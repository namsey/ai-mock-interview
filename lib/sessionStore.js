/**
 * lib/sessionStore.js
 *
 * PHASE 2 UPGRADE: Extended session schema.
 *
 * New fields added in v2:
 *   structuredCV     — grouped skill categories + seniority (from cvParser v2)
 *   currentStage     — interview state machine stage
 *   difficulty       — current difficulty: 'easy' | 'medium' | 'hard'
 *   scores           — per-answer evaluations [{question, answer, score, reasoning}]
 *
 * Backwards compatible: addMessage() signature unchanged, 
 * getSession() returns all new fields alongside old ones.
 */

const sessions = new Map();

// ─── Stage constants ──────────────────────────────────────────────────────────
// Exported so orchestrator.js and API routes can reference them safely
const STAGES = {
  INTRO: 'intro',             // 1 question  — warm-up, confirm role + background
  CV_DEEP_DIVE: 'cv_deep_dive', // 2 questions — probe specific CV claims
  TECHNICAL: 'technical',     // 2 questions — hard technical depth
  BEHAVIORAL: 'behavioral',   // 1 question  — situational / soft skills
  WRAP_UP: 'wrap_up'         // signals feedback generation
};

const DIFFICULTIES = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

/**
 * Creates a new Phase 2 interview session.
 *
 * @param {string}   cvText       - Raw CV text
 * @param {object}   structuredCV - Output of cvParser.extractCVInsights()
 * @returns {object} New session
 */
function createSession(cvText, structuredCV) {
  const id = Math.random().toString(36).substring(2, 11);

  const session = {
    id,
    cvText,

    // v2: structured CV replaces flat skills array
    structuredCV,

    // Backwards compat: keep a flat allSkills + jobTitle at top level
    // so existing API response shapes don't change
    skills: structuredCV.allSkills,
    jobTitle: structuredCV.jobTitle,

    // Conversation history (unchanged from v1)
    messages: [],

    // v2: Interview state machine
    currentStage: STAGES.INTRO,
    difficulty: DIFFICULTIES.EASY,

    // v2: Per-answer scores [{question, answer, score: 1-5, reasoning, stage}]
    scores: [],

    // Counter for AI questions only (unchanged from v1)
    questionCount: 0,

    phase: 'interviewing' // 'interviewing' | 'completed'
  };

  sessions.set(id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id) || null;
}

/**
 * Appends a message and increments questionCount if role is 'assistant'.
 * Unchanged from v1 — signature is compatible.
 */
function addMessage(id, role, content) {
  const session = sessions.get(id);
  if (!session) return null;

  session.messages.push({ role, content });
  if (role === 'assistant') {
    session.questionCount += 1;
  }
  return session;
}

/**
 * v2 NEW: Stores a score for the most recently answered question.
 *
 * @param {string} id          - Session ID
 * @param {object} scoreEntry  - { question, answer, score, reasoning, stage }
 */
function addScore(id, scoreEntry) {
  const session = sessions.get(id);
  if (!session) return null;
  session.scores.push(scoreEntry);
  return session;
}

/**
 * v2 NEW: Updates the interview stage and/or difficulty.
 *
 * @param {string} id
 * @param {object} updates - { stage?, difficulty? }
 */
function updateStageAndDifficulty(id, { stage, difficulty }) {
  const session = sessions.get(id);
  if (!session) return null;
  if (stage) session.currentStage = stage;
  if (difficulty) session.difficulty = difficulty;
  return session;
}

function markCompleted(id) {
  const session = sessions.get(id);
  if (session) session.phase = 'completed';
}

module.exports = {
  createSession,
  getSession,
  addMessage,
  addScore,
  updateStageAndDifficulty,
  markCompleted,
  STAGES,
  DIFFICULTIES
};
