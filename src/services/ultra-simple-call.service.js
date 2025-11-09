const CallRepository = require("../v1/repositories/call.repository");
const CampaignRepository = require("../v1/repositories/campaign.repository");
const AgentRepository = require("../v1/repositories/agent.repository");
const AgentGroupRepository = require("../v1/repositories/agentGroup.repository");
const FreeSwitchService = require("./freeswitch.service");
const RecordingUploadService = require("./recording_upload.service");
const PollyService = require("./polly.service");
const AppError = require("../utils/app_error.util");

// Lightweight ActiveCalls store with optional Redis durability
class ActiveCallStore {
    constructor() {
        this.map = new Map();
        this.enabled = false;
        this.ttlSeconds = parseInt(process.env.ACTIVE_CALL_TTL_SECONDS || "43200", 10); // 12h default
        
        // Support both REDIS_URL and individual config variables
        let redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            // Build Redis URL from individual config variables
            const redisHost = process.env.REDIS_HOST || "localhost";
            const redisPort = process.env.REDIS_PORT || 6379;
            const redisPassword = process.env.REDIS_PASSWORD;
            const redisDb = process.env.REDIS_DB || 0;
            
            if (redisHost && redisPort) {
                // Format: redis://[password@]host:port[/db]
                if (redisPassword) {
                    redisUrl = `redis://:${redisPassword}@${redisHost}:${redisPort}/${redisDb}`;
                } else {
                    redisUrl = `redis://${redisHost}:${redisPort}/${redisDb}`;
                }
            }
        }
        
        if (redisUrl) {
            try {
                // Lazy require to avoid hard dependency when Redis is not configured
                // eslint-disable-next-line global-require
                const redis = require("redis");
                this.redis = redis.createClient({ url: redisUrl });
                this.redis.on("error", (err) => {
                    console.error("Redis error (activeCalls):", err.message);
                });
                this.redis.connect().then(() => {
                    this.enabled = true;
                    console.log(`✅ Redis connected for ActiveCallStore (${redisUrl.replace(/:[^:@]+@/, ':****@')})`);
                }).catch((err) => {
                    console.error("⚠️ Could not connect to Redis for ActiveCallStore:", err.message);
                    console.error("   Make sure Redis is running and accessible at:", redisUrl.replace(/:[^:@]+@/, ':****@'));
                });
            } catch (err) {
                console.log("ℹ️ Redis client not installed, using in-memory ActiveCallStore only");
                console.log("   To enable Redis, install: npm install redis");
            }
        } else {
            console.log("ℹ️ Redis not configured (no REDIS_URL or REDIS_HOST), using in-memory ActiveCallStore only");
        }
    }

    get size() {
        return this.map.size;
    }

    async set(callId, value) {
        this.map.set(callId, value);
        if (this.enabled && this.redis) {
            const key = `active_call:${callId}`;
            try {
                await this.redis.set(key, JSON.stringify(value), { EX: this.ttlSeconds });
            } catch (e) {
                console.error("Redis set error (activeCalls):", e.message);
            }
        }
    }

    get(callId) {
        return this.map.get(callId);
    }

    has(callId) {
        return this.map.has(callId);
    }

    async delete(callId) {
        this.map.delete(callId);
        if (this.enabled && this.redis) {
            const key = `active_call:${callId}`;
            try {
                await this.redis.del(key);
            } catch (e) {
                console.error("Redis del error (activeCalls):", e.message);
            }
        }
    }

    keys() {
        return this.map.keys();
    }

    // Load any persisted active calls from Redis into memory at boot
    async loadFromRedis() {
        if (!this.enabled || !this.redis) return;
        try {
            const iter = this.redis.scanIterator({ MATCH: "active_call:*", COUNT: 100 });
            for await (const key of iter) {
                const raw = await this.redis.get(key);
                if (!raw) continue;
                try {
                    const value = JSON.parse(raw);
                    const callId = key.split(":")[1];
                    if (callId && value) {
                        this.map.set(callId, value);
                    }
                } catch (_) {
                    // ignore corrupt entries
                }
            }
            if (this.map.size > 0) {
                console.log(`♻️ Restored ${this.map.size} active calls from Redis`);
            }
        } catch (e) {
            console.error("Redis load error (activeCalls):", e.message);
        }
    }

    [Symbol.iterator]() {
        return this.map[Symbol.iterator]();
    }

    clear() {
        this.map.clear();
        // Note: We don't clear Redis here as it will expire naturally
        // If you want to clear Redis too, you'd need to scan and delete all active_call:* keys
    }
}
const Agent = require("../models/agent.model");

class UltraSimpleCallService {
    constructor(fsService) {
        this.callRepo = new CallRepository();
        this.campaignRepo = new CampaignRepository();
        this.agentRepo = new AgentRepository();
        this.agentGroupRepo = new AgentGroupRepository();
        this.fsService = fsService;
        this.recordingUploadService = new RecordingUploadService();
        this.pollyService = new PollyService();
        
        // Active calls with optional Redis durability
        this.activeCalls = new ActiveCallStore();
        
        // Setup hangup listener
        this.setupHangupListener();

        // Reload any persisted active calls from Redis
        // and keep agent status cleanup
        (async () => {
            try {
                await this.activeCalls.loadFromRedis();
            } catch (err) {
                console.log("Redis preload skipped:", err.message);
            }
        })();
        
        // Cleanup on startup
        this.cleanupOnStartup();
    }

