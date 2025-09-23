const express = require("express");
const AgentGroupController = require("../controllers/agentGroup.controller");

const router = express.Router();
const agentGroupController = new AgentGroupController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Collection/static routes first
router.get("/default", agentGroupController.getDefault);
router.get("/available", agentGroupController.getAvailable);
router.get("/statistics", agentGroupController.getStatistics);
router.get("/performance", agentGroupController.getByPerformance);
router.get("/type", agentGroupController.getByType);
router.get("/search", agentGroupController.search);
router.get("/count", agentGroupController.getCount);

// CRUD
router.post("/", agentGroupController.create);
router.get("/", agentGroupController.getAll);
router.put("/:id", agentGroupController.update);
router.delete("/:id", agentGroupController.delete);

// Agent management within groups
router.post("/:id/agents", agentGroupController.addAgent);
router.delete("/:id/agents/:agent_id", agentGroupController.removeAgent);

// Group operations
router.post("/:id/clone", agentGroupController.clone);
router.put("/:id/set-default", agentGroupController.setAsDefault);

// Statistics and performance
router.put("/:id/call-stats", agentGroupController.updateCallStats);

// Routes with :id at the end
router.get("/:id", agentGroupController.getById);
router.get("/:id/availability", agentGroupController.checkAvailability);

module.exports = router;
