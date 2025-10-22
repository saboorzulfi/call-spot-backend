const mongoose = require("mongoose");
const config = require("./config/config");

class Database {
  async connect() {
    try {
      console.log("--------------------------------  conne "+ config.database.uri);
      await mongoose.connect(config.database.uri, config.database.options);
      console.log(`MongoDB connected successfully`);
      
      // Handle connection events
      mongoose.connection.on("error", (error) => {
        console.error("MongoDB connection error:", error);
      });

      mongoose.connection.on("disconnected", () => {
        console.log("MongoDB disconnected");
      });

    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      console.log("MongoDB disconnected successfully");
    } catch (error) {
      console.error("Error disconnecting from MongoDB:", error);
      throw error;
    }
  }
}

module.exports = Database;
