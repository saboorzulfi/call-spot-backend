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
      if (!config.tiktok.clientKey || !config.tiktok.clientSecret) {
        throw new Error('TikTok OAuth configuration is missing. Please check TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI in your .env file');
      }

      const body = {
        app_id: config.tiktok.clientKey,
        secret: config.tiktok.clientSecret,
        auth_code: auth_code,
      };

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

      const encryptedAccessToken = await encrypt(access_token);
      const encryptedRefreshToken = refresh_token ? await encrypt(refresh_token) : null;

      const existingAccount = await this.accountRepo.findById(accountId);
      const existingTikTokData = existingAccount?.tiktok_account_data || {};

      const updateData = {
        tiktok_access_token: encryptedAccessToken,
      };

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
      if (!user) 
        throw new Error('User not found');
      
      if (!user.tiktok_access_token) 
        return { data: [] };
      
      const tiktokAccessToken = await decrypt(user.tiktok_access_token);
      const url = `${this.baseURL}/oauth2/advertiser/get/`;
      
      if (!config.tiktok || !config.tiktok.clientKey) 
        throw new Error('TikTok app_id (TIKTOK_CLIENT_KEY) is required for getAdvertisers API call');
      
      const response = await axios.get(url, {
        headers: {
          'Access-Token': tiktokAccessToken,
          'Content-Type': 'application/json'
        },
        params: {
          app_id: config.tiktok.clientKey,
          secret: config.tiktok.clientSecret,
          fields: '["advertiser_id","name"]'
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
      // Use /page/get endpoint with business_type=LEAD_GEN to get lead generation forms
      const url = `${this.baseURL}/page/get`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          advertiser_id: advertiserId,
          business_type: 'LEAD_GEN',
          page_size: 100,
          page: 1
        }
      });


      const tiktokData = response.data?.data;
      if (!tiktokData || !tiktokData.list) {
        return {
          list: [],
          page_info: tiktokData?.page_info || { page: 1, page_size: 100, total_number: 0, total_page: 0 }
        };
      }

      const forms = tiktokData.list.map(form => ({
        page_id: form.page_id,
        title: form.title,
      }));

      return {
        list: forms,
        page_info: tiktokData.page_info
      };
    } catch (error) {
      console.error('Error fetching TikTok forms:', error);
      throw new Error(`Failed to fetch TikTok forms: ${error.message}`);
    }
  }

  async getFormFields(pageId, advertiserId, accessToken) {
    try {
      // Validate required parameters
      if (!pageId || !advertiserId || !accessToken) {
        throw new Error('page_id, advertiser_id and access_token are required');
      }

      // Use /page/field/get endpoint to get form fields
      const url = `${this.baseURL}/page/field/get`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          advertiser_id: advertiserId,
          page_id: pageId // This is the page_id from the forms list
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching TikTok form fields:', error);
      throw new Error(`Failed to fetch TikTok form fields: ${error.message}`);
    }
  }

  /**
   * Create a task to export leads from TikTok
   * @param {string} pageId - The page_id (form_id) from TikTok forms
   * @param {string} advertiserId - TikTok advertiser ID
   * @param {string} accessToken - TikTok access token
   * @returns {Promise<string>} task_id
   */
  async createLeadTask(pageId, advertiserId, accessToken) {
    try {
      const url = `${this.baseURL}/page/lead/task/`;
      const response = await axios.post(url, {
        advertiser_id: advertiserId,
        page_id: pageId
      }, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });

      const taskId = response.data?.data?.task_id;
      if (!taskId) {
        throw new Error('Task ID not received from TikTok API');
      }

      console.log(`✅ Created TikTok lead task: ${taskId}`);
      return taskId;
    } catch (error) {
      console.error('Error creating TikTok lead task:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw new Error(`Failed to create TikTok lead task: ${error.message}`);
    }
  }

  /**
   * Download CSV leads from TikTok task
   * @param {string} taskId - Task ID from createLeadTask
   * @param {string} accessToken - TikTok access token
   * @returns {Promise<Array<Array<string>>>} CSV data as array of arrays
   */
  async downloadLeadCSV(taskId, accessToken) {
    try {
      const url = `${this.baseURL}/page/lead/task/download/`;
      const response = await axios.get(url, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          task_id: taskId
        },
        responseType: 'text' // Expect CSV as text
      });

      // Parse CSV string to array of arrays
      const csvData = this.parseCSV(response.data);
      return csvData;
    } catch (error) {
      console.error('Error downloading TikTok lead CSV:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw new Error(`Failed to download TikTok lead CSV: ${error.message}`);
    }
  }

  /**
   * Parse CSV string to array of arrays
   * @param {string} csvString - CSV content as string
   * @returns {Array<Array<string>>} Parsed CSV data
   */
  parseCSV(csvString) {
    if (!csvString || typeof csvString !== 'string') {
      return [];
    }

    const lines = csvString.split('\n').filter(line => line.trim() !== '');
    return lines.map(line => {
      // Handle quoted fields with commas
      const fields = [];
      let currentField = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            currentField += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Field separator
          fields.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }

      // Add last field
      fields.push(currentField.trim());
      return fields;
    });
  }

  /**
   * Get leads from TikTok using task-based CSV download
   * @param {string} formId - The page_id (form_id) from TikTok forms
   * @param {string} advertiserId - TikTok advertiser ID
   * @param {string} accessToken - TikTok access token
   * @returns {Promise<Array>} Array of lead objects
   */
  async getLeads(formId, advertiserId, accessToken) {
    try {
      // Step 1: Create task
      const taskId = await this.createLeadTask(formId, advertiserId, accessToken);

      // Step 2: Download CSV (may need to wait/poll if task is not ready)
      // For now, try immediately - may need to add retry logic if task takes time
      let csvData;
      let retries = 0;
      const maxRetries = 10;
      const retryDelay = 2000; // 2 seconds

      while (retries < maxRetries) {
        try {
          csvData = await this.downloadLeadCSV(taskId, accessToken);
          if (csvData && csvData.length > 0) {
            break; // Success
          }
        } catch (error) {
          if (error.message.includes('task') || error.response?.status === 404) {
            // Task might not be ready yet
            if (retries < maxRetries - 1) {
              console.log(`⏳ Task ${taskId} not ready, retrying in ${retryDelay}ms... (${retries + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              retries++;
              continue;
            }
          }
          throw error;
        }
        retries++;
      }

      if (!csvData || csvData.length === 0) {
        console.log(`⚠️  No leads found in CSV for task ${taskId}`);
        return [];
      }

      // Step 3: Convert CSV rows to lead objects
      // First row is headers, rest are data
      const headers = csvData[0] || [];
      const leads = csvData.slice(1).map((row, index) => {
        const lead = {};
        headers.forEach((header, colIndex) => {
          if (header && row[colIndex] !== undefined) {
            lead[header.trim()] = row[colIndex]?.trim() || '';
          }
        });
        return lead;
      }).filter(lead => Object.keys(lead).length > 0); // Remove empty rows

      console.log(`✅ Parsed ${leads.length} leads from TikTok CSV`);
      return leads;
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
