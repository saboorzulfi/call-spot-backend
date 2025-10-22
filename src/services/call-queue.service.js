const CallRepository = require("../v1/repositories/call.repository");
const CampaignRepository = require("../v1/repositories/campaign.repository");
const AgentRepository = require("../v1/repositories/agent.repository");
const AgentGroupRepository = require("../v1/repositories/agentGroup.repository");
const FreeSwitchService = require("./freeswitch.service");
const AppError = require("../utils/app_error.util");
const mongoose = require("mongoose");

class CallQueueService {
    constructor(fsService) {
        this.callRepo = new CallRepository();
        this.campaignRepo = new CampaignRepository();
        this.agentRepo = new AgentRepository();
        this.agentGroupRepo = new AgentGroupRepository();
        this.fsService = fsService; // Use injected FreeSWITCH service
        
        this.activeCalls = new Map();
        this.callQueue = [];
        this.agentStatus = new Map(); // Track agent availability
        this.agentCallMap = new Map(); // Track which agents are currently on calls
        
        this.initialize();
    }

    // ==================== INITIALIZATION ====================

    async initialize() {
        this.setupHangupListener();
    }

    setupHangupListener() {
        if (!this.fsService) {
            console.log("⚠️ FreeSWITCH service not available, hangup listener not set up");
            return;
        }

        this.fsService.addListener('channel_hangup', (data) => {
            const { uuid, cause, callId } = data;
            
            for (const [callOriginationId, callInfo] of this.activeCalls) {
                if (callOriginationId === callId) {
                    this.handleCallHangup(callOriginationId, uuid, cause);
                    break;
                }
            }
        });
        
        console.log("✅ Hangup listener set up");
    }

    // ==================== CALL INITIATION ====================

    async startCallingForCall(call) {
        try {
            // DEBUG: Log ALL call initiation attempts
            console.log("🚨 CALL INITIATION ATTEMPT (startCallingForCall):");
            console.log("   Call ID:", call._id);
            console.log("   Account ID:", call.account_id);
            console.log("   Campaign ID:", call.campaign_id);
            console.log("   Lead Data:", call.lead_data);
            console.log("   Timestamp:", new Date().toISOString());
            console.log("   Stack Trace:", new Error().stack);

            // TEMPORARY: Disable automatic call processing
            console.log("🚫 Call processing temporarily disabled");
            throw new AppError("Call processing is temporarily disabled", 503);
            
            // Check if FreeSWITCH service is available
            if (!this.fsService || !this.fsService.isConnectedToFreeSwitch()) {
                throw new AppError("FreeSWITCH service is not available", 503);
            }

            const campaign = await this.campaignRepo.findById(call.campaign_id);
            if (!campaign) {
                throw new AppError("Campaign not found", 404);
            }

            const callOriginationId = call._id.toString();
            
            // Store active call info
            this.activeCalls.set(callOriginationId, {
                callRecord: call,
                campaign: campaign,
                agents: [],
                status: "scheduled",
                agentUuid: null,
                leadUuid: null,
                agentId: null
            });

            // Update call status to in-progress
            await this.updateCallStatus(callOriginationId, "in-progress", "Starting call process");

            // Start processing the call queue
            await this.processCallQueue(callOriginationId);

            return {
                call_id: call._id,
                call_origination_id: callOriginationId,
                status: "in-progress",
                message: "Call initiated successfully"
            };

        } catch (error) {
            console.error("Error starting call:", error);
            throw error;
        }
    }

