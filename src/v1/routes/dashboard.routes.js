const express = require("express");
const DashboardController = require("../controllers/dashboard.controller");

const router = express.Router();
const dashboardController = new DashboardController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

router.get("/stats", dashboardController.getStats);
router.get("/stats/by-campaign", dashboardController.getStatsByCampaign);

module.exports = router;

