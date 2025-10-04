const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const IntegrationService = require("../../services/integration.service");

class IntegrationController {
  constructor() {
    this.integrationService = new IntegrationService();
  }

  // GET /integration/status - Get integration status for all platforms (aligned with Go backend)
  getIntegrationStatus = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const result = await this.integrationService.getIntegrationStatus(accountId);

    return AppResponse.success(res, result, "Integration status retrieved successfully", statusCode.OK);
  });
}

module.exports = IntegrationController;
