const CallRepository = require("../v1/repositories/call.repository");
const CampaignRepository = require("../v1/repositories/campaign.repository");
const AgentRepository = require("../v1/repositories/agent.repository");
const AgentGroupRepository = require("../v1/repositories/agentGroup.repository");
const FreeSwitchService = require("./freeswitch.service");
const AppError = require("../utils/app_error.util");

class UltraSimpleCallService {
    constructor(fsService) {
        this.callRepo = new CallRepository();
        this.campaignRepo = new CampaignRepository();
        this.agentRepo = new AgentRepository();
        this.agentGroupRepo = new AgentGroupRepository();
        this.fsService = fsService;
        
        // Simple tracking - just active calls
        this.activeCalls = new Map();
        
        // Setup hangup listener
        this.setupHangupListener();
    }

    /**
     * Setup hangup listener to handle when either side hangs up
     */
    setupHangupListener() {
        if (!this.fsService) return;

        this.fsService.addListener('channel_hangup', (data) => {
            const { uuid, cause, callId } = data;
            
            console.log(`📴 Hangup event: uuid=${uuid}, callId=${callId}, cause=${cause}`);
            
            // Find the call by matching agent_uuid or lead_uuid
            let foundCallId = null;
            for (const [callIdKey, callInfo] of this.activeCalls) {
                // Match by agent or lead UUID
                if (callInfo.agent_uuid === uuid || callInfo.lead_uuid === uuid) {
                    foundCallId = callIdKey;
                    break;
                }
            }
            
            // If not found by UUID and callId is provided, try to find by callId
            if (!foundCallId && callId) {
                if (this.activeCalls.has(callId)) {
                    foundCallId = callId;
                }
            }
            
            if (foundCallId) {
                console.log(`🎯 Found call ${foundCallId} for hangup event`);
                this.handleCallCompleted(foundCallId, cause);
            } else {
                console.log(`⚠️  Could not find call for hangup uuid ${uuid}`);
            }
        });

        // Listen for bridge events
        this.fsService.addListener('channel_bridge', (data) => {
            const { uuid, otherUuid } = data;
            console.log(`🔗 Bridge detected: ${uuid} <-> ${otherUuid}`);
            
            // Find the call and mark it as answered (both connected)
            for (const [callIdKey, callInfo] of this.activeCalls) {
                if (callInfo.agent_uuid === uuid || callInfo.lead_uuid === uuid || 
                    callInfo.agent_uuid === otherUuid || callInfo.lead_uuid === otherUuid) {
                    this.handleCallAnswered(callIdKey);
                    break;
                }
            }
        });
    }

