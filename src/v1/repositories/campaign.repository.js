const Campaign = require("../../models/campaign.model");
const AppError = require("../../utils/app_error.util");

class CampaignRepository {
  constructor() {
    this.model = Campaign;
  }

  async create(campaignData) {
    try {
      const campaign = new Campaign(campaignData);
      await campaign.save();
      return campaign;
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError("A campaign with this name already exists", 409);
      }
      throw new AppError("Unable to create campaign. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const campaign = await Campaign.findById(id);
      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }
      return campaign;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid campaign ID format", 400);
      }
      throw new AppError("Unable to retrieve campaign", 500);
    }
  }

  async findByIdAndAccount(id, accountId, options = {}) {
    try {
      const { populate = [] } = options;
      
      let query = Campaign.findOne({ _id: id, account_id: accountId });
      
      // Apply population if provided
      if (populate && populate.length > 0) {
        populate.forEach(populateOption => {
          query = query.populate(populateOption);
        });
      }
      
      const campaign = await query.exec();
      
      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }
      return campaign;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid campaign ID format", 400);
      }
      throw new AppError("Unable to retrieve campaign", 500);
    }
  }

  async findByAccount(accountId, options = {}) {
    try {
      const { page = 1, limit = 10, is_active, search, sortBy = "created_at", sortOrder = "desc" } = options;
      const query = { account_id: accountId };
      
      if (is_active !== undefined) {
        query.is_active = is_active === 'true' ? true : is_active === 'false' ? false : is_active;
      }
      
      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }
      
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const campaigns = await Campaign.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const total = await Campaign.countDocuments(query);

      return {
        campaigns,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new AppError("Unable to retrieve campaign list", 500);
    }
  }

  async updateByIdAndAccount(id, accountId, updateData) {
    try {
      const campaign = await Campaign.findOneAndUpdate(
        { _id: id, account_id: accountId },
        { ...updateData, updated_at: new Date() },
        { new: true, runValidators: true }
      );
      
      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }
      
      return campaign;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid campaign ID format", 400);
      }
      if (error.code === 11000) {
        throw new AppError("A campaign with this name already exists", 409);
      }
      throw new AppError("Unable to update campaign", 500);
    }
  }

  async updateConfigsByIdAndAccount(id, accountId, configData) {
    try {
      const campaign = await Campaign.findOneAndUpdate(
        { _id: id, account_id: accountId },
        { ...configData },
        { new: true, runValidators: true }
      );
      
      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }
      
      return campaign;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid campaign ID format", 400);
      }
      throw new AppError("Unable to update campaign configs", 500);
    }
  }

  async cloneByIdAndAccount(id, accountId) {
    try {
      const originalCampaign = await Campaign.findOne({ _id: id, account_id: accountId });
      if (!originalCampaign) {
        throw new AppError("Campaign not found", 404);
      }

      // Create a new campaign object without _id and with updated name
      const clonedData = originalCampaign.toObject();
      delete clonedData._id;
      delete clonedData.doc_number;
      delete clonedData.created_at;
      delete clonedData.updated_at;
      
      // Add "(Copy)" to the name
      clonedData.name = `${clonedData.name} (Copy)`;
      clonedData.account_id = accountId;

      const clonedCampaign = new Campaign(clonedData);
      await clonedCampaign.save();
      
      return clonedCampaign;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid campaign ID format", 400);
      }
      if (error.code === 11000) {
        throw new AppError("A campaign with this name already exists", 409);
      }
      throw new AppError("Unable to clone campaign", 500);
    }
  }

  async deleteByIdAndAccount(id, accountId) {
    try {
      const campaign = await Campaign.findOneAndDelete({ _id: id, account_id: accountId });
      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }
      return campaign;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid campaign ID format", 400);
      }
      throw new AppError("Unable to delete campaign", 500);
    }
  }

  async findByName(accountId, name) {
    try {
      return await Campaign.findOne({
        account_id: accountId,
        name: { $regex: name, $options: 'i' }
      });
    } catch (error) {
      throw new AppError("Unable to search campaign by name", 500);
    }
  }

  async countByAccount(accountId) {
    try {
      return await Campaign.countDocuments({ account_id: accountId });
    } catch (error) {
      throw new AppError("Unable to count campaigns", 500);
    }
  }
}

module.exports = CampaignRepository;
