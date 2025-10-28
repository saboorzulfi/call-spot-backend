const Account = require("../../models/account.model");
const AppError = require("../../utils/app_error.util");

class AccountRepository {
  constructor() {
    this.model = Account;
  }

  async create(accountData) {
    try {
      const account = new Account(accountData);
      await account.save();
      return account;
    } catch (error) {
      console.log(error, 'error');
      if (error.code === 11000) {
        throw new AppError("An account with this email already exists", 409);
      }
      throw new AppError("Unable to create account. Please try again.", 500);
    }
  }

  async findById(id) {
    try {
      const account = await Account.findById(id);
      if (!account) {
        throw new AppError("Account not found", 404);
      }
      return account;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid account ID format", 400);
      }
      throw new AppError("Unable to retrieve account information", 500);
    }
  }

  async findByEmail(email) {
    try {
      const account = await Account.findOne({ 
        $or: [
          { email: email },
          { work_email: email },
          { personal_email: email }
        ]
      });
      return account;
    } catch (error) {
      throw new AppError("Unable to search for account by email", 500);
    }
  }

  async findByPhoneNumber(phoneNumber) {
    try {
      const account = await Account.findOne({
        $or: [
          { phone: phoneNumber },
          { personal_phone: phoneNumber }
        ]
      });
      return account;
    } catch (error) {
      throw new AppError("Unable to search for account by phone number", 500);
    }
  }

  async findByEmailOrPhone(email, phone) {
    try {
      const account = await Account.findOne({
        $or: [
          { email: email },
          { work_email: email },
          { personal_email: email },
          { phone: phone },
          { personal_phone: phone }
        ]
      });
      return account;
    } catch (error) {
      throw new AppError("Unable to search for account", 500);
    }
  }

  async findAll(options = {}) {
    try {
      const { page = 1, limit = 10, role, active, sortBy = "created_at", sortOrder = "desc", search } = options;
      
      const query = { deleted_at: null };
      if (role) {
        query.role = role;
      }
      if (active !== undefined) {
        query.active = active;
      }
      if (search) {
        query.$or = [
          { full_name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { work_email: { $regex: search, $options: "i" } },
          { personal_email: { $regex: search, $options: "i" } }
        ];
      }

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const accounts = await Account.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const total = await Account.countDocuments(query);

      return {
        accounts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new AppError("Unable to retrieve account list", 500);
    }
  }

  async update(id, updateData) {
    try {
      const account = await Account.findByIdAndUpdate(
        id,
        { ...updateData, updated_at: new Date() },
        { new: true }
      );
      
      if (!account) {
        throw new AppError("Account not found", 404);
      }
      
      return account;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid account ID format", 400);
      }
      if (error.code === 11000) {
        throw new AppError("An account with this email already exists", 409);
      }
      throw new AppError("Unable to update account information", 500);
    }
  }

  async delete(id) {
    try {
      const account = await Account.findByIdAndUpdate(
        id,
        { deleted_at: new Date() },
        { new: true }
      );
      
      if (!account) {
        throw new AppError("Account not found", 404);
      }
      
      return account;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid account ID format", 400);
      }
      throw new AppError("Unable to delete account", 500);
    }
  }

  async updateLastLogin(id) {
    try {
      const account = await Account.findByIdAndUpdate(
        id,
        { 
          last_login: new Date(),
          lastLogin: new Date(),
          updated_at: new Date()
        },
        { new: true }
      );
      
      if (!account) {
        throw new AppError("Account not found", 404);
      }
      
      return account;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid account ID format", 400);
      }
      throw new AppError("Unable to update last login", 500);
    }
  }

  async updatePassword(id, newPassword) {
    try {
      const account = await Account.findByIdAndUpdate(
        id,
        { 
          password: newPassword,
          updated_at: new Date()
        },
        { new: true }
      );
      
      if (!account) {
        throw new AppError("Account not found", 404);
      }
      
      return account;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid account ID format", 400);
      }
      throw new AppError("Unable to update password", 500);
    }
  }

  async updateFacebookCredentials(id, facebookUserId, facebookAccessToken) {
    try {
      const account = await Account.findByIdAndUpdate(
        id,
        { 
          facebook_user_id: facebookUserId,
          facebook_access_token: facebookAccessToken,
          updated_at: new Date()
        },
        { new: true }
      );
      
      if (!account) {
        throw new AppError("Account not found", 404);
      }
      
      return account;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new AppError("Invalid account ID format", 400);
      }
      throw new AppError("Unable to update Facebook credentials", 500);
    }
  }
}

module.exports = AccountRepository;
