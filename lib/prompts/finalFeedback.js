/**
 * lib/prompts/finalFeedback.js
 *
 * PHASE 2 UPGRADE: Score-aware final feedback.
 *
 * v1: generic markdown feedback based only on conversation transcript
 * v2: uses per-answer scores + transcript + CV to generate:
 *   - Evidence-backed strengths (tied to actual high-score answers)
 *   - Specific improvement areas (tied to low-score answers)
 *   - Stage-by-stage performance note
 *   - A data-driven verdict (derived from average score)
 *   - An overall numeric score (1–10 for clarity)
 *
 * Output: Structured markdown (human-readable in UI).
 * Not JSON — this is displayed directly to the candidate.
 */

const { summariseScores, scoreToVerdict } = require('../orchestrator');

/**
 * @param {object} structuredCV - From cvParser
 * @param {Array}  messages     - Full conversation history
 * @param {Array}  scores       - Array of per-answer score entries
 * @returns {string} Prompt string
 */
function buildFinalFeedbackPrompt(structuredCV, messages, scores) {
  const { jobTitle, seniorityLevel, skills, estimatedYears } = structuredCV;
  const skillSummary = Object.values(skills).flat().slice(0, 8).join(', ');

  const transcript = messages
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  // Build a score summary for the AI to reference
  const scoreSummary = buildScoreSummary(scores);
  const { average } = summariseScores(scores);
  const verdict = scoreToVerdict(average);
  const numericScore = Math.round(average * 2); // convert 1-5 to 1-10

  return `You are a senior engineering manager writing post-interview feedback. Be honest, specific, and constructive.

Candidate: ${jobTitle} (${seniorityLevel}, ~${estimatedYears} years experience)
Key skills from CV: ${skillSummary}

Per-answer scores (1–5 scale):
${scoreSummary}

Calculated average score: ${average}/5 → ${numericScore}/10
Pre-calculated verdict: ${verdict}

Full interview transcript:
---
${transcript}
---

Write feedback in this EXACT format (use markdown bold for headers):

**Overall Score: ${numericScore}/10** (${verdict})

**Strengths**
- [Reference a specific answer where they showed genuine strength — quote or paraphrase what they said]
- [Another specific strength tied to actual answers]
- [Optional third if there's clear evidence]

**Areas for Improvement**
- [Specific gap from their actual answers — what was vague, missing, or wrong?]
- [Another concrete gap]
- [Optional third]

**Stage Performance**
- Intro: [1 sentence on how they set their context]
- Technical depth: [1 sentence on technical strength or weakness shown]
- Behavioral: [1 sentence on how they communicated experience]

**One-line verdict**: [One direct, honest sentence summarising their candidacy]

Rules:
- Reference SPECIFIC things they actually said. No generic feedback.
- If a score was 1-2, say what was missing directly. Be kind but honest.
- Keep total response under 300 words.
- Do not change the pre-calculated verdict (${verdict}).`;
}

// ─── Helper: Readable Score Summary ──────────────────────────────────────────

function buildScoreSummary(scores) {
  if (scores.length === 0) return 'No scores recorded.';

  return scores
    .map((s, i) =>
      `Q${i + 1} [${s.stage || 'unknown'}]: Score ${s.score}/5 — ${s.reasoning || 'no reasoning'}`
    )
    .join('\n');
}

module.exports = { buildFinalFeedbackPrompt };
