const AppError = require("../../../utils/app_error.util");
const multerS3 = require("multer-s3");
const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");
const config = require("../../../config/config");


function randomString(length) {
  let result = "";
  let characters = config.randomCharacters;

  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    cb(null, new Date().toISOString() + randomString(10) + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  const fileSize = parseInt(req.headers["content-length"]);

  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png" ||
    file.mimetype === "image/jpg" ||
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    return cb(new AppError("file must be jpeg, png, jpg or pdf", 422), false);
  }

  if (fileSize <= 1024 * 1024 * 5) cb(null, true); //1024 * 1024 = 1 MB
  else return cb(new AppError("Max file size is 5 MB", 413), false);
};

const s3 = new S3Client({
  region: config.storage.s3.bucketRegion,
  credentials: {
    accessKeyId: config.storage.s3.bucketAccessKeyId,
    secretAccessKey: config.storage.s3.bucketSecretKeyId,
  },
});
const storageS3 = (path) =>
  multerS3({
    s3,
    acl: "public-read",
    bucket: config.storage.s3.bucketName,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    contentDisposition: "inline",
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      cb(
        null,
        `${path}/${new Date().toISOString()}${randomString(10)}${
          file.originalname
        }`
      );
    },
  });

const uploadS3 = (path) =>
  multer({
    storage: storageS3(path),
    fileFilter: fileFilter,
  });

module.exports = uploadS3;
