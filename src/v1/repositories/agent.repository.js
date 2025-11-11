const Agent = require("../../models/agent.model");
const AppError = require("../../utils/app_error.util");

class AgentRepository {
  constructor() {
    this.model = Agent;
  }

  async create(agentData) {
    try {
      const agent = new Agent(agentData);
      await agent.save();
      return agent;
    } catch (error) {
      console.log(error,'error');
      if (error.code === 11000) {
        throw new AppError("An agent with this phone number or email already exists", 409);
      }
      throw new AppError("Unable to create agent. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const agent = await Agent.findById(id);
      if (!agent) {
        throw new AppError("Agent not found", 404);
      }
      return agent;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent ID format", 400);
      }
      throw new AppError("Unable to retrieve agent information", 500);
    }
  }

  async findByIds(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }
      
      const agents = await Agent.find({
        _id: { $in: ids },
        deleted_at: null
      });
      
      return agents;
    } catch (error) {
      throw new AppError("Unable to retrieve agents by IDs", 500);
    }
  }

  async findByPhoneNumber(phoneNumber) {
    try {
      return await Agent.findByPhoneNumber(phoneNumber);
    } catch (error) {
      throw new AppError("Unable to search for agent by phone number", 500);
    }
  }

  async findByAccount(accountId, options = {}) {
    try {
      const { page = 1, limit = 10, status, sortBy = "created_at", sortOrder = "desc", search } = options;
      
      const query = { account_id: accountId, deleted_at: null };
      if (status) {
        query.is_active = status === "active";
      }
      if(search) {
        query.$or = [
          { full_name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { personal_phone: { $regex: search, $options: "i" } }
        ];
      }

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const agents = await Agent.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const total = await Agent.countDocuments(query);

      return {
        agents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new AppError("Unable to retrieve agent list", 500);
    }
  }

  async update(id, updateData) {
    try {
      const agent = await Agent.findByIdAndUpdate(
        id,
        { ...updateData, updated_at: new Date() },
        { new: true }
      );
      
      if (!agent) {
        throw new AppError("Agent not found", 404);
      }
      
      return agent;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent ID format", 400);
      }
      if (error.code === 11000) {
        throw new AppError("An agent with this phone number already exists", 409);
      }
      throw new AppError("Unable to update agent information", 500);
    }
  }

  async delete(id) {
    try {
      const agent = await Agent.findByIdAndUpdate(
        id,
        { deleted_at: new Date() },
        { new: true }
      );
      
      if (!agent) {
        throw new AppError("Agent not found", 404);
      }
      
      return agent;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent ID format", 400);
      }
      throw new AppError("Unable to delete agent", 500);
    }
  }

  async findActiveAgents(accountId) {
    try {
      return await Agent.findActiveAgents(accountId);
    } catch (error) {
      throw new AppError("Unable to retrieve active agents", 500);
    }
  }

  async updateCallStats(id, callStatus) {
    try {
      const updateField = {};
      switch (callStatus) {
        case "answered":
          updateField["call_stats.answered"] = 1;
          break;
        case "no-answered":
          updateField["call_stats.no_answer"] = 1;
          break;
        case "missed":
          updateField["call_stats.missed"] = 1;
          break;
      }
      updateField["call_stats.total"] = 1;

      const agent = await Agent.findByIdAndUpdate(
        id,
        { $inc: updateField },
        { new: true }
      );

      if (!agent) {
        throw new AppError("Agent not found", 404);
      }

      return agent;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid agent ID format", 400);
      }
      throw new AppError("Unable to update call statistics", 500);
    }
  }
}

module.exports = AgentRepository;
