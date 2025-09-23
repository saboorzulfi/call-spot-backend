const express = require("express");
const BlocklistController = require("../controllers/blocklist.controller");
const uploadExcel = require("../shared/services/file_upload.service");

const router = express.Router();
const blocklistController = new BlocklistController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Blocklist management endpoints
router.post("/", blocklistController.addBlocked);                    // POST /block
router.get("/", blocklistController.getAllBlocked);                  // GET /block
router.delete("/", blocklistController.deleteBlocked);               // DELETE /block

// Import blocklist from Excel file
router.post("/block-file", uploadExcel.single('file'), blocklistController.addBlockedFile);  // POST /block-file

module.exports = router;
