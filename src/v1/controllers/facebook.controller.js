const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const FacebookService = require("../../services/facebook.service");

class FacebookController {
  constructor() {
    this.facebookService = new FacebookService();
  }

  // POST /facebook/access-token - Save Facebook access token (aligned with Go backend)
  saveAccessToken = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const facebookTokenResponse = req.body;

    if (!facebookTokenResponse.accessToken || !facebookTokenResponse.userID) {
      throw new AppError("Access token and user ID are required", 400);
    }

    const result = await this.facebookService.saveAccessToken(accountId, facebookTokenResponse);

    return AppResponse.success(res, result, "Access token retrieved successfully", statusCode.OK);
  });

  // DELETE /facebook/access-token - Delete Facebook access token (aligned with Go backend)
  deleteAccessToken = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const result = await this.facebookService.deleteAccessToken(accountId);

    return AppResponse.success(res, result, "Facebook access token deleted successfully", statusCode.OK);
  });

  // GET /facebook/page - Get Facebook pages (aligned with Go backend)
  getPages = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const pages = await this.facebookService.getPages(accountId);

    return AppResponse.success(res, pages, "Data retrieved successfully", statusCode.OK);
  });

  // GET /facebook/form - Get Facebook forms for a specific page (aligned with Go backend)
  getForms = tryCatchAsync(async (req, res, next) => {
    const { page_id, access_token } = req.query; // Aligned with Go backend parameter names
    const accountId = req.account._id;

    if (!page_id || !access_token) {
      throw new AppError("page_id and access_token are required", 400);
    }

    const forms = await this.facebookService.getForms(accountId, page_id, access_token);

    return AppResponse.success(res, forms, "Data retrieved successfully", statusCode.OK);
  });

  // GET /facebook/form-fields - Get fields for a specific form (aligned with Go backend)
  getFormFields = tryCatchAsync(async (req, res, next) => {
    const { form_id, access_token } = req.query; // Aligned with Go backend parameter names
    const accountId = req.account._id;

    if (!form_id || !access_token) {
      throw new AppError("form_id and access_token are required", 400);
    }

    const fields = await this.facebookService.getFormFields(accountId, form_id, access_token);

    return AppResponse.success(res, fields, "Data retrieved successfully", statusCode.OK);
  });

  // GET /facebook/leads - Get leads from a specific form (aligned with Go backend)
  getLeads = tryCatchAsync(async (req, res, next) => {
    const { form_id, access_token } = req.query; // Aligned with Go backend parameter names
    const accountId = req.account._id;

    if (!form_id || !access_token) {
      throw new AppError("form_id and access_token are required", 400);
    }

    const leads = await this.facebookService.getLeads(accountId, form_id, access_token);

    return AppResponse.success(res, leads, "Data retrieved successfully", statusCode.OK);
  });
}

module.exports = FacebookController;
