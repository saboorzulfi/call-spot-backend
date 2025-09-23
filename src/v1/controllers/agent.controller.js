const AppError = require("../../utils/app_error.util");
const AppResponse = require("../../utils/response.util");
const AgentRepository = require("../repositories/agent.repository");
const tryCatchAsync = require("../../utils/try_catch.util");
const statusCode = require("../../utils/status_code.util");

class AgentController {
  constructor() {
    this.agentRepo = new AgentRepository();
  }


  create = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const agentData = {
      ...req.body,
      account_id: accountId
    };

    if (agentData.personal_phone) {
      agentData.personal_phone = agentData.personal_phone.replace(/[\s\-]/g, '');
    }

    agentData.is_active = true;
    const agent = await this.agentRepo.create(agentData);
    console.log(agent, 'agent');
    const responseData = {
      agent,
      // agent: {
      //   _id: agent._id,
      //   full_name: agent.full_name,
      //   personal_phone: agent.personal_phone,
      //   email: agent.email,
      //   is_active: agent.is_active,
      //   is_multi_calls_allowed: agent.is_multi_calls_allowed,
      //   call_stats: agent.call_stats,
      //   created_at: agent.created_at,
      //   doc_number: agent.doc_number,
      //   updated_at: agent.updated_at,
      //   deleted_at: agent.deleted_at
      // }

    };

