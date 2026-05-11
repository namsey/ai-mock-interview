# Resolved Errors

## 2026-05-11 - AI provider connection failure during interview start

### Log evidence

- `logs/error.log` showed repeated `/api/start` failures returning `500`.
- The active error was `Connection error.` from the OpenAI SDK while generating the opening interview question.
- Older log entries also showed `buildQuestionGeneratorPrompt is not a function`; the current prompt barrel export already exposes that function.

### Resolution

- Updated `lib/aiClient.js` to try all configured providers in preference order.
- If the preferred provider fails at request time, the client now logs the failure and tries the alternate configured provider.
- Updated `/api/start` and `/api/chat` to return `503` for AI provider/network availability failures instead of a generic `500`.
- Updated `lib/fileLogger.js` so error logs can include metadata such as provider, fallback provider, and duration.

### Notes

- If both configured providers are unreachable from the local machine, the API will still fail, but the response and logs now clearly identify it as an AI provider availability issue.
