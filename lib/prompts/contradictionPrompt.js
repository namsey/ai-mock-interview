/**
 * lib/prompts/contradictionPrompt.js — Phase 3 NEW
 *
 * Generates a polite but firm clarification question when a contradiction
 * is detected between the candidate's past and present claims.
 *
 * Tone: professional and neutral — not accusatory.
 * The goal is to give the candidate a chance to clarify, not to trap them.
 */

const INTERVIEWER_PERSONA = require('./persona');

/**
 * @param {object} contradiction — { claimA, claimB, description }
 * @param {Array}  messages      — conversation history (for context)
 * @returns {string} Prompt string
 */
function buildContradictionPrompt(contradiction, messages) {
  const recentTranscript = messages
    .slice(-6)
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  return `${INTERVIEWER_PERSONA}

Recent conversation:
---
${recentTranscript}
---

You have detected an apparent inconsistency in the candidate's answers:
- Earlier claim: "${contradiction.claimA}"
- Current claim: "${contradiction.claimB}"
- Inconsistency: ${contradiction.description}

Generate ONE clarification question that:
- References both claims naturally (don't say "you contradicted yourself")
- Gives the candidate a genuine chance to explain
- Sounds like a thoughtful interviewer who noticed something, not an interrogator
- Is concise and professional (1-2 sentences)

Example tone: "Earlier you mentioned X — I want to make sure I understand: how does that fit with what you just described about Y?"

Output ONLY the clarification question.`;
}

module.exports = { buildContradictionPrompt };
