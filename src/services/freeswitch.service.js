const ESL = require("modesl");

class FreeSwitchService {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.activeCalls = new Map();
        this.eventListeners = new Map();
        
        // Configuration
        this.config = {
            host: process.env.FS_HOST || "127.0.0.1",
            port: parseInt(process.env.FS_PORT || "8021"),
            password: process.env.FS_PASSWORD || "ClueCon",
            gateway: process.env.FS_GATEWAY || "external::didlogic",
            didNumber: process.env.FS_DID_NUMBER || "442039960029"
        };
    }

    /**
     * Connect to FreeSWITCH ESL
     */
    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`🔌 Connecting to FreeSWITCH at ${this.config.host}:${this.config.port}`);
            
            this.connection = new ESL.Connection(
                this.config.host, 
                this.config.port, 
                this.config.password, 
                () => {
                    console.log("✅ Connected to FreeSWITCH ESL");
                    this.isConnected = true;
                    this.setupEventListeners();
                    resolve();
                }
            );

            this.connection.on('esl::error', (error) => {
                console.error("❌ ESL Connection Error:", error);
                this.isConnected = false;
                reject(error);
            });

            this.connection.on('esl::end', () => {
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

        connection.on("esl::event::CHANNEL_HANGUP_COMPLETE::*", (evt) => {
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

        // Build originate command for agent
        const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=false,hangup_after_bridge=false,continue_on_fail=true,originate_timeout=30,bypass_media=false,proxy_media=false,call_id=${callId}}sofia/gateway/${this.config.gateway}/${agentNumber} &echo()`;
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
        
        // Use originate with bridge
        const bridgeCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=true,originate_timeout=30,call_id=${callId}}sofia/gateway/${this.config.gateway}/${leadNumber} &bridge(sofia/gateway/${this.config.gateway}/${agentUuid})`;
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
        
        // Originate lead with park
        const leadCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=false,originate_timeout=30,call_id=${callId}}sofia/gateway/${this.config.gateway}/${leadNumber} &park()`;
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
