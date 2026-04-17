# Logging System Documentation

## Overview

The application now has a comprehensive file-based logging system that tracks all errors, warnings, and info messages. Logs are automatically written to separate files in the `/logs` directory with automatic rotation and cleanup.

## Log Files

All log files are located in the `/logs` directory (automatically created if it doesn't exist):

- **`error.log`** - Contains only ERROR level messages with full stack traces
- **`info.log`** - Contains only INFO level messages
- **`combined.log`** - Contains all log messages (INFO, WARN, ERROR)

## Log File Features

### Automatic Log Rotation
- Log files are automatically rotated when they exceed 10MB
- Rotated files are renamed with a timestamp: `error-2026-04-17T18-30-00-000Z.log`
- Original log files continue with fresh content after rotation

### Automatic Cleanup
- In production mode, rotated log files older than 7 days are automatically deleted
- Cleanup runs on application startup
- Prevents disk space issues from accumulated logs

## Log Format

All logs are written in structured JSON format for easy parsing and analysis:

```json
{
  "timestamp": "2026-04-17T18:15:30.123Z",
  "level": "ERROR",
  "context": "/api/chat",
  "message": "Session not found",
  "pid": 12345,
  "environment": "development",
  "error": {
    "message": "Session abc123 does not exist",
    "stack": "Error: Session abc123 does not exist\n    at getSession...",
    "name": "Error"
  }
}
```

### Log Entry Fields

- **timestamp** - ISO 8601 timestamp
- **level** - Log level (INFO, WARN, ERROR)
- **context** - Where the log originated (e.g., API route, module name)
- **message** - Human-readable log message
- **pid** - Process ID (useful for multi-instance deployments)
- **environment** - Node environment (development/production)
- **data** - Optional additional structured data
- **error** - Error details (message, stack, name) for ERROR level logs

## Usage

### Basic Logging Functions

```javascript
import { logInfo, logWarn, logError } from '../lib/logger';

// Log informational messages
logInfo('MyModule', 'Operation completed successfully', { recordsProcessed: 100 });

// Log warnings
logWarn('MyModule', 'Unusual condition detected', { threshold: 90, current: 95 });

// Log errors with full stack traces
logError('MyModule', 'Failed to process request', error);
```

### API Request Logging

All API routes automatically log requests with timing information:

```javascript
import { logRequest } from '../lib/logger';

const startTime = Date.now();
// ... handle request ...
const duration = Date.now() - startTime;

logRequest('/api/endpoint', 'POST', '/api/endpoint', statusCode, duration, error);
```

Request logs automatically categorize by status code:
- **2xx (Success)** → INFO level
- **4xx (Client Error)** → WARN level  
- **5xx (Server Error)** → ERROR level

## Console Output

### Development Mode
- **INFO** logs are shown in console AND written to files
- **WARN** logs are always shown in console AND written to files
- **ERROR** logs are always shown in console AND written to files

### Production Mode
- **INFO** logs are ONLY written to files (silent in console)
- **WARN** logs are shown in console AND written to files
- **ERROR** logs are shown in console AND written to files

## Implementation Details

### File Structure

```
lib/
├── logger.js         # Main logger interface (use this in your code)
└── fileLogger.js     # File-based logging implementation (internal)
```

### API Routes Enhanced with Logging

All API endpoints now include comprehensive logging:

- **`/api/start`** - Session creation, CV parsing, errors
- **`/api/chat`** - Question generation, scoring, errors
- **`/api/upload`** - File validation, parsing, errors

Each endpoint logs:
- Request received
- Validation failures (with details)
- Processing steps
- Success/failure with response times
- Detailed error information with stack traces

## Monitoring & Debugging

### View Recent Errors
```bash
# View last 20 error log entries
tail -n 20 logs/error.log

# Follow error logs in real-time
tail -f logs/error.log
```

### Search Logs
```bash
# Find all logs for a specific session
grep "abc123" logs/combined.log

# Find all errors in the last hour
grep "$(date -u +%Y-%m-%dT%H)" logs/error.log
```

### Parse JSON Logs
```bash
# Pretty print recent errors (requires jq)
tail -n 10 logs/error.log | jq '.'

# Filter by context
cat logs/combined.log | jq 'select(.context == "/api/chat")'

# Count errors by type
cat logs/error.log | jq -r '.error.name' | sort | uniq -c
```

## Best Practices

### When to Use Each Log Level

**INFO** - Normal operations, successful completions
```javascript
logInfo('/api/chat', 'Question generated successfully');
logInfo('/api/start', 'Session created', { sessionId: session.id });
```

**WARN** - Recoverable issues, unusual conditions
```javascript
logWarn('/api/upload', 'File type not optimal but accepted', { type: 'docx' });
logWarn('/api/chat', 'Low score detected', { score: 2 });
```

**ERROR** - Failures, exceptions, unrecoverable issues
```javascript
logError('/api/start', 'Failed to parse CV', error);
logError('/api/chat', 'AI service unavailable', error);
```

### Context Naming

Use clear, consistent context names:
- API routes: Use the route path (e.g., `/api/chat`)
- Modules: Use the module name (e.g., `CVParser`, `SessionStore`)
- Components: Use component name (e.g., `InterviewForm`)

### Error Logging

Always include the error object when logging errors:
```javascript
try {
  // ... operation ...
} catch (error) {
  // ✅ Good - includes full error details
  logError('MyModule', 'Operation failed', error);
  
  // ❌ Bad - loses stack trace
  logError('MyModule', `Operation failed: ${error.message}`);
}
```

## Troubleshooting

### Logs Directory Not Created
The logs directory is automatically created on first use. If you encounter permission issues:
```bash
mkdir -p logs
chmod 755 logs
```

### Log Files Not Appearing
1. Check that the application has write permissions to the project directory
2. Verify NODE_ENV is set correctly
3. Check console output for any fileLogger initialization errors

### Disk Space Issues
If logs are consuming too much space:
1. Manually run cleanup: Call `cleanOldLogs()` from fileLogger
2. Reduce log retention period (edit `sevenDaysAgo` in fileLogger.js)
3. Lower the rotation size threshold (edit `MAX_LOG_SIZE` in fileLogger.js)

## Security Considerations

- Log files may contain sensitive information (CV data, API responses)
- The `/logs` directory is included in `.gitignore` to prevent committing logs
- In production, ensure proper file permissions on the logs directory
- Consider implementing log encryption for highly sensitive deployments
- Regularly review and clean old logs
- Never log authentication tokens, passwords, or API keys

## Future Enhancements

Potential improvements for the logging system:
- Integration with external logging services (Datadog, LogDNA, etc.)
- Real-time log streaming to monitoring dashboards
- Structured log queries via web interface
- Alert notifications for critical errors
- Performance metrics and APM integration
- Log compression for archived files
