/**
 * lib/logger.js
 *
 * Lightweight structured logger.
 * Phase 1 carried over — no changes needed for Phase 2.
 * In production: swap console.log with Winston, Pino, or Datadog.
 */

const isDev = process.env.NODE_ENV !== 'production';

function logInfo(context, message, data = null) {
  if (!isDev) return; // silence in production unless you wire a real logger
  const entry = { level: 'INFO', context, message };
  if (data) entry.data = data;
  console.log(JSON.stringify(entry));
}

function logWarn(context, message, data = null) {
  const entry = { level: 'WARN', context, message };
  if (data) entry.data = data;
  console.warn(JSON.stringify(entry));
}

function logError(context, message, error = null) {
  const entry = { level: 'ERROR', context, message };
  if (error) entry.error = { message: error.message, stack: error.stack };
  console.error(JSON.stringify(entry));
}

module.exports = { logInfo, logWarn, logError };
