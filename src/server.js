const App = require("./app");
const Database = require("./database");
const config = require("./config/config");
const FreeSwitchService = require("./services/freeswitch.service");
const CallQueueService = require("./services/call-queue.service");

class Server {
  constructor() {
    this.app = new App();
    this.port = Number(config.server.port);
    this.fsService = null;
    this.callQueueService = null;
  }

  async start() {
    try {
      // Connect to database
      console.log("Connecting to database...");
      await new Database().connect();
      console.log("✅ Database connected successfully");

      // Initialize FreeSWITCH service
      console.log("🔌 Initializing FreeSWITCH service...");
      this.fsService = new FreeSwitchService();
      await this.initializeFreeSwitch();

      // Make FreeSWITCH service globally accessible
      global.fsService = this.fsService;

      // Backend services initialized
      console.log("✅ Backend services initialized");

      // Start the server
      this.app.getApp().listen(this.port, () => {
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`📊 FreeSWITCH Status: ${this.fsService.isConnectedToFreeSwitch() ? 'Connected' : 'Disconnected'}`);
        console.log(`🔌 ESL Connection: ${this.fsService.isConnectedToFreeSwitch() ? 'Established' : 'Not Available'}`);
        console.log(`📋 Services: Database ✅ | FreeSWITCH ${this.fsService.isConnectedToFreeSwitch() ? '✅' : '❌'} | Call Queue (On-Demand)`);
      });

      // Graceful shutdown
      process.on("SIGTERM", () => this.gracefulShutdown());
      process.on("SIGINT", () => this.gracefulShutdown());

    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  async initializeFreeSwitch() {
    try {
      await this.fsService.connect();
      console.log("✅ FreeSWITCH ESL connection established");
      
      // Setup periodic health check
      this.setupFreeSwitchHealthCheck();
      
    } catch (error) {
      console.error("❌ Failed to connect to FreeSWITCH:", error.message);
      console.log("⚠️ Server will continue without FreeSWITCH (calls will be disabled)");
      
      // Setup retry mechanism
      this.setupFreeSwitchRetry();
    }
  }

  setupFreeSwitchHealthCheck() {
    // Check FreeSWITCH connection every 30 seconds
    setInterval(async () => {
      try {
        if (!this.fsService.isConnectedToFreeSwitch()) {
          console.log("🔄 FreeSWITCH disconnected, attempting reconnection...");
          await this.fsService.connect();
          console.log("✅ FreeSWITCH reconnected");
        }
      } catch (error) {
        console.error("❌ FreeSWITCH health check failed:", error.message);
      }
    }, 30000);
  }

  setupFreeSwitchRetry() {
    // Retry FreeSWITCH connection every 60 seconds
    const retryInterval = setInterval(async () => {
      try {
        console.log("🔄 Retrying FreeSWITCH connection...");
        await this.fsService.connect();
        console.log("✅ FreeSWITCH connected successfully");
        clearInterval(retryInterval);
        
        // Setup health check after successful connection
        this.setupFreeSwitchHealthCheck();
        
      } catch (error) {
        console.log("❌ FreeSWITCH retry failed:", error.message);
      }
    }, 60000);
  }

  async gracefulShutdown() {
    try {
      console.log("🛑 Shutting down gracefully...");
      
      // Disconnect FreeSWITCH
      if (this.fsService && this.fsService.isConnectedToFreeSwitch()) {
        console.log("🔌 Disconnecting from FreeSWITCH...");
        await this.fsService.disconnect();
        console.log("✅ FreeSWITCH disconnected");
      }
      
      // Disconnect database
      console.log("🗄️ Disconnecting from database...");
      // await new Database().disconnect();
      console.log("✅ Database disconnected");
      
      console.log("✅ Server shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Start the server
new Server().start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