    return AppResponse.success(res, responseData, "Agent created successfully", statusCode.CREATED);
  });


  getById = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const agent = await this.agentRepo.findById(id);

    // Check if agent belongs to the current account
    if (agent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    return AppResponse.success(res, { agent }, "Agent retrieved successfully", statusCode.OK);
  });

  getAll = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { page, limit, status, agent_type, sortBy, sortOrder,search } = req.query;

    const options = {
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      status,
      agent_type,
      sortBy: sortBy || "created_at",
      sortOrder: sortOrder || "desc"
    };

    const result = await this.agentRepo.findByAccount(accountId, options);

    return AppResponse.success(res, {
      agents: result.agents,
      pagination: result.pagination
    }, "Agents retrieved successfully", statusCode.OK);
  });

  // Update agent
  update = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const updateData = req.body;

    if (updateData.personal_phone) {
      updateData.personal_phone = updateData.personal_phone.replace(/[\s\-]/g, '');
    }

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    // Check if phone number is being updated and if it conflicts
    if (updateData.personal_phone && updateData.personal_phone !== existingAgent.personal_phone) {
      const conflictingAgent = await this.agentRepo.findByPhoneNumber(updateData.personal_phone);
      if (conflictingAgent && conflictingAgent.account_id.toString() === accountId.toString()) {
        throw new AppError("Phone number already exists for this account", 409);
      }
    }

    const agent = await this.agentRepo.update(id, updateData);

    return AppResponse.success(res, { agent }, "Agent updated successfully", statusCode.OK);
  });

  // Delete agent
  delete = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    await this.agentRepo.delete(id);

    return AppResponse.success(res, {}, "Agent deleted successfully", statusCode.OK);
  });

  // Get available agents
  getAvailableAgents = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { agent_type } = req.query;

    const agents = await this.agentRepo.findAvailableAgents(accountId, agent_type);

    return AppResponse.success(res, { agents }, "Available agents retrieved successfully", statusCode.OK);
  });

  // Get agents by performance
  getByPerformance = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { min_score = 0, limit = 10 } = req.query;

    const agents = await this.agentRepo.findByPerformance(
      accountId,
      parseFloat(min_score),
      parseInt(limit)
    );

    return AppResponse.success(res, { agents }, "Agents by performance retrieved successfully", statusCode.OK);
  });

  // Get agents by availability
  getAvailableByTime = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { time, day } = req.query;

    if (!time || !day) {
      throw new AppError("Time and day are required", 400);
    }

    const agents = await this.agentRepo.findAvailableByTime(accountId, time, day);

    return AppResponse.success(res, { agents }, "Available agents by time retrieved successfully", statusCode.OK);
  });

  // Update agent performance metrics
  updatePerformanceMetrics = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const conversationData = req.body;

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const agent = await this.agentRepo.updatePerformanceMetrics(id, conversationData);

    return AppResponse.success(res, { agent }, "Performance metrics updated successfully", statusCode.OK);
  });

  // Generate API key for agent
  generateApiKey = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const { permissions = [], expires_in = "30d" } = req.body;

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    // Generate API key
    const apiKey = await this.agentRepo.generateApiKey(id, permissions, expires_in);

    return AppResponse.success(res, { api_key: apiKey }, "API key generated successfully", statusCode.OK);
  });

  // Revoke API key
  revokeApiKey = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const { api_key } = req.body;

    if (!api_key) {
      throw new AppError("API key is required", 400);
    }

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const agent = await this.agentRepo.revokeApiKey(id, api_key);

    return AppResponse.success(res, { agent }, "API key revoked successfully", statusCode.OK);
  });

  // Bulk operations
  bulkUpdate = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { ids, update_data } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError("Agent IDs array is required", 400);
    }

    if (!update_data || Object.keys(update_data).length === 0) {
      throw new AppError("Update data is required", 400);
    }

    // Verify all agents belong to the account
    for (const id of ids) {
      const agent = await this.agentRepo.findById(id);
      if (agent.account_id._id.toString() !== accountId.toString()) {
        throw new AppError(`Access denied for agent ${id}`, 403);
      }
    }

    const result = await this.agentRepo.bulkUpdate(ids, update_data);

    return AppResponse.success(res, { result }, "Bulk update completed successfully", statusCode.OK);
  });

  bulkDelete = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError("Agent IDs array is required", 400);
    }

    // Verify all agents belong to the account
    for (const id of ids) {
      const agent = await this.agentRepo.findById(id);
      if (agent.account_id._id.toString() !== accountId.toString()) {
        throw new AppError(`Access denied for agent ${id}`, 403);
      }
    }

    const result = await this.agentRepo.bulkDelete(ids);

    return AppResponse.success(res, { result }, "Bulk delete completed successfully", statusCode.OK);
  });

  // Get agent statistics
  getStatistics = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const stats = await this.agentRepo.getStatistics(accountId);

    return AppResponse.success(res, { statistics: stats }, "Agent statistics retrieved successfully", statusCode.OK);
  });

  // Search agents with filters
  search = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { page, limit, sortBy, sortOrder, ...filters } = req.query;

    // Add account filter
    filters.account_id = accountId;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      sortBy: sortBy || "created_at",
      sortOrder: sortOrder || "desc"
    };

    const result = await this.agentRepo.findWithFilters(filters, options);

    return AppResponse.success(res, {
      agents: result.agents,
      pagination: result.pagination
    }, "Agents search completed successfully", statusCode.OK);
  });

  // Get agent count
  getCount = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { status, agent_type } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (agent_type) filters.agent_type = agent_type;

    const count = await this.agentRepo.countByAccount(accountId, filters);

    return AppResponse.success(res, { count }, "Agent count retrieved successfully", statusCode.OK);
  });

  // Check agent availability
  checkAvailability = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    // Check if agent exists and belongs to account
    const agent = await this.agentRepo.findById(id);
    if (agent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const isAvailable = agent.isAvailable();

    return AppResponse.success(res, {
      agent_id: id,
      is_available: isAvailable,
      status: agent.status,
      current_time: new Date().toISOString()
    }, "Agent availability checked successfully", statusCode.OK);
  });

  // Train agent
  trainAgent = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const trainingData = req.body;

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    // Update training data
    const updateData = {
      "knowledge_base.training_data": trainingData.training_data || [],
      last_training: new Date()
    };

    const agent = await this.agentRepo.update(id, updateData);

    return AppResponse.success(res, { agent }, "Agent training data updated successfully", statusCode.OK);
  });

  // Deploy agent
  deployAgent = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const { version, status = "active" } = req.body;

    // Check if agent exists and belongs to account
    const existingAgent = await this.agentRepo.findById(id);
    if (existingAgent.account_id._id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const updateData = {
      status,
      last_deployment: new Date()
    };

    if (version) {
      updateData.version = version;
    }

    const agent = await this.agentRepo.update(id, updateData);

    return AppResponse.success(res, { agent }, "Agent deployed successfully", statusCode.OK);
  });
}

module.exports = AgentController;
