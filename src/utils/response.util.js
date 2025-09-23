class AppResponse {
  static success(res, data = null, message = "Success", statusCode = 200, pagination = null) {
    const response = {
      success: true,
      message,
      status_code: statusCode,
    };

    if (data !== null) {
      response.data = data;
    }

    if (pagination) {
      response.pagination = pagination;
    }

    return res.status(statusCode).json(response);
  }

  static created(res, data = null, message = "Created successfully") {
    return this.success(res, data, message, 201);
  }

  static error(res, message = "Error occurred", statusCode = 500, details = null) {
    const response = {
      success: false,
      error: message,
      status_code: statusCode,
    };

    if (details) {
      response.details = details;
    }

    return res.status(statusCode).json(response);
  }

  static badRequest(res, message = "Bad request", details = null) {
    return this.error(res, message, 400, details);
  }

  static unauthorized(res, message = "Unauthorized", details = null) {
    return this.error(res, message, 401, details);
  }

  static forbidden(res, message = "Forbidden", details = null) {
    return this.error(res, message, 403, details);
  }

  static notFound(res, message = "Not found", details = null) {
    return this.error(res, message, 404, details);
  }

  static validationError(res, message = "Validation error", details = null) {
    return this.error(res, message, 422, details);
  }

  static conflict(res, message = "Conflict", details = null) {
    return this.error(res, message, 409, details);
  }

  static tooManyRequests(res, message = "Too many requests", details = null) {
    return this.error(res, message, 429, details);
  }

  static internalServerError(res, message = "Internal server error", details = null) {
    return this.error(res, message, 500, details);
  }
}

module.exports = AppResponse;
