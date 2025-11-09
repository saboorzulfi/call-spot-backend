const axios = require('axios');
const AccountRepository = require('../v1/repositories/account.repository');
const CampaignRepository = require('../v1/repositories/campaign.repository');
const { encrypt, decrypt } = require('../utils/encryption.util');
const { maskEmail } = require('../utils/emailMask.util');
const config = require('../config/config');
const qs = require("qs"); // <-- helper to encode form data

class TikTokService {
  constructor() {
    this.accountRepo = new AccountRepository();
    this.campaignRepo = new CampaignRepository();
    this.baseURL = 'https://business-api.tiktok.com/open_api/v1.3';
  }

  async saveAccessToken(accountId, auth_code) {
    try {
      // Validate TikTok OAuth configuration
      if (!config.tiktok.clientKey || !config.tiktok.clientSecret || !config.tiktok.redirectUri) {
        throw new Error('TikTok OAuth configuration is missing. Please check TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI in your .env file');
      }

      const redirectUri = "https://link.spotcalls.com/integrations"; // no trailing slash if not registered

      const body = {
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        code: auth_code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      };

      // Exchange auth_code for access_token using TikTok OAuth API
      // TikTok API expects JSON format, not form-encoded
      const tokenResponse = await axios.post(config.tiktok.oauthTokenUrl, body, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log("tokenResponse", tokenResponse.data)
      if (!tokenResponse.data || !tokenResponse.data.data) {
        throw new Error('Invalid response from TikTok OAuth API');
      }

      const { access_token, refresh_token, expires_in, refresh_expires_in, scope, token_type } = tokenResponse.data.data;

      if (!access_token) {
        throw new Error('Access token not received from TikTok');
      }

      // Encrypt sensitive data
      const encryptedAccessToken = await encrypt(access_token);
      const encryptedRefreshToken = refresh_token ? await encrypt(refresh_token) : null;

      // Get existing account to preserve tiktok_account_data (like advertisers)
      const existingAccount = await this.accountRepo.findById(accountId);
      const existingTikTokData = existingAccount?.tiktok_account_data || {};

      // Update account with TikTok credentials
      const updateData = {
        tiktok_access_token: encryptedAccessToken,
      };

      // Store refresh token and token metadata in tiktok_account_data
      // Preserve existing data like advertisers array
      updateData.tiktok_account_data = {
        ...existingTikTokData,
        ...(encryptedRefreshToken && { refresh_token: encryptedRefreshToken }),
        expires_in: expires_in,
        refresh_expires_in: refresh_expires_in,
        scope: scope,
        token_type: token_type,
      };

      const account = await this.accountRepo.update(accountId, updateData);

      return account;
    } catch (error) {
      console.error('Error saving TikTok access token:', error);

      // Provide more specific error messages
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.error?.message || errorData?.error_description || error.message;
        throw new Error(`Failed to exchange TikTok auth code for access token: ${errorMessage}`);
      }

      throw new Error(`Failed to save TikTok access token: ${error.message}`);
    }
  }

  async getAdvertisers(accountId) {
    try {
      // Get user account with TikTok credentials
      const user = await this.accountRepo.findById(accountId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.tiktok_access_token) {
        return { data: [] }; // Return empty if no TikTok integration
      }
      console.log(user.tiktok_access_token, 'tiktok_access_token');
      // Decrypt TikTok credentials
      const tiktokAccessToken = await decrypt(user.tiktok_access_token);

      // Make API call to TikTok - get advertisers (like Facebook pages)
      const url = `${this.baseURL}/advertiser/info/`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': tiktokAccessToken,
          'Content-Type': 'application/json'
        },
        params: {
          fields: '["advertiser_id","advertiser_name"]'
        }
      });

      // Return TikTok response directly
      return response.data;
    } catch (error) {
      console.error('Error fetching TikTok advertisers:', error);
      throw new Error(`Failed to fetch TikTok advertisers: ${error.message}`);
    }
  }

  async getForms(advertiserId, accessToken) {
    try {
      const url = `${this.baseURL}/lead/form/list/`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          advertiser_id: advertiserId,
          page: 1,
          page_size: 250
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching TikTok forms:', error);
      throw new Error(`Failed to fetch TikTok forms: ${error.message}`);
    }
  }

  async getFormFields(formId, advertiserId, accessToken) {
    try {
      const url = `${this.baseURL}/lead/form/get/`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          advertiser_id: advertiserId,
          form_id: formId
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching TikTok form fields:', error);
      throw new Error(`Failed to fetch TikTok form fields: ${error.message}`);
    }
  }

  async getLeads(formId, advertiserId, accessToken) {
    try {
      const url = `${this.baseURL}/lead/list/`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          advertiser_id: advertiserId,
          form_id: formId,
          page: 1,
          page_size: 250
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching TikTok leads:', error);
      throw new Error(`Failed to fetch TikTok leads: ${error.message}`);
    }
  }

  async getTikTokUserData(accountId) {
    try {
      const user = await this.accountRepo.findById(accountId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.tiktok_access_token) {
        return null;
      }

      const tiktokAccessToken = await decrypt(user.tiktok_access_token);

      // Get user info from TikTok
      const url = `${this.baseURL}/user/info/`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': tiktokAccessToken,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.email) {
        response.data.email = maskEmail(response.data.email);
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching TikTok user data:', error);
      throw new Error(`Failed to fetch TikTok user data: ${error.message}`);
    }
  }
}

module.exports = TikTokService;