    /**
     * Cleanup on startup - reset all agent statuses
     */
    async cleanupOnStartup() {
        try {
            console.log(`🧹 Cleaning up on startup...`);
            
            // Reset all agents to 'free' status
            const agents = await Agent.find({ status: "in-progress", deleted_at: null });
            if (agents && agents.length > 0) {
                for (const agent of agents) {
                    await Agent.findByIdAndUpdate(agent._id, { status: "free" });
                    console.log(`🔄 Reset agent ${agent.full_name} (${agent._id}) from in-progress to free`);
                }
            }
            
            // Clear any stale active calls
            this.activeCalls.clear();
            console.log(`✅ Startup cleanup completed - ${agents?.length || 0} agents reset`);
        } catch (error) {
            console.error(`⚠️ Error during startup cleanup:`, error);
        }
    }

    /**
     * Setup hangup listener to handle when either side hangs up
     */
    setupHangupListener() {
        if (!this.fsService) return;

        this.fsService.addListener('channel_hangup', async (data) => {
            const { uuid, cause, callId } = data;
            
            console.log(`📴 Hangup event: uuid=${uuid}, callId=${callId}, cause=${cause}`);
            
            // Find the call by matching agent_uuid or lead_uuid
            let foundCallId = null;
            let isLeadHangup = false;
            
            for (const [callIdKey, callInfo] of this.activeCalls) {
                // Check if this is the lead's UUID
                if (callInfo.lead_uuid === uuid) {
                    foundCallId = callIdKey;
                    isLeadHangup = true;
                    
                    // Mark that we're processing this hangup to prevent duplicates
                    if (!callInfo.hangup_processed) {
                        callInfo.hangup_processed = true;
                        await this.activeCalls.set(callIdKey, callInfo);
                        
                        // If lead hung up, also hang up the agent
                        if (callInfo.agent_uuid) {
                            console.log(`📞 Hanging up agent because lead hung up`);
                            this.fsService.hangupCall(callInfo.agent_uuid).catch(err => {
                                console.log(`⚠️ Could not hangup agent: ${err.message}`);
                            });
                        }
                    } else {
                        // Already processed, skip
                        console.log(`ℹ️ Hangup for ${uuid} already processed, skipping duplicate`);
                        return;
                    }
                    break;
                }
                
                // Match by agent UUID
                if (callInfo.agent_uuid === uuid) {
                    foundCallId = callIdKey;
                    // Check if already processed (might have been processed as lead hangup)
                    if (callInfo.hangup_processed) {
                        console.log(`ℹ️ Hangup for ${uuid} already processed, skipping duplicate`);
                        return;
                    }
                    
                    // IMPORTANT: If agent hangs up BEFORE lead is called, don't process as call completion
                    // This can happen if agent hangs up immediately after answering
                    // Only process as completion if lead was already called (has lead_uuid)
                    if (!callInfo.lead_uuid) {
                        console.log(`⚠️ Agent ${uuid} hung up before lead was called - this is a premature hangup, not processing as call completion`);
                        // Clear agent_uuid so the call can try another agent
                        callInfo.agent_uuid = null;
                        callInfo.agent_answered = false;
                        await this.activeCalls.set(callIdKey, callInfo);
                        return; // Don't process as call completion
                    }
                    
                    callInfo.hangup_processed = true;
                    await this.activeCalls.set(callIdKey, callInfo);
                    break;
                }
            }
            
            // If not found by UUID, try to find by checking all active calls
            // Sometimes UUIDs change after bridging, so we need to check all entries
            if (!foundCallId) {
                for (const [callIdKey, callInfo] of this.activeCalls) {
                    // Check if this UUID matches either agent or lead (even if stored differently)
                    if (callInfo.agent_uuid === uuid || callInfo.lead_uuid === uuid) {
                        foundCallId = callIdKey;
                        isLeadHangup = (callInfo.lead_uuid === uuid);
                        
                        // Mark as processed
                        if (!callInfo.hangup_processed) {
                            callInfo.hangup_processed = true;
                            await this.activeCalls.set(callIdKey, callInfo);
                        } else {
                            console.log(`ℹ️ Hangup for ${uuid} already processed, skipping duplicate`);
                            return;
                        }
                        break;
                    }
                }
            }
            
            // If still not found and callId is provided, try to find by callId
            if (!foundCallId && callId) {
                if (this.activeCalls.has(callId)) {
                    foundCallId = callId;
                    const callInfo = this.activeCalls.get(callId);
                    if (callInfo && !callInfo.hangup_processed) {
                        callInfo.hangup_processed = true;
                        await this.activeCalls.set(callId, callInfo);
                    } else if (callInfo && callInfo.hangup_processed) {
                        console.log(`ℹ️ Hangup for call ${callId} already processed, skipping duplicate`);
                        return;
                    }
                }
            }
            
            if (foundCallId) {
                console.log(`🎯 Found call ${foundCallId} for hangup event (isLeadHangup: ${isLeadHangup})`);
                console.log(`📊 activeCalls has ${this.activeCalls.size} entries:`, Array.from(this.activeCalls.keys()));
                this.handleCallCompleted(foundCallId, cause);
            } else {
                console.log(`⚠️  Could not find call for hangup uuid ${uuid}`);
                // ActiveCallStore is iterable but doesn't have entries() method
                // Convert iterator to array to get [key, value] pairs
                const entries = Array.from(this.activeCalls);
                console.log(`📊 activeCalls entries:`, entries.map(([id, info]) => ({
                    callId: id,
                    agent_uuid: info.agent_uuid,
                    lead_uuid: info.lead_uuid
                })));
            }
        });

        // Listen for bridge events
        this.fsService.addListener('channel_bridge', async (data) => {
            const { uuid, otherUuid } = data;
            console.log(`🔗 Bridge detected: ${uuid} <-> ${otherUuid}`);
            
            // Find the call and mark it as answered (both connected)
            // Also update UUIDs in case they changed after bridging
            for (const [callIdKey, callInfo] of this.activeCalls) {
                let updated = false;
                
                // Check if uuid matches agent or lead
                if (callInfo.agent_uuid === uuid || callInfo.agent_uuid === otherUuid) {
                    // Update lead_uuid if we have the other UUID
                    if (!callInfo.lead_uuid) {
                        callInfo.lead_uuid = (callInfo.agent_uuid === uuid) ? otherUuid : uuid;
                        updated = true;
                    }
                }
                
                if (callInfo.lead_uuid === uuid || callInfo.lead_uuid === otherUuid) {
                    // Update agent_uuid if we have the other UUID
                    if (!callInfo.agent_uuid) {
                        callInfo.agent_uuid = (callInfo.lead_uuid === uuid) ? otherUuid : uuid;
                        updated = true;
                    }
                }
                
                // If we found a match (either by agent or lead UUID)
                if (callInfo.agent_uuid === uuid || callInfo.lead_uuid === uuid || 
                    callInfo.agent_uuid === otherUuid || callInfo.lead_uuid === otherUuid) {
                    
                    // Save updated UUIDs if changed
                    if (updated) {
                        await this.activeCalls.set(callIdKey, callInfo);
                        console.log(`📝 Updated call ${callIdKey} UUIDs: agent=${callInfo.agent_uuid}, lead=${callInfo.lead_uuid}`);
                    }
                    
                    this.handleCallAnswered(callIdKey);
                    break;
                }
            }
        });
    }

