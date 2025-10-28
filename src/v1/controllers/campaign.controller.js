const AppError = require("../../utils/app_error.util");
const AppResponse = require("../../utils/response.util");
const CampaignRepository = require("../repositories/campaign.repository");
const CallRepository = require("../repositories/call.repository");
const tryCatchAsync = require("../../utils/try_catch.util");
const statusCode = require("../../utils/status_code.util");

class CampaignController {
  constructor() {
    this.campaignRepo = new CampaignRepository();
    this.callRepo = new CallRepository();
  }

  // POST /campaigns - Create new campaign
  create = tryCatchAsync(async (req, res, next) => {
    const campaignData = req.body;
    const accountId = req.account._id;

    campaignData.account_id = accountId;

    const campaign = await this.campaignRepo.create(campaignData);

    const responseData = {
      campaign: {
        id: campaign._id,
        doc_number: campaign.doc_number,
        name: campaign.name,
        site_url: campaign.site_url,
        is_active: campaign.is_active,
        company_name: campaign.company_name,
        call_stats: campaign.call_stats,
        custom_data: campaign.custom_data,
        design: campaign.design,
        call_routing: campaign.call_routing,
        texts: campaign.texts,
        calls: campaign.calls,
        tiktok_data: campaign.tiktok_data,
        facebook_data: campaign.facebook_data,
        google_widget_data: campaign.google_widget_data,
        custom_fields: campaign.custom_fields,
        auto_created: campaign.auto_created,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at
      }
    };

    return AppResponse.success(res, responseData, "Campaign created successfully", statusCode.CREATED);
  });

