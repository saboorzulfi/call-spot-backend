const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const FacebookService = require("../../services/facebook.service");

class FacebookController {
  constructor() {
    this.facebookService = new FacebookService();
  }

  // GET /facebook/page - Get Facebook pages for authenticated user
  getPages = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const pages = await this.facebookService.getPages(accountId);

    return AppResponse.success(res, pages, "Facebook pages retrieved successfully", statusCode.OK);
  });

  // GET /facebook/forms - Get Facebook forms for a specific page
  getForms = tryCatchAsync(async (req, res, next) => {
    const { pageId, pageToken } = req.query;
    const accountId = req.account._id;

    if (!pageId || !pageToken) {
      throw new AppError("pageId and pageToken are required", 400);
    }

    const forms = await this.facebookService.getForms(accountId, pageId, pageToken);

    return AppResponse.success(res, forms, "Facebook forms retrieved successfully", statusCode.OK);
  });

  // GET /facebook/form-fields - Get fields for a specific form
  getFormFields = tryCatchAsync(async (req, res, next) => {
    const { formId, pageToken } = req.query;
    const accountId = req.account._id;

    if (!formId || !pageToken) {
      throw new AppError("formId and pageToken are required", 400);
    }

    const fields = await this.facebookService.getFormFields(accountId, formId, pageToken);

    return AppResponse.success(res, fields, "Facebook form fields retrieved successfully", statusCode.OK);
  });

  // GET /facebook/leads - Get leads from a specific form
  getLeads = tryCatchAsync(async (req, res, next) => {
    const { formId, pageToken } = req.query;
    const accountId = req.account._id;

    if (!formId || !pageToken) {
      throw new AppError("formId and pageToken are required", 400);
    }

    const leads = await this.facebookService.getLeads(accountId, formId, pageToken);

    return AppResponse.success(res, leads, "Facebook leads retrieved successfully", statusCode.OK);
  });
}

module.exports = FacebookController;
