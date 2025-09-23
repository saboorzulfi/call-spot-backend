const multer = require("multer");
const AppError = require("../../../utils/app_error.util");

// Configure multer for Excel file uploads
const storageExcel = multer.memoryStorage();

const excelFileFilter = (req, file, cb) => {
  // Check file size
  const fileSize = parseInt(req.headers["content-length"]);
  
  if (fileSize > 10 * 1024 * 1024) { // 10MB limit
    return cb(new AppError("Max file size is 10 MB", 413), false);
  }

  // Allow Excel files
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')) {
    cb(null, true);
  } else {
    return cb(new AppError("Only Excel files (.xlsx, .xls) are allowed", 422), false);
  }
};

// Create reusable Excel upload middleware
const uploadExcel = multer({
  storage: storageExcel,
  fileFilter: excelFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

module.exports = uploadExcel;
