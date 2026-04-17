/**
 * lib/prompts/followUp.js
 *
 * PHASE 2: Generates an adaptive follow-up within the CURRENT stage.
 *
 * Unlike questionGenerator (which opens a new stage), followUp is called
 * when we stay in the same stage and want to go DEEPER on the candidate's
 * last answer.
 *
 * Key behaviors:
 * - References the candidate's actual last answer (not just CV)
 * - Adapts probe angle based on answer score:
 *     score 4-5: go deeper on what they did well
 *     score 2-3: probe vague areas, ask for specifics
 *     score 1:   challenge assumptions, ask for a concrete example
 * - Respects difficulty: hard = edge cases + "what if" scenarios
 *
 * Output: A single plain-text question. No JSON.
 */

const INTERVIEWER_PERSONA = require('./persona');

/**
 * @param {object} structuredCV  - From cvParser
 * @param {Array}  messages      - Full conversation history
 * @param {string} stage         - Current stage
 * @param {string} difficulty    - Current difficulty
 * @param {object|null} lastScore - Most recent score entry {score, reasoning}
 * @returns {string} Prompt string
 */
function buildFollowUpPrompt(structuredCV, messages, stage, difficulty, lastScore = null) {
  const { jobTitle, skills } = structuredCV;
  const skillSummary = Object.values(skills).flat().slice(0, 6).join(', ');

  // Format the full conversation for context
  const transcript = messages
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  // Probe angle based on how the candidate scored
  const probeInstruction = getProbeInstruction(lastScore, difficulty, stage);

  return `${INTERVIEWER_PERSONA}

Candidate: ${jobTitle}
Relevant skills: ${skillSummary}

Full interview transcript:
---
${transcript}
---

Current stage: ${stage.toUpperCase()} | Difficulty: ${difficulty.toUpperCase()}

${probeInstruction}

Rules:
- Ask about something in their LAST answer specifically — reference it directly
- One question only
- Do NOT switch topics unless the current one is completely exhausted
- No filler phrases, no praise

Output ONLY the follow-up question.`;
}

// ─── Probe Angle Selection ────────────────────────────────────────────────────

function getProbeInstruction(lastScore, difficulty, stage) {
  const score = lastScore?.score ?? 3;

  // Strong answer (4-5): go deeper, increase scope
  if (score >= 4) {
    const deepeners = {
      easy: 'They answered well. Now ask them to go one level deeper — what was the hardest part of what they described?',
      medium: 'Good answer. Push further: ask about scale, failure modes, or what they would do differently now.',
      hard: 'Strong response. Challenge them: present a constraint or edge case that breaks their described approach. How would they handle it?'
    };
    return deepeners[difficulty] || deepeners.medium;
  }

  // Average answer (2-3): probe vagueness, ask for concrete example
  if (score >= 2) {
    return `Their answer was vague or surface-level. Follow up by asking for a concrete, specific example:
- "Can you walk me through a specific instance of that?"
- Or: "What exact steps did you take when that happened?"
- Or: "You mentioned [X] — can you be more specific about what your role was?"
Pick the most relevant angle based on what they said.`;
  }

  // Weak answer (1): go back to basics with a simpler framing
  return `Their answer showed a gap. Don't move on — instead:
- Reframe the question more concretely: ask for a specific example from their work
- Or: ask about a simpler, foundational aspect of the same topic
- The goal is to understand if the gap is knowledge or communication
Keep difficulty manageable — give them a chance to recover.`;
}

module.exports = { buildFollowUpPrompt };
