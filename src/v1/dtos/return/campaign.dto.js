class CampaignDTO {
  constructor(campaign) {
    this.id = campaign._id;
    this.doc_number = campaign.doc_number;
    this.account_id = campaign.account_id;
    this.name = campaign.name;
    this.site_url = campaign.site_url;
    this.is_active = campaign.is_active;
    this.company_name = campaign.company_name;
    this.custom_data = campaign.custom_data;
    this.call_routing = campaign.call_routing;
    this.custom_fields = campaign.custom_fields;
    this.design = campaign.design;
    this.texts = campaign.texts;
    this.calls = campaign.calls;
    this.tiktok_data = campaign.tiktok_data;
    this.facebook_data = campaign.facebook_data;
    this.google_widget_data = campaign.google_widget_data;
    this.created_at = campaign.created_at;
    this.updated_at = campaign.updated_at;
  }

  // Static method to transform multiple campaigns
  static fromArray(campaigns) {
    return campaigns.map(campaign => new CampaignDTO(campaign));
  }

  // Static method to transform single campaign
  static fromObject(campaign) {
    return new CampaignDTO(campaign);
  }

  // For campaign options (simplified)
  static toOption(campaign) {
    return {
      id: campaign._id.toString(),
      name: campaign.name
    };
  }
}

module.exports = CampaignDTO;