    /**
     * Cancel an active call
     */
    async cancelCall(callId, accountId) {
        try {
            console.log(`🚫 Cancelling call: ${callId}`);
            
            const callInfo = this.activeCalls.get(callId.toString());
            
            if (!callInfo) {
                throw new AppError("Call is not active or already completed", 404);
            }

            // Hang up agent if connected
            if (callInfo.agent_uuid) {
                console.log(`📞 Hanging up agent: ${callInfo.agent_uuid}`);
                await this.fsService.hangupCall(callInfo.agent_uuid).catch(err => {
                    console.log(`⚠️ Could not hangup agent: ${err.message}`);
                });
            }

            // Hang up lead if connected
            if (callInfo.lead_uuid) {
                console.log(`📞 Hanging up lead: ${callInfo.lead_uuid}`);
                await this.fsService.hangupCall(callInfo.lead_uuid).catch(err => {
                    console.log(`⚠️ Could not hangup lead: ${err.message}`);
                });
            }

            // Free the agent
            if (callInfo.agent_id) {
                await this.updateAgentStatus(callId, accountId, callInfo.agent_id, "free");
            }

            // Update call status to cancelled
            await this.updateCallStatus(callId, accountId, "cancelled", "Call was cancelled by user");

            // Update campaign stats (cancelled counts as missed)
            if (callInfo.campaign_id) {
                await this.updateCampaignCallStats(callInfo.campaign_id, accountId, "missed");
            }

            // Remove from active calls
            await this.activeCalls.delete(callId.toString());

            console.log(`✅ Call ${callId} cancelled successfully`);
            
            return { success: true, message: "Call cancelled successfully" };
        } catch (error) {
            console.error(`❌ Error cancelling call:`, error);
            throw error;
        }
    }

    async startCallingForCall(call) {
        try {
            console.log(`🚀 Starting call: ${call._id}`);
            
            // Check if this call is already in progress
            // Only block if call is actually active (has agent_uuid or lead_uuid)
            const existingCallInfo = this.activeCalls.get(call._id.toString());
            if (existingCallInfo) {
                // Check if call is actually active (has active channels)
                const isActive = existingCallInfo.agent_uuid || existingCallInfo.lead_uuid;
                if (isActive) {
                    console.log(`⚠️ Call ${call._id} is already in progress (has active channels), aborting new call`);
                    return { success: false, reason: "Call already in progress" };
                } else {
                    // Call exists but no active channels - it's a stale entry, clean it up
                    console.log(`🧹 Cleaning up stale call entry for ${call._id}`);
                    await this.activeCalls.delete(call._id.toString());
                }
            }
            
            // Check if call was already rejected by lead - don't retry
            if (call.call_status?.call_state === "un-answered" && 
                call.call_status?.description?.includes("Lead rejected")) {
                console.log(`🚫 Call ${call._id} was already rejected by lead, not retrying`);
                return { success: false, reason: "Lead already rejected this call" };
            }
            
            // Store call info for hangup handling (even if call fails early)
            this.activeCalls.set(call._id.toString(), {
                call_id: call._id,
                callRecord: call,
                campaign_id: call.campaign_id,
                account_id: call.account_id,
                agent_uuid: null,
                lead_uuid: null,
                agent_id: null,
                agent_name: null,
                lead_number: null,
                start_time: new Date(),
                last_hangup_cause: null,
                recording_file: null,
                recording_started: null
            });
            
            // Step 1: Find campaign
            const campaign = await this.campaignRepo.findById(call.campaign_id);
            if (!campaign) {
                throw new AppError("Campaign not found", 404);
            }

            // Step 2: Get available agents
            const agents = await this.getAvailableAgents(campaign);
            if (agents.length === 0) {
                await this.updateCallStatus(call._id, call.account_id, "missed by agent(s)", "No available agents");
                // Update campaign stats for missed by agent(s)
                await this.updateCampaignCallStats(call.campaign_id, call.account_id, "missed by agent(s)");
                // Clean up from activeCalls since call failed
                await this.activeCalls.delete(call._id.toString());
                return { success: false, reason: "No available agents" };
            }
            // Step 3: Try agents one by one
            for (const agent of agents) {
                console.log(`📞 Trying agent: ${agent.full_name}`);
                
                const result = await this.tryAgentCall(call, agent);
                
                if (result.success) {
                    console.log(`✅ Call connected!`);
                    return { success: true, agent: agent.full_name };
                }
                
                // If this was a routing error (like invalid number), stop trying agents
            if (result.stop_trying) {
                    console.log(`🛑 Stopping agent attempts due to routing error: ${result.reason}`);
                    await this.updateCallStatus(call._id, call.account_id, "missed", result.reason);
                await this.updateCampaignCallStats(call.campaign_id, call.account_id, "missed");
                    // Clean up from activeCalls since call failed
                    await this.activeCalls.delete(call._id.toString());
                    return { success: false, reason: result.reason };
                }
            }

            // All agents failed
            await this.updateCallStatus(call._id, call.account_id, "missed", "All agents failed");
            await this.updateCampaignCallStats(call.campaign_id, call.account_id, "missed by agent(s)");
            // Clean up from activeCalls since call failed
            await this.activeCalls.delete(call._id.toString());
            return { success: false, reason: "All agents failed" };

        } catch (error) {
            console.error("❌ Call failed:", error);
            await this.updateCallStatus(call._id, call.account_id, "missed", `Error: ${error.message}`);
            // Clean up from activeCalls on error
            await this.activeCalls.delete(call._id.toString());
            throw error;
        }
    }

