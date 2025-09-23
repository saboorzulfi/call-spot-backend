const Blocklist = require("../../models/blocklist.model");
const AppError = require("../../utils/app_error.util");

class BlocklistRepository {
  constructor() {
    this.model = Blocklist;
  }

  async create(blocklistData) {
    try {
      // Check if source already exists globally (same as Go backend)
      const existingBlock = await Blocklist.findOne({ source: blocklistData.source });
      if (existingBlock) {
        throw new AppError("This source is already blocked", 400);
      }

      const blocklist = new Blocklist(blocklistData);
      await blocklist.save();
      return blocklist;
    } catch (error) {
      if (error.message === "This source is already blocked") {
        throw error;
      }
      throw new AppError("Unable to create blocklist entry. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const blocklist = await Blocklist.findById(id);
      if (!blocklist) {
        throw new AppError("Blocklist entry not found", 404);
      }
      return blocklist;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid blocklist ID format", 400);
      }
      throw new AppError("Unable to retrieve blocklist entry", 500);
    }
  }

  async findByAccount(accountId) {
    try {
      const blocklists = await Blocklist.find({ account_id: accountId })
        .sort({ created_at: -1 });
      return blocklists;
    } catch (error) {
      throw new AppError("Unable to retrieve blocklist", 500);
    }
  }

  async checkBlockList(phone, ip, accountId) {
    try {
      const filter = {
        account_id: accountId,
        $or: []
      };

      if (phone) {
        // Normalize phone number for comparison
        const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");
        filter.$or.push({ source: normalizedPhone });
      }

      if (ip) {
        filter.$or.push({ source: ip });
      }

      if (filter.$or.length === 0) {
        return null; // No phone or IP provided
      }

      const blocked = await Blocklist.findOne(filter);
      return blocked;
    } catch (error) {
      throw new AppError("Unable to check blocklist", 500);
    }
  }

  async findBySource(source, accountId) {
    try {
      const blocklist = await Blocklist.findOne({ 
        source: source, 
        account_id: accountId 
      });
      return blocklist;
    } catch (error) {
      throw new AppError("Unable to find blocklist entry", 500);
    }
  }

  async deleteById(id) {
    try {
      const blocklist = await Blocklist.findByIdAndDelete(id);
      if (!blocklist) {
        throw new AppError("Blocklist entry not found", 404);
      }
      return blocklist;
    } catch (error) {
      if (error.name === "CastError") {
        throw new AppError("Invalid blocklist ID format", 400);
      }
      throw new AppError("Unable to delete blocklist entry", 500);
    }
  }

  async countByAccount(accountId) {
    try {
      return await Blocklist.countDocuments({ account_id: accountId });
    } catch (error) {
      throw new AppError("Unable to count blocklist entries", 500);
    }
  }
}

module.exports = BlocklistRepository;
