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
    const { page_id, access_token } = req.body; // Aligned with Go backend parameter names
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

  // PUT /facebook/campaign/:id - Update campaign with Facebook data (aligned with Go backend)
  updateCampaignWithFacebookData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { facebook_page_id, facebook_form_id, facebook_page_token, facebook_page_name, facebook_form_name } = req.body;
    const accountId = req.account._id;

    if (!facebook_page_id || !facebook_form_id || !facebook_page_token) {
      throw new AppError("facebook_page_id, facebook_form_id, and facebook_page_token are required", 400);
    }

    const result = await this.facebookService.updateCampaignWithFacebookData(id, accountId, {
      facebook_page_id,
      facebook_page_name,
      facebook_form_id,
      facebook_form_name,
      facebook_page_token
    });

    return AppResponse.success(res, result, "Campaign updated with Facebook data successfully", statusCode.OK);
  });
  deleteCampaignWithFacebookData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const result = await this.facebookService.deleteCampaignWithFacebookData(id, accountId);

    return AppResponse.success(res, result, "Campaign deleted with Facebook data successfully", statusCode.OK);
  }); 


  // GET /facebook/campaigns - Get campaigns with Facebook integration (aligned with Go backend)
  getCampaignsWithFacebookData = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    
    const result = await this.facebookService.getCampaignsWithFacebookData(accountId,req.body);

    return AppResponse.success(res, result, "Campaigns with Facebook data retrieved successfully", statusCode.OK);
  });

  getCampaignWithFacebookData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const result = await this.facebookService.getCampaignWithFacebookData(id, accountId);

    return AppResponse.success(res, result, "Campaign with Facebook data retrieved successfully", statusCode.OK);
  });

}

module.exports = FacebookController;
