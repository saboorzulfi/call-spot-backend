class AgentGroupDTO {
  constructor(agentGroup) {
    this.id = agentGroup._id;
    this.doc_number = agentGroup.doc_number;
    this.account_id = agentGroup.account_id;
    this.name = agentGroup.name;
    this.agent_ids = agentGroup.agent_ids;
    this.agents = agentGroup.agents;
    this.call_stats = agentGroup.call_stats;
    this.is_default = agentGroup.is_default;
    this.created_at = agentGroup.created_at;
    this.updated_at = agentGroup.updated_at;
  }

  // Static method to transform multiple agent groups
  static fromArray(agentGroups) {
    return agentGroups.map(agentGroup => new AgentGroupDTO(agentGroup));
  }

  // Static method to transform single agent group
  static fromObject(agentGroup) {
    return new AgentGroupDTO(agentGroup);
  }
}

module.exports = AgentGroupDTO;
