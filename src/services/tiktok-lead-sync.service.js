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


    async syncAllCampaigns() {
        try {
            console.log("🔄 Starting TikTok leads sync...");

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

            const account = await this.accountRepo.findById(campaign.account_id);
            if (!account || !account.tiktok_access_token) {
                console.log(`⚠️  Account not found or no TikTok token for campaign ${campaign._id}`);
                return { created: 0, skipped: 0 };
            }

            const accessToken = await decrypt(account.tiktok_access_token);

            const formId = campaign.tiktok_data?.tiktok_form_id; // This is the page_id
            const advertiserId = campaign.tiktok_data?.tiktok_advertiser_id;

            if (!formId || !advertiserId) {
                console.log(`⚠️  Missing TikTok form_id (page_id) or advertiser_id for campaign ${campaign._id}`);
                return { created: 0, skipped: 0 };
            }

            const allLeads = await this.fetchAllLeads(formId, advertiserId, accessToken);

            console.log(`📥 Fetched ${allLeads.length} leads from TikTok for campaign ${campaign.name}`);

            let created = 0;
            let skipped = 0;

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
     * Fetch all leads from TikTok using task-based CSV download
     * No pagination needed - CSV contains all leads
     */
    async fetchAllLeads(formId, advertiserId, accessToken) {
        try {
            // getLeads now uses task-based CSV download and returns array of lead objects
            const leads = await this.tiktokService.getLeads(formId, advertiserId, accessToken);
            return leads || [];
        } catch (error) {
            console.error("⚠️  Error fetching TikTok leads:", error.message);
            return [];
        }
    }

    /**
     * Process a single lead - check for duplicates, time filter, map custom fields, and save to Call model
     */
    async processLead(lead, campaign) {
        try {
            // Extract base lead data from TikTok CSV structure (phone, name, email)
            const baseLeadData = this.extractLeadData(lead);

            if (!baseLeadData.phone_number) {
                const leadId = lead.lead_id || lead.id || lead.leadid || 'unknown';
                console.log(`⚠️  Lead ${leadId} has no phone number, skipping`);
                return { created: false };
            }

            // Get lead creation time from CSV
            const createTime = this.parseLeadTime(lead.create_time || lead.created_time || lead.CreateTime || lead.CreatedTime);
            if (!createTime) {
                console.log(`⚠️  Lead ${lead.lead_id || lead.id} has no create time, skipping`);
                return { created: false };
            }

            // Time filter: Only process leads within 48 hours
            const now = new Date();
            const leadTime = new Date(createTime);
            const hoursDiff = (now - leadTime) / (1000 * 60 * 60);
            
            if (hoursDiff > 48) {
                console.log(`⏭️  Lead ${lead.lead_id || lead.id} is older than 48 hours (${Math.floor(hoursDiff)}h), skipping`);
                return { created: false };
            }

            // Use lead_id or id as source_id
            const leadId = lead.lead_id || lead.id || lead.leadid || lead.LeadID || lead.LeadId;
            if (!leadId) {
                console.log(`⚠️  Lead has no ID, skipping`);
                return { created: false };
            }

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

            // Map custom fields based on campaign configuration
            // Start with base lead data (phone_number, name, email)
            let mappedLeadData = { ...baseLeadData };
            
            // If custom fields are enabled, map TikTok fields to custom field names
            if (campaign.custom_fields && campaign.custom_fields.is_active && campaign.custom_fields.widget_custom_field) {
                mappedLeadData = this.mapCustomFields(lead, campaign.custom_fields.widget_custom_field, baseLeadData);
            } else {
                // If no custom fields, include all TikTok fields in lead_data
                Object.keys(lead).forEach(key => {
                    // Skip internal fields
                    if (!['lead_id', 'id', 'leadid', 'LeadID', 'LeadId', 'create_time', 'created_time', 'CreateTime', 'CreatedTime'].includes(key)) {
                        if (!mappedLeadData[key] && lead[key]) {
                            mappedLeadData[key] = String(lead[key]).trim();
                        }
                    }
                });
            }

            // Create call record with mapped lead_data
            const callData = {
                account_id: campaign.account_id,
                call_origination_id: new mongoose.Types.ObjectId(),
                source_type: "tiktok",
                source_id: leadId.toString(),
                campaign_id: campaign._id,
                campaign_name: campaign.name,
                site_url: campaign.site_url,
                lead_data: mappedLeadData, // All mapped fields go here (Mongoose converts object to Map)
                register_time: leadTime,
                start_time: leadTime,
                "call_status.call_state": "scheduled" // Initial status
            };

            const call = await this.callRepo.create(callData);

            console.log(`✅ Created call ${call._id} for TikTok lead ${leadId} with ${Object.keys(mappedLeadData).length} fields in lead_data`);
            return { created: true, callId: call._id };

        } catch (error) {
            const leadId = lead.lead_id || lead.id || lead.leadid || 'unknown';
            console.error(`❌ Error processing lead ${leadId}:`, error);
            throw error;
        }
    }

    /**
     * Parse lead time from various formats
     */
    parseLeadTime(timeValue) {
        if (!timeValue) return null;
        
        // Try parsing as timestamp (seconds or milliseconds)
        if (typeof timeValue === 'number') {
            // If it's in seconds (TikTok format), convert to milliseconds
            if (timeValue < 10000000000) {
                return new Date(timeValue * 1000);
            }
            return new Date(timeValue);
        }
        
        // Try parsing as date string
        if (typeof timeValue === 'string') {
            const parsed = new Date(timeValue);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        
        return null;
    }

    /**
     * Extract standard lead data from TikTok CSV structure
     * CSV columns become object keys (case-insensitive matching)
     */
    extractLeadData(lead) {
        const leadData = {};

        // CSV format: lead is an object with column names as keys
        // Common TikTok CSV columns: lead_id, create_time, phone_number, name, email, etc.
        Object.keys(lead).forEach(key => {
            const value = lead[key];
            if (value === null || value === undefined || value === '') {
                return; // Skip empty values
            }

            const keyLower = key.toLowerCase().trim();
            
            // Map standard fields (case-insensitive)
            if (keyLower === 'phone_number' || keyLower === 'phone' || keyLower === 'mobile' || keyLower === 'phone number') {
                leadData.phone_number = String(value).trim();
            } else if (keyLower === 'full_name' || keyLower === 'name' || keyLower === 'full name') {
                leadData.name = String(value).trim();
                leadData.full_name = String(value).trim();
            } else if (keyLower === 'email' || keyLower === 'e-mail') {
                leadData.email = String(value).trim();
            } else if (keyLower === 'lead_id' || keyLower === 'leadid' || keyLower === 'lead id') {
                // Store lead_id but don't add to lead_data
                lead.lead_id = String(value).trim();
            } else if (keyLower === 'create_time' || keyLower === 'created_time' || keyLower === 'createtime' || keyLower === 'createdtime') {
                // Store create_time but don't add to lead_data
                lead.create_time = value;
            } else {
                // Store other fields as-is in lead_data
                leadData[key] = String(value).trim();
            }
        });

        return leadData;
    }

    /**
     * Map custom fields from campaign to lead_data
     * For CSV format, fields are already in the lead object as keys
     * Maps TikTok field keys (from campaign.custom_fields.widget_custom_field[].key) 
     * to custom field names (campaign.custom_fields.widget_custom_field[].name)
     */
    mapCustomFields(tiktokLead, customFields, baseLeadData) {
        // Start with base lead data (phone_number, name, email)
        const mappedData = { ...baseLeadData };

        // For CSV format, TikTok fields are already in the lead object as keys
        // Create a case-insensitive map of TikTok field keys to values
        const tiktokFieldMap = {};
        Object.keys(tiktokLead).forEach(key => {
            const keyLower = key.toLowerCase().trim();
            const value = tiktokLead[key];
            if (value !== null && value !== undefined && value !== '') {
                tiktokFieldMap[keyLower] = String(value).trim();
                tiktokFieldMap[key] = String(value).trim(); // Also keep original case
            }
        });

        // Map custom fields based on campaign configuration
        // customFields is an array of { name: "Custom Field Name", key: "tiktok_field_key" }
        if (Array.isArray(customFields)) {
            customFields.forEach(customField => {
                if (!customField || !customField.key || !customField.name) {
                    return; // Skip invalid custom field config
                }

                // Try to find the TikTok field by key (case-insensitive)
                const tiktokKey = customField.key.trim();
                const tiktokValue = tiktokFieldMap[tiktokKey.toLowerCase()] || tiktokFieldMap[tiktokKey];
                
                if (tiktokValue) {
                    // Use custom field name as the key in lead_data
                    mappedData[customField.name.trim()] = tiktokValue;
                    console.log(`  📋 Mapped TikTok field "${tiktokKey}" → "${customField.name}" = "${tiktokValue}"`);
                }
            });
        }

        return mappedData;
    }
}

module.exports = TikTokLeadSyncService;

