const CampaignRepository = require("../v1/repositories/campaign.repository");
const CallRepository = require("../v1/repositories/call.repository");
const FacebookService = require("./facebook.service");
const AccountRepository = require("../v1/repositories/account.repository");
const { decrypt } = require("../utils/encryption.util");
const mongoose = require("mongoose");

class FacebookLeadSyncService {
    constructor() {
        this.campaignRepo = new CampaignRepository();
        this.callRepo = new CallRepository();
        this.facebookService = new FacebookService();
        this.accountRepo = new AccountRepository();
    }

    /**
     * Sync Facebook leads for all campaigns
     * Runs daily via cron job
     */
    async syncAllCampaigns() {
        try {
            console.log("🔄 Starting Facebook leads sync...");

            // Get all campaigns with Facebook form ID directly from model
            const Campaign = require("../models/campaign.model");
            const allCampaigns = await Campaign.find({
                deleted_at: null,
                "facebook_data.facebook_form_id": { $exists: true, $ne: null },
                "facebook_data.facebook_page_token": { $exists: true, $ne: null }
            });

            console.log(`📊 Found ${allCampaigns.length} campaigns with Facebook forms`);

            let totalProcessed = 0;
            let totalCreated = 0;
            let totalSkipped = 0;

            // Process each campaign
            for (const campaign of allCampaigns) {
                try {
                    const result = await this.syncCampaignLeads(campaign);
                    totalProcessed++;
                    totalCreated += result.created;
                    totalSkipped += result.skipped;
                } catch (error) {
                    console.error(`❌ Error syncing campaign ${campaign._id}:`, error.message);
                }
            }

            console.log(`✅ Facebook leads sync completed:`);
            console.log(`   - Campaigns processed: ${totalProcessed}`);
            console.log(`   - Calls created: ${totalCreated}`);
            console.log(`   - Duplicates skipped: ${totalSkipped}`);

        } catch (error) {
            console.error("❌ Error in Facebook leads sync:", error);
        }
    }

    /**
     * Sync leads for a single campaign
     */
    async syncCampaignLeads(campaign) {
        try {
            console.log(`📞 Syncing leads for campaign: ${campaign.name} (${campaign._id})`);

            // Get account to decrypt access token
            const account = await this.accountRepo.findById(campaign.account_id);
            if (!account || !account.facebook_access_token) {
                console.log(`⚠️  Account not found or no Facebook token for campaign ${campaign._id}`);
                return { created: 0, skipped: 0 };
            }

            // Decrypt access token - use page token if available, otherwise use account token
            let accessToken;
            if (campaign.facebook_data.facebook_page_token) {
                accessToken = await decrypt(campaign.facebook_data.facebook_page_token);
            } else {
                accessToken = await decrypt(account.facebook_access_token);
            }

            // Fetch all leads from Facebook (handle pagination)
            const allLeads = await this.fetchAllLeads(campaign.facebook_data.facebook_form_id, accessToken);

            console.log(`📥 Fetched ${allLeads.length} leads from Facebook for campaign ${campaign.name}`);

            let created = 0;
            let skipped = 0;

            // Process each lead
            for (const lead of allLeads) {
                try {
                    const result = await this.processLead(lead, campaign);
                    if (result.created) {
                        created++;
                    } else {
                        skipped++;
                    }
                } catch (error) {
                    console.error(`⚠️  Error processing lead ${lead.id}:`, error.message);
                }
            }

            return { created, skipped };
        } catch (error) {
            console.error(`❌ Error syncing campaign ${campaign._id}:`, error);
            throw error;
        }
    }

