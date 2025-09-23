const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const config = require("./config/config");
const v1Routes = require("./v1/routes/v1.routes");

class App {
  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddlewares() {
    // Security middleware
    this.app.use(helmet());

    // CORS middleware
    this.app.use(cors(config.security.cors));

    // Body parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Compression middleware
    this.app.use(compression());

    // Logging middleware
    if (config.server.nodeEnv === "development") {
      this.app.use(morgan("dev"));
    }

    // Rate limiting middleware
    if (config.features.rateLimiting) {
      const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.maxRequests,
        message: "Too many requests from this IP, please try again later.",
      });
      this.app.use(limiter);
    }
  }

  initializeRoutes() {
    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "Welcome to New Backend API",
        version: "1.0.0",
        health: "/v1/health",
        auth: "/v1/auth",
      });
    });

    // API v1 routes
    this.app.use("/api/v1", v1Routes);

    // 404 handler
    this.app.use("*", (req, res) => {
      res.status(404).json({
        success: false,
        error: "Route not found",
        status_code: 404,
      });
    });
  }

  initializeErrorHandling() {
    // Global error handling middleware
    this.app.use((error, req, res, next) => {
      console.error("Error:", error);

      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal server error";

      res.status(statusCode).json({
        success: false,
        error: message,
        status_code: statusCode,
      });
    });
  }

  getApp() {
    return this.app;
  }
}

module.exports = App;