    async startCall(accountId, callData) {
        // DEBUG: Log who is creating new calls
        console.log("🚨 NEW CALL CREATION ATTEMPT:");
        console.log("   Account ID:", accountId);
        console.log("   Call Data:", JSON.stringify(callData, null, 2));
        console.log("   Timestamp:", new Date().toISOString());
        console.log("   Stack Trace:", new Error().stack);

        const { lead_number, lead_name, widget_id, site_url, lead_data } = callData;

        if (!lead_number) {
            throw new AppError("Lead number is required", 400);
        }

        if (!widget_id) {
            throw new AppError("Widget ID is required", 400);
        }

        try {
            // Find campaign by widget ID
            const campaign = await this.findCampaignByWidgetId(widget_id, accountId);
            if (!campaign) {
                throw new AppError("Campaign not found for widget", 404);
            }

            // Create call record
            const callRecord = await this.callRepo.create({
                account_id: accountId,
                call_origination_id: new mongoose.Types.ObjectId(),
                source_type: "website",
                source_id: widget_id,
                site_url: site_url,
                lead_data: {
                    phone_number: lead_number,
                    name: lead_name,
                    ...lead_data
                },
                campaign_id: campaign._id,
                campaign_name: campaign.name
            });

            // Start calling for this call
            return await this.startCallingForCall(callRecord);

        } catch (error) {
            console.error("Error creating and starting call:", error);
            throw error;
        }
    }

    // ==================== CAMPAIGN & AGENT MANAGEMENT ====================

    async findCampaignByWidgetId(widgetId, accountId) {
        try {
            // First try to find by widget key
            let campaign = await this.campaignRepo.findById(widgetId);
            
            // If not found by ID, try to find by name
            if (!campaign) {
                campaign = await this.campaignRepo.findByName(accountId, widgetId);
            }

            // Verify campaign belongs to account
            if (campaign && campaign.account_id.toString() !== accountId.toString()) {
                throw new AppError("Campaign access denied", 403);
            }

            return campaign;
        } catch (error) {
            console.error("Error finding campaign:", error);
            throw error;
        }
    }

    async getAvailableAgents(campaign) {
        const { call_routing } = campaign;
        let agents = [];

        // Get agents from call routing configuration
        if (call_routing?.agents?.length > 0) {
            const campaignAgents = await this.agentRepo.findByIds(call_routing.agents);
            agents.push(...campaignAgents);
        }

        // Get agents from agent groups
        if (call_routing?.agent_groups?.length > 0) {
            const agentGroups = await this.agentGroupRepo.findByIds(call_routing.agent_groups);
            for (const group of agentGroups) {
                if (group.agents?.length > 0) {
                    const groupAgents = await this.agentRepo.findByIds(group.agents);
                    agents.push(...groupAgents);
                }
            }
        }

        // Get investor agents if enabled
        if (call_routing?.use_investor_agents) {
            if (call_routing.investor_agents?.length > 0) {
                const investorAgents = await this.agentRepo.findByIds(call_routing.investor_agents);
                agents.push(...investorAgents);
            }

            if (call_routing.investor_agent_groups?.length > 0) {
                const investorGroups = await this.agentGroupRepo.findByIds(call_routing.investor_agent_groups);
                for (const group of investorGroups) {
                    if (group.agents?.length > 0) {
                        const groupAgents = await this.agentRepo.findByIds(group.agents);
                        agents.push(...groupAgents);
                    }
                }
            }
        }

        // If no specific agents/groups, get all active agents for the account
        if (agents.length === 0) {
            const result = await this.agentRepo.findByAccount(campaign.account_id, { status: "active" });
            agents = result.agents;
        }

        // Filter out busy agents, inactive agents, and agents already on calls
        const availableAgents = agents.filter(agent => {
            const agentId = agent._id.toString();
            const isAvailable = agent.is_active && 
                   !this.agentStatus.has(agentId) && 
                   !this.agentCallMap.has(agentId) && // Agent not already on a call
                   agent.personal_phone;
            
            // Log when agent is skipped due to being on another call
            if (agent.is_active && this.agentCallMap.has(agentId)) {
                const callInfo = this.agentCallMap.get(agentId);
                console.log(`⚠️ Skipping agent ${agent.full_name} - already on call for campaign "${callInfo.campaignName}"`);
            }
            
            return isAvailable;
        });

        console.log(`📊 Agent availability: ${availableAgents.length}/${agents.length} agents available`);
        return availableAgents;
    }

    // ==================== CALL PROCESSING ====================

