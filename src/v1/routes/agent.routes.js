const express = require("express");
const router = express.Router();
const AgentController = require("../controllers/agent.controller");
const agentController = new AgentController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Static and collection routes first (avoid conflict with /:id)
router.get("/available/list", agentController.getAvailableAgents);
router.get("/performance/top", agentController.getByPerformance);
router.get("/available/time", agentController.getAvailableByTime);
router.get("/statistics/overview", agentController.getStatistics);
router.get("/search/advanced", agentController.search);
router.get("/count/summary", agentController.getCount);

// Basic CRUD operations
router.post("/", agentController.create);
router.get("/", agentController.getAll);
router.put("/:id", agentController.update);
router.delete("/:id", agentController.delete);

// Performance metrics
router.put("/:id/performance", agentController.updatePerformanceMetrics);

// API key management
router.post("/:id/api-key", agentController.generateApiKey);
router.delete("/:id/api-key", agentController.revokeApiKey);

// Bulk operations
router.put("/bulk/update", agentController.bulkUpdate);
router.delete("/bulk/delete", agentController.bulkDelete);

// Agent training and deployment
router.put("/:id/train", agentController.trainAgent);
router.put("/:id/deploy", agentController.deployAgent);

// Routes with :id at the end to avoid shadowing static routes
router.get("/:id", agentController.getById);
router.get("/:id/availability", agentController.checkAvailability);

module.exports = router;
