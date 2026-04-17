/**
 * lib/logger.js
 *
 * Enhanced structured logger with file-based logging.
 * Integrates with fileLogger for persistent error tracking.
 * All logs are written to files in the /logs directory.
 */

const fileLogger = require('./fileLogger');

function logInfo(context, message, data = null) {
  // Use fileLogger which handles both console and file logging
  fileLogger.logInfo(context, message, data);
}

function logWarn(context, message, data = null) {
  // Use fileLogger which handles both console and file logging
  fileLogger.logWarn(context, message, data);
}

function logError(context, message, error = null) {
  // Use fileLogger which handles both console and file logging
  fileLogger.logError(context, message, error);
}

function logRequest(context, method, path, statusCode, duration, error = null) {
  // Log API request with appropriate level based on status code
  fileLogger.logRequest(context, method, path, statusCode, duration, error);
}

module.exports = { logInfo, logWarn, logError, logRequest };