  // GET /campaigns - Get all campaigns for account
  getAll = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { page, limit, is_active, search, sortBy, sortOrder } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      is_active,
      search,
      sortBy: sortBy || "created_at",
      sortOrder: sortOrder || "desc"
    };

    const result = await this.campaignRepo.findByAccount(accountId, options);

    const campaigns = result.campaigns.map(campaign => ({
      id: campaign._id,
      doc_number: campaign.doc_number,
      name: campaign.name,
      site_url: campaign.site_url,
      is_active: campaign.is_active,
      company_name: campaign.company_name,
      call_stats: campaign.call_stats,
      custom_data: campaign.custom_data,
      design: campaign.design,
      call_routing: campaign.call_routing,
      texts: campaign.texts,
      calls: campaign.calls,
      tiktok_data: campaign.tiktok_data,
      facebook_data: campaign.facebook_data,
      google_widget_data: campaign.google_widget_data,
      custom_fields: campaign.custom_fields,
      auto_created: campaign.auto_created,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at
    }));

    const responseData = {
      campaigns,
      pagination: result.pagination
    };

    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // GET /campaigns/:id - Get campaign by ID
  getById = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    let options = {
      populate: [
        {
          path: "call_routing.agents",
          model: "Agent",
          select: "full_name personal_phone email is_active doc_number _id"
        },
        {
          path: "call_routing.agent_groups",
          model: "AgentGroup",
          select: "name agent_ids is_default doc_number _id"
        }
      ]
    };

    const campaign = await this.campaignRepo.findByIdAndAccount(id, accountId, options);

    const responseData = {
      campaign: {
        id: campaign._id,
        doc_number: campaign.doc_number,
        name: campaign.name,
        site_url: campaign.site_url,
        is_active: campaign.is_active,
        company_name: campaign.company_name,
        call_stats: campaign.call_stats,
        custom_data: campaign.custom_data,
        design: campaign.design,
        call_routing: campaign.call_routing,
        texts: campaign.texts,
        calls: campaign.calls,
        tiktok_data: campaign.tiktok_data,
        facebook_data: campaign.facebook_data,
        google_widget_data: campaign.google_widget_data,
        custom_fields: campaign.custom_fields,
        auto_created: campaign.auto_created,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at
      }
    };

    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // PUT /campaigns/:id - Update campaign
  update = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const updateData = req.body;

    const existingCampaign = await this.campaignRepo.findByIdAndAccount(id, accountId);
    if (existingCampaign.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const campaign = await this.campaignRepo.updateByIdAndAccount(id, accountId, updateData);

    const responseData = {
      campaign: {
        id: campaign._id,
        doc_number: campaign.doc_number,
        name: campaign.name,
        site_url: campaign.site_url,
        is_active: campaign.is_active,
        company_name: campaign.company_name,
        call_stats: campaign.call_stats,
        custom_data: campaign.custom_data,
        design: campaign.design,
        call_routing: campaign.call_routing,
        texts: campaign.texts,
        calls: campaign.calls,
        tiktok_data: campaign.tiktok_data,
        facebook_data: campaign.facebook_data,
        google_widget_data: campaign.google_widget_data,
        custom_fields: campaign.custom_fields,
        auto_created: campaign.auto_created,
        created_at: campaign.createdAt,
        updated_at: campaign.updatedAt
      }
    };

    return AppResponse.success(res, responseData, "Campaign updated successfully", statusCode.OK);
  });

  // PATCH /campaigns/:id - Update campaign configs
  updateConfigs = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    console.log("Form data received:", req.body);
    console.log("Files received:", req.files);

    // Extract form fields like Go backend does (PascalCase)
    const {
      Name, SiteUrl, CompanyName, UnitType, PropertyType, PropertyStatus, PropertyPrice, PropertySize, PropertyBedrooms, PropertyBathrooms, PropertyLocation, PropertyFeatures,
      TitleColor, SubTextColor, BackgroundColor, FormBackgroundColor, FormButtonColor, FormTextColor, WidgetButtonColor, WidgetButtonIcon, WidgetButtonIconColor, FontFamily, StickyButtonState,
      AiAgentId, Agents, AgentGroups, UseInvestorAgents, InvestorAgents, InvestorAgentGroups, Timezone, WorkingHours, CallType, Keywords, AgentHangup, DisableAgents, TriggerMissed,
      MessageEnabled, MessageText, MessageDelay, MessageRetryCount, MessageRetryDelay,
      CallEnabled, CallDelay, CallRetryCount, CallRetryDelay, CallRecording, CallTranscription,
      TiktokAdvertiserId, TiktokFormId, TiktokAccessToken, TiktokRefreshToken,
      FacebookPageId, FacebookFormId, FacebookAccessToken, FacebookRefreshToken,
      GoogleFormId, GoogleAccessToken, GoogleRefreshToken,
      CustomFieldsJsonString,
      is_custom_field_active,
      custom_fields
    } = req.body;

    // Handle S3 uploaded files
    const logo = req.files?.Logo?.[0];
    const backgroundImage = req.files?.BackgroundImage?.[0];

    const updateData = {};

    // Update main tab data if provided
    if (Name || SiteUrl || CompanyName || UnitType || PropertyType || PropertyStatus || PropertyPrice || PropertySize || PropertyBedrooms || PropertyBathrooms || PropertyLocation || PropertyFeatures) {
      updateData.name = Name;
      updateData.site_url = SiteUrl;
      updateData.company_name = CompanyName;
      if (!updateData.custom_data) updateData.custom_data = {};
      updateData.custom_data.unit_type = UnitType;
      updateData.custom_data.property_type = PropertyType;
      updateData.custom_data.property_status = PropertyStatus;
      updateData.custom_data.property_price = PropertyPrice;
      updateData.custom_data.property_size = PropertySize;
      updateData.custom_data.property_bedrooms = PropertyBedrooms;
      updateData.custom_data.property_bathrooms = PropertyBathrooms;
      updateData.custom_data.property_location = PropertyLocation;
      updateData.custom_data.property_features = PropertyFeatures;
    }

    // Update design data if provided
    if (logo || backgroundImage || TitleColor || SubTextColor || BackgroundColor || FormBackgroundColor || FormButtonColor || FormTextColor || WidgetButtonColor || WidgetButtonIcon || WidgetButtonIconColor || FontFamily || StickyButtonState) {
      if (!updateData.design) updateData.design = {};
      if (logo) { updateData.design.logo = logo.location; console.log("Logo uploaded to S3:", logo.location); }
      if (backgroundImage) { updateData.design.background_image = backgroundImage.location; console.log("Background image uploaded to S3:", backgroundImage.location); }
      updateData.design.title_color = TitleColor;
      updateData.design.sub_text_color = SubTextColor;
      updateData.design.background_color = BackgroundColor;
      updateData.design.form_background_color = FormBackgroundColor;
      updateData.design.form_button_color = FormButtonColor;
      updateData.design.form_text_color = FormTextColor;
      updateData.design.widget_button_color = WidgetButtonColor;
      updateData.design.widget_button_icon = WidgetButtonIcon;
      updateData.design.widget_button_icon_color = WidgetButtonIconColor;
      updateData.design.font_family = FontFamily;
      updateData.design.sticky_button_state = StickyButtonState === 'true';
    }

    // Update routing data if provided
    if (AiAgentId || Agents || AgentGroups || UseInvestorAgents || InvestorAgents || InvestorAgentGroups || Timezone || WorkingHours || CallType || Keywords || AgentHangup || DisableAgents || TriggerMissed) {
      if (!updateData.call_routing) updateData.call_routing = {};
      updateData.call_routing.ai_agent_id = AiAgentId;
      updateData.call_routing.agents = Agents ? Agents.split(',').map(id => id.trim()) : [];
      updateData.call_routing.agent_groups = AgentGroups ? AgentGroups.split(',').map(id => id.trim()) : [];
      updateData.call_routing.use_investor_agents = UseInvestorAgents === 'true';
      updateData.call_routing.investor_agents = InvestorAgents ? InvestorAgents.split(',').map(id => id.trim()) : [];
      updateData.call_routing.investor_agent_groups = InvestorAgentGroups ? InvestorAgentGroups.split(',').map(id => id.trim()) : [];
      updateData.call_routing.timezone = Timezone;
      if (WorkingHours) {
        try {
          updateData.call_routing.working_hours = JSON.parse(WorkingHours);
        } catch (error) {
          console.error("Error parsing working hours:", error);
        }
      }
      updateData.call_routing.call_type = CallType;
      updateData.call_routing.keywords = Keywords ? Keywords.split(',').map(keyword => keyword.trim()) : [];
      updateData.call_routing.agent_hangup = AgentHangup === 'true';
      updateData.call_routing.disable_agents = DisableAgents === 'true';
      updateData.call_routing.trigger_missed = TriggerMissed === 'true';
    }

    // Update texts data if provided
    if (MessageEnabled || MessageText || MessageDelay || MessageRetryCount || MessageRetryDelay) {
      if (!updateData.texts) updateData.texts = {};
      updateData.texts.message_enabled = MessageEnabled === 'true';
      updateData.texts.message_text = MessageText;
      updateData.texts.message_delay = parseInt(MessageDelay) || 0;
      updateData.texts.message_retry_count = parseInt(MessageRetryCount) || 0;
      updateData.texts.message_retry_delay = parseInt(MessageRetryDelay) || 0;
    }

    // Update calls data if provided
    if (CallEnabled || CallDelay || CallRetryCount || CallRetryDelay || CallRecording || CallTranscription) {
      if (!updateData.calls) updateData.calls = {};
      updateData.calls.call_enabled = CallEnabled === 'true';
      updateData.calls.call_delay = parseInt(CallDelay) || 0;
      updateData.calls.call_retry_count = parseInt(CallRetryCount) || 0;
      updateData.calls.call_retry_delay = parseInt(CallRetryDelay) || 0;
      updateData.calls.call_recording = CallRecording === 'true';
      updateData.calls.call_transcription = CallTranscription === 'true';
    }

    // Update integration data if provided
    if (TiktokAdvertiserId || TiktokFormId || TiktokAccessToken || TiktokRefreshToken) {
      if (!updateData.tiktok_data) updateData.tiktok_data = {};
      updateData.tiktok_data.tiktok_advertiser_id = TiktokAdvertiserId;
      updateData.tiktok_data.tiktok_form_id = TiktokFormId;
      updateData.tiktok_data.tiktok_access_token = TiktokAccessToken;
      updateData.tiktok_data.tiktok_refresh_token = TiktokRefreshToken;
    }

    if (FacebookPageId || FacebookFormId || FacebookAccessToken || FacebookRefreshToken) {
      if (!updateData.facebook_data) updateData.facebook_data = {};
      updateData.facebook_data.facebook_page_id = FacebookPageId;
      updateData.facebook_data.facebook_form_id = FacebookFormId;
      updateData.facebook_data.facebook_access_token = FacebookAccessToken;
      updateData.facebook_data.facebook_refresh_token = FacebookRefreshToken;
    }

    if (GoogleFormId || GoogleAccessToken || GoogleRefreshToken) {
      if (!updateData.google_widget_data) updateData.google_widget_data = {};
      updateData.google_widget_data.google_form_id = GoogleFormId;
      updateData.google_widget_data.google_access_token = GoogleAccessToken;
      updateData.google_widget_data.google_refresh_token = GoogleRefreshToken;
    }

    // Update custom fields if provided (supports JSON string or direct array)
    if (is_custom_field_active || Array.isArray(custom_fields)) {

      if (!updateData.custom_fields) updateData.custom_fields = {};
      updateData.custom_fields.widget_custom_field = custom_fields;
      updateData.custom_fields.is_active = (is_custom_field_active === true || is_custom_field_active === 'true') ? true : false;

    }

    console.log("Final update data:", updateData);
    const campaign = await this.campaignRepo.updateConfigsByIdAndAccount(id, accountId, updateData);
    const responseData = {
      campaign: {
        id: campaign._id,
        doc_number: campaign.doc_number,
        name: campaign.name,
        site_url: campaign.site_url,
        is_active: campaign.is_active,
        company_name: campaign.company_name,
        call_stats: campaign.call_stats,
        custom_data: campaign.custom_data,
        design: campaign.design,
        call_routing: campaign.call_routing,
        texts: campaign.texts,
        calls: campaign.calls,
        tiktok_data: campaign.tiktok_data,
        facebook_data: campaign.facebook_data,
        google_widget_data: campaign.google_widget_data,
        custom_fields: campaign.custom_fields,
        auto_created: campaign.auto_created,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at
      }
    };

    return AppResponse.success(res, responseData, "Campaign configs updated successfully", statusCode.OK);
  });

  // POST /campaigns/:id/clone - Clone campaign
  clone = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const campaign = await this.campaignRepo.cloneByIdAndAccount(id, accountId);

    const responseData = {
      campaign: {
        id: campaign._id,
        doc_number: campaign.doc_number,
        name: campaign.name,
        site_url: campaign.site_url,
        is_active: campaign.is_active,
        company_name: campaign.company_name,
        call_stats: campaign.call_stats,
        custom_data: campaign.custom_data,
        design: campaign.design,
        call_routing: campaign.call_routing,
        texts: campaign.texts,
        calls: campaign.calls,
        tiktok_data: campaign.tiktok_data,
        facebook_data: campaign.facebook_data,
        google_widget_data: campaign.google_widget_data,
        custom_fields: campaign.custom_fields,
        auto_created: campaign.auto_created,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at
      }
    };

    return AppResponse.success(res, responseData, "Campaign cloned successfully", statusCode.CREATED);
  });

  // DELETE /campaigns/:id - Delete campaign
  delete = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const existingCampaign = await this.campaignRepo.findByIdAndAccount(id, accountId);
    if (existingCampaign.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    await this.campaignRepo.deleteByIdAndAccount(id, accountId);
    let responseData = {};
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // GET /campaigns/widget-options - Get widget options (equivalent to Go backend /call/widget-options)
  getCampaignOptions = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { source } = req.query;

    const campaigns = await this.campaignRepo.findByAccount(accountId, { limit: 1000 });
    // If source is provided, filter campaigns that have calls with that source type
    let filteredCampaigns = campaigns.campaigns;

    if (source) {
      const sourceTypes = source.split(',').map(s => s.trim());

      // Get campaigns that have calls with the specified source types
      const campaignIds = campaigns.campaigns.map(c => c._id);

      // This is a simplified version - in a real implementation, you'd query calls table
      // For now, we'll return all campaigns (you can enhance this based on your call data)
      filteredCampaigns = campaigns.campaigns;
    }

    // Format response like Go backend
    const campaignOptions = filteredCampaigns.map(campaign => ({
      id: campaign._id.toString(),
      name: campaign.name
    }));
    let responseData = {
      campaigns: campaignOptions
    };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });
}

module.exports = CampaignController;
