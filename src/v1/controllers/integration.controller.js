const AppResponse = require("../../utils/response.util");
const AppError = require("../../utils/app_error.util");
const statusCode = require("../../utils/status_code.util");
const tryCatchAsync = require("../../utils/try_catch.util");
const FacebookService = require("../../services/facebook.service");
const AccountRepository = require("../repositories/account.repository");
const TikTokService = require("../../services/tiktok.service");
class IntegrationController {
  constructor() {
    this.facebookService = new FacebookService();
    this.tiktokService = new TikTokService();
    this.accountRepo = new AccountRepository();
  }

  // GET /integration/status - Get integration status for all platforms (aligned with Go backend)
  getIntegrationStatus = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;


    const user = await this.accountRepo.findById(accountId);
    if (!user) 
      throw new AppError("User not found", 404);
    

    const integrationStatus = {
      Facebook: !!user.facebook_access_token,
      TikTok: !!user.tiktok_access_token,
      Google: !!(user.google_data && user.google_data.refresh_token),
      Mailchimp: !!user.mandrill_account_key,
      Whatsapp: !!user.whatsapp_token,
      ElevenLabs: !!user.eleven_labs_api_key,
      Skylead: !!(user.skylead_settings && user.skylead_settings.skylead_integration_key)
    };

    return AppResponse.success(res, integrationStatus, "", statusCode.OK);

  });


  getSocialUserData = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { platform } = req.query;

    if (!platform) 
      throw new AppError("Platform parameter is required", 400);
    

    let result = null;

    switch (platform.toLowerCase()) {
      case 'facebook':
        result = await this.facebookService.getFacebookUserData(accountId);
        break;
      // Future platforms can be added here
      case 'tiktok':
        result = await this.tiktokService.getTikTokUserData(accountId);
        break;
      // case 'google':
      //   result = await this.googleService.getGoogleUserData(accountId);
      //   break;
      default:
        throw new AppError(`Unsupported platform: ${platform}`, 400);
    }

    return AppResponse.success(res, result, "", statusCode.OK);
  });
}

module.exports = IntegrationController;
