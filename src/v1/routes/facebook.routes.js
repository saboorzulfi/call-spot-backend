const express = require("express");
const FacebookController = require("../controllers/facebook.controller");

const router = express.Router();
const facebookController = new FacebookController();



router.post("/access-token", facebookController.saveAccessToken);        
router.delete("/access-token", facebookController.deleteAccessToken);   
router.get("/page", facebookController.getPages);                       
router.post("/form", facebookController.getForms);                       
router.get("/form-fields", facebookController.getFormFields);           
router.get("/leads", facebookController.getLeads);                      


router.put("/campaign/:id", facebookController.updateCampaignWithFacebookData); 
router.get("/campaign/:id", facebookController.getCampaignWithFacebookData);     
router.post("/campaigns", facebookController.getCampaignsWithFacebookData);     

module.exports = router;
