# Logging Guide

## Where Are Errors Logged?

All errors in this application are logged to **the terminal/console** where your Next.js development server is running.

### Current Logging Locations:

1. **lib/aiClient.js**
   - `console.error('[AI Client] Anthropic API failed:', error.message)`
   - `console.error('[AI Client] OpenAI API failed:', error.message)`
   - `console.error('[AI Client] Gemini API failed:', error.message)`
   - `console.error('[AI Client] All AI providers failed:', error)`

2. **pages/api/start.js**
   - `console.error('[/api/start] CV parsing error:', err)`
   - `console.error('[/api/start] AI request error:', err.message)`
   - `console.error('[/api/start] Error:', err)`

3. **pages/api/chat.js**
   - `console.error('[/api/chat] Error generating question:', err.message)`
   - `console.error('[/api/chat] Error generating feedback:', err.message)`
   - `console.error('[/api/chat] Error:', err)`

4. **lib/cvParser.js**
   - `console.error('[cvParser] Error parsing CV:', error)`

## How to View Logs

### During Development:

1. Open the terminal where you ran `npm run dev`
2. Errors will appear in **real-time** as they occur
3. Look for lines starting with `[AI Client]`, `[/api/start]`, `[/api/chat]`, etc.

### Example Log Output:
```
[AI Client] Anthropic API failed: Connection error
[/api/start] AI request error: Connection error
POST /api/start 500 in 2778ms
```

## Common Errors and Solutions

### 1. "Anthropic API error: Connection error"
**Cause**: Invalid or placeholder Anthropic API key  
**Solution**: 
- Comment out the `ANTHROPIC_API_KEY` line in `.env.local`
- Use only valid API keys (OpenAI, Gemini, etc.)
- The system will automatically use available providers

### 2. "All AI providers failed"
**Cause**: No valid API keys configured  
**Solution**: Add at least one valid API key to `.env.local`

### 3. "Session not found"
**Cause**: Session expired or invalid session ID  
**Solution**: Application automatically prompts user to restart interview

### 4. "Rate limit exceeded" (429)
**Cause**: Too many requests to AI provider  
**Solution**: Wait a moment and try again; system provides user feedback

## Adding File-Based Logging (Optional)

If you want to log errors to a file instead of just the console, you can add this:

### Option 1: Simple File Logging

Create `lib/logger.js`:
```javascript
import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'app.log');

export function logError(context, message, error) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [ERROR] [${context}] ${message}\n${error?.stack || error}\n\n`;
  
  // Log to console
  console.error(`[${context}]`, message, error);
  
  // Log to file (only in Node.js environment)
  if (typeof window === 'undefined') {
    fs.appendFileSync(logFile, logEntry);
  }
}
```

Then replace `console.error` calls with:
```javascript
import { logError } from '../../lib/logger';

// Instead of: console.error('[/api/start] Error:', err)
logError('/api/start', 'Error:', err);
```

### Option 2: Use a Logging Library

Install a professional logging library:
```bash
npm install winston
# or
npm install pino
```

Configure in `lib/logger.js`:
```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

export default logger;
```

## Production Logging

For production environments, consider:

1. **Cloud-based logging services**:
   - [Sentry](https://sentry.io/) - Error tracking and monitoring
   - [LogRocket](https://logrocket.com/) - Session replay and logging
   - [Datadog](https://www.datadoghq.com/) - Full observability platform
   - [New Relic](https://newrelic.com/) - Application monitoring

2. **Vercel Integration** (if deploying to Vercel):
   - Automatic log collection
   - View logs in Vercel dashboard
   - Integration with monitoring services

## Debugging Tips

1. **Enable verbose logging**: Add more `console.log` statements temporarily
2. **Check environment variables**: Ensure `.env.local` is loaded correctly
3. **Restart server**: After changing `.env.local`, always restart `npm run dev`
4. **Network issues**: Check if API endpoints are reachable
5. **API key validity**: Test keys using provider's web console

## Log Levels (If Implementing)

Consider implementing log levels for better control:

- `ERROR`: Critical errors that need attention
- `WARN`: Warning messages (e.g., approaching rate limits)
- `INFO`: General information (e.g., session created)
- `DEBUG`: Detailed debugging information

Example:
```javascript
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG]', 'Detailed info here');
}
```

## Current Solution

Your application currently:
- ✅ Logs all errors to terminal console
- ✅ Includes context labels (e.g., `[AI Client]`, `[/api/start]`)
- ✅ Provides error details for debugging
- ✅ Uses console.error for errors (not console.log)

**To view logs**: Simply check the terminal where `npm run dev` is running.

**No log files**: Currently no files are created; all logging is console-only. This is standard for development and works well for most cases.
