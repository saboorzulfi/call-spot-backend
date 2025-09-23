const Call = require("../../models/call.model");
const Campaign = require("../../models/campaign.model");
const AppError = require("../../utils/app_error.util");

class CallRepository {
  async create(callData) {
    try {
      const call = new Call(callData);
      await call.save();
      return call;
    } catch (error) {
      throw new AppError("Unable to create call. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const call = await Call.findById(id);
      if (!call) {
        throw new AppError("Call not found", 404);
      }
      return call;
    } catch (error) {
      if (error.message === "Call not found") {
        throw error;
      }
      throw new AppError("Unable to find call. Please try again.", 500);
    }
  }

  async findByAccount(accountId, options = {}) {

      const { page = 1, limit = 10, search, sortBy = "created_at", sortOrder = "desc", status, source, campaignID, agentID, startDate, endDate } = options;

      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === "desc" ? -1 : 1;

      let query = { account_id: accountId };
      if (status) {
        query["call_status.call_state"] = status;
      }
      if (search) {
        query.$or = [
          { widget_name: { $regex: search, $options: "i" } },
          { "lead_data.name": { $regex: search, $options: "i" } },
          { "lead_data.phone_number": { $regex: search, $options: "i" } }
        ];
      }
      if (source) {
        query["source_type"] = source;
      }
      if (campaignID) {
        query["campaign_id"] = campaignID;
      }
      if (agentID) {
        query["agents.id"] = agentID;
      }
      if (startDate && endDate) {
        query["start_time"] = { $gte: startDate, $lte: endDate };
      }

      const calls = await Call.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate("campaign_id", "name site_url is_active company_name custom_data call_routing custom_fields")
        .populate("agents.id", "full_name personal_phone email doc_number")
        .populate("previous_agents.id", "full_name personal_phone email doc_number")
        .populate("ringing_agent.id", "full_name personal_phone email doc_number");

      const totalCount = await Call.countDocuments(query);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      };

      return { calls, pagination };

  }

  async updateByIdAndAccount(id, accountId, updateData) {
    try {
      const call = await Call.findOneAndUpdate(
        { _id: id, account_id: accountId },
        { ...updateData, updated_at: new Date() },
        { new: true, runValidators: true }
      );

      if (!call) {
        throw new AppError("Call not found or access denied", 404);
      }

      return call;
    } catch (error) {
      if (error.message === "Call not found or access denied") {
        throw error;
      }
      throw new AppError("Unable to update call. Please try again.", 500);
    }
  }

  async deleteByIdAndAccount(id, accountId) {
    try {
      const call = await Call.findOneAndDelete({ _id: id, account_id: accountId });

      if (!call) {
        throw new AppError("Call not found or access denied", 404);
      }

      return call;
    } catch (error) {
      if (error.message === "Call not found or access denied") {
        throw error;
      }
      throw new AppError("Unable to delete call. Please try again.", 500);
    }
  }

  async findByWidgetKey(widgetKey) {
    try {
      // Try to find by ID first
      let campaign = await Campaign.findById(widgetKey);

      if (!campaign) {
        // If not found by ID, try to find by name
        campaign = await Campaign.findOne({ name: widgetKey });
      }

      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }

      return campaign;
    } catch (error) {
      if (error.message === "Campaign not found") {
        throw error;
      }
      throw new AppError("Unable to find campaign. Please try again.", 500);
    }
  }

  async countByCampaign(campaignId) {
    try {
      return await Call.countDocuments({ source_id: campaignId.toString() });
    } catch (error) {
      throw new AppError("Unable to count calls", 500);
    }
  }

  async listByOriginationId(callOriginationId) {
    try {
      const calls = await Call.find({ call_origination_id: callOriginationId });
      return calls;
    } catch (error) {
      throw new AppError("Unable to find calls by origination ID", 500);
    }
  }

  async getWidgetOptions(filter) {
    try {
      const calls = await Call.find(filter).distinct("source_id");
      return calls.map(sourceId => ({ source_id: sourceId }));
    } catch (error) {
      throw new AppError("Unable to get widget options", 500);
    }
  }
}

module.exports = CallRepository;
