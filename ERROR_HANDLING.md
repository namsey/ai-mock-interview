# Error Handling Documentation

This document describes the comprehensive error handling implemented across the Mock Interview application.

## Overview

The application has multi-layered error handling to ensure robust operation and clear error messages for users:

1. **Input Validation** - Validates all user inputs before processing
2. **API Error Handling** - Catches and handles API failures gracefully  
3. **Session Management** - Handles session-related errors
4. **Frontend Error Handling** - User-friendly error messages and recovery
5. **Logging** - Centralized error logging for debugging

---

## Backend Error Handling

### `/api/start` Endpoint

**Validation:**
- Checks HTTP method (POST only)
- Validates request body exists and is valid JSON
- Validates CV text is present and meets minimum length requirements

**Error Responses:**
- `405` - Method not allowed (non-POST requests)
- `400` - Invalid request body, missing CV text, or CV too short
- `500` - AI service configuration errors
- `429` - Rate limit exceeded
- `402` - AI service quota exceeded
- `500` - Unexpected errors

**Error Flow:**
```javascript
try {
  // Validate input
  // Parse CV
  // Create session
  // Generate opening question
  return success
} catch (aiError) {
  // Specific AI error handling
} catch (error) {
  // Generic error handling
}
```

### `/api/chat` Endpoint

**Validation:**
- Checks HTTP method (POST only)
- Validates request body structure
- Validates sessionId format and existence
- Validates answer is present and within length limits
- Checks session hasn't been completed

**Error Responses:**
- `405` - Method not allowed
- `400` - Invalid request body or parameters
- `404` - Session not found or expired
- `429` - Rate limit exceeded  
- `402` - AI service quota exceeded
- `500` - Internal errors (session retrieval, message storage, AI failures)

**Error Flow:**
```javascript
try {
  // Validate input
  // Load session
  // Store answer
  // Generate next question or feedback
  return success
} catch (sessionError) {
  // Session-specific errors
} catch (aiError) {
  // AI service errors with specific status codes
} catch (error) {
  // Unexpected errors
}
```

---

## Library Error Handling

### `lib/aiClient.js`

**Error Handling:**
- Validates API keys are configured
- Handles provider-specific errors (OpenAI, Anthropic)
- Catches HTTP errors (429 rate limits, 402 quota exceeded, etc.)
- Handles network failures
- Validates AI responses

**Fallback Behavior:**
- Falls back to alternative AI providers if primary fails
- Returns meaningful error messages for debugging

### `lib/cvParser.js`

**Validation:**
- Validates CV text is a non-empty string
- Enforces minimum length requirement (configurable)
- Validates parsed data structure

**Error Handling:**
- Returns safe defaults if parsing fails
- Logs warnings for missing data
- Never crashes - always returns valid data structure

### `lib/sessionStore.js`

**Validation:**
- Validates all input parameters (sessionId, role, content, etc.)
- Type checking for all arguments

**Error Handling:**
- Returns null for invalid session IDs
- Logs errors to console
- Throws errors for invalid operations (caught by API handlers)

### `lib/logger.js`

**Features:**
- Writes to both console and file system
- Safely handles file system errors
- Browser/Node.js environment detection
- Structured log format with timestamps and context

**Error Handling:**
- Falls back to console-only if file writes fail
- Never crashes the application

---

## Frontend Error Handling

### CV Upload Phase (`pages/index.js`)

**Validation:**
- File type checking (.txt only)
- File size validation (max 1MB)
- Minimum CV length validation (50 characters)

**Error Handling:**
```javascript
try {
  // File reading
  // Content validation
} catch (err) {
  // User-friendly alert
  // Fallback suggestions
}
```

### Interview Start

**Error Handling:**
- Request timeout (60 seconds)
- Network failure detection
- Invalid response format validation
- User-friendly error messages

**User Feedback:**
- Timeout: "Request timed out. The server might be busy."
- Network: "Network error. Please check your internet connection."
- Generic: Displays specific error message from server

### Interview Chat

**Error Handling:**
- Request timeout (60 seconds)
- Answer length validation (max 5000 characters)
- Network failure detection
- Session expiration detection
- Optimistic UI with rollback on failure

**Specific Error Cases:**
- `404` - Session expired → Alert user and reload page
- `429` - Rate limit → "Please wait a moment and try again"
- `402` - Quota exceeded → "Please try again later"

**User Experience:**
- Optimistic message rendering (instant feedback)
- Automatic rollback on errors
- Input preservation on failure
- Loading states during async operations

---

## Configuration-Based Error Messages

All error handling uses configuration from `config.json` for:
- Maximum answer length
- Minimum CV length  
- Timeout values
- Rate limiting parameters

This allows easy adjustment of limits without code changes.

---

## Error Logging

All errors are logged using the centralized logger:

**Log Levels:**
- `ERROR` - Critical errors affecting functionality
- `WARN` - Non-critical issues (e.g., no skills detected)
- `INFO` - Operational information

**Log Output:**
- Console (for development)
- `logs/error.log` (errors only)
- `logs/combined.log` (all levels)

**Log Format:**
```
[timestamp] [level] [context] message
Stack: error.stack (if available)
Details: JSON or string representation

```

---

## Best Practices Implemented

1. **Never Crash**: All error paths are handled - app never throws unhandled exceptions
2. **User-Friendly Messages**: Technical errors are translated to helpful user messages
3. **Graceful Degradation**: Falls back to defaults when possible
4. **Logging**: All errors are logged for debugging
5. **Input Validation**: Validate early and provide clear feedback
6. **Type Safety**: Check types before processing
7. **Rollback Support**: Frontend can revert optimistic updates on errors
8. **Timeout Protection**: All network requests have timeouts
9. **Specific Error Codes**: HTTP status codes match error types
10. **Recovery Paths**: Users always have a way to recover from errors

---

## Testing Error Scenarios

To test error handling:

1. **Invalid CV**: Try submitting empty or too-short CV
2. **Network Failure**: Disconnect network during interview
3. **Session Expiration**: Restart server mid-interview
4. **Long Answers**: Try submitting answers > 5000 characters
5. **File Upload**: Try uploading non-.txt files or large files
6. **API Rate Limits**: Make rapid successive requests
7. **Invalid API Keys**: Configure invalid AI API keys

---

## Future Improvements

1. **Retry Logic**: Automatic retry for transient failures
2. **Offline Support**: Queue actions when offline, sync when online
3. **Error Analytics**: Track error patterns for improvements
4. **User Error Reporting**: Allow users to report bugs with context
5. **Circuit Breaker**: Prevent cascading failures
6. **Rate Limiting UI**: Show rate limit status to users
7. **Progressive Enhancement**: Degrade features gracefully if AI unavailable

---

## Error Response Format

All API errors follow this structure:

```json
{
  "error": "Human-readable error message"
}
```

Frontend checks `res.ok` and parses error messages appropriately.

---

## Summary

The Mock Interview application has comprehensive error handling at every layer:

- ✅ Input validation
- ✅ Network error handling  
- ✅ Session management errors
- ✅ AI service errors
- ✅ File upload errors
- ✅ Timeout protection
- ✅ User-friendly messages
- ✅ Centralized logging
- ✅ Graceful degradation
- ✅ Recovery mechanisms

The application is production-ready with robust error handling that ensures a smooth user experience even when things go wrong.
