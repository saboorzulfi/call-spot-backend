const EventEmitter = require('events');

/**
 * Call Manager Service
 * Handles the complete call flow: incoming caller -> queue -> agent -> outbound bridge
 */
class CallManagerService extends EventEmitter {
  constructor(freeSwitchService, config) {
    super();
    this.fsService = freeSwitchService;
    this.config = config;
    
    // Call tracking maps
    this.activeCalls = new Map(); // caller_uuid -> call info
    this.agentCalls = new Map(); // agent_uuid -> call info
    this.outboundCalls = new Map(); // outbound_uuid -> call info
    this.pendingBridges = new Map(); // agent_uuid -> { caller_uuid, lead_number }
    
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for FreeSWITCH events
   */
  setupEventHandlers() {
    // Handle incoming caller events
    this.fsService.on('channelOriginated', (data) => {
      this.handleIncomingCaller(data);
    });

    // Handle agent answer events
    this.fsService.on('agentAnswered', (data) => {
      this.handleAgentAnswer(data);
    });

    // Handle outbound channel creation
    this.fsService.on('outboundChannelCreated', (data) => {
      this.handleOutboundChannelCreated(data);
    });

    // Handle outbound channel answer
    this.fsService.on('outboundAnswered', (data) => {
      this.handleOutboundAnswer(data);
    });

    // Handle channel hangup
    this.fsService.on('channelHangup', (data) => {
      this.handleChannelHangup(data);
    });

    // Handle bridge completion
    this.fsService.on('channelsBridged', (data) => {
      this.handleBridgeComplete(data);
    });
  }

  /**
   * Handle incoming caller - put into queue
   */
  handleIncomingCaller(data) {
    const { uuid: callerUuid, callerUuid: originalCallerUuid, serverKey } = data;
    
    console.log(`Incoming caller: ${callerUuid} (original: ${originalCallerUuid})`);
    
    // Store call information
    this.activeCalls.set(callerUuid, {
      uuid: callerUuid,
      originalUuid: originalCallerUuid,
      serverKey: serverKey,
      status: 'queued',
      queuedAt: new Date(),
      leadNumber: data.leadNumber || null,
      agentUuid: null,
      outboundUuid: null
    });

    // Emit event for external handling (e.g., database logging)
    this.emit('callerQueued', {
      callerUuid: callerUuid,
      serverKey: serverKey,
      leadNumber: data.leadNumber
    });

    // Find available agent and initiate call
    this.findAvailableAgent(callerUuid, serverKey);
  }

  /**
   * Find available agent and initiate call
   */
  async findAvailableAgent(callerUuid, serverKey) {
    try {
      // This would typically query your database for available agents
      // For now, we'll simulate finding an agent
      const availableAgent = await this.getAvailableAgent();
      
      if (availableAgent) {
        console.log(`Found available agent: ${availableAgent.uuid}`);
        
        // Update call info with agent
        const callInfo = this.activeCalls.get(callerUuid);
        if (callInfo) {
          callInfo.agentUuid = availableAgent.uuid;
          callInfo.agentId = availableAgent.id;
          callInfo.status = 'ringing_agent';
          callInfo.agentRingingAt = new Date();
        }

        // Store agent call info
        this.agentCalls.set(availableAgent.uuid, {
          agentUuid: availableAgent.uuid,
          agentId: availableAgent.id,
          callerUuid: callerUuid,
          serverKey: serverKey,
          status: 'ringing',
          ringingAt: new Date()
        });

        this.emit('agentRinging', {
          agentUuid: availableAgent.uuid,
          agentId: availableAgent.id,
          callerUuid: callerUuid,
          serverKey: serverKey
        });
      } else {
        console.log('No available agents found');
        this.emit('noAgentsAvailable', { callerUuid, serverKey });
      }
    } catch (error) {
      console.error('Error finding available agent:', error);
      this.emit('agentSearchError', { callerUuid, serverKey, error });
    }
  }

  /**
   * Handle agent answer
   */
  handleAgentAnswer(data) {
    const { uuid: agentUuid, agentId, accountId, widgetId, serverKey } = data;
    
    console.log(`Agent answered: ${agentUuid} (Agent ID: ${agentId})`);
    
    // Update agent call status
    const agentCall = this.agentCalls.get(agentUuid);
    if (agentCall) {
      agentCall.status = 'answered';
      agentCall.answeredAt = new Date();
      
      // Get the caller UUID for this agent
      const callerUuid = agentCall.callerUuid;
      
      // Update caller info
      const callInfo = this.activeCalls.get(callerUuid);
      if (callInfo) {
        callInfo.status = 'agent_answered';
        callInfo.agentAnsweredAt = new Date();
      }

      // Store pending bridge info
      this.pendingBridges.set(agentUuid, {
        callerUuid: callerUuid,
        leadNumber: callInfo?.leadNumber || 'unknown',
        serverKey: serverKey
      });

      this.emit('agentAnswered', {
        agentUuid: agentUuid,
        agentId: agentId,
        callerUuid: callerUuid,
        serverKey: serverKey
      });

      // Now initiate outbound call to lead
      this.initiateOutboundCall(agentUuid, callInfo?.leadNumber || 'unknown', serverKey);
    }
  }

  /**
   * Initiate outbound call to lead number
   */
  async initiateOutboundCall(agentUuid, leadNumber, serverKey) {
    try {
      console.log(`Initiating outbound call to ${leadNumber} for agent ${agentUuid}`);
      
      // Use FreeSWITCH service to originate call
      await this.fsService.originateCall(agentUuid, leadNumber, serverKey);
      
      this.emit('outboundCallInitiated', {
        agentUuid: agentUuid,
        leadNumber: leadNumber,
        serverKey: serverKey
      });
    } catch (error) {
      console.error('Error initiating outbound call:', error);
      this.emit('outboundCallError', {
        agentUuid: agentUuid,
        leadNumber: leadNumber,
        serverKey: serverKey,
        error: error
      });
    }
  }

  /**
   * Handle outbound channel creation
   */
  handleOutboundChannelCreated(data) {
    const { uuid: outboundUuid, agentUuid, leadNumber, serverKey } = data;
    
    console.log(`Outbound channel created: ${outboundUuid} for agent ${agentUuid}`);
    
    // Store outbound call info
    this.outboundCalls.set(outboundUuid, {
      uuid: outboundUuid,
      agentUuid: agentUuid,
      leadNumber: leadNumber,
      serverKey: serverKey,
      status: 'created',
      createdAt: new Date()
    });

    this.emit('outboundChannelCreated', {
      outboundUuid: outboundUuid,
      agentUuid: agentUuid,
      leadNumber: leadNumber,
      serverKey: serverKey
    });
  }

  /**
   * Handle outbound channel answer
   */
  handleOutboundAnswer(data) {
    const { uuid: outboundUuid, agentUuid, leadNumber, serverKey } = data;
    
    console.log(`Outbound channel answered: ${outboundUuid} for agent ${agentUuid}`);
    
    // Update outbound call status
    const outboundCall = this.outboundCalls.get(outboundUuid);
    if (outboundCall) {
      outboundCall.status = 'answered';
      outboundCall.answeredAt = new Date();
    }

    // Update agent call status
    const agentCall = this.agentCalls.get(agentUuid);
    if (agentCall) {
      agentCall.status = 'outbound_answered';
      agentCall.outboundUuid = outboundUuid;
    }

    // Update main call status
    const callInfo = this.activeCalls.get(agentCall?.callerUuid);
    if (callInfo) {
      callInfo.status = 'outbound_answered';
      callInfo.outboundUuid = outboundUuid;
      callInfo.outboundAnsweredAt = new Date();
    }

    this.emit('outboundAnswered', {
      outboundUuid: outboundUuid,
      agentUuid: agentUuid,
      leadNumber: leadNumber,
      serverKey: serverKey
    });

    // Now bridge the channels
    this.bridgeChannels(agentUuid, outboundUuid, serverKey);
  }

  /**
   * Bridge agent and outbound channels
   */
  async bridgeChannels(agentUuid, outboundUuid, serverKey) {
    try {
      console.log(`Bridging channels: ${agentUuid} <-> ${outboundUuid}`);
      
      // Use FreeSWITCH service to bridge channels
      await this.fsService.bridgeChannels(agentUuid, outboundUuid, serverKey);
      
      // Update call statuses
      const agentCall = this.agentCalls.get(agentUuid);
      const outboundCall = this.outboundCalls.get(outboundUuid);
      
      if (agentCall) {
        agentCall.status = 'bridged';
        agentCall.bridgedAt = new Date();
      }
      
      if (outboundCall) {
        outboundCall.status = 'bridged';
        outboundCall.bridgedAt = new Date();
      }

      // Update main call status
      const callInfo = this.activeCalls.get(agentCall?.callerUuid);
      if (callInfo) {
        callInfo.status = 'bridged';
        callInfo.bridgedAt = new Date();
      }

      this.emit('channelsBridged', {
        agentUuid: agentUuid,
        outboundUuid: outboundUuid,
        serverKey: serverKey
      });
    } catch (error) {
      console.error('Error bridging channels:', error);
      this.emit('bridgeError', {
        agentUuid: agentUuid,
        outboundUuid: outboundUuid,
        serverKey: serverKey,
        error: error
      });
    }
  }

  /**
   * Handle bridge completion
   */
  handleBridgeComplete(data) {
    const { agentUuid, outboundUuid, serverKey } = data;
    
    console.log(`Bridge completed: ${agentUuid} <-> ${outboundUuid}`);
    
    this.emit('bridgeCompleted', {
      agentUuid: agentUuid,
      outboundUuid: outboundUuid,
      serverKey: serverKey
    });
  }

  /**
   * Handle channel hangup
   */
  handleChannelHangup(data) {
    const { uuid, serverKey, hangupCause } = data;
    
    console.log(`Channel hangup: ${uuid} (Cause: ${hangupCause})`);
    
    // Clean up tracking maps
    this.activeCalls.delete(uuid);
    this.agentCalls.delete(uuid);
    this.outboundCalls.delete(uuid);
    this.pendingBridges.delete(uuid);
    
    this.emit('channelHangup', {
      uuid: uuid,
      serverKey: serverKey,
      hangupCause: hangupCause
    });
  }

  /**
   * Get available agent (placeholder - implement based on your agent management)
   */
  async getAvailableAgent() {
    // This is a placeholder implementation
    // In a real system, you would query your database for available agents
    return {
      uuid: 'agent-uuid-' + Date.now(),
      id: 'agent-123',
      name: 'Test Agent',
      status: 'available'
    };
  }

  /**
   * Get call statistics
   */
  getCallStats() {
    return {
      activeCalls: this.activeCalls.size,
      agentCalls: this.agentCalls.size,
      outboundCalls: this.outboundCalls.size,
      pendingBridges: this.pendingBridges.size,
      totalCalls: this.activeCalls.size + this.agentCalls.size + this.outboundCalls.size
    };
  }

  /**
   * Get call information by UUID
   */
  getCallInfo(uuid) {
    return {
      activeCall: this.activeCalls.get(uuid),
      agentCall: this.agentCalls.get(uuid),
      outboundCall: this.outboundCalls.get(uuid),
      pendingBridge: this.pendingBridges.get(uuid)
    };
  }
}

module.exports = CallManagerService;
