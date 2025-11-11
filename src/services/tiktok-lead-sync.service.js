const CampaignRepository = require("../v1/repositories/campaign.repository");
const CallRepository = require("../v1/repositories/call.repository");
const TikTokService = require("./tiktok.service");
const AccountRepository = require("../v1/repositories/account.repository");
const { decrypt } = require("../utils/encryption.util");
const mongoose = require("mongoose");

class TikTokLeadSyncService {
    constructor() {
        this.campaignRepo = new CampaignRepository();
        this.callRepo = new CallRepository();
        this.tiktokService = new TikTokService();
        this.accountRepo = new AccountRepository();
    }

    /**
     * Sync TikTok leads for all campaigns
     * Runs daily via cron job
     */
    async syncAllCampaigns() {
        try {
            console.log("🔄 Starting TikTok leads sync...");

            // Get all campaigns with TikTok form ID directly from model
            const Campaign = require("../models/campaign.model");
            const allCampaigns = await Campaign.find({
                deleted_at: null,
                "tiktok_data.tiktok_form_id": { $exists: true, $ne: null },
                "tiktok_data.tiktok_advertiser_id": { $exists: true, $ne: null }
            });

            console.log(`📊 Found ${allCampaigns.length} campaigns with TikTok forms`);

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

            console.log(`✅ TikTok leads sync completed:`);
            console.log(`   - Campaigns processed: ${totalProcessed}`);
            console.log(`   - Calls created: ${totalCreated}`);
            console.log(`   - Duplicates skipped: ${totalSkipped}`);

        } catch (error) {
            console.error("❌ Error in TikTok leads sync:", error);
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
            if (!account || !account.tiktok_access_token) {
                console.log(`⚠️  Account not found or no TikTok token for campaign ${campaign._id}`);
                return { created: 0, skipped: 0 };
            }

            // Decrypt access token
            const accessToken = await decrypt(account.tiktok_access_token);

            // Get TikTok form ID (page_id) and advertiser ID from campaign
            // Note: tiktok_form_id in campaign is actually the page_id from TikTok forms
            const formId = campaign.tiktok_data?.tiktok_form_id; // This is the page_id
            const advertiserId = campaign.tiktok_data?.tiktok_advertiser_id;

            if (!formId || !advertiserId) {
                console.log(`⚠️  Missing TikTok form_id (page_id) or advertiser_id for campaign ${campaign._id}`);
                return { created: 0, skipped: 0 };
            }

            // Fetch all leads from TikTok (handle pagination)
            const allLeads = await this.fetchAllLeads(formId, advertiserId, accessToken);

            console.log(`📥 Fetched ${allLeads.length} leads from TikTok for campaign ${campaign.name}`);

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
                    console.error(`⚠️  Error processing lead ${lead.id || lead.lead_id}:`, error.message);
                }
            }

