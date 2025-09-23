const AppResponse = require('../../utils/response.util');
const tryCatchAsync = require('../../utils/try_catch.util');

/**
 * SIP Trunk Controller
 * Handles API endpoints for SIP trunk integration
 */
class SipTrunkController {
  constructor(sipTrunkService) {
    this.sipTrunkService = sipTrunkService;
  }

  /**
   * Handle incoming call from SIP trunk
   */
  handleIncomingCall = tryCatchAsync(async (req, res, next) => {
    const { callerNumber, leadNumber, accountId, widgetId, priority, maxWaitTime } = req.body;
    
    // Generate caller UUID
    const callerUuid = `caller-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const callData = {
      callerUuid,
      callerNumber,
      leadNumber,
      accountId: req.account._id,
      widgetId,
      priority: priority || 1,
      maxWaitTime: maxWaitTime || 60
    };

    const result = await this.sipTrunkService.handleIncomingCall(callData);
    
    return AppResponse.success(res, result, 'Call handled successfully');
  });

  /**
   * Add agent to the system
   */
  addAgent = tryCatchAsync(async (req, res, next) => {
    const { id, name, extension, accountId } = req.body;
    
    const agentData = {
      id: id || `agent-${Date.now()}`,
      name,
      extension,
      accountId: req.account._id
    };

    const result = await this.sipTrunkService.addAgent(agentData);
    
    return AppResponse.success(res, result, 'Agent added successfully');
  });

  /**
   * Remove agent from the system
   */
  removeAgent = tryCatchAsync(async (req, res, next) => {
    const { agentId } = req.params;
    
    await this.sipTrunkService.removeAgent(agentId);
    
    return AppResponse.success(res, null, 'Agent removed successfully');
  });

  /**
   * Update agent status
   */
  updateAgentStatus = tryCatchAsync(async (req, res, next) => {
    const { agentId } = req.params;
    const { status } = req.body;
    
    await this.sipTrunkService.updateAgentStatus(agentId, status);
    
    return AppResponse.success(res, null, 'Agent status updated successfully');
  });

  /**
   * Get system statistics
   */
  getSystemStats = tryCatchAsync(async (req, res, next) => {
    const stats = this.sipTrunkService.getSystemStats();
    
    return AppResponse.success(res, stats, 'System statistics retrieved successfully');
  });

  /**
   * Get call information
   */
  getCallInfo = tryCatchAsync(async (req, res, next) => {
    const { callId } = req.params;
    
    const callInfo = this.sipTrunkService.getCallInfo(callId);
    
    if (!callInfo) {
      return AppResponse.error(res, 'Call not found', 404);
    }
    
    return AppResponse.success(res, callInfo, 'Call information retrieved successfully');
  });

  /**
   * Get agent information
   */
  getAgentInfo = tryCatchAsync(async (req, res, next) => {
    const { agentId } = req.params;
    
    const agentInfo = this.sipTrunkService.getAgentInfo(agentId);
    
    if (!agentInfo.agent) {
      return AppResponse.error(res, 'Agent not found', 404);
    }
    
    return AppResponse.success(res, agentInfo, 'Agent information retrieved successfully');
  });

  /**
   * Send FreeSWITCH command
   */
  sendFreeSwitchCommand = tryCatchAsync(async (req, res, next) => {
    const { command, serverKey } = req.body;
    
    await this.sipTrunkService.sendFreeSwitchCommand(command, serverKey);
    
    return AppResponse.success(res, null, 'FreeSWITCH command sent successfully');
  });

  /**
   * Handle agent login
   */
  handleAgentLogin = tryCatchAsync(async (req, res, next) => {
    const { agentId, channelInfo } = req.body;
    
    this.sipTrunkService.handleAgentLogin(agentId, channelInfo);
    
    return AppResponse.success(res, null, 'Agent login handled successfully');
  });

  /**
   * Handle agent logout
   */
  handleAgentLogout = tryCatchAsync(async (req, res, next) => {
    const { agentId, reason } = req.body;
    
    this.sipTrunkService.handleAgentLogout(agentId, reason);
    
    return AppResponse.success(res, null, 'Agent logout handled successfully');
  });

  /**
   * Handle call completion
   */
  handleCallCompletion = tryCatchAsync(async (req, res, next) => {
    const { callId, duration, agentId } = req.body;
    
    this.sipTrunkService.handleCallCompletion(callId, duration, agentId);
    
    return AppResponse.success(res, null, 'Call completion handled successfully');
  });

  /**
   * Health check
   */
  healthCheck = tryCatchAsync(async (req, res, next) => {
    const health = this.sipTrunkService.healthCheck();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    return AppResponse.success(res, health, 'Health check completed', statusCode);
  });

  /**
   * Emergency handler
   */
  handleEmergency = tryCatchAsync(async (req, res, next) => {
    this.sipTrunkService.handleEmergency();
    
    return AppResponse.success(res, null, 'Emergency handled successfully');
  });

  /**
   * Get queue status
   */
  getQueueStatus = tryCatchAsync(async (req, res, next) => {
    const stats = this.sipTrunkService.getSystemStats();
    
    return AppResponse.success(res, {
      queueLength: stats.queue.queueLength,
      activeCalls: stats.queue.activeCalls,
      availableAgents: stats.queue.availableAgents,
      totalAgents: stats.queue.totalAgents,
      averageWaitTime: stats.queue.averageWaitTime
    }, 'Queue status retrieved successfully');
  });

  /**
   * Get active calls
   */
  getActiveCalls = tryCatchAsync(async (req, res, next) => {
    const stats = this.sipTrunkService.getSystemStats();
    
    return AppResponse.success(res, {
      activeCalls: stats.queue.activeCalls,
      totalCalls: stats.calls.totalCalls
    }, 'Active calls retrieved successfully');
  });

  /**
   * Get agent list
   */
  getAgentList = tryCatchAsync(async (req, res, next) => {
    const stats = this.sipTrunkService.getSystemStats();
    
    // This would typically come from your database
    // For now, return basic info
    return AppResponse.success(res, {
      totalAgents: stats.queue.totalAgents,
      availableAgents: stats.queue.availableAgents,
      agents: [] // Would be populated from database
    }, 'Agent list retrieved successfully');
  });
}

module.exports = SipTrunkController;

