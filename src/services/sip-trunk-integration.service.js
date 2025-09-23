const FreeSwitchService = require('./freeswitch.service');
const CallManagerService = require('./call-manager.service');
const QueueManagerService = require('./queue-manager.service');
const EventEmitter = require('events');

/**
 * SIP Trunk Integration Service
 * Main service that orchestrates FreeSWITCH, call management, and queue management
 */
class SipTrunkIntegrationService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    // Initialize services
    this.fsService = new FreeSwitchService(config.freeswitch);
    this.queueManager = new QueueManagerService(config.queue);
    this.callManager = new CallManagerService(this.fsService, config.routing);
    
    this.isInitialized = false;
    this.setupEventHandlers();
  }

  /**
   * Initialize the integration service
   */
  async initialize() {
    try {
      console.log('Initializing SIP Trunk Integration Service...');
      
      // Initialize FreeSWITCH service
      await this.fsService.initialize();
      
      // Start queue cleanup timer
      this.queueManager.startCleanupTimer();
      
      this.isInitialized = true;
      console.log('SIP Trunk Integration Service initialized successfully');
      
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize SIP Trunk Integration Service:', error);
      throw error;
    }
  }

  /**
   * Set up event handlers between services
   */
  setupEventHandlers() {
    // Queue Manager Events
    this.queueManager.on('callQueued', (callInfo) => {
      console.log(`Call queued: ${callInfo.id}`);
      this.emit('callQueued', callInfo);
    });

    this.queueManager.on('agentAssigned', (assignment) => {
      console.log(`Agent assigned: ${assignment.agentId} to call ${assignment.callId}`);
      this.emit('agentAssigned', assignment);
    });

    this.queueManager.on('agentAnswered', (answer) => {
      console.log(`Agent answered: ${answer.agentId}`);
      this.emit('agentAnswered', answer);
    });

    this.queueManager.on('callCompleted', (completion) => {
      console.log(`Call completed: ${completion.callId}`);
      this.emit('callCompleted', completion);
    });

    this.queueManager.on('callFailed', (failure) => {
      console.log(`Call failed: ${failure.callId}`);
      this.emit('callFailed', failure);
    });

    this.queueManager.on('callExpired', (expiration) => {
      console.log(`Call expired: ${expiration.callId}`);
      this.emit('callExpired', expiration);
    });

    // Call Manager Events
    this.callManager.on('callerQueued', (data) => {
      console.log(`Caller queued: ${data.callerUuid}`);
      this.emit('callerQueued', data);
    });

    this.callManager.on('agentRinging', (data) => {
      console.log(`Agent ringing: ${data.agentUuid}`);
      this.emit('agentRinging', data);
    });

    this.callManager.on('agentAnswered', (data) => {
      console.log(`Agent answered: ${data.agentUuid}`);
      this.emit('agentAnswered', data);
    });

    this.callManager.on('outboundCallInitiated', (data) => {
      console.log(`Outbound call initiated: ${data.leadNumber}`);
      this.emit('outboundCallInitiated', data);
    });

    this.callManager.on('outboundAnswered', (data) => {
      console.log(`Outbound answered: ${data.outboundUuid}`);
      this.emit('outboundAnswered', data);
    });

    this.callManager.on('channelsBridged', (data) => {
      console.log(`Channels bridged: ${data.agentUuid} <-> ${data.outboundUuid}`);
      this.emit('channelsBridged', data);
    });

    this.callManager.on('bridgeCompleted', (data) => {
      console.log(`Bridge completed: ${data.agentUuid} <-> ${data.outboundUuid}`);
      this.emit('bridgeCompleted', data);
    });

    // FreeSWITCH Service Events
    this.fsService.on('event', (event, serverKey) => {
      // Handle other FreeSWITCH events
      this.emit('freeswitchEvent', { event, serverKey });
    });

    this.fsService.on('bridgeError', (error) => {
      console.error('Bridge error:', error);
      this.emit('bridgeError', error);
    });

    this.fsService.on('originateError', (error) => {
      console.error('Originate error:', error);
      this.emit('originateError', error);
    });
  }

  /**
   * Handle incoming call from SIP trunk
   */
  async handleIncomingCall(callData) {
    try {
      if (!this.isInitialized) {
        throw new Error('Service not initialized');
      }

      console.log(`Handling incoming call: ${callData.callerNumber} -> ${callData.leadNumber}`);

      // Add call to queue
      const queueEntry = this.queueManager.addCallToQueue({
        callerUuid: callData.callerUuid,
        callerNumber: callData.callerNumber,
        leadNumber: callData.leadNumber,
        accountId: callData.accountId,
        widgetId: callData.widgetId,
        priority: callData.priority || 1,
        maxWaitTime: callData.maxWaitTime || 60
      });

      this.emit('incomingCallHandled', {
        callId: queueEntry.id,
        callerNumber: callData.callerNumber,
        leadNumber: callData.leadNumber
      });

      return queueEntry;
    } catch (error) {
      console.error('Error handling incoming call:', error);
      this.emit('incomingCallError', { callData, error });
      throw error;
    }
  }

  /**
   * Add agent to the system
   */
  addAgent(agentData) {
    try {
      console.log(`Adding agent: ${agentData.id}`);
      
      const agent = this.queueManager.addAgent({
        id: agentData.id,
        name: agentData.name,
        extension: agentData.extension,
        accountId: agentData.accountId
      });

      this.emit('agentAdded', agent);
      return agent;
    } catch (error) {
      console.error('Error adding agent:', error);
      this.emit('agentAddError', { agentData, error });
      throw error;
    }
  }

  /**
   * Remove agent from the system
   */
  removeAgent(agentId) {
    try {
      console.log(`Removing agent: ${agentId}`);
      
      this.queueManager.removeAgent(agentId);
      
      this.emit('agentRemoved', { agentId });
    } catch (error) {
      console.error('Error removing agent:', error);
      this.emit('agentRemoveError', { agentId, error });
      throw error;
    }
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId, status) {
    try {
      console.log(`Updating agent status: ${agentId} -> ${status}`);
      
      this.queueManager.updateAgentStatus(agentId, status);
      
      this.emit('agentStatusUpdated', { agentId, status });
    } catch (error) {
      console.error('Error updating agent status:', error);
      this.emit('agentStatusUpdateError', { agentId, status, error });
      throw error;
    }
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    return {
      queue: this.queueManager.getQueueStats(),
      calls: this.callManager.getCallStats(),
      freeswitch: this.fsService.getStatus(),
      initialized: this.isInitialized
    };
  }

  /**
   * Get call information
   */
  getCallInfo(callId) {
    return this.queueManager.getCallInfo(callId);
  }

  /**
   * Get agent information
   */
  getAgentInfo(agentId) {
    return this.queueManager.getAgentInfo(agentId);
  }

  /**
   * Send command to FreeSWITCH
   */
  async sendFreeSwitchCommand(command, serverKey) {
    try {
      await this.fsService.sendCommand(command, serverKey);
      this.emit('freeswitchCommandSent', { command, serverKey });
    } catch (error) {
      console.error('Error sending FreeSWITCH command:', error);
      this.emit('freeswitchCommandError', { command, serverKey, error });
      throw error;
    }
  }

  /**
   * Handle agent login
   */
  handleAgentLogin(agentId, channelInfo) {
    try {
      console.log(`Agent login: ${agentId}`);
      
      // Update agent status to available
      this.queueManager.updateAgentStatus(agentId, 'available');
      
      this.emit('agentLoggedIn', { agentId, channelInfo });
    } catch (error) {
      console.error('Error handling agent login:', error);
      this.emit('agentLoginError', { agentId, error });
    }
  }

  /**
   * Handle agent logout
   */
  handleAgentLogout(agentId, reason) {
    try {
      console.log(`Agent logout: ${agentId} (${reason})`);
      
      // Remove agent from system
      this.queueManager.removeAgent(agentId);
      
      this.emit('agentLoggedOut', { agentId, reason });
    } catch (error) {
      console.error('Error handling agent logout:', error);
      this.emit('agentLogoutError', { agentId, reason, error });
    }
  }

  /**
   * Handle call completion
   */
  handleCallCompletion(callId, duration, agentId) {
    try {
      console.log(`Call completion: ${callId} (Duration: ${duration}s)`);
      
      // Update queue manager
      this.queueManager.handleCallComplete(callId, duration);
      
      this.emit('callCompleted', { callId, duration, agentId });
    } catch (error) {
      console.error('Error handling call completion:', error);
      this.emit('callCompletionError', { callId, duration, agentId, error });
    }
  }

  /**
   * Handle emergency scenarios
   */
  handleEmergency() {
    try {
      console.log('Handling emergency scenario');
      
      // Clear all queues
      this.queueManager.callQueue = [];
      
      // Set all agents to unavailable
      for (const [agentId] of this.queueManager.agentStatuses) {
        this.queueManager.updateAgentStatus(agentId, 'unavailable');
      }
      
      this.emit('emergencyHandled');
    } catch (error) {
      console.error('Error handling emergency:', error);
      this.emit('emergencyError', error);
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    try {
      console.log('Shutting down SIP Trunk Integration Service...');
      
      // Close FreeSWITCH connections
      await this.fsService.close();
      
      // Clear all data
      this.queueManager.callQueue = [];
      this.queueManager.activeCalls.clear();
      this.queueManager.agentQueue = [];
      this.queueManager.agentStatuses.clear();
      this.queueManager.agentChannels.clear();
      
      this.isInitialized = false;
      
      console.log('SIP Trunk Integration Service shutdown complete');
      this.emit('shutdown');
    } catch (error) {
      console.error('Error during shutdown:', error);
      this.emit('shutdownError', error);
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        freeswitch: this.fsService.isConnected,
        queue: this.queueManager.callQueue.length < 100, // Queue not overloaded
        callManager: this.callManager.activeCalls.size < 50 // Not too many active calls
      },
      stats: this.getSystemStats()
    };

    // Check if any service is unhealthy
    if (!health.services.freeswitch || !health.services.queue || !health.services.callManager) {
      health.status = 'unhealthy';
    }

    return health;
  }
}

module.exports = SipTrunkIntegrationService;

