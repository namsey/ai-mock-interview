/**
 * lib/prompts/challengePrompt.js — Phase 3 NEW
 *
 * Generates a challenge question when the engine decides to push back.
 *
 * Challenge types:
 *  numbers   — ask for concrete metrics the answer lacked
 *  tradeoffs — why this approach vs alternatives
 *  failure   — what went wrong / what would break
 *  depth     — drill into a brief but decent answer
 *  why       — reasoning behind a decision
 */

const INTERVIEWER_PERSONA = require('./persona');

/**
 * @param {Array}  messages    — full conversation history
 * @param {string} type        — challenge type from challengeEngine
 * @param {string} angle       — engine's recommended angle
 * @param {string} difficulty  — current difficulty level
 * @param {string} interviewMode — normal | probing | pressure
 * @returns {string} Prompt string
 */
function buildChallengePrompt(messages, type, angle, difficulty, interviewMode) {
  const transcript = messages
    .slice(-6) // last 3 exchanges for context
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  const toneInstruction = getToneInstruction(interviewMode);
  const typeInstruction = getChallengeTypeInstruction(type);

  return `${INTERVIEWER_PERSONA}

Recent interview exchange:
---
${transcript}
---

Interviewer assessment: ${angle}

Challenge type: ${type.toUpperCase()}
${typeInstruction}

Tone: ${toneInstruction}
Difficulty: ${difficulty}

Generate ONE challenge question that:
- Directly references what the candidate just said
- Pushes for what is missing: ${type}
- Does NOT repeat any previous question
- Sounds like a real interviewer — not robotic or accusatory
- Is concise (1-2 sentences max)

Output ONLY the question.`;
}

function getChallengeTypeInstruction(type) {
  switch (type) {
    case 'numbers':
      return 'Ask for specific numbers, metrics, or data that quantify their claim.';
    case 'tradeoffs':
      return 'Ask why they chose that approach over a specific alternative. Name an alternative.';
    case 'failure':
      return 'Ask what went wrong, what failed, or what they would change. Push for honesty.';
    case 'depth':
      return 'Ask them to go one layer deeper — what was hardest, most complex, or most interesting?';
    case 'why':
      return 'Challenge their reasoning: why specifically? What evidence or data drove that decision?';
    default:
      return 'Ask a probing follow-up that reveals genuine understanding.';
  }
}

function getToneInstruction(mode) {
  switch (mode) {
    case 'pressure':
      return 'Direct and challenging. Short sentences. Do not soften. Interviewer is clearly skeptical.';
    case 'probing':
      return 'Intellectually curious and incisive. Professionally skeptical but not hostile.';
    default:
      return 'Professional and focused. Firm but fair.';
  }
}

module.exports = { buildChallengePrompt };