    async tryAgentCall(call, agent) {
        let agentUuid = null;
        
        try {
            await this.updateCallStatus(call._id, call.account_id, "in-progress", `Calling agent: ${agent.full_name}`);
            
            await this.addAgentToCall(call._id, call.account_id, agent._id, "in-progress");

            if (!this.fsService || !this.fsService.isConnectedToFreeSwitch()) {
                return { success: false, reason: "FreeSWITCH not available" };
            }

            // Check if we have a prompt configured - if so, don't use echo()
            const campaignForPrompt = await this.campaignRepo.findById(call.campaign_id);
            const msgCfg = campaignForPrompt?.calls;
            const hasPrompt = msgCfg?.message_enabled && (msgCfg?.prompt_audio_url || msgCfg?.message_for_answered_agent);
            
            // Step 1: Call agent (30 seconds timeout)
            // Use echo() only if there's no prompt configured (echo conflicts with prompt playback)
            // If hasPrompt is true, use park() instead of echo() so prompt can play cleanly
            agentUuid = await this.fsService.startAgentCall(agent.personal_phone, call._id.toString(), !hasPrompt);
            
            // IMMEDIATELY store agent_uuid so hangup events can find this call
            const existingCallInfo = this.activeCalls.get(call._id.toString());
            if (existingCallInfo) {
                existingCallInfo.agent_uuid = agentUuid;
                existingCallInfo.agent_id = agent._id;
                existingCallInfo.agent_name = agent.full_name;
                existingCallInfo.agent_answered = false; // Track if agent actually answered
            }
            
            // CRITICAL: Define callback to start audio IMMEDIATELY when answer is detected
            // This prevents the channel from hanging up due to inactivity
            const startAudioImmediately = async (uuid) => {
                console.log(`🚨 ANSWER DETECTED! Unparking and starting audio IMMEDIATELY to prevent hangup...`);
                
                // FIRST: Unpark the channel so it can receive media
                try {
                    const unparked = await this.fsService.activateParkedChannel(uuid);
                    if (!unparked) {
                        console.log(`⚠️ Failed to unpark channel, but continuing with audio start...`);
                    }
                } catch (e) {
                    console.log(`⚠️ Error unparking channel: ${e.message}, continuing anyway...`);
                }
                
                // THEN: Start audio immediately
                if (hasPrompt && msgCfg?.message_enabled && msgCfg?.prompt_audio_url) {
                    // Start prompt immediately - this keeps channel alive
                    const promptUrl = msgCfg.prompt_audio_url;
                    console.log(`🔊 Starting prompt IMMEDIATELY: ${promptUrl}`);
                    try {
                        await this.fsService.startAgentPrompt(uuid, promptUrl);
                        console.log(`✅ Prompt started IMMEDIATELY - channel should stay alive`);
                        
                        // Track it in activeCalls
                        const info = this.activeCalls.get(call._id.toString());
                        if (info) {
                            info.agent_prompt_url = promptUrl;
                            await this.activeCalls.set(call._id.toString(), info);
                        }
                    } catch (e) {
                        console.log(`⚠️ Failed to start prompt immediately: ${e.message}`);
                        // Fallback: try echo
                        await this.startEchoFallback(uuid);
                    }
                } else if (hasPrompt && msgCfg?.message_enabled && msgCfg?.message_for_answered_agent) {
                    // For on-the-fly synthesis, start echo first, then synthesize
                    console.log(`⚠️ Prompt needs synthesis, starting echo first...`);
                    await this.startEchoFallback(uuid);
                } else {
                    // No prompt - start echo immediately to keep channel alive
                    await this.startEchoFallback(uuid);
                }
            };
            
            const agentAnswered = await this.fsService.waitForAgentAnswer(agentUuid, 30000, startAudioImmediately);
            
            if (!agentAnswered) {
                console.log(`❌ Agent ${agent.full_name} did not answer`);
                // Mark that agent didn't answer in call info
                if (existingCallInfo) {
                    existingCallInfo.agent_answered = false;
                    existingCallInfo.agent_uuid = null; // Clear agent_uuid since call failed
                    await this.activeCalls.set(call._id.toString(), existingCallInfo);
                }
                await this.fsService.hangupCall(agentUuid);
                await this.updateAgentStatus(call._id, call.account_id, agent._id, "missed");
                // Note: Don't delete from activeCalls here - let it be cleaned up when all agents fail
                // or when the call is completed. This allows trying the next agent.
                return { success: false, reason: "Agent did not answer" };
            }
            
            // Mark that agent answered
            if (existingCallInfo) {
                existingCallInfo.agent_answered = true;
                await this.activeCalls.set(call._id.toString(), existingCallInfo);
            }

            console.log(`✅ Agent ${agent.full_name} answered! Audio should already be playing...`);
            
            // Audio should have already started in the onAnswerCallback
            // If prompt needs synthesis, do it now (echo is already playing as fallback)
            if (hasPrompt && msgCfg?.message_enabled && msgCfg?.message_for_answered_agent && !msgCfg?.prompt_audio_url) {
                // Synthesize on-the-fly and replace echo with prompt
                console.log(`⚠️ Prompt audio URL not found, synthesizing on-the-fly...`);
                try {
                    const voiceId = msgCfg?.polly_voice || "Joanna";
                    const promptUrl = await this.pollyService.synthesizeToS3(
                        msgCfg.message_for_answered_agent,
                        { voiceId }
                    );
                    if (promptUrl) {
                        // Stop echo and start prompt
                        await this.fsService.stopAgentPrompt(agentUuid);
                        await this.fsService.startAgentPrompt(agentUuid, promptUrl);
                        const info = this.activeCalls.get(call._id.toString());
                        if (info) {
                            info.agent_prompt_url = promptUrl;
                            await this.activeCalls.set(call._id.toString(), info);
                        }
                    }
                } catch (e) {
                    console.log(`⚠️ Failed to synthesize prompt: ${e.message}, keeping echo`);
                }
            }
            
            console.log(`📞 Channel is now active, calling lead and bridging...`);
            
            // Get call to update agents array
            const callDoc = await this.callRepo.findById(call._id);
            const agents = callDoc.agents || [];
            const agentIndex = agents.findIndex(a => a.id.toString() === agent._id.toString());
            
            if (agentIndex !== -1) {
                agents[agentIndex].last_call_status = "answered";
            } else {
                agents.push({
                    id: agent._id,
                    last_call_status: "answered"
                });
            }
            
            // Single combined update: agent pickup time, agent status, call status
            const agentPickupTime = new Date();
            await this.callRepo.updateByIdAndAccount(call._id, call.account_id, {
                "call_details.agent_pickup_time": agentPickupTime,
                "call_status.call_state": "in-progress",
                "call_status.description": `Agent ${agent.full_name} answered, calling lead...`,
                agents: agents,
                updated_at: new Date()
            });
            
            // Update agent model status (single update)
            await this.updateAgentModelStatus(agent._id, "in-progress");

            // Step 2: Call lead separately, then use uuid_bridge (same as your working test script)
            const leadNumber = call.lead_data.get('phone_number') || call.lead_data.phone_number;
            console.log(`📞 Dialing lead separately: ${leadNumber}`);
            
            // Get lead UUID before calling so we can store it immediately
            // The lead UUID is generated in callLeadSeparateAndBridge, but we need it earlier
            // So we'll extract it from the result and store it immediately
            let result;
            try {
                result = await this.fsService.callLeadSeparateAndBridge(agentUuid, leadNumber, call._id.toString());
                
                // IMMEDIATELY store lead_uuid when we get it, before bridge completes
                const leadUuid = result.leadUuid || result;
                if (leadUuid && typeof leadUuid === 'string') {
                    const callInfo = this.activeCalls.get(call._id.toString());
                    if (callInfo) {
                        callInfo.lead_uuid = leadUuid;
                        callInfo.lead_number = leadNumber;
                        await this.activeCalls.set(call._id.toString(), callInfo);
                        console.log(`📝 Stored lead_uuid ${leadUuid} for call ${call._id.toString()}`);
                    }
                }
            } catch (error) {
                // Check if lead rejected the call
                if (error.rejected) {
                    console.log(`🚫 Lead rejected the call: ${error.cause}`);
                    
                    // Mark in activeCalls that lead rejected
                    const callInfo = this.activeCalls.get(call._id.toString());
                    if (callInfo) {
                        callInfo.lead_rejected = true;
                        callInfo.last_hangup_cause = error.cause;
                        await this.activeCalls.set(call._id.toString(), callInfo);
                    }
                    
                    await this.fsService.hangupCall(agentUuid);
                    
                    // Get call to update agents array
                    const callDoc = await this.callRepo.findById(call._id);
                    const agents = callDoc.agents || [];
                    const agentIndex = agents.findIndex(a => a.id.toString() === agent._id.toString());
                    
                    if (agentIndex !== -1) {
                        agents[agentIndex].last_call_status = "free";
                    }
                    
                    // Single combined update: agent status + call status
                    // Mark as un-answered with rejection reason to prevent future retries
                    await this.callRepo.updateByIdAndAccount(call._id, call.account_id, {
                        agents: agents,
                        "call_status.call_state": "un-answered",
                        "call_status.description": `Lead rejected the call - ${error.cause}`,
                        updated_at: new Date()
                    });
                    
                    // Update agent model status (single update)
                    await this.updateAgentModelStatus(agent._id, "free");
                    
                    // Update campaign stats for rejection
                    await this.updateCampaignCallStats(call.campaign_id, call.account_id, "un-answered");
                    
                    // Return with stop_trying flag to prevent retrying
                    return { 
                        success: false, 
                        reason: `Lead rejected the call - ${error.cause}`,
                        stop_trying: true // Stop trying other agents - lead explicitly rejected
                    };
                }
                // Re-throw other errors
                throw error;
            }
            
            // Handle both old and new return formats
            const leadUuid = result.leadUuid || result;
            const recordingFile = result.recordingFile;
            
            if (!leadUuid) {
                console.log(`❌ Lead did not answer`);
                await this.fsService.hangupCall(agentUuid);
                
                // Get call to update agents array
                const callDoc = await this.callRepo.findById(call._id);
                const agents = callDoc.agents || [];
                const agentIndex = agents.findIndex(a => a.id.toString() === agent._id.toString());
                
                if (agentIndex !== -1) {
                    agents[agentIndex].last_call_status = "free";
                }
                
                // Single combined update: agent status + call status
                await this.callRepo.updateByIdAndAccount(call._id, call.account_id, {
                    agents: agents,
                    "call_status.call_state": "un-answered",
                    "call_status.description": "Agent answered but lead did not answer",
                    updated_at: new Date()
                });
                
                // Update agent model status (single update)
                await this.updateAgentModelStatus(agent._id, "free");
                
                // Update campaign stats for no_answer immediately
                await this.updateCampaignCallStats(call.campaign_id, call.account_id, "un-answered");
                return { success: false, reason: "Lead did not answer" };
            }

            // callLeadSeparate already handled everything: called lead, waited for answer, and bridged
            // So if we get here with a leadUuid, the call is successful!
            
            // Track lead pickup time and update call status in single update
            const leadPickupTime = new Date();
            
            // IMMEDIATELY store lead_uuid and recording info to track
            if (existingCallInfo) {
                existingCallInfo.lead_uuid = leadUuid;
                existingCallInfo.lead_number = leadNumber;
                
                // Store recording file if available
                if (recordingFile) {
                    existingCallInfo.recording_file = recordingFile;
                    existingCallInfo.recording_started = new Date();
                    console.log(`📹 Stored recording file: ${recordingFile}`);
                }
            }

            console.log(`✅ Bridge established successfully! Agent and lead are now connected and talking.`);
            
            // Single combined update: lead pickup time + call status
            await this.callRepo.updateByIdAndAccount(call._id, call.account_id, {
                "call_details.lead_pickup_time": leadPickupTime,
                "call_status.call_state": "in-progress",
                "call_status.description": "Both parties connected and talking",
                updated_at: new Date()
            });

            return { success: true };

        } catch (error) {
            console.error(`❌ Error calling agent ${agent.full_name}:`, error);
            
            // Check if this was a routing error
            const callInfo = this.activeCalls.get(call._id.toString());
            const isRoutingError = callInfo && callInfo.last_hangup_cause && 
                (callInfo.last_hangup_cause === "INVALID_NUMBER_FORMAT" || 
                 callInfo.last_hangup_cause === "NO_ROUTE_DESTINATION" ||
                 callInfo.last_hangup_cause === "NORMAL_TEMPORARY_FAILURE");
            
            if (isRoutingError) {
                // Make sure agent call is hung up
                if (agentUuid) {
                    try {
                        await this.fsService.hangupCall(agentUuid);
                    } catch (err) {
                        console.log(`Could not hangup agent call (may already be disconnected)`);
                    }
                }
                await this.updateAgentStatus(call._id, call.account_id, agent._id, "free");
                return { success: false, reason: `Routing error: ${callInfo.last_hangup_cause}`, stop_trying: true };
            }
            
            await this.updateAgentStatus(call._id, call.account_id, agent._id, "missed");
            return { success: false, reason: error.message };
        }
    }

