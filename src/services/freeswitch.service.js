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
            const answerState = evt.getHeader("Answer-State");
            console.log(`📞 Channel answered: ${uuid} | Direction: ${direction} | Caller: ${callerIdName} (${callerIdNumber}) | Answer State: ${answerState}`);

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
            const callDirection = evt.getHeader("Call-Direction");
            
            console.log(`📴 Channel hung up: ${uuid} | Cause: ${cause} | Direction: ${callDirection} | Call ID: ${callId || 'N/A'}`);

            // Notify listeners (always notify, even if callId is null)
            this.notifyListeners('channel_hangup', { uuid, cause, callId: callId || null });
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
     * @param {string} agentNumber - Agent's phone number
     * @param {string} callId - Call ID for tracking
     * @param {boolean} useEcho - Whether to use echo() application (default: true)
     *                           Set to false when prompt will be played (echo conflicts with prompt)
     */
    async startAgentCall(agentNumber, callId, useEcho = true) {
        const agentUuid = this.generateUUID();
        console.log(`📞 Starting agent call to: ${agentNumber}`);

        // Call agent - use echo() only if no prompt will be played
        // echo() plays agent's own voice back, which conflicts with prompt playback
        // When prompt is enabled, use answer() to keep channel active and ready for prompt playback
        // answer() answers the call and keeps it active without playing any audio
        // When we bridge, the echo/prompt will be replaced with lead's audio
        const echoApp = useEcho ? "&echo()" : "&answer()"; // Use answer() if no echo to keep channel alive and ready for prompt
        const agentCmd = `originate {origination_uuid=${agentUuid},ignore_early_media=false,hangup_after_bridge=false,continue_on_fail=true,originate_timeout=30,bypass_media=false,proxy_media=false}sofia/gateway/${this.config.gateway}/${agentNumber} ${echoApp}`;
        console.log("🧾 Agent Command:", agentCmd);
        if (!useEcho) {
            console.log("ℹ️ Using answer() instead of echo() - prompt will be played cleanly");
        }

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
                    console.log(`⏱️ Agent answer timeout for ${agentUuid}`);
                    resolve(false);
                }
            }, timeout);

            const listener = (data) => {
                // Only resolve as answered if it's the actual agent UUID and not early media
                if (data.uuid === agentUuid && !answered) {
                    // Add a small delay to check if the channel actually stays active
                    setTimeout(() => {
                        // Re-check if still connected
                        this.api(`uuid_exists ${agentUuid}`).then((result) => {
                            if (result.includes('true')) {
                                answered = true;
                                clearTimeout(timer);
                                this.removeListener('channel_answer', listener);
                                console.log(`✅ Agent answered and channel is active: ${agentUuid}`);
                                resolve(true);
                            } else {
                                console.log(`⚠️ Channel ${agentUuid} answered but quickly disconnected (early media)`);
                            }
                        });
                    }, 500);
                }
            };

            this.addListener('channel_answer', listener);
        });
    }

    /**
     * Call lead with direct bridge to agent (works when agent is answered)
     */
    async callLeadWithDirectBridge(agentNumber, leadNumber, callId) {
        const leadUuid = this.generateUUID();

        console.log(`📞 Dialing lead with direct bridge: ${leadNumber}`);

        // Direct bridge approach - call lead and bridge to agent number
        // This works when agent is already answered
        const bridgeCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=true,originate_timeout=30}sofia/gateway/${this.config.gateway}/${leadNumber} &bridge(sofia/gateway/${this.config.gateway}/${agentNumber})`;
        console.log("🧾 Bridge Command:", bridgeCmd);

        const res = await this.api(bridgeCmd);
        console.log("📤 Bridge originate result:", res.trim());

        if (!res.startsWith("+OK")) {
            throw new Error("Failed to bridge calls");
        }

        return leadUuid;
    }

    /**
     * Call lead and bridge to agent UUID (for parked calls that were unparked)
     */
    async callLeadAndBridgeToUUID(agentUuid, leadNumber, callId) {
        const leadUuid = this.generateUUID();

        console.log(`📞 Dialing lead and bridging to agent UUID: ${leadNumber}`);

        // Use the agent UUID in the bridge command
        const bridgeCmd = `originate {origination_uuid=${leadUuid},ignore_early_media=false,bypass_media=false,proxy_media=false,hangup_after_bridge=true,originate_timeout=30}sofia/gateway/${this.config.gateway}/${leadNumber} &bridge(${agentUuid})`;
        console.log("🧾 Bridge Command:", bridgeCmd);

        const res = await this.api(bridgeCmd);
        console.log("📤 Bridge originate result:", res.trim());

        if (!res.startsWith("+OK")) {
            throw new Error("Failed to bridge calls");
        }

        return leadUuid;
    }

    /**
     * Call lead separately, then bridge using uuid_bridge (your working method 2)
     */
    async callLeadSeparateAndBridge(agentUuid, leadNumber, callId) {
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
        const result = await this.waitForLeadAnswer(leadUuid, 60000);
        
        // If lead rejected, throw a specific error that we can catch and stop retrying
        if (result.rejected) {
            const error = new Error(`Lead rejected the call: ${result.cause}`);
            error.rejected = true;
            error.cause = result.cause;
            throw error;
        }
        
        if (!result.answered) {
            throw new Error("Lead did not answer");
        }

        // Bridge the calls using uuid_bridge (same as your working test script)
        console.log(`🔗 Bridging agent (${agentUuid}) <-> lead (${leadUuid})`);

        // Stop the looping prompt now that lead has answered
        // The prompt was playing continuously until this point
        try {
            await this.api(`uuid_broadcast ${agentUuid} stop:::-1`);
            console.log(`🔇 Stopped agent prompt (lead answered, bridging now)`);
        } catch (err) {
            console.log(`⚠️ Could not stop agent broadcast apps, continuing with bridge...`);
        }

        // Now bridge - the lead's audio will replace any existing media
        const bridgeRes = await this.api(`uuid_bridge ${agentUuid} ${leadUuid}`);
        console.log("📤 Bridge result:", bridgeRes.trim());

        if (bridgeRes.startsWith("+OK")) {
            console.log("✅ Bridge successful! Echo stopped and lead audio is now flowing.");

            // Start recording the call and return the recording file path
            console.log(`📹 Attempting to start recording for call ${callId}`);
            let recordingFile;
            try {
                recordingFile = await this.startCallRecording(callId, agentUuid, leadUuid);
            } catch (err) {
                console.error(`❌ Error in startCallRecording:`, err);
                recordingFile = null;
            }

            if (recordingFile) {
                console.log(`✅ Recording file returned: ${recordingFile}`);
                // Store recording file in a way that can be retrieved later
                this.recordingFiles = this.recordingFiles || new Map();
                this.recordingFiles.set(callId, recordingFile);
            } else {
                console.log(`⚠️  No recording file returned - recording may have failed`);
            }

            return { leadUuid, recordingFile };
        } else {
            throw new Error("Bridge failed");
        }
    }

    /**
     * Start looping prompt to the agent leg using HTTP playback.
     * We rely on uuid_broadcast playback with a looped file_string.
     * The 'aleg' flag ensures it plays to the agent leg (not the B leg).
     */
    async startAgentPrompt(agentUuid, promptUrl) {
        if (!agentUuid || !promptUrl) return;
        try {
            // Stop any existing playback first to ensure clean start
            try {
                await this.api(`uuid_broadcast ${agentUuid} stop:::-1`);
            } catch (e) {
                // Ignore if nothing to stop
            }
            
            // Try multiple methods to ensure prompt plays and is audible
            // Method 1: Use uuid_broadcast with playback and loop
            // The 'loop:' prefix tells FreeSWITCH to loop the file_string indefinitely
            // 'aleg' flag plays to the A leg (agent leg) only
            // Adding 'both' flag to ensure it plays on both directions might help
            let cmd = `uuid_broadcast ${agentUuid} playback::file_string=loop:${promptUrl} aleg`;
            let res = await this.api(cmd);
            console.log(`🔊 Started agent prompt loop (will play continuously until lead answers): ${res.trim()}`);
            
            // Verify it started successfully
            if (!res.trim().startsWith('+OK')) {
                console.log(`⚠️ uuid_broadcast failed, trying alternative method: ${res.trim()}`);
                // Fallback: Try using uuid_exec with playback directly
                try {
                    cmd = `uuid_exec ${agentUuid} playback file_string://loop:${promptUrl}`;
                    res = await this.api(cmd);
                    console.log(`🔊 Started agent prompt using uuid_exec: ${res.trim()}`);
                    if (!res.trim().startsWith('+OK')) {
                        throw new Error(`Both methods failed: ${res.trim()}`);
                    }
                } catch (e2) {
                    console.log(`⚠️ Alternative method also failed: ${e2.message}`);
                    throw new Error(`Failed to start prompt: ${e2.message}`);
                }
            }
        } catch (e) {
            console.log(`⚠️ Failed to start agent prompt: ${e.message}`);
            throw e; // Re-throw so caller knows it failed
        }
    }

    /**
     * Stop any currently running broadcast (echo/prompt) on agent leg.
     * Note: We don't try to stop echo() application directly as it can hang up the call.
     * Instead, we just stop any uuid_broadcast playback. The new prompt playback will
     * naturally interrupt the echo when it starts.
     */
    async stopAgentPrompt(agentUuid) {
        if (!agentUuid) return;
        try {
            // Stop any existing uuid_broadcast playback (like previous prompts)
            // We don't try to stop echo() as it can cause the call to hang up
            // The new prompt playback will interrupt echo naturally
            const res1 = await this.api(`uuid_broadcast ${agentUuid} stop:::-1`);
            console.log(`🔇 Stopped agent broadcast: ${res1.trim()}`);
        } catch (e) {
            // Ignore errors - channel might not have any broadcast running
            console.log(`ℹ️ No broadcast to stop (this is OK): ${e.message}`);
        }
    }

    /**
     * Start recording a call
     */
    async startCallRecording(callId, agentUuid, leadUuid) {
        try {
            // Generate unique recording filename with absolute path
            const timestamp = Date.now();
            const filename = `call_${callId}_${timestamp}.wav`;
            const recordingPath = `/usr/local/freeswitch/recordings/${filename}`;

            console.log(`📹 Starting recording for call ${callId}`);
            console.log(`📹 Agent UUID: ${agentUuid}, Lead UUID: ${leadUuid}`);
            console.log(`📹 Recording path: ${recordingPath}`);

            // Record both legs separately to ensure we get both sides of the conversation
            const recordResult1 = await this.api(`uuid_record ${agentUuid} start ${recordingPath}`);
            const recordResult2 = await this.api(`uuid_record ${leadUuid} start ${recordingPath}`);

            console.log(`📹 Agent recording result: ${recordResult1.trim()}`);
            console.log(`📹 Lead recording result: ${recordResult2.trim()}`);

            // Return the relative filename for storage
            return filename;
        } catch (error) {
            console.error(`❌ Error starting call recording:`, error);
            return null;
        }
    }

    /**
     * Stop recording and get the file
     */
    async stopCallRecording(callId) {
        try {
            const callInfo = this.activeCalls?.get(callId);
            if (!callInfo || !callInfo.recording_file) return null;

            const recordingFile = callInfo.recording_file;

            // Stop recording on the legs (they're already hung up, but let's make sure)
            console.log(`📹 Stopped recording for call ${callId} at ${recordingFile}`);

            // Return the recording URL
            const recordingUrl = `${this.getRecordingBaseUrl()}/${recordingFile}`;

            return recordingUrl;
        } catch (error) {
            console.error(`Error stopping call recording:`, error);
            return null;
        }
    }

    /**
     * Get base URL for recordings
     */
    getRecordingBaseUrl() {
        // Configure this based on your server setup
        // Example: http://localhost:8080 or your CDN URL
        return process.env.RECORDING_BASE_URL || 'http://localhost:8080';
    }

    /**
     * Wait for lead to answer
     * Returns: { answered: boolean, rejected: boolean, cause?: string }
     */
    waitForLeadAnswer(leadUuid, timeout = 60000) {
        return new Promise((resolve) => {
            let resolved = false;

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.removeListener('channel_answer', answerListener);
                    this.removeListener('channel_hangup', hangupListener);
                    console.log(`⏱️ Lead answer timeout for ${leadUuid}`);
                    resolve({ answered: false, rejected: false });
                }
            }, timeout);

            const answerListener = async (data) => {
                if (data.uuid === leadUuid && !resolved) {
                    // Verify the channel is actually answered, not just early media
                    try {
                        const channelInfo = await this.api(`uuid_exists ${leadUuid}`);
                        if (channelInfo.includes('true')) {
                            // Double-check channel state
                            const channelState = await this.api(`uuid_dump ${leadUuid}`);
                            if (channelState && !channelState.includes('NONE')) {
                                resolved = true;
                    clearTimeout(timer);
                                this.removeListener('channel_answer', answerListener);
                                this.removeListener('channel_hangup', hangupListener);
                    console.log(`✅ Lead answered: ${leadUuid}`);
                                resolve({ answered: true, rejected: false });
                            }
                        }
                    } catch (err) {
                        console.log(`⚠️ Error verifying lead answer for ${leadUuid}: ${err.message}`);
                    }
                }
            };

            const hangupListener = (data) => {
                if (data.uuid === leadUuid && !resolved) {
                    const { cause } = data;
                    // Check if lead rejected the call
                    const rejectionCauses = ['CALL_REJECTED', 'USER_BUSY', 'NO_ANSWER', 'NO_USER_RESPONSE'];
                    const isRejected = rejectionCauses.includes(cause);
                    
                    if (isRejected) {
                        resolved = true;
                        clearTimeout(timer);
                        this.removeListener('channel_answer', answerListener);
                        this.removeListener('channel_hangup', hangupListener);
                        console.log(`🚫 Lead rejected the call: ${leadUuid} (cause: ${cause})`);
                        resolve({ answered: false, rejected: true, cause });
                    } else {
                        // Other hangup causes (like timeout) - just mark as not answered
                        resolved = true;
                        clearTimeout(timer);
                        this.removeListener('channel_answer', answerListener);
                        this.removeListener('channel_hangup', hangupListener);
                        console.log(`📴 Lead call ended: ${leadUuid} (cause: ${cause})`);
                        resolve({ answered: false, rejected: false, cause });
                    }
                }
            };

            this.addListener('channel_answer', answerListener);
            this.addListener('channel_hangup', hangupListener);
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
