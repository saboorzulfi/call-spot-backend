const express = require('express');
const SipTrunkController = require('../controllers/sip-trunk.controller');

/**
 * SIP Trunk Routes
 * API endpoints for SIP trunk integration
 */
const router = express.Router();

// Initialize controller (will be injected with service)
let sipTrunkController;

/**
 * Set controller (dependency injection)
 */
const setController = (controller) => {
  sipTrunkController = controller;
};

/**
 * Routes
 */

// Incoming call handling
router.post('/incoming-call', (req, res, next) => {
  sipTrunkController.handleIncomingCall(req, res, next);
});

// Agent management
router.post('/agents', (req, res, next) => {
  sipTrunkController.addAgent(req, res, next);
});

router.delete('/agents/:agentId', (req, res, next) => {
  sipTrunkController.removeAgent(req, res, next);
});

router.put('/agents/:agentId/status', (req, res, next) => {
  sipTrunkController.updateAgentStatus(req, res, next);
});

router.get('/agents/:agentId', (req, res, next) => {
  sipTrunkController.getAgentInfo(req, res, next);
});

router.get('/agents', (req, res, next) => {
  sipTrunkController.getAgentList(req, res, next);
});

// Call management
router.get('/calls/:callId', (req, res, next) => {
  sipTrunkController.getCallInfo(req, res, next);
});

router.post('/calls/:callId/complete', (req, res, next) => {
  sipTrunkController.handleCallCompletion(req, res, next);
});

router.get('/calls/active', (req, res, next) => {
  sipTrunkController.getActiveCalls(req, res, next);
});

// Agent login/logout
router.post('/agents/:agentId/login', (req, res, next) => {
  sipTrunkController.handleAgentLogin(req, res, next);
});

router.post('/agents/:agentId/logout', (req, res, next) => {
  sipTrunkController.handleAgentLogout(req, res, next);
});

// System management
router.get('/stats', (req, res, next) => {
  sipTrunkController.getSystemStats(req, res, next);
});

router.get('/queue/status', (req, res, next) => {
  sipTrunkController.getQueueStatus(req, res, next);
});

router.get('/health', (req, res, next) => {
  sipTrunkController.healthCheck(req, res, next);
});

// FreeSWITCH commands
router.post('/freeswitch/command', (req, res, next) => {
  sipTrunkController.sendFreeSwitchCommand(req, res, next);
});

// Emergency handling
router.post('/emergency', (req, res, next) => {
  sipTrunkController.handleEmergency(req, res, next);
});

module.exports = { router, setController };

