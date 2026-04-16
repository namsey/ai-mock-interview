/**
 * lib/prompts.js
 *
 * All AI prompt logic lives here.
 * This is the most important file — it defines the interviewer's
 * personality, question strategy, and feedback quality.
 *
 * Design principles:
 *  - One question at a time (real interviewers don't pepper)
 *  - Probe the ANSWER, not just the CV (adaptive depth)
 *  - No filler praise ("Great!", "Excellent!") — it's hollow
 *  - Escalate technical depth as the interview progresses
 */

// ─── SHARED INTERVIEWER PERSONA ───────────────────────────────────────────────
// Injected into every prompt. Keeps AI behavior consistent across all calls.
const INTERVIEWER_PERSONA = `You are a senior hiring manager conducting a real job interview. Your style:
- Professional, focused, and direct — but not cold
- Ask ONE question at a time. Never stack multiple questions.
- React naturally to what the candidate says. If they mention something interesting, dig into it.
- Escalate depth: start broad, then progressively get more specific and technical
- Use probing follow-ups: "why did you choose that?", "what went wrong?", "how would you do it differently now?"
- Do NOT use hollow filler phrases like "Great answer!", "Excellent!", or "That's interesting!"
- Do NOT give hints or help the candidate. You are evaluating, not teaching.
- Sound like a human, not a chatbot.`;


// ─── PROMPT 1: OPENING QUESTION ───────────────────────────────────────────────
/**
 * Generates the very first interview question.
 * Grounded in the actual CV — avoids the cliché "tell me about yourself".
 *
 * @param {string}   cvText   - Full CV text
 * @param {string[]} skills   - Extracted skill list
 * @param {string}   jobTitle - Inferred job title
 * @returns {string} Prompt string to send to Claude
 */
function buildOpeningPrompt(cvText, skills, jobTitle) {
  return `${INTERVIEWER_PERSONA}

The candidate is applying for a ${jobTitle} role.

Their CV:
---
${cvText}
---

Skills detected: ${skills.join(', ')}

Open the interview with ONE question that:
1. References something specific from their CV (a project, a skill, a role)
2. Is open-ended — lets them talk about real experience
3. Is NOT "tell me about yourself" or "walk me through your resume"
4. Sets a professional, focused tone

Output ONLY the question. No introduction, no preamble.`;
}


// ─── PROMPT 2: ADAPTIVE FOLLOW-UP QUESTION ────────────────────────────────────
/**
 * Generates the next question based on the full conversation history.
 *
 * The key insight: Claude sees the FULL conversation so it can:
 *  - Pick up on vague answers and press for specifics
 *  - Transition topics naturally when an area is exhausted
 *  - Increase technical depth as the interview progresses
 *
 * @param {string}   cvText        - Full CV text (truncated for token efficiency)
 * @param {string[]} skills        - Extracted skill list
 * @param {string}   jobTitle      - Inferred job title
 * @param {object[]} messages      - Full message history [{role, content}]
 * @param {number}   questionCount - How many questions asked so far
 * @returns {string} Prompt string to send to Claude
 */
function buildFollowUpPrompt(cvText, skills, jobTitle, messages, questionCount) {
  // Format conversation history for Claude to read
  const transcript = messages
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  // Tell Claude where we are in the interview arc
  const depthInstruction = getDepthInstruction(questionCount);

  return `${INTERVIEWER_PERSONA}

Candidate profile: ${jobTitle}
Key skills: ${skills.join(', ')}

Their CV (for context):
---
${cvText.substring(0, 1500)}${cvText.length > 1500 ? '...' : ''}
---

Interview transcript so far:
---
${transcript}
---

This is question ${questionCount + 1} of 6. ${depthInstruction}

Based on the candidate's LAST answer, decide:
- If they were vague or shallow → press for specifics ("Can you be more concrete about X?")
- If they gave a solid answer → go deeper on a related technical aspect
- If this topic is exhausted → smoothly transition to another skill from their CV

Output ONLY the next question. No commentary, no evaluation of their answer.`;
}


/**
 * Returns a depth instruction based on where we are in the interview.
 * Mirrors how real interviews naturally escalate from broad to deep.
 *
 * @param {number} questionCount
 * @returns {string}
 */
function getDepthInstruction(questionCount) {
  if (questionCount <= 1) {
    return 'You are still in the opening phase. Keep questions broad and exploratory.';
  }
  if (questionCount <= 3) {
    return 'You are in the middle phase. Get more specific. Ask about decisions, tradeoffs, and real challenges they faced.';
  }
  return 'You are in the deep phase. Ask hard technical questions. Challenge their reasoning. Use "what if" scenarios and edge cases.';
}


// ─── PROMPT 3: FINAL FEEDBACK ─────────────────────────────────────────────────
/**
 * Generates structured post-interview feedback.
 * Reads the FULL transcript and gives honest, specific assessment.
 *
 * Kept intentionally separate from interview prompts so Claude
 * switches cleanly from "interviewer" mode into "evaluator" mode.
 *
 * @param {string}   cvText   - Full CV text
 * @param {string[]} skills   - Extracted skill list
 * @param {string}   jobTitle - Inferred job title
 * @param {object[]} messages - Full message history
 * @returns {string} Prompt string to send to Claude
 */
function buildFeedbackPrompt(cvText, skills, jobTitle, messages) {
  const transcript = messages
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  return `You are a senior engineering manager giving post-interview feedback. Be honest, specific, and constructive.

Candidate role: ${jobTitle}
Key skills from CV: ${skills.join(', ')}

Full interview transcript:
---
${transcript}
---

Write structured feedback in this exact format:

**Strengths**
- [Specific strength based on something they actually said]
- [Another specific strength]
- [Optional third]

**Areas for Improvement**
- [Specific gap or weakness observed in their answers]
- [Another area]
- [Optional third]

**Overall Verdict**: [Choose one: Strong Hire / Good Candidate / Average / Needs Improvement]

**One-line summary**: [A single honest sentence about their overall performance]

Rules:
- Reference specific things they actually said. Do not give generic feedback.
- Be direct. If they were weak, say so constructively.
- Keep total response under 250 words.`;
}


module.exports = {
  buildOpeningPrompt,
  buildFollowUpPrompt,
  buildFeedbackPrompt
};
