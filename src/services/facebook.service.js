const axios = require('axios');
const AccountRepository = require('../v1/repositories/account.repository');
const { decrypt } = require('../utils/encryption.util');

class FacebookService {
  constructor() {
    this.accountRepo = new AccountRepository();
    this.baseURL = 'https://graph.facebook.com/v21.0';
  }

  /**
   * Get Facebook pages for authenticated user
   */
  async getPages(accountId) {
    try {
      // Get user account with Facebook credentials
      const user = await this.accountRepo.findById(accountId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.facebookAccessToken || !user.facebookUserId) {
        return { data: [] }; // Return empty if no Facebook integration
      }

      // Decrypt Facebook credentials
      const facebookUserId = await decrypt(user.facebookUserId);
      const facebookAccessToken = await decrypt(user.facebookAccessToken);

      // Make API call to Facebook
      const url = `${this.baseURL}/${facebookUserId}/accounts?limit=250`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${facebookAccessToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook pages:', error);
      throw new Error(`Failed to fetch Facebook pages: ${error.message}`);
    }
  }

  /**
   * Get Facebook forms for a specific page
   */
  async getForms(accountId, pageId, pageToken) {
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

  /**
   * Get form fields for a specific form
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
   * Get leads from a specific form
   */
  async getLeads(accountId, formId, pageToken) {
    try {
      const url = `${this.baseURL}/${formId}/leads?fields=created_time,id,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_name,ad_id`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${pageToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Facebook leads:', error);
      throw new Error(`Failed to fetch Facebook leads: ${error.message}`);
    }
  }
}

module.exports = FacebookService;
