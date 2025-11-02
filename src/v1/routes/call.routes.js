const express = require("express");
const CallController = require("../controllers/call.controller");
const uploadExcel = require("../shared/services/file_upload.service");

const router = express.Router();
const callController = new CallController();

// Authentication is handled at v1.routes level
// All routes now have access to req.account

router.get("/", callController.getAll);
router.get("/:id", callController.getById);                   
router.put("/:id", callController.update);                    
router.delete("/:id", callController.delete);                 

router.post("/start", callController.start);
router.post("/cancel", callController.cancel);

router.post("/import-call", uploadExcel.single('file'), callController.importCall); 

module.exports = router;