            return { created, skipped };
        } catch (error) {
            console.error(`❌ Error syncing campaign ${campaign._id}:`, error);
            throw error;
        }
    }

    /**
     * Fetch all leads from TikTok (handles pagination)
     */
    async fetchAllLeads(formId, advertiserId, accessToken) {
        const allLeads = [];
        let page = 1;
        const pageSize = 250;
        let hasMore = true;

        while (hasMore) {
            try {
                const responseData = await this.tiktokService.getLeads(formId, advertiserId, accessToken, page, pageSize);

                // TikTok API response structure: { data: { list: [...], page_info: {...} } }
                const tiktokData = responseData?.data;
                if (tiktokData && tiktokData.list && Array.isArray(tiktokData.list)) {
                    allLeads.push(...tiktokData.list);

                    // Check if there are more pages
                    const pageInfo = tiktokData.page_info;
                    if (pageInfo && page < pageInfo.total_page) {
                        page++;
                    } else {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            } catch (error) {
                console.error("⚠️  Error fetching TikTok leads page:", error.message);
                hasMore = false;
            }
        }

        return allLeads;
    }

    /**
     * Process a single lead - check for duplicates and create call if new
     */
    async processLead(lead, campaign) {
        try {
            // Extract lead data from TikTok lead structure
            const leadData = this.extractLeadData(lead);

            if (!leadData.phone_number) {
                console.log(`⚠️  Lead ${lead.id || lead.lead_id} has no phone number, skipping`);
                return { created: false };
            }

            // Use lead_id or id as source_id
            const leadId = lead.lead_id || lead.id || lead.leadid;

            // Check if call already exists (by source_id = TikTok lead ID)
            const Call = require("../models/call.model");
            const existing = await Call.findOne({
                source_type: "tiktok",
                source_id: leadId.toString(),
                account_id: campaign.account_id
            });

            if (existing) {
                console.log(`⏭️  Lead ${leadId} already exists as call ${existing._id}, skipping`);
                return { created: false };
            }

            // Map custom fields if enabled
            let mappedLeadData = { ...leadData };
            if (campaign.custom_fields && campaign.custom_fields.is_active && campaign.custom_fields.widget_custom_field) {
                mappedLeadData = this.mapCustomFields(lead, campaign.custom_fields.widget_custom_field, leadData);
            }

            // Create call record
            // Mongoose Map accepts plain objects - it will convert automatically
            const callData = {
                account_id: campaign.account_id,
                call_origination_id: new mongoose.Types.ObjectId(),
                source_type: "tiktok",
                source_id: leadId.toString(),
                campaign_id: campaign._id,
                campaign_name: campaign.name,
                site_url: campaign.site_url,
                lead_data: mappedLeadData, // Mongoose will convert object to Map
                register_time: new Date(lead.create_time || lead.created_time || Date.now()),
                start_time: new Date(lead.create_time || lead.created_time || Date.now())
            };

            const call = await this.callRepo.create(callData);

            console.log(`✅ Created call ${call._id} for TikTok lead ${leadId}`);
            return { created: true, callId: call._id };

        } catch (error) {
            console.error(`❌ Error processing lead ${lead.id || lead.lead_id}:`, error);
            throw error;
        }
    }

    /**
     * Extract standard lead data from TikTok lead structure
     */
    extractLeadData(lead) {
        const leadData = {};

        // TikTok leads typically have a list of answers/fields
        // Structure may vary, but common fields include:
        if (lead.answers && Array.isArray(lead.answers)) {
            lead.answers.forEach(answer => {
                const fieldName = answer.key || answer.field_name || answer.name;
                const value = answer.value || answer.values?.[0];

                if (value && fieldName) {
                    // Map standard fields
                    const fieldLower = fieldName.toLowerCase();
                    if (fieldLower === 'full_name' || fieldLower === 'name') {
                        leadData.name = value;
                        leadData.full_name = value;
                    } else if (fieldLower === 'phone_number' || fieldLower === 'phone' || fieldLower === 'mobile') {
                        leadData.phone_number = value;
                    } else if (fieldLower === 'email') {
                        leadData.email = value;
                    } else {
                        // Store other fields as-is
                        leadData[fieldName] = value;
                    }
                }
            });
        }

        // Also check for direct fields in the lead object
        if (lead.phone_number || lead.phone) {
            leadData.phone_number = lead.phone_number || lead.phone;
        }
        if (lead.name || lead.full_name) {
            leadData.name = lead.name || lead.full_name;
            leadData.full_name = leadData.name;
        }
        if (lead.email) {
            leadData.email = lead.email;
        }

        return leadData;
    }

    /**
     * Map custom fields from campaign to lead_data
     */
    mapCustomFields(tiktokLead, customFields, baseLeadData) {
        const mappedData = { ...baseLeadData };

        // Create a map of TikTok field keys to values
        const tiktokFieldMap = {};
        if (tiktokLead.answers && Array.isArray(tiktokLead.answers)) {
            tiktokLead.answers.forEach(answer => {
                const fieldKey = answer.key || answer.field_name || answer.name;
                const fieldValue = answer.value || answer.values?.[0];
                if (fieldKey) {
                    tiktokFieldMap[fieldKey] = fieldValue;
                }
            });
        }

        // Map custom fields based on campaign configuration
        customFields.forEach(customField => {
            const tiktokValue = tiktokFieldMap[customField.key];
            if (tiktokValue) {
                // Use custom field name as the key in lead_data
                mappedData[customField.name] = tiktokValue;
            }
        });

        return mappedData;
    }
}

module.exports = TikTokLeadSyncService;

