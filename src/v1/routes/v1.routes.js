const express = require("express");
const authRoutes = require("./auth.routes");
const agentRoutes = require("./agent.routes");
const agentGroupRoutes = require("./agentGroup.routes");
const campaignRoutes = require("./campaign.routes");
const callRoutes = require("./call.routes");
const blocklistRoutes = require("./blocklist.routes");
const facebookRoutes = require("./facebook.routes");
const integrationRoutes = require("./integration.routes");
const { isLoggedIn } = require("../middlewares/auth.middleware");
const { statusCheckMiddleware } = require("../middlewares/status.middleware");

const router = express.Router();

// Public routes (no authentication required)
router.use("/auth", authRoutes);

// Apply authentication middleware to all routes below
router.use(isLoggedIn);

// Apply status check middleware
router.use(statusCheckMiddleware);

// Protected routes (authentication required)
router.use("/agent", agentRoutes);
router.use("/agent-group", agentGroupRoutes);
router.use("/campaign", campaignRoutes);
router.use("/call", callRoutes);
router.use("/block", blocklistRoutes);
router.use("/facebook", facebookRoutes);
router.use("/integration", integrationRoutes);

module.exports = router;
