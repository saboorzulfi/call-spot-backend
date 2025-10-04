const AccountRepository = require('../v1/repositories/account.repository');

class IntegrationService {
  constructor() {
    this.accountRepo = new AccountRepository();
  }

  /**
   * Get integration status for all platforms (aligned with Go backend)
   */
  async getIntegrationStatus(accountId) {
    try {
      const user = await this.accountRepo.findById(accountId);
      if (!user) {
        throw new Error('User not found');
      }

      const integrationStatus = {
        Facebook: !!user.facebook_access_token,
        TikTok: !!user.tiktok_access_token,
        Google: !!(user.google_data && user.google_data.refresh_token),
        Mailchimp: !!user.mandrill_account_key,
        Whatsapp: !!user.whatsapp_token,
        ElevenLabs: !!user.eleven_labs_api_key,
        Skylead: !!(user.skylead_settings && user.skylead_settings.skylead_integration_key)
      };

      return integrationStatus;
    } catch (error) {
      console.error('Error getting integration status:', error);
      throw new Error(`Failed to get integration status: ${error.message}`);
    }
  }
}

module.exports = IntegrationService;
