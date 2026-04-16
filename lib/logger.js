/**
 * lib/logger.js
 * 
 * Centralized logging utility that writes to both console and file.
 * Logs are written to 'logs/error.log' with timestamps and context.
 */

import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
const errorLogFile = path.join(logsDir, 'error.log');
const combinedLogFile = path.join(logsDir, 'combined.log');

// Ensure logs directory exists
function ensureLogDirectory() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * Format log entry with timestamp and context
 */
function formatLogEntry(level, context, message, error) {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] [${level}] [${context}] ${message}\n`;
  
  if (error) {
    if (error.stack) {
      logEntry += `Stack: ${error.stack}\n`;
    } else if (typeof error === 'object') {
      logEntry += `Details: ${JSON.stringify(error, null, 2)}\n`;
    } else {
      logEntry += `Details: ${error}\n`;
    }
  }
  
  logEntry += '\n'; // Empty line between entries
  return logEntry;
}

/**
 * Write to log file safely (only in server environment)
 */
function writeToFile(logFile, content) {
  // Only run in Node.js environment (not browser)
  if (typeof window === 'undefined') {
    try {
      ensureLogDirectory();
      fs.appendFileSync(logFile, content);
    } catch (err) {
      // Fallback to console only if file write fails
      console.error('Failed to write to log file:', err);
    }
  }
}

/**
 * Log error messages
 */
export function logError(context, message, error = null) {
  const logEntry = formatLogEntry('ERROR', context, message, error);
  
  // Write to console
  console.error(`[${context}]`, message, error || '');
  
  // Write to both error log and combined log
  writeToFile(errorLogFile, logEntry);
  writeToFile(combinedLogFile, logEntry);
}

/**
 * Log warning messages
 */
export function logWarn(context, message, details = null) {
  const logEntry = formatLogEntry('WARN', context, message, details);
  
  // Write to console
  console.warn(`[${context}]`, message, details || '');
  
  // Write to combined log only
  writeToFile(combinedLogFile, logEntry);
}

/**
 * Log info messages
 */
export function logInfo(context, message, details = null) {
  const logEntry = formatLogEntry('INFO', context, message, details);
  
  // Write to console
  console.log(`[${context}]`, message, details || '');
  
  // Write to combined log only
  writeToFile(combinedLogFile, logEntry);
}

/**
 * Clear old logs (optional - call this periodically if needed)
 */
export function clearOldLogs(daysToKeep = 7) {
  try {
    const files = [errorLogFile, combinedLogFile];
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(file);
          console.log(`Cleared old log file: ${file}`);
        }
      }
    });
  } catch (err) {
    console.error('Error clearing old logs:', err);
  }
}

/**
 * Get log file path for reading
 */
export function getErrorLogPath() {
  return errorLogFile;
}

export function getCombinedLogPath() {
  return combinedLogFile;
}
