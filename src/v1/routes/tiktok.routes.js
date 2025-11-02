const express = require("express");
const TikTokController = require("../controllers/tiktok.controller");

const router = express.Router();
const tiktokController = new TikTokController();

router.post("/access-token", tiktokController.saveAccessToken);        
router.delete("/access-token", tiktokController.deleteAccessToken);   
router.get("/advertiser", tiktokController.getAdvertisers);                       
router.post("/form", tiktokController.getForms);                       
router.get("/form-fields", tiktokController.getFormFields);           
router.get("/leads", tiktokController.getLeads);                      

router.put("/campaign/:id", tiktokController.updateCampaignWithTikTokData); 
router.delete("/campaign/:id", tiktokController.deleteCampaignWithTikTokData);     
router.get("/campaign/:id", tiktokController.getCampaignWithTikTokData);     
router.post("/campaigns", tiktokController.getCampaignsWithTikTokData);     

module.exports = router;

