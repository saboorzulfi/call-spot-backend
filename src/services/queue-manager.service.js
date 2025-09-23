const EventEmitter = require('events');

/**
 * Queue Manager Service
 * Manages call queues and agent status tracking
 */
class QueueManagerService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    // Queue management
    this.callQueue = [];
    this.agentQueue = [];
    this.activeCalls = new Map();
    
    // Agent status tracking
    this.agentStatuses = new Map(); // agentId -> status
    this.agentChannels = new Map(); // agentId -> channel info
    
    // Statistics
    this.stats = {
      totalCalls: 0,
      answeredCalls: 0,
      missedCalls: 0,
      averageWaitTime: 0,
      averageCallDuration: 0
    };
  }

  /**
   * Add incoming call to queue
   */
  addCallToQueue(callInfo) {
    const queueEntry = {
      id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      callerUuid: callInfo.callerUuid,
      callerNumber: callInfo.callerNumber,
      leadNumber: callInfo.leadNumber,
      accountId: callInfo.accountId,
      widgetId: callInfo.widgetId,
      queuedAt: new Date(),
      status: 'queued',
      priority: callInfo.priority || 1,
      maxWaitTime: callInfo.maxWaitTime || 60, // seconds
      retryCount: 0,
      maxRetries: 3
    };

    // Add to queue based on priority
    this.insertByPriority(queueEntry);
    
    console.log(`Call added to queue: ${queueEntry.id} (Priority: ${queueEntry.priority})`);
    
    this.emit('callQueued', queueEntry);
    
    // Try to assign agent immediately
    this.tryAssignAgent();
    
    return queueEntry;
  }

  /**
   * Insert call into queue by priority
   */
  insertByPriority(callEntry) {
    let inserted = false;
    
    for (let i = 0; i < this.callQueue.length; i++) {
      if (callEntry.priority > this.callQueue[i].priority) {
        this.callQueue.splice(i, 0, callEntry);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      this.callQueue.push(callEntry);
    }
  }

  /**
   * Try to assign an agent to a queued call
   */
  tryAssignAgent() {
    if (this.callQueue.length === 0) {
      return; // No calls in queue
    }

    const availableAgent = this.getAvailableAgent();
    if (!availableAgent) {
      console.log('No available agents found');
      this.emit('noAgentsAvailable', { queueLength: this.callQueue.length });
      return;
    }

    const callEntry = this.callQueue.shift(); // Get highest priority call
    this.assignAgentToCall(callEntry, availableAgent);
  }

  /**
   * Get available agent
   */
  getAvailableAgent() {
    for (const agent of this.agentQueue) {
      if (this.isAgentAvailable(agent.id)) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Check if agent is available
   */
  isAgentAvailable(agentId) {
    const status = this.agentStatuses.get(agentId);
    return status === 'available' || status === 'idle';
  }

  /**
   * Assign agent to call
   */
  assignAgentToCall(callEntry, agent) {
    console.log(`Assigning agent ${agent.id} to call ${callEntry.id}`);
    
    // Update call status
    callEntry.status = 'ringing_agent';
    callEntry.assignedAgent = agent.id;
    callEntry.agentAssignedAt = new Date();
    
    // Update agent status
    this.agentStatuses.set(agent.id, 'ringing');
    this.agentChannels.set(agent.id, {
      callId: callEntry.id,
      callerUuid: callEntry.callerUuid,
      assignedAt: new Date(),
      status: 'ringing'
    });
    
    // Store active call
    this.activeCalls.set(callEntry.id, callEntry);
    
    this.emit('agentAssigned', {
      callId: callEntry.id,
      agentId: agent.id,
      callerUuid: callEntry.callerUuid,
      leadNumber: callEntry.leadNumber
    });
  }

  /**
   * Handle agent answer
   */
  handleAgentAnswer(agentId, channelInfo) {
    console.log(`Agent ${agentId} answered`);
    
    // Update agent status
    this.agentStatuses.set(agentId, 'busy');
    
    // Update agent channel info
    const agentChannel = this.agentChannels.get(agentId);
    if (agentChannel) {
      agentChannel.status = 'answered';
      agentChannel.answeredAt = new Date();
      agentChannel.channelInfo = channelInfo;
    }
    
    // Update call status
    const callId = agentChannel?.callId;
    if (callId) {
      const call = this.activeCalls.get(callId);
      if (call) {
        call.status = 'agent_answered';
        call.agentAnsweredAt = new Date();
      }
    }
    
    this.emit('agentAnswered', {
      agentId: agentId,
      callId: callId,
      channelInfo: channelInfo
    });
  }

  /**
   * Handle agent hangup
   */
  handleAgentHangup(agentId, reason) {
    console.log(`Agent ${agentId} hung up: ${reason}`);
    
    // Update agent status
    this.agentStatuses.set(agentId, 'available');
    
    // Get call info
    const agentChannel = this.agentChannels.get(agentId);
    if (agentChannel) {
      const callId = agentChannel.callId;
      const call = this.activeCalls.get(callId);
      
      if (call) {
        call.status = 'agent_hungup';
        call.agentHangupAt = new Date();
        call.hangupReason = reason;
        
        // Try to reassign call if it's still active
        if (call.status !== 'completed') {
          this.reassignCall(call);
        }
      }
      
      // Clean up agent channel
      this.agentChannels.delete(agentId);
    }
    
    this.emit('agentHangup', {
      agentId: agentId,
      reason: reason,
      callId: agentChannel?.callId
    });
    
    // Try to assign next call
    this.tryAssignAgent();
  }

  /**
   * Reassign call to another agent
   */
  reassignCall(call) {
    if (call.retryCount >= call.maxRetries) {
      console.log(`Call ${call.id} exceeded max retries, ending call`);
      call.status = 'failed';
      this.activeCalls.delete(call.id);
      this.stats.missedCalls++;
      
      this.emit('callFailed', {
        callId: call.id,
        reason: 'max_retries_exceeded'
      });
      return;
    }
    
    call.retryCount++;
    call.status = 'queued';
    call.assignedAgent = null;
    call.agentAssignedAt = null;
    
    // Re-add to queue
    this.insertByPriority(call);
    
    console.log(`Call ${call.id} reassigned (retry ${call.retryCount}/${call.maxRetries})`);
    
    this.emit('callReassigned', {
      callId: call.id,
      retryCount: call.retryCount
    });
    
    // Try to assign agent
    this.tryAssignAgent();
  }

  /**
   * Handle call completion
   */
  handleCallComplete(callId, duration) {
    const call = this.activeCalls.get(callId);
    if (!call) return;
    
    console.log(`Call ${callId} completed (Duration: ${duration}s)`);
    
    // Update call status
    call.status = 'completed';
    call.completedAt = new Date();
    call.duration = duration;
    
    // Update agent status
    if (call.assignedAgent) {
      this.agentStatuses.set(call.assignedAgent, 'available');
      this.agentChannels.delete(call.assignedAgent);
    }
    
    // Update statistics
    this.stats.totalCalls++;
    this.stats.answeredCalls++;
    this.updateAverageCallDuration(duration);
    
    // Clean up
    this.activeCalls.delete(callId);
    
    this.emit('callCompleted', {
      callId: callId,
      duration: duration,
      agentId: call.assignedAgent
    });
    
    // Try to assign next call
    this.tryAssignAgent();
  }

  /**
   * Update average call duration
   */
  updateAverageCallDuration(duration) {
    const totalDuration = this.stats.averageCallDuration * (this.stats.answeredCalls - 1) + duration;
    this.stats.averageCallDuration = totalDuration / this.stats.answeredCalls;
  }

  /**
   * Add agent to available pool
   */
  addAgent(agentInfo) {
    const agent = {
      id: agentInfo.id,
      name: agentInfo.name,
      extension: agentInfo.extension,
      accountId: agentInfo.accountId,
      status: 'available',
      addedAt: new Date()
    };
    
    this.agentQueue.push(agent);
    this.agentStatuses.set(agent.id, 'available');
    
    console.log(`Agent ${agent.id} added to queue`);
    
    this.emit('agentAdded', agent);
    
    // Try to assign calls
    this.tryAssignAgent();
    
    return agent;
  }

  /**
   * Remove agent from pool
   */
  removeAgent(agentId) {
    // Remove from queue
    this.agentQueue = this.agentQueue.filter(agent => agent.id !== agentId);
    
    // Handle any active calls
    const agentChannel = this.agentChannels.get(agentId);
    if (agentChannel) {
      this.handleAgentHangup(agentId, 'agent_removed');
    }
    
    // Clean up
    this.agentStatuses.delete(agentId);
    this.agentChannels.delete(agentId);
    
    console.log(`Agent ${agentId} removed from queue`);
    
    this.emit('agentRemoved', { agentId: agentId });
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId, status) {
    const currentStatus = this.agentStatuses.get(agentId);
    
    if (currentStatus !== status) {
      this.agentStatuses.set(agentId, status);
      
      console.log(`Agent ${agentId} status changed: ${currentStatus} -> ${status}`);
      
      this.emit('agentStatusChanged', {
        agentId: agentId,
        oldStatus: currentStatus,
        newStatus: status
      });
      
      // If agent became available, try to assign calls
      if (status === 'available') {
        this.tryAssignAgent();
      }
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const now = new Date();
    
    return {
      queueLength: this.callQueue.length,
      activeCalls: this.activeCalls.size,
      availableAgents: this.agentQueue.filter(agent => this.isAgentAvailable(agent.id)).length,
      totalAgents: this.agentQueue.length,
      averageWaitTime: this.calculateAverageWaitTime(),
      stats: { ...this.stats }
    };
  }

  /**
   * Calculate average wait time
   */
  calculateAverageWaitTime() {
    if (this.callQueue.length === 0) return 0;
    
    const now = new Date();
    const totalWaitTime = this.callQueue.reduce((total, call) => {
      return total + (now - call.queuedAt) / 1000; // seconds
    }, 0);
    
    return totalWaitTime / this.callQueue.length;
  }

  /**
   * Get call information
   */
  getCallInfo(callId) {
    return this.activeCalls.get(callId) || this.callQueue.find(call => call.id === callId);
  }

  /**
   * Get agent information
   */
  getAgentInfo(agentId) {
    const agent = this.agentQueue.find(agent => agent.id === agentId);
    const status = this.agentStatuses.get(agentId);
    const channel = this.agentChannels.get(agentId);
    
    return {
      agent: agent,
      status: status,
      channel: channel
    };
  }

  /**
   * Clean up expired calls
   */
  cleanupExpiredCalls() {
    const now = new Date();
    const expiredCalls = [];
    
    // Check queued calls
    for (let i = this.callQueue.length - 1; i >= 0; i--) {
      const call = this.callQueue[i];
      const waitTime = (now - call.queuedAt) / 1000; // seconds
      
      if (waitTime > call.maxWaitTime) {
        expiredCalls.push(call);
        this.callQueue.splice(i, 1);
      }
    }
    
    // Handle expired calls
    for (const call of expiredCalls) {
      call.status = 'expired';
      this.stats.missedCalls++;
      
      this.emit('callExpired', {
        callId: call.id,
        waitTime: (now - call.queuedAt) / 1000
      });
    }
    
    return expiredCalls.length;
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredCalls();
    }, 30000); // Every 30 seconds
  }
}

module.exports = QueueManagerService;

