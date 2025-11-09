const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const TikTokService = require("../../services/tiktok.service");
const CampaignRepository = require("../repositories/campaign.repository");
const AccountRepository = require("../repositories/account.repository");
const { decrypt } = require("../../utils/encryption.util");

class TikTokController {
  constructor() {
    this.tiktokService = new TikTokService();
    this.campaignRepo = new CampaignRepository();
    this.accountRepo = new AccountRepository();
  }

  saveAccessToken = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const {auth_code} = req.body;

    if (!auth_code) {
      throw new AppError("Access token is required", 400);
    }

    const result = await this.tiktokService.saveAccessToken(accountId, auth_code);

    return AppResponse.success(res, result, "", statusCode.OK);
  });

  deleteAccessToken = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const account = await this.accountRepo.update(accountId, {
      tiktok_access_token: null,
      tiktok_account_data: null
    });

    let responseData = {
      id: account._id,
      tiktok_data: account.tiktok_account_data
    };

    return AppResponse.success(res, responseData, "TikTok access token deleted successfully", statusCode.OK);
  });

  getAdvertisers = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const advertisers = await this.tiktokService.getAdvertisers(accountId);

    return AppResponse.success(res, advertisers, "", statusCode.OK);
  });

  getForms = tryCatchAsync(async (req, res, next) => {
    const { advertiser_id } = req.query;
    const accountId = req.account._id;

    if (!advertiser_id) 
      throw new AppError("advertiser_id is required", 400);
    
    const account = await this.accountRepo.findById(accountId);
    if (!account || !account.tiktok_access_token)
      throw new AppError("Account not found or access token not found", 404);
    
    const access_token = await decrypt(account.tiktok_access_token);

    const forms = await this.tiktokService.getForms(advertiser_id, access_token);

    return AppResponse.success(res, forms, "", statusCode.OK);
  });

  getFormFields = tryCatchAsync(async (req, res, next) => {
    const { form_id, advertiser_id } = req.query;
    const accountId = req.account._id;
    const account = await this.accountRepo.findById(accountId);
    if (!account || !account.tiktok_access_token)
      throw new AppError("Account not found or access token not found", 404);
    
    const access_token = await decrypt(account.tiktok_access_token);

    if (!form_id || !advertiser_id || !access_token) {
      throw new AppError("form_id, advertiser_id and access_token are required", 400);
    }

    const fields = await this.tiktokService.getFormFields(form_id, advertiser_id, access_token);

    return AppResponse.success(res, fields, "", statusCode.OK);
  });

  getTikTokUserData = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const result = await this.tiktokService.getTikTokUserData(accountId);

    return AppResponse.success(res, result, "", statusCode.OK);
  });

  getLeads = tryCatchAsync(async (req, res, next) => {
    const { form_id, advertiser_id } = req.query;
    const accountId = req.account._id;

    if (!form_id || !advertiser_id)
      throw new AppError("form_id and advertiser_id are required", 400);
    
    const account = await this.accountRepo.findById(accountId);
    if (!account || !account.tiktok_access_token)
      throw new AppError("Account not found or access token not found", 404);

    const access_token = await decrypt(account.tiktok_access_token);

    const leads = await this.tiktokService.getLeads(form_id, advertiser_id, access_token);

    return AppResponse.success(res, leads, "", statusCode.OK);
  });

  // ** Campaigns **
  updateCampaignWithTikTokData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { tiktok_advertiser_id, tiktok_form_id, tiktok_advertiser_name, tiktok_form_name } = req.body;
    const accountId = req.account._id;

    if (!tiktok_advertiser_id || !tiktok_form_id) {
      throw new AppError("tiktok_advertiser_id and tiktok_form_id are required", 400);
    }

    const campaign = await this.campaignRepo.updateByIdAndAccount(id, accountId, {
      tiktok_data: {
        tiktok_advertiser_id: tiktok_advertiser_id,
        tiktok_advertiser_name: tiktok_advertiser_name,
        tiktok_form_id: tiktok_form_id,
        tiktok_form_name: tiktok_form_name
      }
    });
    
    let responseData = {
      id: campaign._id,
      tiktok_data: campaign.tiktok_data
    };

    return AppResponse.success(res, responseData, "Campaign updated with TikTok data successfully", statusCode.OK);
  });

  deleteCampaignWithTikTokData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const campaign = await this.campaignRepo.deleteByIdAndAccount(id, accountId);

    let responseData = {
      id: campaign._id,
      tiktok_data: campaign.tiktok_data
    };

    return AppResponse.success(res, responseData, "Campaign deleted with TikTok data successfully", statusCode.OK);
  });

  getCampaignsWithTikTokData = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { page } = req.body;

    let options = { page };

    const campaigns = await this.campaignRepo.findByAccount(accountId, options);

    const tiktokCampaigns = campaigns.campaigns.filter(campaign =>
      campaign.tiktok_data &&
      campaign.tiktok_data.tiktok_advertiser_id &&
      campaign.tiktok_data.tiktok_form_id
    );

    let responseData = {
      campaigns: tiktokCampaigns,
      pagination: campaigns.pagination
    };

    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  getCampaignWithTikTokData = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const campaign = await this.campaignRepo.findByIdAndAccount(id, accountId);

    let responseData = {
      id: campaign._id,
      tiktok_data: campaign.tiktok_data
    };

    return AppResponse.success(res, responseData, "", statusCode.OK);
  });
}

module.exports = TikTokController;

