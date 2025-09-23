const express = require("express");
const CallController = require("../controllers/call.controller");
const uploadExcel = require("../shared/services/file_upload.service");

const router = express.Router();
const callController = new CallController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

// Call management endpoints
router.get("/", callController.getAll);                      // GET /calls
router.get("/:id", callController.getById);                   // GET /calls/:id
router.put("/:id", callController.update);                    // PUT /calls/:id
router.delete("/:id", callController.delete);                 // DELETE /calls/:id

// Import call endpoint (equivalent to Go backend /import-call)
router.post("/import-call", uploadExcel.single('file'), callController.importCall);  // POST /import-call

module.exports = router;
