# Error Handling Documentation

This document outlines the comprehensive error handling implemented across the mock interview application.

## Overview

Error handling has been added to all layers of the application:
- **Frontend (pages/index.js)**: User-facing error messages and recovery
- **API Routes (pages/api/)**: Request validation and error responses
- **Library Functions (lib/)**: Core function error handling

## Frontend Error Handling (pages/index.js)

### File Upload
- **File type validation**: Only .txt files accepted
- **File size validation**: Maximum 1MB file size
- **Content validation**: Ensures file content is valid string
- **Error recovery**: Prompts user to paste CV manually if upload fails

### Start Interview
- **Request timeout**: 60-second timeout with abort controller
- **Network error handling**: Detects connection issues
- **Response validation**: Validates server response structure
- **User feedback**: Clear error messages for different failure scenarios

### Send Answer
- **Input validation**: Max 5000 characters
- **Request timeout**: 60-second timeout
- **Optimistic updates**: User message added immediately, rolled back on failure
- **Specific error codes**:
  - `404`: Session expired - prompts page reload
  - `429`: Rate limit - suggests retry
  - `402`: Quota exceeded - informative message
- **Network error handling**: Connection issue detection
- **Response validation**: Validates response type and content

## API Routes Error Handling

### /api/start (pages/api/start.js)

#### Request Validation
- HTTP method validation (POST only)
- Request body validation
- CV text length validation (minimum 50 chars, maximum 50,000 chars)
- CV text type validation

#### Processing Errors
- **CV parsing errors**: Caught and logged with specific error message
- **Session creation errors**: Handled with appropriate error response
- **AI generation errors**: Specific handling for:
  - Configuration errors (no API keys)
  - Rate limits (429)
  - Quota exceeded (402)
  - General AI failures

#### Error Responses
```javascript
400 - Bad Request (validation failures)
402 - Payment Required (quota exceeded)
429 - Too Many Requests (rate limit)
500 - Internal Server Error (unexpected errors)
```

### /api/chat (pages/api/chat.js)

#### Request Validation
- HTTP method validation (POST only)
- Request body validation
- Session ID validation (string type)
- Answer validation (string type, not empty, max 5000 chars)

#### Session Management Errors
- Session retrieval errors
- Session not found (404)
- Completed session attempts (400)
- Message storage errors

#### AI Generation Errors
Both `generateNextQuestion` and `generateFeedback` functions handle:
- AI configuration errors
- Rate limit errors (429)
- Quota exceeded errors (402)
- Invalid AI responses
- General AI failures

#### Error Responses
```javascript
400 - Bad Request (validation failures)
402 - Payment Required (quota exceeded)
404 - Not Found (session not found)
429 - Too Many Requests (rate limit)
500 - Internal Server Error (unexpected errors)
```

## Library Error Handling

### lib/cvParser.js

#### parseCV Function
- **Input validation**: Checks for empty or invalid CV text
- **Extraction errors**: Try-catch around AI parsing
- **Response validation**: Validates parsed job title and skills array
- **Fallback values**: Returns safe defaults on failure
- **Error logging**: Detailed console errors for debugging

### lib/sessionStore.js

#### createSession Function
- **Input validation**: Validates all required parameters
- **ID generation**: Uses crypto.randomUUID() with fallback
- **Safe defaults**: Ensures valid session structure

#### getSession Function
- **Validation**: Checks session ID parameter
- **Null handling**: Returns null for non-existent sessions

#### addMessage Function
- **Input validation**: Validates session ID, role, and content
- **Session existence check**: Ensures session exists
- **Completed phase check**: Prevents messages after completion

#### markCompleted Function
- **Input validation**: Validates session ID
- **Session existence check**: Ensures session exists

### lib/aiClient.js

#### sendMessage Function
- **Configuration validation**: Checks for API keys
- **Provider fallback**: Tries Anthropic, then OpenAI, then Gemini
- **Specific error handling**:
  - Network errors
  - Rate limits (429)
  - Quota exceeded (402)
  - Invalid responses
- **Retry logic**: (Can be enhanced based on requirements)
- **Error logging**: Detailed error information for debugging

#### Individual Provider Functions
Each provider function includes:
- Request validation
- Response validation
- Error catching and re-throwing with context
- Proper error message formatting

## Error Response Format

All API endpoints return consistent error format:
```json
{
  "error": "Human-readable error message"
}
```

## Error Logging

All errors are logged to console with:
- Component/function identifier
- Error type/context
- Full error message
- Stack trace (where applicable)

## User Experience

### Error Messages
- **Clear and actionable**: Users understand what went wrong
- **Recovery guidance**: Users know what to do next
- **Non-technical**: Avoid jargon in user-facing messages

### Error Recovery
- **Automatic rollback**: Failed operations don't leave partial state
- **Retry prompts**: Users encouraged to retry transient failures
- **Session recovery**: Expired sessions prompt fresh start
- **Graceful degradation**: Non-critical failures don't block progress

## Testing Recommendations

To test error handling:

1. **Network errors**: Disable internet connection during requests
2. **Invalid input**: Try empty strings, very long strings, invalid types
3. **Missing API keys**: Remove .env.local file
4. **Rate limits**: Make rapid successive requests
5. **Session expiration**: Use invalid/old session IDs
6. **File upload errors**: Try invalid file types, oversized files
7. **Timeout scenarios**: Simulate slow network conditions

## Future Enhancements

Potential improvements:
- Retry logic with exponential backoff for transient failures
- Error tracking/monitoring service integration (e.g., Sentry)
- More granular error codes for debugging
- User-friendly error page for critical failures
- Offline mode detection and handling
- Request cancellation on navigation
- Error analytics and reporting

## Maintenance

When adding new features:
1. Always validate user input
2. Wrap external API calls in try-catch
3. Provide specific error messages
4. Log errors with context
5. Return appropriate HTTP status codes
6. Test error scenarios
7. Update this documentation
