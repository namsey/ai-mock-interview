/**
 * lib/fileLogger.js
 *
 * Comprehensive file-based logging system
 * Logs errors, warnings, and info to separate files with rotation support
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file paths
const ERROR_LOG = path.join(logsDir, 'error.log');
const COMBINED_LOG = path.join(logsDir, 'combined.log');
const INFO_LOG = path.join(logsDir, 'info.log');

// Maximum log file size (10MB)
const MAX_LOG_SIZE = 10 * 1024 * 1024;

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE
 */
function rotateLogFile(logPath) {
  try {
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > MAX_LOG_SIZE) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = logPath.replace('.log', `-${timestamp}.log`);
        fs.renameSync(logPath, rotatedPath);
        console.log(`[FileLogger] Rotated log file: ${path.basename(rotatedPath)}`);
      }
    }
  } catch (err) {
    console.error('[FileLogger] Failed to rotate log file:', err.message);
  }
}

/**
 * Write log entry to file
 */
function writeToFile(logPath, entry) {
  try {
    rotateLogFile(logPath);
    fs.appendFileSync(logPath, entry + '\n', 'utf8');
  } catch (err) {
    console.error(`[FileLogger] Failed to write to ${path.basename(logPath)}:`, err.message);
  }
}

/**
 * Format log entry with timestamp and structured data
 */
function formatLogEntry(level, context, message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    context,
    message,
    pid: process.pid,
    environment: process.env.NODE_ENV || 'development'
  };

  if (data) {
    if (data instanceof Error) {
      entry.error = {
        message: data.message,
        stack: data.stack,
        name: data.name
      };
    } else {
      entry.data = data;
    }
  }

  return JSON.stringify(entry);
}

/**
 * Log INFO level message
 */
function logInfo(context, message, data = null) {
  const entry = formatLogEntry('INFO', context, message, data);
  
  // Write to files
  writeToFile(INFO_LOG, entry);
  writeToFile(COMBINED_LOG, entry);
  
  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[INFO] [${context}] ${message}`, data || '');
  }
}

/**
 * Log WARN level message
 */
function logWarn(context, message, data = null) {
  const entry = formatLogEntry('WARN', context, message, data);
  
  // Write to files
  writeToFile(COMBINED_LOG, entry);
  
  // Always log warnings to console
  console.warn(`[WARN] [${context}] ${message}`, data || '');
}

/**
 * Log ERROR level message
 */
function logError(context, message, error = null) {
  const entry = formatLogEntry('ERROR', context, message, error);
  
  // Write to files
  writeToFile(ERROR_LOG, entry);
  writeToFile(COMBINED_LOG, entry);
  
  // Always log errors to console
  if (error) {
    console.error(`[ERROR] [${context}] ${message}`, error);
  } else {
    console.error(`[ERROR] [${context}] ${message}`);
  }
}

/**
 * Log API request details
 */
function logRequest(context, method, path, statusCode, duration, error = null) {
  const message = `${method} ${path} ${statusCode} in ${duration}ms`;
  
  if (statusCode >= 500 || error) {
    logError(context, message, error);
  } else if (statusCode >= 400) {
    logWarn(context, message);
  } else {
    logInfo(context, message);
  }
}

/**
 * Get log file paths (for diagnostics)
 */
function getLogPaths() {
  return {
    error: ERROR_LOG,
    combined: COMBINED_LOG,
    info: INFO_LOG,
    directory: logsDir
  };
}

/**
 * Clean up old rotated log files (older than 7 days)
 */
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logsDir);
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      if (file.match(/\.log$/)) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < sevenDaysAgo && file.includes('-')) {
          fs.unlinkSync(filePath);
          console.log(`[FileLogger] Cleaned old log: ${file}`);
        }
      }
    });
  } catch (err) {
    console.error('[FileLogger] Failed to clean old logs:', err.message);
  }
}

// Clean old logs on startup
if (process.env.NODE_ENV === 'production') {
  cleanOldLogs();
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  logRequest,
  getLogPaths,
  cleanOldLogs
};
