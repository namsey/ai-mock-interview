/**
 * lib/prompts/evaluator.js
 *
 * PHASE 2 NEW: Per-answer evaluator.
 *
 * Called after EVERY user answer (before generating the next question).
 * Returns a structured JSON score that the orchestrator uses to adapt difficulty.
 *
 * Output format (JSON):
 * {
 *   score: 1–5,
 *   reasoning: "1-2 sentence explanation of the score",
 *   keyPoints: ["strength or gap observed"],
 *   answerQuality: "strong" | "adequate" | "weak"
 * }
 *
 * Score rubric:
 *   5 = Excellent: specific, structured, demonstrates deep understanding
 *   4 = Good: correct and relevant, minor gaps in depth
 *   3 = Adequate: partially correct or vague, shows basic familiarity
 *   2 = Weak: surface-level, missing key concepts, generic
 *   1 = Poor: incorrect, off-topic, or "I don't know"
 *
 * This runs as a PARALLEL call — it does not block question generation.
 * If it fails, the interview continues with a neutral score (3).
 */

/**
 * @param {string} question    - The question that was asked
 * @param {string} answer      - The candidate's answer
 * @param {object} structuredCV - CV context (role + skills for calibration)
 * @param {string} stage       - Current interview stage
 * @returns {string} Prompt to send to AI
 */
function buildEvaluatorPrompt(question, answer, structuredCV, stage) {
  const { jobTitle, seniorityLevel, skills } = structuredCV;
  const relevantSkills = Object.values(skills).flat().slice(0, 8).join(', ');

  return `You are a technical interviewer scoring a candidate's answer. Be objective and calibrated.

Candidate: ${jobTitle} (${seniorityLevel} level)
Relevant skills from CV: ${relevantSkills}
Interview stage: ${stage}

Question asked:
"${question}"

Candidate's answer:
"${answer}"

Score this answer on a 1–5 scale using this rubric:
5 = Excellent: specific, structured, demonstrates deep/nuanced understanding
4 = Good: correct and relevant, shows solid competence with minor gaps
3 = Adequate: partially correct or vague, shows basic familiarity but lacks depth
2 = Weak: surface-level, missing key concepts, or too generic
1 = Poor: incorrect, off-topic, evasive, or no real answer given

Calibrate against a ${seniorityLevel}-level candidate. Expect more from senior candidates.

Respond with ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "score": <1-5 integer>,
  "reasoning": "<1-2 sentences explaining the score — be specific about what was good or lacking>",
  "keyPoints": ["<key strength or gap #1>", "<key strength or gap #2>"],
  "answerQuality": "<strong|adequate|weak>"
}`;
}

module.exports = { buildEvaluatorPrompt };
