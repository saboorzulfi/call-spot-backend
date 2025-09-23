const AppError = require("../../utils/app_error.util");
const AppResponse = require("../../utils/response.util");
const BlocklistRepository = require("../repositories/blocklist.repository");
const tryCatchAsync = require("../../utils/try_catch.util");
const statusCode = require("../../utils/status_code.util");
const XLSX = require("xlsx");
const { BlocklistDTO } = require("../dtos/return");

class BlocklistController {
  constructor() {
    this.blocklistRepo = new BlocklistRepository();
  }

  // POST /block - Add a single blocklist entry
  addBlocked = tryCatchAsync(async (req, res, next) => {
    const { source, block_type, name } = req.body;
    const accountId = req.account._id;

    // Validate required fields
    if (!source || !block_type || !name) {
      throw new AppError("Source, block type, and name are required", 400);
    }

    // Validate block type
    if (!["phone", "ip"].includes(block_type)) {
      throw new AppError("Block type must be either 'phone' or 'ip'", 400);
    }

    // Validate source based on block type
    if (block_type === "ip") {
      if (!this.isValidIP(source)) {
        throw new AppError("Invalid IP address format", 400);
      }
    } else if (block_type === "phone") {
      if (this.containsLetters(source)) {
        throw new AppError("Phone number cannot contain letters", 400);
      }
    }

    // Create blocklist entry
    const blocklistData = {
      account_id: accountId,
      source,
      block_type,
      name
    };

    const blocklist = await this.blocklistRepo.create(blocklistData);
    let responseData = { blocklist: BlocklistDTO.fromObject(blocklist) };

    // Return the full object like Go backend (not wrapped in data object)
    return AppResponse.success(res, responseData, "Resource blocked successfully", statusCode.CREATED);
  });

  // GET /block - Get all blocklist entries for account
  getAllBlocked = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const blocklists = await this.blocklistRepo.findByAccount(accountId);

    let responseData = { blocklists: BlocklistDTO.fromArray(blocklists) };

    return AppResponse.success(res, responseData, "Blocklist retrieved successfully", statusCode.OK);
  });

  // DELETE /block - Delete a blocklist entry
  deleteBlocked = tryCatchAsync(async (req, res, next) => {
    const { id } = req.body;
    const accountId = req.account._id;

    if (!id) {
      throw new AppError("Blocklist ID is required", 400);
    }

    // Check if blocklist entry exists and belongs to account
    const existingBlock = await this.blocklistRepo.findById(id);
    if (existingBlock.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    await this.blocklistRepo.deleteById(id);

    return AppResponse.success(res, {}, "Blocklist entry deleted successfully", statusCode.OK);
  });

  // POST /block-file - Import blocklist from Excel file
  addBlockedFile = tryCatchAsync(async (req, res, next) => {
    const file = req.file;
    const accountId = req.account._id;

    if (!file) {
      throw new AppError("Failed to get file", 400);
    }

    console.log("Import blocklist file received:", file.originalname);

    try {
      // Read the Excel file
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rows.length === 0) {
        throw new AppError("Empty file - No rows in file", 400);
      }

      const errors = [];
      let validRows = 0;

      // Process each row
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];

        if (!row || row.length === 0) {
          continue;
        }

        try {
          // Validate and process the row
          const blocklistItem = this.validateRow(row);

          // Create blocklist entry (duplicate check is handled in repository)
          const blocklistData = {
            account_id: accountId,
            source: blocklistItem.source,
            block_type: blocklistItem.block_type,
            name: blocklistItem.name
          };

          await this.blocklistRepo.create(blocklistData);
          validRows++;

        } catch (error) {
          errors.push({
            row: idx + 1,
            message: error.message
          });
          console.error(`Error processing row ${idx + 1}:`, error.message);
        }
      }

      // Handle errors
      if (errors.length > 0) {
        const errorMessages = errors.map(err => `Row ${err.row}: ${err.message}`).join("; ");

        let responseMessage;
        if (validRows === 0) {
          responseMessage = "Blocklist import unsuccessful";
        } else {
          responseMessage = "Blocklist import partially successful";
        }

        return AppResponse.error(res, responseMessage, errorMessages, statusCode.BAD_REQUEST);
      }
      let responseData = {
        imported_count: validRows,
        total_rows: rows.length
      };
      return AppResponse.success(res, responseData, "Blocklist imported successfully", statusCode.CREATED);

    } catch (error) {
      console.error("Import blocklist error:", error);
      throw new AppError(error.message || "Failed to process import file", 500);
    }
  });

  // Validate a single row from Excel file
  validateRow(row) {
    if (row.length < 3) {
      throw new Error("Empty cell value");
    }

    const name = row[0];
    const source = row[1];
    const blockType = row[2];

    if (!name || !source || !blockType) {
      throw new Error("Empty cell value");
    }

    if (!["phone", "ip"].includes(blockType)) {
      throw new Error("Invalid block type. Must be 'phone' or 'ip'");
    }

    if (blockType === "ip") {
      if (!this.isValidIP(source)) {
        throw new Error("Invalid IP address");
      }
    } else if (blockType === "phone") {
      if (this.containsLetters(source)) {
        throw new Error("Invalid phone number - cannot contain letters");
      }
    }

    return {
      name: name.trim(),
      source: source.trim(),
      block_type: blockType
    };
  }

  // Validate IP address
  isValidIP(ip) {
    // IPv4 regex
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // IPv6 regex (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:)|(([0-9a-fA-F]{1,4}:){1,7}|:):(([0-9a-fA-F]{1,4}:){1,6}|:)|(([0-9a-fA-F]{1,4}:){1,6}|:):(([0-9a-fA-F]{1,4}:){1,5}|:)|(([0-9a-fA-F]{1,4}:){1,5}|:):(([0-9a-fA-F]{1,4}:){1,4}|:)|(([0-9a-fA-F]{1,4}:){1,4}|:):(([0-9a-fA-F]{1,4}:){1,3}|:)|(([0-9a-fA-F]{1,4}:){1,3}|:):(([0-9a-fA-F]{1,4}:){1,2}|:)|(([0-9a-fA-F]{1,4}:){1,2}|:):([0-9a-fA-F]{1,4}|:)|([0-9a-fA-F]{1,4}|:):([0-9a-fA-F]{1,4}|:)|:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  // Check if string contains letters
  containsLetters(str) {
    return /[a-zA-Z]/.test(str);
  }
}

module.exports = BlocklistController;
