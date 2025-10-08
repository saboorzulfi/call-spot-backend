const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const FacebookService = require("../../services/facebook.service");
const CampaignRepository = require("../repositories/campaign.repository");
const AccountRepository = require("../repositories/account.repository");
const { decrypt } = require("../../utils/encryption.util");
class FacebookController {
  constructor() {
    this.facebookService = new FacebookService();
    this.campaignRepo = new CampaignRepository();
    this.accountRepo = new AccountRepository();
  }

  saveAccessToken = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const facebookTokenResponse = req.body;

    if (!facebookTokenResponse.accessToken || !facebookTokenResponse.userID) {
      throw new AppError("Access token and user ID are required", 400);
    }

    const result = await this.facebookService.saveAccessToken(accountId, facebookTokenResponse);

    return AppResponse.success(res, result, "Access token retrieved successfully", statusCode.OK);
  });

  deleteAccessToken = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    // const result = await this.facebookService.deleteAccessToken(accountId);
    const account = await this.accountRepo.update(accountId, {
      facebook_user_id: null,
      facebook_access_token: null,
      facebook_account_data: null
    });

    let responseData = {
      id: account._id,
      facebook_data: account.facebook_data
    };

    return AppResponse.success(res, responseData, "Facebook access token deleted successfully", statusCode.OK);
  });

  getPages = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const pages = await this.facebookService.getPages(accountId);

    return AppResponse.success(res, pages, "Data retrieved successfully", statusCode.OK);
  });

  getForms = tryCatchAsync(async (req, res, next) => {
    const { page_id, access_token } = req.body;
    const accountId = req.account._id;

    if (!page_id || !access_token) {
      throw new AppError("page_id and access_token are required", 400);
    }

    const forms = await this.facebookService.getForms(page_id, access_token);

    return AppResponse.success(res, forms, "Data retrieved successfully", statusCode.OK);
  });

  getFormFields = tryCatchAsync(async (req, res, next) => {
    const { form_id, access_token } = req.query;
    const accountId = req.account._id;

    if (!form_id || !access_token) {
      throw new AppError("form_id and access_token are required", 400);
    }

    const fields = await this.facebookService.getFormFields(form_id, access_token);

    return AppResponse.success(res, fields, "Data retrieved successfully", statusCode.OK);
  });

  getFacebookUserData = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const result = await this.facebookService.getFacebookUserData(accountId);

    return AppResponse.success(res, result, "Data retrieved successfully", statusCode.OK);
  });

  getLeads = tryCatchAsync(async (req, res, next) => {
    const { form_id } = req.query;
    const accountId = req.account._id;

    if (!form_id)
      throw new AppError("form_id and access_token are required", 400);
    console.log("accountIdaccountId", accountId);
    const account = await this.accountRepo.findById(accountId);
    if (!account || !account.facebook_access_token)
      throw new AppError("Account not found or access token not found", 404);

    const access_token = await decrypt(account.facebook_access_token);

    const leads = await this.facebookService.getLeads(form_id, access_token);

    return AppResponse.success(res, leads, "Data retrieved successfully", statusCode.OK);
  });

  // ** Campaigns **
  updateCampaignWithFacebookData = tryCatchAsync(async (req, res, next) => {

    const { id } = req.params;
    const { facebook_page_id, facebook_form_id, facebook_page_token, facebook_page_name, facebook_form_name } = req.body;
    const accountId = req.account._id;

    if (!facebook_page_id || !facebook_form_id || !facebook_page_token) {
      throw new AppError("facebook_page_id, facebook_form_id, and facebook_page_token are required", 400);
    }

    const campaign = await this.campaignRepo.updateByIdAndAccount(id, accountId, {
      facebook_data: {
        facebook_page_id: facebook_page_id,
        facebook_page_name: facebook_page_name,
        facebook_form_id: facebook_form_id,
        facebook_form_name: facebook_form_name,
        facebook_page_token: facebook_page_token
      }
    });
    let responseData = {
      id: campaign._id,
      facebook_data: campaign.facebook_data
    };

    return AppResponse.success(res, responseData, "Campaign updated with Facebook data successfully", statusCode.OK);
  });

  deleteCampaignWithFacebookData = tryCatchAsync(async (req, res, next) => {

    const { id } = req.params;
    const accountId = req.account._id;

    const campaign = await this.campaignRepo.deleteByIdAndAccount(id, accountId);

    let responseData = {
      id: campaign._id,
      facebook_data: campaign.facebook_data
    };

    return AppResponse.success(res, responseData, "Campaign deleted with Facebook data successfully", statusCode.OK);
  });


  getCampaignsWithFacebookData = tryCatchAsync(async (req, res, next) => {

    const accountId = req.account._id;
    const { page } = req.body;

    let options = { page };


    const campaigns = await this.campaignRepo.findByAccount(accountId, options);


    const facebookCampaigns = campaigns.campaigns.filter(campaign =>
      campaign.facebook_data &&
      campaign.facebook_data.facebook_page_id &&
      campaign.facebook_data.facebook_form_id
    );

    let responseData = {
      campaigns: facebookCampaigns,
      pagination: campaigns.pagination
    };

    return AppResponse.success(res, responseData, "Campaigns with Facebook data retrieved successfully", statusCode.OK);
  });

  getCampaignWithFacebookData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const campaign = await this.campaignRepo.findByIdAndAccount(id, accountId);


    let responseData = {
      id: campaign._id,
      facebook_data: campaign.facebook_data
    };

    return AppResponse.success(res, responseData, "Campaign with Facebook data retrieved successfully", statusCode.OK);
  });



}

module.exports = FacebookController;
