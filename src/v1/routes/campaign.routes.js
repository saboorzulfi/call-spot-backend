const express = require("express");
const CampaignController = require("../controllers/campaign.controller");
const uploadS3 = require("../shared/services/image_upload.service");

const router = express.Router();
const campaignController = new CampaignController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Campaign CRUD routes
router.post("/", campaignController.create);
router.get("/", campaignController.getAll);
router.get("/campaign-options", campaignController.getCampaignOptions);

router.get("/:id", campaignController.getById);
router.put("/:id", campaignController.update);
router.delete("/:id", campaignController.delete);

// Campaign configs update with file uploads
router.patch("/:id", uploadS3("campaigns").fields([
  { name: 'Logo', maxCount: 1 },
  { name: 'BackgroundImage', maxCount: 1 }
]),
 campaignController.updateConfigs);

// Clone campaign
router.post("/:id/clone", campaignController.clone);


module.exports = router;
