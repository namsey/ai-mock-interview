/**
 * lib/orchestrator.js
 *
 * PHASE 2 NEW: Interview Orchestrator — the brain of the system.
 *
 * Responsibilities:
 *  1. Decide which stage comes next based on questionCount
 *  2. Adapt difficulty based on recent answer scores
 *  3. Decide whether to continue the interview or trigger feedback
 *  4. Return a clean "decision object" that the API routes consume
 *
 * Design principles:
 *  - Pure functions (no side effects — caller updates session)
 *  - Simple rules, no ML — deterministic and debuggable
 *  - Easy to extend: adding a stage = one entry in STAGE_MAP
 *
 * ─────────────────────────────────────────────────────────────────
 * Stage progression (total 6 questions):
 *
 *   INTRO        Q1       Warm-up — confirm background, set tone
 *   CV_DEEP_DIVE Q2–Q3   Probe specific CV claims and projects
 *   TECHNICAL    Q4–Q5   Hard technical depth, tradeoffs, edge cases
 *   BEHAVIORAL   Q6      Situational — teamwork, conflict, impact
 *   → WRAP_UP           Triggers feedback generation
 * ─────────────────────────────────────────────────────────────────
 *
 * Difficulty adaptation:
 *   Score 4–5 (strong)    → increase difficulty one level
 *   Score 2–3 (average)   → hold difficulty (probe same area more)
 *   Score 1   (weak)      → decrease difficulty (back to basics)
 */

const { STAGES, DIFFICULTIES } = require('./sessionStore');

// Maps questionCount ranges to their target stage.
// This is the ONLY place stage transitions are defined.
const STAGE_MAP = [
  { upTo: 1, stage: STAGES.INTRO },
  { upTo: 3, stage: STAGES.CV_DEEP_DIVE },
  { upTo: 5, stage: STAGES.TECHNICAL },
  { upTo: 6, stage: STAGES.BEHAVIORAL },
];

const TOTAL_QUESTIONS = 6; // after this, generate feedback

/**
 * Core orchestration function.
 * Call this AFTER storing the user's answer, BEFORE generating the next question.
 *
 * @param {object} session - Full session object from sessionStore
 * @returns {{
 *   shouldEnd: boolean,     // true → generate feedback instead of question
 *   stage: string,          // target stage for next question
 *   difficulty: string,     // adapted difficulty for next question
 *   stageChanged: boolean   // true → first question in a new stage
 * }}
 */
function orchestrate(session) {
  const { questionCount, scores, difficulty: currentDifficulty, currentStage } = session;

  // 1. Check if interview is over
  if (questionCount >= TOTAL_QUESTIONS) {
    return {
      shouldEnd: true,
      stage: STAGES.WRAP_UP,
      difficulty: currentDifficulty,
      stageChanged: false
    };
  }

  // 2. Determine next stage from question count
  const nextStage = resolveStage(questionCount);
  const stageChanged = nextStage !== currentStage;

  // 3. Adapt difficulty from recent scores
  const nextDifficulty = adaptDifficulty(scores, currentDifficulty);

  return {
    shouldEnd: false,
    stage: nextStage,
    difficulty: nextDifficulty,
    stageChanged
  };
}

// ─── Stage Resolution ─────────────────────────────────────────────────────────

/**
 * Maps the current questionCount to the correct interview stage.
 * questionCount is the number of AI questions ALREADY ASKED.
 * So after Q1, questionCount=1, next question is Q2 → CV_DEEP_DIVE.
 */
function resolveStage(questionCount) {
  for (const { upTo, stage } of STAGE_MAP) {
    if (questionCount < upTo) return stage;
  }
  return STAGES.BEHAVIORAL;
}

// ─── Difficulty Adaptation ────────────────────────────────────────────────────

/**
 * Adapts difficulty based on the trailing window of scores.
 * Only looks at the last 2 scores to stay responsive (not overly penalizing).
 *
 * Difficulty ladder: easy → medium → hard (and reverse)
 */
function adaptDifficulty(scores, currentDifficulty) {
  if (scores.length === 0) return currentDifficulty;

  // Look at up to the last 2 scored answers
  const recent = scores.slice(-2);
  const avgScore = recent.reduce((sum, s) => sum + s.score, 0) / recent.length;

  if (avgScore >= 4) {
    return increaseDifficulty(currentDifficulty);
  }
  if (avgScore <= 1.5) {
    return decreaseDifficulty(currentDifficulty);
  }
  // Scores 2–3.9: hold current difficulty, keep probing same depth
  return currentDifficulty;
}

function increaseDifficulty(current) {
  const ladder = [DIFFICULTIES.EASY, DIFFICULTIES.MEDIUM, DIFFICULTIES.HARD];
  const idx = ladder.indexOf(current);
  return ladder[Math.min(idx + 1, ladder.length - 1)];
}

function decreaseDifficulty(current) {
  const ladder = [DIFFICULTIES.EASY, DIFFICULTIES.MEDIUM, DIFFICULTIES.HARD];
  const idx = ladder.indexOf(current);
  return ladder[Math.max(idx - 1, 0)];
}

// ─── Utility: Score Summary ───────────────────────────────────────────────────

/**
 * Calculates an aggregate score summary for the final feedback prompt.
 * Called by the feedback prompt builder.
 *
 * @param {Array} scores - Array of score entries
 * @returns {{ average: number, highest: number, lowest: number, totalAnswered: number }}
 */
function summariseScores(scores) {
  if (scores.length === 0) {
    return { average: 3, highest: 3, lowest: 3, totalAnswered: 0 };
  }

  const values = scores.map(s => s.score);
  return {
    average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    highest: Math.max(...values),
    lowest: Math.min(...values),
    totalAnswered: scores.length
  };
}

/**
 * Returns a human-readable verdict label based on average score.
 * Used in final feedback.
 */
function scoreToVerdict(averageScore) {
  if (averageScore >= 4.5) return 'Strong Hire';
  if (averageScore >= 3.5) return 'Good Candidate';
  if (averageScore >= 2.5) return 'Average';
  return 'Needs Improvement';
}

module.exports = { orchestrate, summariseScores, scoreToVerdict };
