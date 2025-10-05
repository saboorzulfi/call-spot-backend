const express = require("express");
const FacebookController = require("../controllers/facebook.controller");

const router = express.Router();
const facebookController = new FacebookController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Facebook integration endpoints (aligned with Go backend)
router.post("/access-token", facebookController.saveAccessToken);        // POST /facebook/access-token
router.delete("/access-token", facebookController.deleteAccessToken);   // DELETE /facebook/access-token
router.get("/page", facebookController.getPages);                        // GET /facebook/page
router.post("/form", facebookController.getForms);                        // GET /facebook/form
router.get("/form-fields", facebookController.getFormFields);            // GET /facebook/form-fields
router.get("/leads", facebookController.getLeads);                       // GET /facebook/leads

// Facebook campaign integration endpoints (aligned with Go backend widget integration)
router.put("/campaign/:id", facebookController.updateCampaignWithFacebookData); // PUT /facebook/campaign/:id
router.post("/campaigns", facebookController.getCampaignsWithFacebookData);      // GET /facebook/campaigns

module.exports = router;