    /**
     * Fetch all leads from Facebook (handles pagination)
     */
    async fetchAllLeads(formId, accessToken) {
        const allLeads = [];
        let nextUrl = null;
        const axios = require('axios');

        do {
            try {
                let responseData;
                if (nextUrl) {
                    // Use the next URL from pagination
                    const response = await axios.get(nextUrl);
                    responseData = response.data;
                } else {
                    // Initial request - getLeads returns data directly
                    responseData = await this.facebookService.getLeads(formId, accessToken);
                }

                if (responseData && responseData.data) {
                    allLeads.push(...responseData.data);

                    // Check for next page
                    if (responseData.paging && responseData.paging.next) {
                        nextUrl = responseData.paging.next;
                    } else {
                        nextUrl = null;
                    }
                } else {
                    nextUrl = null;
                }
            } catch (error) {
                console.error("⚠️  Error fetching Facebook leads page:", error.message);
                nextUrl = null;
            }
        } while (nextUrl);

        return allLeads;
    }

    /**
     * Process a single lead - check for duplicates and create call if new
     */
    async processLead(lead, campaign) {
        try {
            // Extract lead data from Facebook field_data
            const leadData = this.extractLeadData(lead.field_data);

            if (!leadData.phone_number) {
                console.log(`⚠️  Lead ${lead.id} has no phone number, skipping`);
                return { created: false };
            }

            // Check if call already exists (by source_id = Facebook lead ID)
            const Call = require("../models/call.model");
            const existing = await Call.findOne({
                source_type: "facebook",
                source_id: lead.id.toString(),
                account_id: campaign.account_id
            });

            if (existing) {
                console.log(`⏭️  Lead ${lead.id} already exists as call ${existing._id}, skipping`);
                return { created: false };
            }

            // Map custom fields if enabled
            let mappedLeadData = { ...leadData };
            if (campaign.custom_fields && campaign.custom_fields.is_active && campaign.custom_fields.widget_custom_field) {
                mappedLeadData = this.mapCustomFields(lead.field_data, campaign.custom_fields.widget_custom_field, leadData);
            }

            // Create call record
            // Mongoose Map accepts plain objects - it will convert automatically
            const callData = {
                account_id: campaign.account_id,
                call_origination_id: new mongoose.Types.ObjectId(),
                source_type: "facebook",
                source_id: lead.id.toString(),
                campaign_id: campaign._id,
                campaign_name: campaign.name,
                site_url: campaign.site_url,
                lead_data: mappedLeadData, // Mongoose will convert object to Map
                register_time: new Date(lead.created_time),
                start_time: new Date(lead.created_time)
            };

            const call = await this.callRepo.create(callData);

            console.log(`✅ Created call ${call._id} for Facebook lead ${lead.id}`);
            return { created: true, callId: call._id };

        } catch (error) {
            console.error(`❌ Error processing lead ${lead.id}:`, error);
            throw error;
        }
    }

    /**
     * Extract standard lead data from Facebook field_data
     */
    extractLeadData(fieldData) {
        const leadData = {};

        fieldData.forEach(field => {
            const fieldName = field.name.toLowerCase();
            const value = field.values && field.values.length > 0 ? field.values[0] : null;

            if (value) {
                // Map standard fields
                if (fieldName === 'full_name' || fieldName === 'name') {
                    leadData.name = value;
                    leadData.full_name = value;
                } else if (fieldName === 'phone_number' || fieldName === 'phone') {
                    leadData.phone_number = value;
                } else if (fieldName === 'email') {
                    leadData.email = value;
                } else {
                    // Store other fields as-is
                    leadData[field.name] = value;
                }
            }
        });

        return leadData;
    }

    /**
     * Map custom fields from campaign to lead_data
     */
    mapCustomFields(facebookFieldData, customFields, baseLeadData) {
        const mappedData = { ...baseLeadData };

        // Create a map of Facebook field names to values
        const facebookFieldMap = {};
        facebookFieldData.forEach(field => {
            facebookFieldMap[field.name] = field.values && field.values.length > 0 ? field.values[0] : null;
        });

        // Map custom fields based on campaign configuration
        customFields.forEach(customField => {
            const facebookValue = facebookFieldMap[customField.key];
            if (facebookValue) {
                // Use custom field name as the key in lead_data
                mappedData[customField.name] = facebookValue;
            }
        });

        return mappedData;
    }
}

module.exports = FacebookLeadSyncService;

