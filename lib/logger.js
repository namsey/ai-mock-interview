/**
 * lib/logger.js
 *
 * Main logger interface - exports fileLogger functions
 * All logging now uses file-based logging system with automatic rotation
 */

const fileLogger = require('./fileLogger');

module.exports = {
  logInfo: fileLogger.logInfo,
  logWarn: fileLogger.logWarn,
  logError: fileLogger.logError,
  logRequest: fileLogger.logRequest,
  getLogPaths: fileLogger.getLogPaths,
  cleanOldLogs: fileLogger.cleanOldLogs
};
