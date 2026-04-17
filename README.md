# 🎙 AI Mock Interview — v2

Adaptive, stage-aware mock interview platform built on Next.js + Claude/OpenAI.

## What's new in v2 (vs v1)

| Feature | v1 | v2 |
|---|---|---|
| CV parsing | Flat skill list | Grouped by category + seniority + experience signals |
| Session | questionCount only | Stage, difficulty, per-answer scores |
| Question logic | Simple count | State machine (intro → cv_deep_dive → technical → behavioral) |
| Difficulty | Fixed | Adaptive — escalates/de-escalates based on answer scores |
| Scoring | None | Per-answer 1–5 score via evaluator prompt |
| Feedback | Generic markdown | Score-weighted, references specific answers |
| UI | Skill tags | Stage badge, difficulty badge, score panel, grouped skills |

---

## Project Structure

```
mock-interview-v2/
├── lib/
│   ├── aiClient.js        # Unified Anthropic + OpenAI client
│   ├── cvParser.js        # Structured CV parsing (v2)
│   ├── fileParser.js      # TXT/PDF/DOCX extraction
│   ├── logger.js          # Structured logging
│   ├── orchestrator.js    # Stage machine + difficulty adaptation (NEW)
│   ├── sessionStore.js    # Extended session with stage/scores (v2)
│   └── prompts/
│       ├── persona.js         # Shared interviewer persona
│       ├── questionGenerator.js  # Stage-aware openers (NEW)
│       ├── followUp.js        # Score-adaptive follow-ups (NEW)
│       ├── evaluator.js       # Per-answer JSON scoring (NEW)
│       ├── finalFeedback.js   # Score-weighted final report (NEW)
│       └── index.js           # Barrel export
├── pages/
│   ├── index.js           # UI with stage/difficulty/score panels (v2)
│   └── api/
│       ├── start.js       # POST /api/start (v2)
│       ├── chat.js        # POST /api/chat with orchestration (v2)
│       └── upload.js      # POST /api/upload (unchanged)
├── config.json            # AI providers, stage config, difficulty thresholds
├── .env.local.example
└── package.json
```

---

## Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API key
```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
# Use Anthropic (recommended)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OR use OpenAI
OPENAI_API_KEY=sk-your-openai-key-here
```

To switch provider, edit `config.json`:
```json
"preferredProvider": "anthropic"   // or "openai"
```

### 3. Run
```bash
npm run dev
```

Open: http://localhost:3000

---

## How Phase 2 works

```
User uploads CV
    ↓
cvParser.extractCVInsights()
    → skills grouped by category (frontend/backend/devops/data/practices)
    → seniority level (junior/mid/senior)
    → experience signals (action verbs: built, led, scaled...)
    → estimated years of experience
    ↓
POST /api/start → creates session with structuredCV
    → buildQuestionGeneratorPrompt(INTRO stage, easy difficulty)
    → returns opening question + metadata to UI
    ↓
Chat loop per answer:

  POST /api/chat
    ├── Store user answer
    ├── buildEvaluatorPrompt → score answer (1–5) via AI
    ├── orchestrate(session)
    │     → resolveStage(questionCount)   ← which stage?
    │     → adaptDifficulty(recentScores) ← escalate or hold?
    │     → shouldEnd?                    ← done after Q6
    ├── updateStageAndDifficulty(session)
    └── if same stage → buildFollowUpPrompt (score-aware probing)
        if new stage  → buildQuestionGeneratorPrompt (stage opener)
        if done       → buildFinalFeedbackPrompt (score-weighted)
```

---

## Interview Stages

| Stage | Questions | Focus |
|---|---|---|
| intro | Q1 | Warm-up — confirm role + background |
| cv_deep_dive | Q2–Q3 | Probe specific CV claims + projects |
| technical | Q4–Q5 | Hard technical depth, tradeoffs, edge cases |
| behavioral | Q6 | Situational — teamwork, conflict, impact |

---

## Difficulty Adaptation

```
After each answer → evaluator scores it 1–5
Trailing window of last 2 scores:
  avg ≥ 4.0  → increase difficulty (easy → medium → hard)
  avg ≤ 1.5  → decrease difficulty (hard → medium → easy)
  avg 2–3.9  → hold current difficulty
```

---

## Example Evaluator Output (JSON)

```json
{
  "score": 4,
  "reasoning": "Candidate explained the tradeoff between read performance and write amplification in LSM trees with specific numbers from their work.",
  "keyPoints": ["Good depth on LSM structure", "Could have mentioned compaction strategies"],
  "answerQuality": "strong"
}
```

---

## Phase 3 ideas

- Voice I/O (Web Speech API or ElevenLabs)
- PDF CV parsing improvement (layout-aware extraction)
- Per-role question banks (SWE vs DS vs DevOps)
- Persistent sessions (Redis or Postgres)
- Multi-round interviews (30-min vs 60-min modes)
- Exported PDF report of scores + feedback
