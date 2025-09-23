const AgentGroup = require("../../models/agentGroup.model");
const AppError = require("../../utils/app_error.util");

class AgentGroupRepository {
  constructor() {
    this.model = AgentGroup;
  }

  async create(agentGroupData) {
    try {
      const agentGroup = new AgentGroup(agentGroupData);
      await agentGroup.save();
      return agentGroup;
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError("An agent group with this name already exists", 409);
      }
      throw new AppError("Unable to create agent group. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const agentGroup = await AgentGroup.findById(id);
      if (!agentGroup) {
        throw new AppError("Agent group not found", 404);
      }
      return agentGroup;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent group ID format", 400);
      }
      throw new AppError("Unable to retrieve agent group information", 500);
    }
  }

  async findByAccount(accountId, options = {}) {
    try {
      const { page = 1, limit = 10, sortBy = "created_at", sortOrder = "desc" ,populate = [] ,search} = options;
      
      const query = { account_id: accountId };
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      if(search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } }
        ];
      }

      const agentGroups = await AgentGroup.find(query)
        .populate(populate)
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const total = await AgentGroup.countDocuments(query);

      return {
        agentGroups,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new AppError("Unable to retrieve agent group list", 500);
    }
  }

  async update(id, updateData) {
    try {
      const agentGroup = await AgentGroup.findByIdAndUpdate(
        id,
        { ...updateData, updated_at: new Date() },
        { new: true }
      );
      
      if (!agentGroup) {
        throw new AppError("Agent group not found", 404);
      }
      
      return agentGroup;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent group ID format", 400);
      }
      if (error.code === 11000) {
        throw new AppError("An agent group with this name already exists", 409);
      }
      throw new AppError("Unable to update agent group information", 500);
    }
  }

  async delete(id) {
    try {
      const agentGroup = await AgentGroup.findByIdAndDelete(id);
      
      if (!agentGroup) {
        throw new AppError("Agent group not found", 404);
      }
      
      return agentGroup;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent group ID format", 400);
      }
      throw new AppError("Unable to delete agent group", 500);
    }
  }

  async findByName(name, accountId) {
    try {
      return await AgentGroup.findByName(name, accountId);
    } catch (error) {
      throw new AppError("Unable to search for agent group by name", 500);
    }
  }

  async clone(id, name, accountId) {
    try {
      const originalGroup = await AgentGroup.findById(id);
      if (!originalGroup) {
        throw new AppError("Original agent group not found", 404);
      }

      const clonedGroup = new AgentGroup({
        name: name,
        account_id: accountId,
        agent_ids: [...originalGroup.agent_ids],
        call_stats: {
          total: 0,
          answered: 0,
          no_answer: 0,
          missed: 0
        },
        is_default: false
      });

      await clonedGroup.save();
      return clonedGroup;
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError("An agent group with this name already exists", 409);
      }
      throw new AppError("Unable to clone agent group", 500);
    }
  }

  async setDefault(id, accountId) {
    try {
      await AgentGroup.updateMany(
        { account_id: accountId },
        { $set: { is_default: false } }
      );

      const agentGroup = await AgentGroup.findByIdAndUpdate(
        id,
        { $set: { is_default: true, updated_at: new Date() } },
        { new: true }
      );

      if (!agentGroup) {
        throw new AppError("Agent group not found", 404);
      }

      return agentGroup;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent group ID format", 400);
      }
      throw new AppError("Unable to set default agent group", 500);
    }
  }
}

module.exports = AgentGroupRepository;

