const CallRepository = require("../repositories/call.repository");
const UltraSimpleCallService = require("../../services/ultra-simple-call.service");
const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const XLSX = require("xlsx");
const { CallDTO } = require("../dtos/return");

class CallController {
  constructor() {
    this.callRepo = new CallRepository();
    // Call queue service will be created on-demand
  }

  // Get or create ultra simple call service
  getCallQueueService() {
    if (!global.ultraSimpleCallService) {
      const fsService = global.fsService;
      if (!fsService) {
        throw new AppError("FreeSWITCH service is not available", 503);
      }
      global.ultraSimpleCallService = new UltraSimpleCallService(fsService);
      console.log("📞 Ultra Simple Call service created on-demand");
    }
    return global.ultraSimpleCallService;
  }

  start = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { call_id } = req.body;

    if (!call_id) {
      throw new AppError("Call ID is required", 400);
    }

    const callQueueService = this.getCallQueueService();

    const call = await this.callRepo.findById(call_id);
    
    if (call.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }


    if (call.call_status.call_state === "in-progress") {
      throw new AppError("Call is already in progress", 400);
    }
    

    if (call.call_status.call_state === "answered" && !call.call_details?.end_time) {
      throw new AppError("Call is still active", 400);
    }
    
    // // Allow new calls if previous call is completed
    // if (call.call_status.call_state === "completed") {
    //   // Previous call is completed, allow new call
    // }

    const result = await callQueueService.startCallingForCall(call);

    return AppResponse.success(res, result, "Call initiated successfully", statusCode.ACCEPTED);
  });

  cancel = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { call_id } = req.body;

    if (!call_id) {
      throw new AppError("Call ID is required", 400);
    }

    const callQueueService = this.getCallQueueService();

    const call = await this.callRepo.findById(call_id);
    
    if (call.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const result = await callQueueService.cancelCall(call_id, accountId);

    return AppResponse.success(res, result, "Call cancelled successfully", statusCode.OK);
  });

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
      
      // Generate unique source_id for imported calls (using timestamp + index)
      const importSourceId = `import_${Date.now()}_${i}_${campaign._id.toString()}`;
      
      // Create call directly (no Lead model needed)
      const callData = {
        account_id: accountId,
        campaign_id: campaign._id,
        call_origination_id: new (require("mongoose")).Types.ObjectId(),
        source_type: "import",
        source_id: importSourceId, // Unique ID for imported calls
        campaign_name: campaign.name,
        lead_data: {
          phone_number: callRequest.phone_number,
          name: callRequest.name,
          ...callRequest.data_fields
        },
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

    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  getById = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const call = await this.callRepo.findById(id);

    if (call.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const responseData = {
      call: CallDTO.fromObject(call)
    };

    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

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

  delete = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    await this.callRepo.deleteByIdAndAccount(id, accountId);

    return AppResponse.success(res, {}, "Call deleted successfully", statusCode.OK);
  });

}

module.exports = CallController;
