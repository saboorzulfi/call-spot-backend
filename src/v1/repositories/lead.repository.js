const Lead = require("../../models/lead.model");
const AppError = require("../../utils/app_error.util");

class LeadRepository {
  async create(leadData) {
    try {
      const lead = new Lead(leadData);
      await lead.save();
      return lead;
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error (account_id + phone unique constraint)
        throw new AppError("A lead with this phone number already exists for this account", 400);
      }
      throw new AppError("Unable to create lead. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const lead = await Lead.findById(id);
      if (!lead) {
        throw new AppError("Lead not found", 404);
      }
      return lead;
    } catch (error) {
      if (error.message === "Lead not found") {
        throw error;
      }
      throw new AppError("Unable to find lead. Please try again.", 500);
    }
  }

  async findByAccount(accountId, options = {}) {
    try {
      const { page = 1, limit = 10, search, sortBy = "created_at", sortOrder = "desc" } = options;
      
      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === "desc" ? -1 : 1;

      let query = { account_id: accountId };

      // Add search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } }
        ];
      }

      const leads = await Lead.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate("last_call_status.agent_id", "full_name personal_phone email");

      const totalCount = await Lead.countDocuments(query);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      };

      return { leads, pagination };
    } catch (error) {
      throw new AppError("Unable to fetch leads. Please try again.", 500);
    }
  }

  async findByAccountAndPhone(accountId, phone) {
    try {
      const lead = await Lead.findOne({ account_id: accountId, phone: phone });
      return lead;
    } catch (error) {
      throw new AppError("Unable to find lead. Please try again.", 500);
    }
  }

  async updateByIdAndAccount(id, accountId, updateData) {
    try {
      const lead = await Lead.findOneAndUpdate(
        { _id: id, account_id: accountId },
        { ...updateData, updated_at: new Date() },
        { new: true, runValidators: true }
      );

      if (!lead) {
        throw new AppError("Lead not found or access denied", 404);
      }

      return lead;
    } catch (error) {
      if (error.message === "Lead not found or access denied") {
        throw error;
      }
      if (error.code === 11000) {
        throw new AppError("A lead with this phone number already exists for this account", 400);
      }
      throw new AppError("Unable to update lead. Please try again.", 500);
    }
  }

  async deleteByIdAndAccount(id, accountId) {
    try {
      const lead = await Lead.findOneAndDelete({ _id: id, account_id: accountId });
      
      if (!lead) {
        throw new AppError("Lead not found or access denied", 404);
      }

      return lead;
    } catch (error) {
      if (error.message === "Lead not found or access denied") {
        throw error;
      }
      throw new AppError("Unable to delete lead. Please try again.", 500);
    }
  }

  async upsert(leadData) {
    try {
      // Try to find existing lead by account_id and phone
      const existingLead = await Lead.findOne({
        account_id: leadData.account_id,
        phone: leadData.phone
      });

      if (existingLead) {
        // Update existing lead
        const updatedLead = await Lead.findByIdAndUpdate(
          existingLead._id,
          {
            ...leadData,
            updated_at: new Date(),
            last_call_status: existingLead.last_call_status // Preserve existing call status
          },
          { new: true, runValidators: true }
        );
        return updatedLead;
      } else {
        // Create new lead
        const newLead = new Lead(leadData);
        await newLead.save();
        return newLead;
      }
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError("A lead with this phone number already exists for this account", 400);
      }
      throw new AppError("Unable to upsert lead. Please try again.", 500);
    }
  }

  async importLeads(leadsData, accountId, sourceId) {
    try {
      const leadsToInsert = leadsData.map(lead => ({
        account_id: accountId,
        name: lead.name,
        phone: lead.phone,
        source_type: "import",
        source_id: sourceId,
        data_fields: lead.data_fields || {},
        created_at: new Date(),
        updated_at: new Date()
      }));

      const result = await Lead.insertMany(leadsToInsert, { 
        ordered: false, // Continue inserting even if some fail
        rawResult: true 
      });

      return {
        inserted: result.insertedCount,
        errors: result.writeErrors || []
      };
    } catch (error) {
      if (error.code === 11000) {
        // Handle duplicate key errors
        const insertedCount = error.insertedDocs ? error.insertedDocs.length : 0;
        return {
          inserted: insertedCount,
          errors: error.writeErrors || []
        };
      }
      throw new AppError("Unable to import leads. Please try again.", 500);
    }
  }

  async countByAccount(accountId) {
    try {
      return await Lead.countDocuments({ account_id: accountId });
    } catch (error) {
      throw new AppError("Unable to count leads", 500);
    }
  }
}

module.exports = LeadRepository;

