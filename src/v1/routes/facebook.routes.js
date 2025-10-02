const express = require("express");
const FacebookController = require("../controllers/facebook.controller");

const router = express.Router();
const facebookController = new FacebookController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Facebook integration endpoints
router.get("/page", facebookController.getPages);                    // GET /facebook/page
router.get("/forms", facebookController.getForms);                   // GET /facebook/forms
router.get("/form-fields", facebookController.getFormFields);        // GET /facebook/form-fields
router.get("/leads", facebookController.getLeads);                   // GET /facebook/leads

module.exports = router;
