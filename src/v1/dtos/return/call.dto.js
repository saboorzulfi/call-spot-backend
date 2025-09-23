class CallDTO {
  constructor(call) {
    this.id = call._id;
    this.doc_number = call.doc_number;
    this.account_id = call.account_id;
    this.campaign = call.campaign_id;
    this.campaign_name = call.campaign_name;
    this.call_origination_id = call.call_origination_id;
    this.call_status = call.call_status;
    this.source_type = call.source_type;
    this.source_id = call.source_id;
    this.start_time = call.start_time;
    this.register_time = call.register_time;
    this.site_url = call.site_url;
    this.lead_data = call.lead_data;
    this.agents = call.agents;
    this.ai_agent_details = call.ai_agent_details;
    this.call_details = call.call_details;
    this.recording_url = call.recording_url;
    this.widget_name = call.widget_name;
    this.sentiment_analysis_result = call.sentiment_analysis_result;
    this.client_type = call.client_type;
    this.previous_agents = call.previous_agents;
    this.ringing_agent = call.ringing_agent;
    this.conversational_id = call.conversational_id;
    this.re_trigger_time = call.re_trigger_time;
    this.created_at = call.created_at;
    this.updated_at = call.updated_at;
  }

  // Static method to transform multiple calls
  static fromArray(calls) {
    return calls.map(call => new CallDTO(call));
  }

  // Static method to transform single call
  static fromObject(call) {
    return new CallDTO(call);
  }
}

module.exports = CallDTO;
