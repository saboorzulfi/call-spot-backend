const axios = require('axios');
const AccountRepository = require('../v1/repositories/account.repository');
const CampaignRepository = require('../v1/repositories/campaign.repository');
const { encrypt, decrypt } = require('../utils/encryption.util');
const { maskEmail } = require('../utils/emailMask.util');

class FacebookService {
  constructor() {
    this.accountRepo = new AccountRepository();
    this.campaignRepo = new CampaignRepository();
    this.baseURL = 'https://graph.facebook.com/v21.0';
  }

  async getLongLivedToken(accessToken) {
    try {
      const url = `${this.baseURL}/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&grant_type=fb_exchange_token&fb_exchange_token=${accessToken}`;
      console.log('url', url);
      const response = await axios.get(url);
      
      if (response.data.access_token) {
        return response.data.access_token;
      }
      
      throw new Error('Failed to get long-lived token');
    } catch (error) {
      console.error('Error getting long-lived token:', error);
      throw new Error(`Failed to get long-lived token: ${error.message}`);
    }
  }

  async saveAccessToken(accountId, facebookTokenResponse) {
    try {
      // Exchange for long-lived token (like Go backend)
      const longLivedToken = await this.getLongLivedToken(facebookTokenResponse.accessToken);
      
      // Encrypt sensitive data
      const encryptedUserId = await encrypt(facebookTokenResponse.userID);
      const encryptedAccessToken = await encrypt(longLivedToken);

      // Update account with Facebook credentials (aligned with Go backend)
      const account = await this.accountRepo.update(accountId, {
        facebook_user_id: encryptedUserId,
        facebook_access_token: encryptedAccessToken,
        facebook_account_data: {
          ad_accounts: []
        }
      });

      return account;
    } catch (error) {
      console.error('Error saving Facebook access token:', error);
      throw new Error(`Failed to save Facebook access token: ${error.message}`);
    }
  }

  async getPages(accountId) {
    try {
      // Get user account with Facebook credentials
      const user = await this.accountRepo.findById(accountId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.facebook_access_token || !user.facebook_user_id) {
        return { data: [] }; // Return empty if no Facebook integration
      }

      // Decrypt Facebook credentials
      const facebookUserId = await decrypt(user.facebook_user_id);
      const facebookAccessToken = await decrypt(user.facebook_access_token);

      // Make API call to Facebook (aligned with Go backend)
      const url = `${this.baseURL}/${facebookUserId}/accounts?limit=250`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${facebookAccessToken}`
        }
      });

      // Return Facebook response directly (like Go backend - no database storage)
      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook pages:', error);
      throw new Error(`Failed to fetch Facebook pages: ${error.message}`);
    }
  }

  async getForms(pageId, pageToken) {
    try {
      const url = `${this.baseURL}/${pageId}/leadgen_forms?limit=250`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${pageToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook forms:', error);
      throw new Error(`Failed to fetch Facebook forms: ${error.message}`);
    }
  }

  async getFormFields(formId, pageToken) {
    try {
      const url = `${this.baseURL}/${formId}?fields=questions`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${pageToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook form fields:', error);
      throw new Error(`Failed to fetch Facebook form fields: ${error.message}`);
    }
  }

  async getLeads(formId, accessToken) {
    try {
      const url = `${this.baseURL}/${formId}/leads?fields=created_time,id,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_name,ad_id`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook leads:', error);
      throw new Error(`Failed to fetch Facebook leads: ${error.message}`);
    }
  }

  async getFacebookUserData(accountId) {
    try {

      const user = await this.accountRepo.findById(accountId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.facebook_access_token) {
        return null; 
      }

      const facebookAccessToken = await decrypt(user.facebook_access_token);

      const url = `${this.baseURL}/me?fields=id,name,email&access_token=${facebookAccessToken}`;
      const response = await axios.get(url);


      if (response.data.email) {
        response.data.email = maskEmail(response.data.email);
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook user data:', error);
      throw new Error(`Failed to fetch Facebook user data: ${error.message}`);
    }
  }

}

module.exports = FacebookService;
