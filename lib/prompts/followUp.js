/**
 * lib/prompts/followUp.js — Phase 3 UPGRADED
 *
 * Now references:
 *  - Specific claims the candidate made (from claimExtractor)
 *  - Current topic depth level (from topicTracker)
 *  - Interview mode (normal / probing / pressure)
 *  - Recent claims for memory-based follow-ups
 *
 * This makes follow-ups feel like the interviewer was actually listening.
 */

const INTERVIEWER_PERSONA = require('./persona');
const { depthLevelToInstruction } = require('../topicTracker');

/**
 * @param {object} structuredCV
 * @param {Array}  messages
 * @param {string} stage
 * @param {string} difficulty
 * @param {object|null} lastScore
 * @param {object|null} topicEntry  — {topic, depthLevel, confidence, questionCount}
 * @param {Array}  recentClaims     — claims from last 2 turns
 * @param {string} interviewMode
 * @returns {string} Prompt string
 */
function buildFollowUpPrompt(
  structuredCV,
  messages,
  stage,
  difficulty,
  lastScore = null,
  topicEntry = null,
  recentClaims = [],
  interviewMode = 'normal'
) {
  const { jobTitle, skills } = structuredCV;
  const skillSummary = Object.values(skills).flat().slice(0, 6).join(', ');

  const transcript = messages
    .slice(-8) // last 4 exchanges
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  const depthInstruction = topicEntry
    ? depthLevelToInstruction(topicEntry.depthLevel)
    : 'Ask a relevant follow-up at appropriate depth.';

  const claimsContext = buildClaimsContext(recentClaims);
  const probeInstruction = getProbeInstruction(lastScore, difficulty, interviewMode);
  const modeInstruction = getModeInstruction(interviewMode);

  return `${INTERVIEWER_PERSONA}

Candidate: ${jobTitle} | Skills: ${skillSummary}
Current stage: ${stage} | Difficulty: ${difficulty} | Mode: ${interviewMode.toUpperCase()}

${claimsContext}

Recent conversation:
---
${transcript}
---

Topic depth guidance: ${depthInstruction}
Probe instruction: ${probeInstruction}
Interviewer mode: ${modeInstruction}

Generate ONE follow-up question that:
- References something SPECIFIC the candidate said in their last answer
- ${topicEntry ? `Stays focused on "${topicEntry.topic}" unless exhausted` : 'Stays on the current topic'}
- Sounds natural — not like a form question
- One sentence only

Output ONLY the question.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildClaimsContext(recentClaims) {
  if (!recentClaims.length) return '';
  const claimLines = recentClaims
    .slice(0, 3)
    .map(c => `  - "${c.claim}" (${c.details || 'no detail given'}) [${c.type}]`)
    .join('\n');
  return `Specific claims to remember and potentially reference:\n${claimLines}\n`;
}

function getProbeInstruction(lastScore, difficulty, mode) {
  const score = lastScore?.score ?? 3;

  if (mode === 'pressure') {
    return 'Pressure mode: be direct and terse. Short, pointed question. Do not soften.';
  }

  if (score >= 4) {
    const map = {
      easy: 'Strong answer — go one level deeper. Ask about a complication or edge case.',
      medium: 'Good answer — push into tradeoffs or failure modes.',
      hard: 'Excellent answer — present a constraint that breaks their approach.'
    };
    return map[difficulty] || map.medium;
  }

  if (score >= 2) {
    return 'Vague or surface answer — ask for a specific example. Reference what they said and ask them to be concrete.';
  }

  return 'Weak answer — reframe the question more simply. Give them a chance to demonstrate any relevant knowledge.';
}

function getModeInstruction(mode) {
  switch (mode) {
    case 'pressure': return 'Be skeptical and direct. No filler. Short questions.';
    case 'probing': return 'Be intellectually curious. Dig deep. Ask why, not just what.';
    default: return 'Be balanced and professional. Probe naturally.';
  }
}

module.exports = { buildFollowUpPrompt };