    /**
     * Main method: Start calling for a call document
     * This is the ONLY method you need!
     */
    async startCallingForCall(call) {
        try {
            console.log(`🚀 Starting call: ${call._id}`);
            
            // Store call info for hangup handling (even if call fails early)
            this.activeCalls.set(call._id.toString(), {
                call_id: call._id,
                callRecord: call,
                account_id: call.account_id,
                agent_uuid: null,
                lead_uuid: null,
                agent_id: null,
                agent_name: null,
                lead_number: null,
                start_time: new Date()
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
            }

            // All agents failed
            await this.updateCallStatus(call._id, call.account_id, "missed by agent(s)", "All agents failed");
            return { success: false, reason: "All agents failed" };

        } catch (error) {
            console.error("❌ Call failed:", error);
            await this.updateCallStatus(call._id, call.account_id, "missed", `Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Try calling a single agent
     */
    async tryAgentCall(call, agent) {
        try {
            // Update call status
            await this.updateCallStatus(call._id, call.account_id, "in-progress", `Calling agent: ${agent.full_name}`);
            
            // Add agent to call record
            await this.addAgentToCall(call._id, call.account_id, agent._id, "in-progress");

            // Check FreeSWITCH
            if (!this.fsService || !this.fsService.isConnectedToFreeSwitch()) {
                return { success: false, reason: "FreeSWITCH not available" };
            }

            // Step 1: Call agent (30 seconds timeout)
            const agentUuid = await this.fsService.startAgentCall(agent.personal_phone, call._id.toString());
            
            // IMMEDIATELY store agent_uuid so hangup events can find this call
            const existingCallInfo = this.activeCalls.get(call._id.toString());
            if (existingCallInfo) {
                existingCallInfo.agent_uuid = agentUuid;
                existingCallInfo.agent_id = agent._id;
                existingCallInfo.agent_name = agent.full_name;
            }
            
            const agentAnswered = await this.fsService.waitForAgentAnswer(agentUuid, 30000);
            
            if (!agentAnswered) {
                console.log(`❌ Agent ${agent.full_name} did not answer`);
                await this.fsService.hangupCall(agentUuid);
                await this.updateAgentStatus(call._id, call.account_id, agent._id, "missed");
                return { success: false, reason: "Agent did not answer" };
            }

            console.log(`✅ Agent ${agent.full_name} answered! Calling lead...`);
            await this.updateAgentStatus(call._id, call.account_id, agent._id, "in-progress");
            await this.updateCallStatus(call._id, call.account_id, "in-progress", `Agent ${agent.full_name} answered, calling lead...`);

            // Step 2: Call lead and bridge
            const leadNumber = call.lead_data.get('phone_number') || call.lead_data.phone_number;
            console.log(`📞 Dialing lead and bridging: ${leadNumber}`);
            const leadUuid = await this.fsService.callLeadAndBridge(agentUuid, leadNumber, call._id.toString());
            
            // Check if agent hung up while we were calling the lead
            // If call is no longer in activeCalls, it means agent hung up
            if (!this.activeCalls.has(call._id.toString())) {
                console.log(`❌ Agent hung up during lead call setup`);
                return { success: false, reason: "Agent hung up during call setup" };
            }
            
            if (!leadUuid) {
                console.log(`❌ Lead did not answer`);
                await this.fsService.hangupCall(agentUuid);
                await this.updateCallStatus(call._id, call.account_id, "un-answered", "Agent answered but lead did not answer");
                return { success: false, reason: "Lead did not answer" };
            }

            // Step 3: Lead answered - now wait for bridge confirmation
            console.log(`✅ Lead answered! Waiting for bridge confirmation...`);
            await this.updateCallStatus(call._id, call.account_id, "in-progress", "Lead answered, establishing bridge...");
            
            // Update active call info with lead connection details
            if (existingCallInfo) {
                existingCallInfo.lead_uuid = leadUuid;
                existingCallInfo.lead_number = leadNumber;
            }

            return { success: true };

        } catch (error) {
            console.error(`❌ Error calling agent ${agent.full_name}:`, error);
            await this.updateAgentStatus(call._id, call.account_id, agent._id, "missed");
            return { success: false, reason: error.message };
        }
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

        console.log(`📴 Call completed: ${cause}`);

        // Determine call status based on what happened
        let finalStatus = "completed";
        let finalDescription = `Call completed - ${cause}`;
        
        // If lead wasn't connected yet, this is an early hangup
        if (!callInfo.lead_uuid) {
            finalStatus = "missed";
            finalDescription = `Agent hung up before lead was connected - ${cause}`;
        }
        
        // Mark call with appropriate status
        if (callInfo && callInfo.account_id) {
            await this.updateCallStatus(callId, callInfo.account_id, finalStatus, finalDescription);
        }
        
        // Set agent back to free
        if (callInfo && callInfo.agent_id) {
            await this.updateAgentStatus(callId, callInfo.account_id, callInfo.agent_id, "free");
        }
        
        // Update call details with end time
        await this.updateCallEndTime(callId);

        // Remove from active calls
        this.activeCalls.delete(callId);
        
        console.log(`✅ Call ${callId} completed`);
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

        // If no specific agents, get all active agents for the account
        if (agents.length === 0) {
            const result = await this.agentRepo.findByAccount(campaign.account_id, { status: "active" });
            agents = result?.agents || []; // Handle null/undefined result
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
            await this.callRepo.updateByIdAndAccount(callId, accountId, {
                "call_status.call_state": status,
                "call_status.description": description,
                updated_at: new Date()
            });
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
                updated_at: new Date()
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
