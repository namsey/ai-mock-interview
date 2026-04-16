# 🎙 AI Mock Interview — v1

A minimal, working AI-powered mock interview platform built with Next.js, supporting both Anthropic Claude and OpenAI GPT models with automatic fallback.

---

## What it does

- User pastes or uploads their CV
- AI asks targeted interview questions based on the CV
- AI adapts follow-up questions based on your answers
- After 6 questions, AI generates structured feedback (strengths, weaknesses, verdict)

---

## Project Structure

```
mock-interview-v1/
├── lib/
│   ├── sessionStore.js   # In-memory session management (Map)
│   ├── cvParser.js       # Keyword-based skill extraction from CV
│   └── prompts.js        # All AI prompt logic (interviewer brain)
├── pages/
│   ├── index.js          # Full UI: upload → chat → feedback
│   └── api/
│       ├── start.js      # POST /api/start — parse CV, return first question
│       └── chat.js       # POST /api/chat  — return next question or feedback
├── .env.local.example    # Copy this to .env.local and add your key
└── package.json
```

---

## Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API key(s)
```bash
cp .env.local.example .env.local
```
Then open `.env.local` and add at least one API key:
```
ANTHROPIC_API_KEY=sk-ant-your-real-key-here
OPENAI_API_KEY=sk-your-openai-key-here
```
- Get Anthropic key at: https://console.anthropic.com
- Get OpenAI key at: https://platform.openai.com/api-keys

**Note:** You can configure one or both API keys. If both are configured, the system will automatically fall back to the available provider when one's quota is exhausted or rate-limited.

### 3. Run locally
```bash
npm run dev
```
Open: http://localhost:3000

---

## How it works

```
User uploads CV
    ↓
POST /api/start
    → cvParser extracts skills + job title
    → AI generates opening question (grounded in CV)
    → Session created in memory
    ↓
Chat loop (6 questions):
POST /api/chat (with each answer)
    → Answer stored in session history
    → AI sees full conversation + CV context
    → AI generates adaptive follow-up question
    ↓
After 6 questions:
    → AI generates structured feedback
    → Session marked completed
```

**AI Provider Fallback:**
- Tries Anthropic (Claude) first if configured
- Falls back to OpenAI (GPT) if Anthropic quota exhausted or rate-limited
- Works with either provider individually or both together

---

## Key Design Decisions

| Decision | Why |
|---|---|
| All prompts in `lib/prompts.js` | Easy to tune without touching logic |
| Session stored in a `Map` | Zero dependencies, fine for Phase 1 |
| `questionCount` tracks AI messages only | User can revise without skipping questions |
| CV truncated to 1500 chars in follow-ups | Avoids unnecessary token usage |
| Feedback uses a separate prompt | Switches AI from "interviewer" to "evaluator" cleanly |
| Multi-provider with fallback | Ensures uptime even when one provider's quota is exhausted |
| Unified AI client (`lib/aiClient.js`) | Clean abstraction, easy to add more providers later |

---

## Phase 2 ideas

- PDF CV parsing (via pdf-parse or Anthropic's document API)
- Voice input/output (Web Speech API or ElevenLabs)
- Real database for session persistence (PostgreSQL / Redis)
- Per-role question banks
- Detailed scoring rubrics
- User authentication

---

## Notes

- Sessions are in-memory and reset on server restart
- CV must be plain text (`.txt`) for file upload in Phase 1
- The app works fine with pasted CV text