    async processCallQueue(callOriginationId) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return;

        try {
            const agents = await this.getAvailableAgents(callInfo.campaign);
            
            if (agents.length === 0) {
                console.log("❌ No available agents found");
                await this.updateCallStatus(callOriginationId, "missed by agent(s)", "No available agents");
                return;
            }

            console.log(`🔄 Found ${agents.length} available agents`);

            // Try agents based on routing strategy
            const success = await this.tryAgentsByRouting(callOriginationId, agents, callInfo.campaign.call_routing);

            if (!success) {
                console.log("❌ All agents failed to answer");
                await this.updateCallStatus(callOriginationId, "missed by agent(s)", "All agents failed to answer");
            }

        } catch (error) {
            console.error("Error processing call queue:", error);
            await this.updateCallStatus(callOriginationId, "missed", `Error: ${error.message}`);
        }
    }

    async tryAgentsByRouting(callOriginationId, agents, callRouting) {
        const callType = callRouting?.call_type || "sequential";
        
        switch (callType) {
            case "round_robin":
                return await this.tryAgentsRoundRobin(callOriginationId, agents);
            case "today_priority":
                return await this.tryAgentsTodayPriority(callOriginationId, agents);
            case "blind_sequence":
                return await this.tryAgentsBlindSequence(callOriginationId, agents);
            case "sequential":
            default:
                return await this.tryAgentsSequential(callOriginationId, agents);
        }
    }

    async tryAgentsSequential(callOriginationId, agents) {
        for (const agent of agents) {
            const success = await this.tryAgent(callOriginationId, agent);
            if (success) {
                return true; // Call successful, stop trying more agents
            }
        }
        return false; // All agents failed
    }

    async tryAgentsRoundRobin(callOriginationId, agents) {
        // Simple round-robin implementation
        const shuffledAgents = [...agents].sort(() => Math.random() - 0.5);
        return await this.tryAgentsSequential(callOriginationId, shuffledAgents);
    }

    async tryAgentsTodayPriority(callOriginationId, agents) {
        // Sort agents by today's performance (you can implement this logic)
        const sortedAgents = [...agents].sort((a, b) => {
            // Implement priority logic based on call stats
            return (b.call_stats?.answered || 0) - (a.call_stats?.answered || 0);
        });
        return await this.tryAgentsSequential(callOriginationId, sortedAgents);
    }

    async tryAgentsBlindSequence(callOriginationId, agents) {
        // Try all agents simultaneously (blind sequence)
        const promises = agents.map(agent => this.tryAgent(callOriginationId, agent));
        const results = await Promise.allSettled(promises);
        return results.some(result => result.status === 'fulfilled' && result.value === true);
    }

    // ==================== AGENT CALLING ====================

    async tryAgent(callOriginationId, agent) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return false;

        try {
            console.log(`🔄 Trying agent: ${agent.full_name} (${agent.personal_phone})`);

            // Add agent to agents array with "in-progress" status
            const agentData = {
                id: agent._id,
                last_call_status: "in-progress"
            };

            this.addAgentToCall(callInfo, agentData);

            // Mark agent as on call to prevent conflicts
            this.agentCallMap.set(agent._id.toString(), {
                callOriginationId: callOriginationId,
                campaignId: callInfo.campaign._id,
                campaignName: callInfo.campaign.name,
                startTime: new Date()
            });

            // Update ringing agent and agents array
            await this.callRepo.updateByIdAndAccount(callInfo.callRecord._id, callInfo.callRecord.account_id, {
                ringing_agent: agentData,
                agents: callInfo.agents
            });

            // Start agent call
            const agentUuid = await this.fsService.startAgentCall(agent.personal_phone, callOriginationId);
            
            // Wait for agent to answer (30 seconds timeout)
            const agentAnswered = await this.fsService.waitForAgentAnswer(agentUuid, 30000);
            
            if (!agentAnswered) {
                console.log(`❌ Agent ${agent.full_name} did not answer`);
                await this.fsService.hangupCall(agentUuid);
                await this.handleAgentMissed(callOriginationId, agent._id);
                return false;
            }

            console.log(`✅ Agent ${agent.full_name} answered, calling lead ${callInfo.callRecord.lead_data.phone_number}`);
            
            // Agent answered, now call lead and bridge
            const leadUuid = await this.callLeadAndBridge(agentUuid, callInfo.callRecord.lead_data.phone_number, callOriginationId);
            
            if (!leadUuid) {
                await this.handleLeadMissed(callOriginationId, agent._id, agentUuid);
                return false;
            }
            
            // Both agent and lead answered - call is now in progress
            await this.handleCallConnected(callOriginationId, agent._id, agentUuid, leadUuid);
            return true;

        } catch (error) {
            console.error(`Error calling agent ${agent.full_name}:`, error);
            await this.handleAgentMissed(callOriginationId, agent._id);
            return false;
        }
    }

    async callLeadAndBridge(agentUuid, leadNumber, callOriginationId) {
        try {
            const leadUuid = await this.fsService.callLeadAndBridge(agentUuid, leadNumber, callOriginationId);
            console.log(`✅ Both agent and lead answered - call connected!`);
            return leadUuid;
        } catch (leadError) {
            console.log(`❌ Lead did not answer: ${leadError.message}`);
            return null;
        }
    }

    // ==================== CALL EVENT HANDLERS ====================

    addAgentToCall(callInfo, agentData) {
        const existingAgentIndex = callInfo.agents.findIndex(a => a.id.toString() === agentData.id.toString());
        if (existingAgentIndex === -1) {
            callInfo.agents.push(agentData);
        } else {
            callInfo.agents[existingAgentIndex] = agentData;
        }
    }

    async handleAgentMissed(callOriginationId, agentId) {
        await this.updateAgentStatus(callOriginationId, agentId, "missed");
        
        // Remove agent from call map since they didn't answer
        this.agentCallMap.delete(agentId.toString());
        
        // Mark agent as busy temporarily
        this.agentStatus.set(agentId.toString(), "busy");
        setTimeout(() => {
            this.agentStatus.delete(agentId.toString());
        }, 30000); // Reset after 30 seconds
    }

    async handleLeadMissed(callOriginationId, agentId, agentUuid) {
        await this.fsService.hangupCall(agentUuid);
        await this.updateAgentStatus(callOriginationId, agentId, "missed");
        await this.updateCallStatus(callOriginationId, "un-answered", "Agent answered but lead did not answer");
    }

    async handleCallConnected(callOriginationId, agentId, agentUuid, leadUuid) {
        const callInfo = this.activeCalls.get(callOriginationId);
        
        await this.updateAgentStatus(callOriginationId, agentId, "answered");
        
        // Update call info
        callInfo.agentUuid = agentUuid;
        callInfo.leadUuid = leadUuid;
        callInfo.agentId = agentId;
        callInfo.status = "in-progress";

        // Update call status to "in-progress"
        await this.updateCallStatus(callOriginationId, "in-progress", "Call is in progress - both agent and lead connected");
        
        // Update call_details with successful call information
        await this.callRepo.updateByIdAndAccount(callInfo.callRecord._id, callInfo.callRecord.account_id, {
            "call_details.start_time": new Date(),
            "call_details.recording_url": null,
            updated_at: new Date()
        });
    }

    async handleCallHangup(callOriginationId, uuid, cause) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return;

        try {
            if (callInfo.agentUuid === uuid) {
                console.log(`📴 Agent hung up: ${cause}`);
                
                // Remove agent from call map when they hang up
                if (callInfo.agentId) {
                    this.agentCallMap.delete(callInfo.agentId.toString());
                }
                
                if (callInfo.status === "in-progress") {
                    await this.updateCallStatus(callOriginationId, "answered", `Call completed - agent hung up: ${cause}`);
                } else {
                    await this.updateCallStatus(callOriginationId, "missed", `Agent hung up: ${cause}`);
                }
            } else if (callInfo.leadUuid === uuid) {
                console.log(`📴 Lead hung up: ${cause}`);
                
                // Remove agent from call map when lead hangs up (call ends)
                if (callInfo.agentId) {
                    this.agentCallMap.delete(callInfo.agentId.toString());
                }
                
                if (callInfo.status === "in-progress") {
                    await this.updateCallStatus(callOriginationId, "answered", `Call completed - lead hung up: ${cause}`);
                } else {
                    await this.updateCallStatus(callOriginationId, "missed", `Lead hung up: ${cause}`);
                }
            }

            // Update call_details with end time and duration
            await this.updateCallEndTime(callOriginationId);

        } catch (error) {
            console.error(`Error handling call hangup:`, error);
        }
    }

    // ==================== STATUS MANAGEMENT ====================

    async updateAgentStatus(callOriginationId, agentId, status) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return;

        try {
            const agentIndex = callInfo.agents.findIndex(a => a.id.toString() === agentId.toString());
            if (agentIndex !== -1) {
                callInfo.agents[agentIndex].last_call_status = status;
            }

            // Update ringing agent if it's the same agent
            if (callInfo.ringingAgent && callInfo.ringingAgent.id.toString() === agentId.toString()) {
                callInfo.ringingAgent.last_call_status = status;
            }

            // Update database
            await this.callRepo.updateByIdAndAccount(callInfo.callRecord._id, callInfo.callRecord.account_id, {
                agents: callInfo.agents,
                ringing_agent: callInfo.ringingAgent,
                updated_at: new Date()
            });

            console.log(`📊 Agent ${agentId} status updated to: ${status}`);

        } catch (error) {
            console.error(`Error updating agent status for ${agentId}:`, error);
        }
    }

    async updateCallStatus(callOriginationId, status, description = null) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return;

        try {
            const updateData = {
                "call_status.call_state": status,
                "call_status.description": description || `Call status: ${status}`,
                updated_at: new Date()
            };

            // If call is completed, update call_details with end time and duration
            if (this.isCallCompleted(status)) {
                await this.updateCallEndTime(callOriginationId, updateData);
            }

            // Update database
            await this.callRepo.updateByIdAndAccount(callInfo.callRecord._id, callInfo.callRecord.account_id, updateData);

            // Update active call info
            callInfo.status = status;

            console.log(`📊 Call ${callOriginationId} status updated to: ${status}`);

        } catch (error) {
            console.error(`Error updating call status for ${callOriginationId}:`, error);
        }
    }

    async updateCallEndTime(callOriginationId, updateData = {}) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return;

        const endTime = new Date();
        const startTime = callInfo.callRecord.call_details?.start_time || callInfo.callRecord.start_time;
        const duration = Math.floor((endTime - startTime) / 1000);

        updateData["call_details.end_time"] = endTime;
        updateData["call_details.duration"] = duration;

        await this.callRepo.updateByIdAndAccount(callInfo.callRecord._id, callInfo.callRecord.account_id, updateData);
    }

    isCallCompleted(status) {
        return ["answered", "missed", "missed by agent(s)", "un-answered"].includes(status);
    }

    // ==================== CALL QUERIES ====================

    async getCallStatus(callOriginationId) {
        const callInfo = this.activeCalls.get(callOriginationId);
        
        if (!callInfo) {
            return {
                status: "not_found",
                message: "Call not found in active calls"
            };
        }

        return {
            call_id: callInfo.callRecord._id,
            call_origination_id: callOriginationId,
            status: callInfo.status,
            agents: callInfo.agents,
            ringing_agent: callInfo.ringingAgent,
            agent_uuid: callInfo.agentUuid,
            lead_uuid: callInfo.leadUuid,
            campaign: {
                id: callInfo.campaign._id,
                name: callInfo.campaign.name
            }
        };
    }

    async getActiveCalls(accountId) {
        const activeCalls = [];
        
        for (const [callOriginationId, callInfo] of this.activeCalls) {
            if (callInfo.callRecord.account_id.toString() === accountId.toString()) {
                activeCalls.push({
                    call_id: callInfo.callRecord._id,
                    call_origination_id: callOriginationId,
                    status: callInfo.status,
                    lead_data: callInfo.callRecord.lead_data,
                    campaign_name: callInfo.campaign.name,
                    agents: callInfo.agents,
                    ringing_agent: callInfo.ringingAgent
                });
            }
        }

        return activeCalls;
    }

    // ==================== CALL CONTROL ====================

    async cancelCall(callOriginationId) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) {
            throw new AppError("Call not found", 404);
        }

        try {
            // Hangup active calls
            if (callInfo.agentUuid) {
                await this.fsService.hangupCall(callInfo.agentUuid);
            }
            if (callInfo.leadUuid) {
                await this.fsService.hangupCall(callInfo.leadUuid);
            }

            // Remove agent from call map if they were on this call
            if (callInfo.agentId) {
                this.agentCallMap.delete(callInfo.agentId.toString());
            }

            // Update call status
            await this.updateCallStatus(callOriginationId, "missed", "Call cancelled by user");

            // Remove from active calls
            this.activeCalls.delete(callOriginationId);

            return {
                call_id: callInfo.callRecord._id,
                call_origination_id: callOriginationId,
                status: "cancelled",
                message: "Call cancelled successfully"
            };

        } catch (error) {
            console.error("Error cancelling call:", error);
            throw error;
        }
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get information about agents currently on calls (for debugging)
     */
    getAgentsOnCalls() {
        const agentsOnCalls = [];
        
        for (const [agentId, callInfo] of this.agentCallMap) {
            agentsOnCalls.push({
                agent_id: agentId,
                call_origination_id: callInfo.callOriginationId,
                campaign_id: callInfo.campaignId,
                campaign_name: callInfo.campaignName,
                start_time: callInfo.startTime,
                duration_minutes: Math.floor((Date.now() - callInfo.startTime.getTime()) / 60000)
            });
        }
        
        return agentsOnCalls;
    }

    /**
     * Check if an agent is available for calling
     */
    isAgentAvailable(agentId) {
        const agentIdStr = agentId.toString();
        return !this.agentStatus.has(agentIdStr) && !this.agentCallMap.has(agentIdStr);
    }

    async updateCallRecording(callOriginationId, recordingUrl) {
        const callInfo = this.activeCalls.get(callOriginationId);
        if (!callInfo) return;

        try {
            await this.callRepo.updateByIdAndAccount(callInfo.callRecord._id, callInfo.callRecord.account_id, {
                "call_details.recording_url": recordingUrl,
                recording_url: recordingUrl,
                updated_at: new Date()
            });

            console.log(`📹 Recording updated for call ${callOriginationId}: ${recordingUrl}`);

        } catch (error) {
            console.error(`Error updating call recording:`, error);
        }
    }

    cleanupCompletedCalls() {
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        for (const [callOriginationId, callInfo] of this.activeCalls) {
            const callAge = Date.now() - callInfo.callRecord.start_time.getTime();
            
            if (callAge > maxAge && this.isCallCompleted(callInfo.status)) {
                console.log(`🧹 Cleaning up old completed call: ${callOriginationId}`);
                
                // Remove agent from call map if they were on this call
                if (callInfo.agentId) {
                    this.agentCallMap.delete(callInfo.agentId.toString());
                }
                
                this.activeCalls.delete(callOriginationId);
            }
        }
    }

    // ==================== HEALTH CHECK ====================

    getHealthStatus() {
        return {
            freeswitch_connected: this.fsService ? this.fsService.isConnectedToFreeSwitch() : false,
            active_calls: this.activeCalls.size,
            call_queue_length: this.callQueue.length,
            agent_status_tracking: this.agentStatus.size,
            agents_on_calls: this.agentCallMap.size,
            agent_conflicts_prevented: this.agentCallMap.size > 0
        };
    }
}

module.exports = CallQueueService;