    /**
     * Start echo() as fallback to keep channel active when no prompt is available
     */
    async startEchoFallback(agentUuid) {
        console.log(`🔊 Starting echo() to keep channel active (no prompt configured)`);
        try {
            // Try to start echo() via uuid_exec to keep channel active
            const echoResult = await this.fsService.api(`uuid_exec ${agentUuid} echo`);
            if (echoResult && echoResult.trim().startsWith('+OK')) {
                console.log(`✅ Echo started successfully`);
                return true;
            } else {
                console.log(`⚠️ Echo command returned: ${echoResult?.trim()}`);
                // Try alternative: play a silent audio file to keep channel alive
                try {
                    // Use a very short silent audio or beep to keep channel active
                    await this.fsService.api(`uuid_broadcast ${agentUuid} playback::tone_stream://%(500,500,480)`);
                    console.log(`✅ Started tone stream to keep channel alive`);
                    return true;
                } catch (e2) {
                    console.log(`⚠️ Failed to start tone stream: ${e2.message}`);
                    return false;
                }
            }
        } catch (e) {
            console.log(`⚠️ Failed to start echo: ${e.message}`);
            // Try alternative: play a silent audio file to keep channel alive
            try {
                await this.fsService.api(`uuid_broadcast ${agentUuid} playback::tone_stream://%(500,500,480)`);
                console.log(`✅ Started tone stream as fallback`);
                return true;
            } catch (e2) {
                console.log(`⚠️ Failed to start tone stream: ${e2.message}`);
                return false;
            }
        }
    }

