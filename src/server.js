const App = require("./app");
const Database = require("./database");
const config = require("./config/config");

class Server {
  constructor() {
    this.app = new App();
    this.port = Number(config.server.port);
  }

  async start() {
    try {
      // Connect to database
      console.log("Connecting to database...");
      await new Database().connect();
      console.log("Database connected successfully");

      // Backend services initialized
      console.log("Backend services initialized");

      // Start the server
      this.app.getApp().listen(this.port, () => {
        console.log(`🚀 Server running on port ${this.port}`);
      });

      // Graceful shutdown
      process.on("SIGTERM", () => this.gracefulShutdown());
      process.on("SIGINT", () => this.gracefulShutdown());

    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  async gracefulShutdown() {
    try {
      console.log("Shutting down gracefully...");
      // await new Database().disconnect();
      console.log("Server shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Start the server
new Server().start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
