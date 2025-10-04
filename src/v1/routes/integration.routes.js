const express = require("express");
const IntegrationController = require("../controllers/integration.controller");

const router = express.Router();
const integrationController = new IntegrationController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Integration endpoints (aligned with Go backend)
router.get("/status", integrationController.getIntegrationStatus); // GET /integration/status

module.exports = router;
