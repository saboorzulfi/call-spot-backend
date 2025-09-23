class AgentDTO {
  constructor(agent) {
    this.id = agent._id;
    this.doc_number = agent.doc_number;
    this.account_id = agent.account_id;
    this.full_name = agent.full_name;
    this.personal_phone = agent.personal_phone;
    this.email = agent.email;
    this.is_active = agent.is_active;
    this.call_stats = agent.call_stats;
    this.created_at = agent.created_at;
    this.updated_at = agent.updated_at;
  }

  // Static method to transform multiple agents
  static fromArray(agents) {
    return agents.map(agent => new AgentDTO(agent));
  }

  // Static method to transform single agent
  static fromObject(agent) {
    return new AgentDTO(agent);
  }
}

module.exports = AgentDTO;
