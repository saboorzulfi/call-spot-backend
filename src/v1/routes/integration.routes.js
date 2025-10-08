const express = require("express");
const IntegrationController = require("../controllers/integration.controller");

const router = express.Router();
const integrationController = new IntegrationController();

router.get("/status", integrationController.getIntegrationStatus);
router.get("/profile", integrationController.getSocialUserData); 

module.exports = router;
