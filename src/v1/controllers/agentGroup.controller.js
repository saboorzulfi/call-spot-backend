const AppError = require("../../utils/app_error.util");
const AppResponse = require("../../utils/response.util");
const AgentGroupRepository = require("../repositories/agentGroup.repository");
const tryCatchAsync = require("../../utils/try_catch.util");
const statusCode = require("../../utils/status_code.util");

class AgentGroupController {
  constructor() {
    this.agentGroupRepo = new AgentGroupRepository();
  }

  // Create new agent group
  create = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const agentGroupData = {
      ...req.body,
      account_id: accountId
    };

    const agentGroup = await this.agentGroupRepo.create(agentGroupData);

    const responseData = {
      agent_group: {
        id: agentGroup._id,
        name: agentGroup.name,
        agent_ids: agentGroup.agent_ids,
        call_stats: agentGroup.call_stats,
        is_default: agentGroup.is_default,
        created_at: agentGroup.created_at
      }
    };

    return AppResponse.success(res, responseData, "Agent group created successfully", statusCode.CREATED);
  });

  // Get agent group by ID
  getById = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    const agentGroup = await this.agentGroupRepo.findById(id);
    
    // Check if agent group belongs to the current account
    if (agentGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    let responseData = { agent_group: agentGroup };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Get all agent groups for account
  getAll = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { page, limit, status, search, sortBy, sortOrder } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      status,
      search,
      sortBy: sortBy || "created_at",
      sortOrder: sortOrder || "desc",
      populate: [
        {
          path: "agent_ids",
          model: "Agent"
        }
      ]
    };

    const result = await this.agentGroupRepo.findByAccount(accountId, options);

    let responseData = {
      agent_groups: result.agentGroups,
      pagination: result.pagination
    }
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Update agent group
  update = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const updateData = req.body;

    // Check if agent group exists and belongs to account
    const existingGroup = await this.agentGroupRepo.findById(id);
    if (existingGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    // Check if name is being updated and if it conflicts
    if (updateData.name && updateData.name !== existingGroup.name) {
      const conflictingGroup = await this.agentGroupRepo.findByName(updateData.name, accountId);
      if (conflictingGroup && conflictingGroup._id.toString() !== id) {
        throw new AppError("Group name already exists", 409);
      }
    }

    const agentGroup = await this.agentGroupRepo.update(id, updateData);

    return AppResponse.success(res, { agent_group: agentGroup }, "Agent group updated successfully", statusCode.OK);
  });

  // Delete agent group
  delete = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    // Check if agent group exists and belongs to account
    const existingGroup = await this.agentGroupRepo.findById(id);
    if (existingGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    // Prevent deletion of default group
    if (existingGroup.is_default) {
      throw new AppError("Cannot delete default group", 400);
    }

    await this.agentGroupRepo.delete(id);

    return AppResponse.success(res, {}, "Agent group deleted successfully", statusCode.OK);
  });

  // Add agent to group
  addAgent = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const { agent_id } = req.body;

    if (!agent_id) {
      throw new AppError("Agent ID is required", 400);
    }

    // Check if agent group exists and belongs to account
    const existingGroup = await this.agentGroupRepo.findById(id);
    if (existingGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const agentGroup = await this.agentGroupRepo.addAgentToGroup(id, agent_id);

    return AppResponse.success(res, { agent_group: agentGroup }, "Agent added to group successfully", statusCode.OK);
  });

  // Remove agent from group
  removeAgent = tryCatchAsync(async (req, res, next) => {
    const { id, agent_id } = req.params;
    const accountId = req.account._id;

    // Check if agent group exists and belongs to account
    const existingGroup = await this.agentGroupRepo.findById(id);
    if (existingGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const agentGroup = await this.agentGroupRepo.removeAgentFromGroup(id, agent_id);

    return AppResponse.success(res, { agent_group: agentGroup }, "Agent removed from group successfully", statusCode.OK);
  });

  // Clone agent group
  clone = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const { name } = req.body;

    if (!name) {
      throw new AppError("New group name is required", 400);
    }


    const clonedGroup = await this.agentGroupRepo.clone(id, name, accountId);

    const responseData = {
      agent_group: {
        id: clonedGroup._id,
        name: clonedGroup.name,
        doc_number: clonedGroup.doc_number,
        agent_count: clonedGroup.agent_count,
        status: clonedGroup.status,
        created_at: clonedGroup.created_at
      }
    };

    return AppResponse.success(res, responseData, "Agent group cloned successfully", statusCode.CREATED);
  });

  // Set as default group
  setAsDefault = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    // Check if agent group exists and belongs to account
    const existingGroup = await this.agentGroupRepo.findById(id);
    if (existingGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const agentGroup = await this.agentGroupRepo.setAsDefault(id, accountId);

    return AppResponse.success(res, { agent_group: agentGroup }, "Default group set successfully", statusCode.OK);
  });

  // Get default group
  getDefault = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const defaultGroup = await this.agentGroupRepo.findDefaultGroup(accountId);

    if (!defaultGroup) {
      return AppResponse.success(res, { agent_group: null }, "No default group found", statusCode.OK);
    }

    let responseData = { agent_group: defaultGroup };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Get available groups
  getAvailable = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const availableGroups = await this.agentGroupRepo.findAvailableGroups(accountId);

    let responseData = { agent_groups: availableGroups };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Update call statistics
  updateCallStats = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;
    const { call_result } = req.body;

    if (!call_result) {
      throw new AppError("Call result is required", 400);
    }

    if (!['answered', 'no-answered', 'missed'].includes(call_result)) {
      throw new AppError("Invalid call result", 400);
    }

    // Check if agent group exists and belongs to account
    const existingGroup = await this.agentGroupRepo.findById(id);
    if (existingGroup.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const agentGroup = await this.agentGroupRepo.updateCallStats(id, call_result);

    return AppResponse.success(res, { agent_group: agentGroup }, "Call statistics updated successfully", statusCode.OK);
  });

  // Bulk operations
  bulkUpdate = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { ids, update_data } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError("Group IDs array is required", 400);
    }

    if (!update_data || Object.keys(update_data).length === 0) {
      throw new AppError("Update data is required", 400);
    }

    // Verify all groups belong to the account
    for (const id of ids) {
      const group = await this.agentGroupRepo.findById(id);
      if (group.account_id.toString() !== accountId.toString()) {
        throw new AppError(`Access denied for group ${id}`, 403);
      }
    }

    const result = await this.agentGroupRepo.bulkUpdate(ids, update_data);

    return AppResponse.success(res, { result }, "Bulk update completed successfully", statusCode.OK);
  });

  bulkDelete = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError("Group IDs array is required", 400);
    }

    // Verify all groups belong to the account and are not default
    for (const id of ids) {
      const group = await this.agentGroupRepo.findById(id);
      if (group.account_id.toString() !== accountId.toString()) {
        throw new AppError(`Access denied for group ${id}`, 403);
      }
      if (group.is_default) {
        throw new AppError(`Cannot delete default group ${id}`, 400);
      }
    }

    const result = await this.agentGroupRepo.bulkDelete(ids);

    return AppResponse.success(res, { result }, "Bulk delete completed successfully", statusCode.OK);
  });

  // Get agent group statistics
  getStatistics = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;

    const stats = await this.agentGroupRepo.getStatistics(accountId);

    let responseData = { statistics: stats };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Search agent groups with filters
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

    const result = await this.agentGroupRepo.findWithFilters(filters, options);

    return AppResponse.success(res, {
      agent_groups: result.agentGroups,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      }
    }, "Agent groups search completed successfully", statusCode.OK);
  });

  // Get agent group count
  getCount = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { status, group_type } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (group_type) filters.group_type = group_type;

    const count = await this.agentGroupRepo.countByAccount(accountId, filters);

    let responseData = { count };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Check agent group availability
  checkAvailability = tryCatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const accountId = req.account._id;

    // Check if agent group exists and belongs to account
    const group = await this.agentGroupRepo.findById(id);
    if (group.account_id.toString() !== accountId.toString()) {
      throw new AppError("Access denied", 403);
    }

    const isAvailable = group.isAvailable();

    return AppResponse.success(res, { 
      group_id: id,
      is_available: isAvailable,
      status: group.status,
      agent_count: group.agent_count,
      current_time: new Date().toISOString()
    }, "Agent group availability checked successfully", statusCode.OK);
  });

  // Get groups by performance
  getByPerformance = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { min_success_rate = 0, limit = 10 } = req.query;

    const availableGroups = await this.agentGroupRepo.findAvailableGroups(accountId);
    
    // Filter by performance
    const filteredGroups = availableGroups
      .filter(group => group.call_success_rate >= parseFloat(min_success_rate))
      .sort((a, b) => b.call_success_rate - a.call_success_rate)
      .slice(0, parseInt(limit));

    let responseData = { agent_groups: filteredGroups };
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });

  // Get groups by type
  getByType = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;
    const { group_type } = req.query;

    if (!group_type) {
      throw new AppError("Group type is required", 400);
    }

    const filters = { group_type };
    const options = { page: 1, limit: 100 };

    const result = await this.agentGroupRepo.findByAccount(accountId, { ...options, ...filters });

    let responseData = {
      agent_groups: result.agentGroups,
      pagination: result.pagination
    }
    return AppResponse.success(res, responseData, "", statusCode.OK);
  });
}

module.exports = AgentGroupController;
