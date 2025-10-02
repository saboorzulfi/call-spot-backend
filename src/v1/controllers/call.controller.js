const CallRepository = require("../repositories/call.repository");
const LeadRepository = require("../repositories/lead.repository");
const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const XLSX = require("xlsx");
const { CallDTO } = require("../dtos/return");

class CallController {
  constructor() {
    this.callRepo = new CallRepository();
    this.leadRepo = new LeadRepository();
  }

  // POST /call/start - Initiate a call flow (placeholder)
  start = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { lead_number, widget_id } = req.body;

    if (!lead_number) {
      throw new AppError("lead_id is required", 400);
    }

    // TODO: Implement call initiation logic
    return AppResponse.success(res, {
      message: "Call initiation placeholder",
      lead_id: lead_id,
      widget_id,
      account_id: accountId
    }, "Call initiation accepted", statusCode.ACCEPTED || 202);
  });

  // POST /calls/import-call - Import calls from Excel
  importCall = tryCatchAsync(async (req, res, next) => {
    const { widget_key } = req.body;
    const accountId = req.account._id;

    if (!req.file) {
      throw new AppError("Please upload an Excel file", 400);
    }

    // Find campaign by widget_key (ID or name)
    const campaign = await this.callRepo.findByWidgetKey(widget_key);
    if (!campaign) {
      throw new AppError("Campaign not found", 404);
    }

    // Read Excel file with better options
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellText: false,
      cellDates: true,
      cellNF: false,
      cellStyles: false
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with header row (skip first row which is instructions)
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false
    });

    console.log("Raw Excel data:", rawData);

    if (rawData.length < 1) {
      throw new AppError("Excel file is empty", 400);
    }

    // Handle different Excel structures
    let headers, dataRows;

    if (rawData.length === 1) {
      // Only one row - treat as data with default headers
      headers = ["name", "phone"];
      dataRows = rawData;
    } else if (rawData.length === 2) {
      // Two rows - treat first as headers, second as data
      headers = rawData[0];
      dataRows = rawData.slice(1);
    } else {
      // Three or more rows - skip first (instructions), use second as headers
      headers = rawData[1];
      dataRows = rawData.slice(2);
    }

    console.log("Headers:", headers);
    console.log("Data rows:", dataRows);

    // Map data rows to objects using headers
    const data = dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header && header.trim() !== "") {
          obj[header.trim().toLowerCase()] = row[index] || "";
        }
      });
      return obj;
    }).filter(row => Object.keys(row).length > 0); // Remove empty rows

    // console.log("Processed data:", data);

    if (data.length === 0) {
      throw new AppError("No valid data rows found in Excel file", 400);
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      const callRequest = this.processRow(row);
      console.log(callRequest, "callRequest");
      // Create or update lead first (like Go backend)
      const leadData = {
        account_id: accountId,
        name: callRequest.name,
        phone: callRequest.phone_number,
        source_type: "import",
        source_id: campaign._id.toString(),
        data_fields: callRequest.data_fields || {}
      };

      const lead = await this.leadRepo.upsert(leadData);

      // Create call with lead data
      const callData = {
        account_id: accountId,
        campaign_id: campaign._id,
        call_origination_id: new (require("mongoose")).Types.ObjectId(),
        source_type: "import",
        source_id: campaign._id.toString(),
        campaign_name: campaign.name,
        lead_data: lead.data_fields,
        call_status: {
          call_state: "scheduled",
          description: "Imported Call"
        },
        register_time: new Date()
      };
      console.log(callData, "callData");
      await this.callRepo.create(callData);
      results.success++;

      // } catch (error) {
      //   results.failed++;
      //   results.errors.push({
      //     row: i + 2, // +2 because Excel is 1-indexed and we have headers
      //     error: error.message
      //   });
      // }
    }

    const responseData = {
      total_rows: data.length,
      success: results.success,
      failed: results.failed,
      errors: results.errors
    };

    return AppResponse.success(res, responseData, "Calls imported successfully", statusCode.CREATED);
  });

  // Helper method to process Excel row
  processRow(row) {
    const requiredFields = ["name", "phone"];
    const missingFields = requiredFields.filter(field => !row[field]);

    if (missingFields.length > 0) {
      throw new AppError(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Normalize phone number
    const phoneNumber = row.phone.toString().replace(/[\s\-\(\)]/g, "");

    return {
      name: row.name.toString().trim(),
      phone_number: phoneNumber,
      data_fields: Object.keys(row)
        .filter(key => !requiredFields.includes(key))
        .reduce((acc, key) => {
          if (row[key] !== undefined && row[key] !== null) {
            acc[key] = row[key].toString();
          }
          return acc;
        }, {})
    };
  }

  // GET /calls - Get all calls for account
  getAll = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { page, limit, search, sortBy, sortOrder, status, source, campaignID, agentID, startDate, endDate } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      search,
      status,
      source,
      campaignID,
      agentID,
      startDate,
      endDate,
      sortBy: sortBy || "created_at",
      sortOrder: sortOrder || "desc"
    };

    const result = await this.callRepo.findByAccount(accountId, options);

    const responseData = {
      calls: CallDTO.fromArray(result.calls),
      pagination: result.pagination
    };

    return AppResponse.success(res, responseData, "Calls retrieved successfully", statusCode.OK);
  });

  // GET /calls/:id - Get call by ID
  getById = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const call = await this.callRepo.findById(id);

    // Check if call belongs to account
    if (call.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const responseData = {
      call: CallDTO.fromObject(call)
    };

    return AppResponse.success(res, responseData, "Call retrieved successfully", statusCode.OK);
  });

  // PUT /calls/:id - Update call
  update = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const updateData = req.body;

    const call = await this.callRepo.updateByIdAndAccount(id, accountId, updateData);

    const responseData = {
      call: CallDTO.fromObject(call)
    };

    return AppResponse.success(res, responseData, "Call updated successfully", statusCode.OK);
  });

  // DELETE /calls/:id - Delete call
  delete = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    await this.callRepo.deleteByIdAndAccount(id, accountId);

    return AppResponse.success(res, {}, "Call deleted successfully", statusCode.OK);
  });
}

module.exports = CallController;