    /**
     * Wait for bridge to complete or detect rejection
     */
    waitForBridgeOrRejection(callId, leadUuid, timeout = 5000) {
        return new Promise((resolve) => {
            let resolved = false;
            let callStillActive = true;
            let checkInterval;
            let timer;
            let bridgeListener;

            const cleanup = () => {
                if (checkInterval) clearInterval(checkInterval);
                if (timer) clearTimeout(timer);
                if (bridgeListener) this.fsService.removeListener('channel_bridge', bridgeListener);
            };

            checkInterval = setInterval(() => {
                // Check if call is still in activeCalls
                if (!this.activeCalls.has(callId)) {
                    callStillActive = false;
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolve(false); // Call was removed (rejected)
                    }
                }
            }, 500);

            timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    // If we still have the call active after timeout, assume success
                    resolve(callStillActive);
                }
            }, timeout);

            // Listen for bridge event
            bridgeListener = (data) => {
                if (!resolved && (data.uuid === leadUuid || data.otherUuid === leadUuid)) {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolve(true);
                    }
                }
            };

            this.fsService.addListener('channel_bridge', bridgeListener);
        });
    }

    /**
     * Handle call answered event (when both agent and lead are connected)
     */
    async handleCallAnswered(callId) {
        const callInfo = this.activeCalls.get(callId);
        if (!callInfo) return;

        console.log(`🎉 Call answered: ${callId}`);
        await this.updateCallStatus(callId, callInfo.account_id, "answered", "Agent and lead are connected and talking");
        
        // Keep agent as in-progress (they're on a call)
        console.log(`📞 Agent ${callInfo.agent_id} is now on an active call`);
    }

    /**
     * Handle call completion when either side hangs up
     */
    async handleCallCompleted(callId, cause) {
        const callInfo = this.activeCalls.get(callId);
        if (!callInfo) return;

        // Store the hangup cause for reference
        callInfo.last_hangup_cause = cause;
        console.log(`📴 Call completed: ${cause}`);

        // Stop recording and upload to S3
        let recordingUrl = null;
        try {
            const recordingFile = callInfo.recording_file;
            console.log(`🔍 Call info:`, { callId, recordingFile, hasRecordingFile: !!recordingFile });
            
            if (recordingFile) {
                console.log(`📹 Uploading recording to S3: ${recordingFile}`);
                recordingUrl = await this.recordingUploadService.uploadFromFreeSwitch(recordingFile, callId);
                if (recordingUrl) {
                    console.log(`✅ Recording uploaded to S3: ${recordingUrl}`);
                } else {
                    console.log(`⚠️ Recording upload returned null`);
                }
            } else {
                console.log(`⚠️ No recording file found for call ${callId}`);
            }
        } catch (error) {
            console.error(`❌ Error uploading recording:`, error);
        }

        // Determine call status based on what happened
        let finalStatus = "completed";
        let finalDescription = `Call completed - ${cause}`;
        
        // Handle different hangup causes
        if (cause === "CALL_REJECTED" || cause === "USER_BUSY") {
            finalStatus = "un-answered";
            finalDescription = `Lead rejected the call - ${cause}`;
        } else if (cause === "INVALID_NUMBER_FORMAT" || cause === "NORMAL_TEMPORARY_FAILURE" || cause === "NO_ROUTE_DESTINATION") {
            // Call routing failures
            finalStatus = "missed";
            finalDescription = `Call failed due to routing error - ${cause}`;
        } else if (cause === "NORMAL_CLEARING") {
            // Normal hangup - check if both parties were connected
            if (!callInfo.lead_uuid) {
                finalStatus = "missed";
                finalDescription = `Agent hung up before lead was connected - ${cause}`;
            } else {
                finalStatus = "completed";
                finalDescription = `Call completed successfully - ${cause}`;
            }
        } else {
            // Other causes (timeout, etc.)
            if (!callInfo.lead_uuid) {
                finalStatus = "missed";
                finalDescription = `Call failed - ${cause}`;
            }
        }
        
        // Mark call with appropriate status
        if (callInfo && callInfo.account_id) {
            await this.updateCallStatus(callId, callInfo.account_id, finalStatus, finalDescription);
        }

        // Update campaign call stats (total/answered/no_answer/missed)
        try {
            const campaignId = callInfo?.campaign_id;
            const accountId = callInfo?.account_id;
            if (campaignId && accountId) {
                await this.updateCampaignCallStats(campaignId, accountId, finalStatus);
            }
        } catch (e) {
            console.error(`Error updating campaign call stats:`, e);
        }
        
        // Update call with recording URL
        if (recordingUrl && callInfo && callInfo.account_id) {
            await this.updateCallRecording(callId, callInfo.account_id, recordingUrl);
        }
        
        // Set agent back to free ONLY if they actually answered
        // If agent didn't answer, they should remain as "missed" (already set in tryAgentCall)
        if (callInfo && callInfo.agent_id) {
            // Only set to free if agent actually answered (connected to a call)
            // If agent_answered is false or undefined, they didn't answer, so don't change status
            if (callInfo.agent_answered === true) {
                await this.updateAgentStatus(callId, callInfo.account_id, callInfo.agent_id, "free");
            } else {
                console.log(`ℹ️ Agent ${callInfo.agent_id} did not answer, keeping status as "missed"`);
            }
        }
        
        // Update call details with end time
        await this.updateCallEndTime(callId);

        // Remove from active calls
        this.activeCalls.delete(callId);
        
        console.log(`✅ Call ${callId} completed with status: ${finalStatus}`);
    }

    /**
     * Update campaign call statistics counters
     */
    async updateCampaignCallStats(campaignId, accountId, finalStatus) {
        try {
            const inc = { "call_stats.total": 1 };
            if (finalStatus === "completed") {
                inc["call_stats.answered"] = 1;
            } else if (finalStatus === "un-answered") {
                inc["call_stats.no_answer"] = 1;
            } else if (finalStatus === "missed" || finalStatus === "missed by agent(s)") {
                inc["call_stats.missed"] = 1;
            }

            await this.campaignRepo.updateByIdAndAccount(campaignId, accountId, { $inc: inc, updated_at: new Date() });
        } catch (error) {
            console.error(`Error updating campaign (${campaignId}) call stats:`, error);
        }
    }

    /**
     * Get available agents for a campaign
     */
    async getAvailableAgents(campaign) {
        const { call_routing } = campaign;
        let agents = [];

        // Get agents from campaign routing
        if (call_routing?.agents?.length > 0) {
            const campaignAgents = await this.agentRepo.findByIds(call_routing.agents);
            agents.push(...campaignAgents);
        }

        // Get agents from agent groups
        if (call_routing?.agent_groups?.length > 0) {
            const agentGroups = await this.agentGroupRepo.findByIds(call_routing.agent_groups);
            for (const group of agentGroups) {
                if (group.agent_ids?.length > 0) {
                    const groupAgents = await this.agentRepo.findByIds(group.agent_ids);
                    agents.push(...groupAgents);
                }
            }
        }

        // Filter available agents (active and not currently on calls)
        const availableAgents = [];
        for (const agent of agents) {
            if (!agent || !agent._id) continue; // Skip null/undefined agents
            
            const isActive = agent.is_active && agent.personal_phone;
            const isBusy = await this.isAgentOnCall(agent._id.toString());
            
            // Only add agents that are active AND not busy (i.e., status is "free")
            if (isActive && !isBusy) {
                availableAgents.push(agent);
            } else if (isBusy) {
                console.log(`⏭️  Skipping agent ${agent.full_name} - currently on a call (status: in-progress)`);
            }
        }

        return availableAgents;
    }

    /**
     * Check if agent is currently on a call (by checking agent status)
     * Returns true if agent is busy (i.e., in-progress)
     */
    async isAgentOnCall(agentId) {
        try {
            const agent = await this.agentRepo.findById(agentId);
            return agent && agent.status === "in-progress";
        } catch (error) {
            console.error(`Error checking agent status:`, error);
            return false;
        }
    }

    /**
     * Update call status in database
     */
    async updateCallStatus(callId, accountId, status, description) {
        try {
            const updateData = {
                "call_status.call_state": status,
                "call_status.description": description,
            };

            // Set start_time when call first becomes in-progress
            if (status === "in-progress") {
                const call = await this.callRepo.findById(callId);
                // Only set start_time if it hasn't been set yet
                if (!call.start_time) {
                    const startTime = new Date();
                    updateData.start_time = startTime;
                    updateData["call_details.start_time"] = startTime;
                }
            }

            await this.callRepo.updateByIdAndAccount(callId, accountId, updateData);
            console.log(`📊 Call ${callId} status: ${status}`);
        } catch (error) {
            console.error(`Error updating call status:`, error);
        }
    }

    /**
     * Add agent to call record
     */
    async addAgentToCall(callId, accountId, agentId, status) {
        try {
            const agentData = {
                id: agentId,
                last_call_status: status
            };

            await this.callRepo.updateByIdAndAccount(callId, accountId, {
                $push: { agents: agentData },
                ringing_agent: agentData,
                updated_at: new Date()
            });
        } catch (error) {
            console.error(`Error adding agent to call:`, error);
        }
    }

    /**
     * Update agent status in call record
     */
    async updateAgentStatus(callId, accountId, agentId, status) {
        try {
            // First, find the call to get the current agents array
            const call = await this.callRepo.findById(callId);
            if (!call) {
                console.error(`Call ${callId} not found`);
                return;
            }

            // Update the specific agent's status
            const agents = call.agents || [];
            const agentIndex = agents.findIndex(agent => agent.id.toString() === agentId.toString());
            
            if (agentIndex !== -1) {
                agents[agentIndex].last_call_status = status;
            } else {
                // If agent not found, add them
                agents.push({
                    id: agentId,
                    last_call_status: status
                });
            }

            await this.callRepo.updateByIdAndAccount(callId, accountId, {
                agents: agents,
            });
            
            // Also update the agent's status in the agent model
            await this.updateAgentModelStatus(agentId, status);
            
            console.log(`📊 Agent ${agentId} status updated to: ${status}`);
        } catch (error) {
            console.error(`Error updating agent status:`, error);
        }
    }

    /**
     * Update agent status in agent model
     */
    async updateAgentModelStatus(agentId, status) {
        try {
            // Map call status to agent status
            let agentStatus;
            switch (status) {
                case "in-progress":
                    agentStatus = "in-progress";
                    break;
                case "free":
                case "missed":
                case "un-answered":
                case "answered": // When call is answered, agent stays in-progress
                default:
                    agentStatus = "free";
                    break;
            }
            
            await this.agentRepo.update(agentId, { status: agentStatus });
        } catch (error) {
            console.error(`Error updating agent model status:`, error);
        }
    }


    /**
     * Update call with recording URL
     */
    async updateCallRecording(callId, accountId, recordingUrl) {
        try {
            console.log(`📹 Updating call ${callId} with new recording URL: ${recordingUrl}`);
            
            // Get the current call to check if there's an old recording
            const currentCall = await this.callRepo.findById(callId);
            if (currentCall?.recording_url && currentCall.recording_url !== recordingUrl) {
                console.log(`📹 Replacing old recording URL: ${currentCall.recording_url} with new: ${recordingUrl}`);
            }
            
            await this.callRepo.updateByIdAndAccount(callId, accountId, {
                "call_details.recording_url": recordingUrl,
                recording_url: recordingUrl,
                updated_at: new Date()
            });
            
            console.log(`📹 Call ${callId} recording successfully updated in database: ${recordingUrl}`);
        } catch (error) {
            console.error(`Error updating call recording:`, error);
        }
    }

    /**
     * Update call end time and duration
     */
    async updateCallEndTime(callId) {
        try {
            const callInfo = this.activeCalls.get(callId);
            if (!callInfo) return;

            const endTime = new Date();
            const startTime = callInfo.start_time;
            const duration = Math.floor((endTime - startTime) / 1000);

            await this.callRepo.updateByIdAndAccount(callId, callInfo.account_id, {
                "call_details.end_time": endTime,
                "call_details.duration": duration,
                updated_at: new Date()
            });
        } catch (error) {
            console.error(`Error updating call end time:`, error);
        }
    }
}

module.exports = UltraSimpleCallService;
