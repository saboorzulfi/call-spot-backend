const ESL = require("modesl");
const config = require("../config/config");

class FreeSwitchService {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.activeCalls = new Map();
        this.eventListeners = new Map();
        
        // Configuration - Use main config file
        this.config = {
            host: config.esl.host,
            port: config.esl.port,
            password: config.esl.password,
            gateway: "external::didlogic", // Your working gateway format
            didNumber: config.dialer.didNumber,
            agentPrefix: config.dialer.agentPrefix,
            leadPrefix: config.dialer.leadPrefix,
            siptrunk: config.siptrunk
        };
    }

    /**
     * Connect to FreeSWITCH ESL
     */
    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`🔌 Connecting to FreeSWITCH at ${this.config.host}:${this.config.port}`);
            
            // Set a timeout for connection attempts
            const timeout = setTimeout(() => {
                console.error("❌ FreeSWITCH connection timeout (10 seconds)");
                this.isConnected = false;
                reject(new Error("Connection timeout"));
            }, 10000);
            
            this.connection = new ESL.Connection(
                this.config.host, 
                this.config.port, 
                this.config.password, 
                () => {
                    clearTimeout(timeout);
                    console.log("✅ Connected to FreeSWITCH ESL");
                    this.isConnected = true;
                    this.setupEventListeners();
                    resolve();
                }
            );

            this.connection.on('esl::error', (error) => {
                clearTimeout(timeout);
                console.error("❌ ESL Connection Error:", error);
                this.isConnected = false;
                reject(error);
            });

            this.connection.on('esl::end', () => {
                clearTimeout(timeout);
                console.log("🔌 ESL Connection ended");
                this.isConnected = false;
            });
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        console.log("🎧 Setting up event listeners...");
        
        // Subscribe to call events
        this.connection.events("plain", "all");
        
        this.connection.on("esl::event::CHANNEL_CREATE::*", (evt) => {
            const uuid = evt.getHeader("Unique-ID");
            const direction = evt.getHeader("Call-Direction");
            const callerIdName = evt.getHeader("Caller-Caller-ID-Name");
            const callerIdNumber = evt.getHeader("Caller-Caller-ID-Number");
            console.log(`🆕 Channel created: ${uuid} | Direction: ${direction} | Caller: ${callerIdName} (${callerIdNumber})`);
            
            // Notify listeners
            this.notifyListeners('channel_create', { uuid, direction, callerIdName, callerIdNumber });
        });

        this.connection.on("esl::event::CHANNEL_ANSWER::*", (evt) => {
            const uuid = evt.getHeader("Unique-ID");
            const direction = evt.getHeader("Call-Direction");
            const callerIdName = evt.getHeader("Caller-Caller-ID-Name");
            const callerIdNumber = evt.getHeader("Caller-Caller-ID-Number");
            console.log(`📞 Channel answered: ${uuid} | Direction: ${direction} | Caller: ${callerIdName} (${callerIdNumber})`);
            
            // Notify listeners
            this.notifyListeners('channel_answer', { uuid, direction, callerIdName, callerIdNumber });
        });

        this.connection.on("esl::event::CHANNEL_BRIDGE::*", (evt) => {
            const uuid = evt.getHeader("Unique-ID");
            const otherUuid = evt.getHeader("Other-Leg-Unique-ID");
            console.log(`🔗 Channels bridged: ${uuid} <-> ${otherUuid}`);
            
            // Notify listeners
            this.notifyListeners('channel_bridge', { uuid, otherUuid });
        });

        this.connection.on("esl::event::CHANNEL_HANGUP_COMPLETE::*", (evt) => {
            const uuid = evt.getHeader("Unique-ID");
            const cause = evt.getHeader("Hangup-Cause");
            const callId = evt.getHeader("Call-ID");
            console.log(`📴 Channel hung up: ${uuid} | Cause: ${cause} | Call ID: ${callId}`);
            
            // Notify listeners
            this.notifyListeners('channel_hangup', { uuid, cause, callId });
        });
    }

    /**
     * Execute FreeSWITCH API command
     */
    async api(cmd) {
        return new Promise((resolve) => {
            this.connection.api(cmd, (res) => resolve(res.getBody()));
        });
    }

    /**
     * Generate UUID
     */
    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0,
                v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Start agent call
     */
    async startAgentCall(agentNumber, callId) {
        const agentUuid = this.generateUUID();
        console.log(`📞 Starting agent call to: ${agentNumber}`);

        // Call agent and put them on hold (no echo loop!)
        // Using &hold() instead of &echo() to prevent the agent hearing their own voice
        const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=false,hangup_after_bridge=false,continue_on_fail=true,originate_timeout=30,bypass_media=false,proxy_media=false}sofia/gateway/${this.config.gateway}/${agentNumber} &hold()`;
        console.log("🧾 Agent Command:", agentCmd);

        const result = await this.api(agentCmd);
        console.log("📤 Agent originate result:", result.trim());

        if (!result.startsWith("+OK")) {
            throw new Error("Failed to start agent call");
        }

        return agentUuid;
    }

    /**
     * Wait for agent to answer
     */
    waitForAgentAnswer(agentUuid, timeout = 30000) {
        return new Promise((resolve) => {
            let answered = false;

            const timer = setTimeout(() => {
                if (!answered) {
                    answered = true;
                    resolve(false);
                }
            }, timeout);

            const listener = (data) => {
                if (data.uuid === agentUuid && !answered) {
                    answered = true;
                    clearTimeout(timer);
                    this.removeListener('channel_answer', listener);
                    console.log(`✅ Agent answered: ${agentUuid}`);
                    resolve(true);
                }
            };

            this.addListener('channel_answer', listener);
        });
    }

    /**
     * Call lead and bridge with agent
     */
    async callLeadAndBridge(agentUuid, leadNumber, callId) {
        const leadUuid = this.generateUUID();
        
        console.log(`📞 Dialing lead and bridging: ${leadNumber}`);
        
        // Use your exact working bridge command format
        const bridgeCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=true,originate_timeout=30}sofia/gateway/${this.config.gateway}/${leadNumber} &bridge(sofia/gateway/${this.config.gateway}/${agentUuid})`;
        console.log("🧾 Bridge Command:", bridgeCmd);
        
        const res = await this.api(bridgeCmd);
        console.log("📤 Bridge originate result:", res.trim());
        
        if (!res.startsWith("+OK")) {
            throw new Error("Failed to bridge calls");
        }
        
        return leadUuid;
    }

    /**
     * Alternative: Call lead separately then bridge
     */
    async callLeadSeparate(agentUuid, leadNumber, callId) {
        const leadUuid = this.generateUUID();
        
        console.log(`📞 Dialing lead separately: ${leadNumber}`);
        
        // Use your exact working lead command format
        const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=false,originate_timeout=30}sofia/gateway/${this.config.gateway}/${leadNumber} &park()`;
        console.log("🧾 Lead Command:", leadCmd);
        
        const res = await this.api(leadCmd);
        console.log("📤 Lead originate result:", res.trim());
        
        if (!res.startsWith("+OK")) {
            throw new Error("Failed to originate lead");
        }
        
        // Wait for lead to answer
        const answered = await this.waitForLeadAnswer(leadUuid, 60000);
        if (!answered) {
            throw new Error("Lead did not answer");
        }
        
        // Bridge the calls
        console.log(`🔗 Bridging agent (${agentUuid}) <-> lead (${leadUuid})`);
        
        const bridgeRes = await this.api(`uuid_bridge ${agentUuid} ${leadUuid}`);
        console.log("📤 Bridge result:", bridgeRes.trim());
        
        if (!bridgeRes.startsWith("+OK")) {
            throw new Error("Bridge failed");
        }
        
        return leadUuid;
    }

    /**
     * Wait for lead to answer
     */
    waitForLeadAnswer(leadUuid, timeout = 60000) {
        return new Promise((resolve) => {
            let answered = false;

            const timer = setTimeout(() => {
                if (!answered) {
                    answered = true;
                    resolve(false);
                }
            }, timeout);

            const listener = (data) => {
                if (data.uuid === leadUuid && !answered) {
                    answered = true;
                    clearTimeout(timer);
                    this.removeListener('channel_answer', listener);
                    console.log(`✅ Lead answered: ${leadUuid}`);
                    resolve(true);
                }
            };

            this.addListener('channel_answer', listener);
        });
    }

    /**
     * Hangup call
     */
    async hangupCall(uuid) {
        const result = await this.api(`uuid_kill ${uuid}`);
        console.log(`📴 Hangup result for ${uuid}:`, result.trim());
        return result.startsWith("+OK");
    }

    /**
     * Add event listener
     */
    addListener(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    removeListener(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Notify all listeners of an event
     */
    notifyListeners(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Check if connected
     */
    isConnectedToFreeSwitch() {
        return this.isConnected;
    }

    /**
     * Your working call flow implementation
     */
    async startCallFlow(agentNumber, leadNumber) {
        try {
            console.log("🚀 Starting Call Flow (Your Working Version)");
            console.log("==========================================");
            console.log(`Agent: ${agentNumber}`);
            console.log(`Lead: ${leadNumber}`);
            console.log(`Gateway: ${this.config.gateway}`);
            console.log("");

            // Method 1: Try direct bridge approach (your working method)
            console.log("🔄 Trying Method 1: Direct Bridge Approach");
            const success = await this.callLeadAndBridge(null, leadNumber, "working_call");
            
            if (success) {
                console.log("✅ Method 1 successful!");
                return { success: true, method: "direct_bridge" };
            }

            console.log("❌ Method 1 failed, trying Method 2...");

            // Method 2: Separate calls then bridge (your backup method)
            console.log("🔄 Trying Method 2: Separate Calls + Bridge");
            
            // Start agent call
            const agentUuid = await this.startAgentCall(agentNumber, "working_call");
            if (!agentUuid) {
                console.log("❌ Failed to start agent call");
                return { success: false, error: "Failed to start agent call" };
            }

            // Wait for agent to answer
            const agentAnswered = await this.waitForAgentAnswer(agentUuid, 60000);
            if (agentAnswered) {
                console.log("✅ Agent answered! Dialing lead...");
                const leadUuid = await this.callLeadSeparate(agentUuid, leadNumber, "working_call");
                return { success: true, method: "separate_bridge", agentUuid, leadUuid };
            } else {
                console.log("❌ Agent did not answer");
                return { success: false, error: "Agent did not answer" };
            }

        } catch (error) {
            console.error("❌ Call flow failed:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Disconnect
     */
    disconnect() {
        if (this.connection) {
            this.connection.close();
            this.isConnected = false;
        }
    }
}

module.exports = FreeSwitchService;
