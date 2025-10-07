const axios = require('axios');
const AccountRepository = require('../v1/repositories/account.repository');
const CampaignRepository = require('../v1/repositories/campaign.repository');
const { encrypt, decrypt } = require('../utils/encryption.util');

class FacebookService {
  constructor() {
    this.accountRepo = new AccountRepository();
    this.campaignRepo = new CampaignRepository();
    this.baseURL = 'https://graph.facebook.com/v21.0';
  }

  /**
   * Exchange short-lived token for long-lived token
   */
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

  /**
   * Save Facebook access token to account (aligned with Go backend)
   */
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

  /**
   * Get Facebook pages for authenticated user (aligned with Go backend - no database storage)
   */
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

  /**
   * Get Facebook forms for a specific page (aligned with Go backend - no database storage)
   */
  async getForms(accountId, pageId, pageToken) {
    try {
      const url = `${this.baseURL}/${pageId}/leadgen_forms?limit=250`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${pageToken}`
        }
      });

      // Return Facebook response directly (like Go backend - no database storage)
      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook forms:', error);
      throw new Error(`Failed to fetch Facebook forms: ${error.message}`);
    }
  }

  /**
   * Get form fields for a specific form (aligned with Go backend)
   */
  async getFormFields(accountId, formId, pageToken) {
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

  /**
   * Get leads from a specific form (aligned with Go backend - no database storage)
   */
  async getLeads(accountId, formId, pageToken) {
    try {
      const url = `${this.baseURL}/${formId}/leads?fields=created_time,id,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_name,ad_id`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${pageToken}`
        }
      });

      // Return Facebook response directly (like Go backend - no database storage)
      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook leads:', error);
      throw new Error(`Failed to fetch Facebook leads: ${error.message}`);
    }
  }

  /**
   * Update campaign with Facebook data (aligned with Go backend widget integration)
   */
  async updateCampaignWithFacebookData(campaignId, accountId, facebookData) {
    try {
      const campaign = await this.campaignRepo.updateByIdAndAccount(campaignId, accountId, {
        facebook_data: {
          facebook_page_id: facebookData.facebook_page_id,
          facebook_form_id: facebookData.facebook_form_id,
          facebook_page_token: facebookData.facebook_page_token
        }
      });

      return campaign;
    } catch (error) {
      console.error('Error updating campaign with Facebook data:', error);
      throw new Error(`Failed to update campaign with Facebook data: ${error.message}`);
    }
  }

  /**
   * Get campaigns with Facebook integration (aligned with Go backend)
   */
  async getCampaignsWithFacebookData(accountId,body) {
    try {
      const { page } = body;
      let options = {
         page
      };
      const campaigns = await this.campaignRepo.findByAccount(accountId,options);
      
      
      // Filter campaigns that have Facebook data
      const facebookCampaigns = campaigns.campaigns.filter(campaign => 
        campaign.facebook_data && 
        campaign.facebook_data.facebook_page_id && 
        campaign.facebook_data.facebook_form_id
      );

      return {
        campaigns: facebookCampaigns,
        pagination: campaigns.pagination
      };
    } catch (error) {
      console.error('Error fetching campaigns with Facebook data:', error);
      throw new Error(`Failed to fetch campaigns with Facebook data: ${error.message}`);
    }
  }

  async getCampaignWithFacebookData(id, accountId) {
    const campaign = await this.campaignRepo.findByIdAndAccount(id, accountId);
    return campaign;
  } 

  /**
   * Delete Facebook access token from account (aligned with Go backend)
   */
  async deleteAccessToken(accountId) {
    try {
      const account = await this.accountRepo.update(accountId, {
        facebook_user_id: null,
        facebook_access_token: null,
        facebook_account_data: null
      });

      return account;
    } catch (error) {
      console.error('Error deleting Facebook access token:', error);
      throw new Error(`Failed to delete Facebook access token: ${error.message}`);
    }
  }
}

module.exports = FacebookService;
