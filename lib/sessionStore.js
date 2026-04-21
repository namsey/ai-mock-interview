/**
 * lib/sessionStore.js — Phase 3
 *
 * Extended session schema adds:
 *   topics         — per-topic depth + confidence tracking
 *   claims         — extracted candidate assertions for memory + contradiction check
 *   contradictions — detected inconsistencies between claims
 *   currentTopic   — active topic being explored
 *   interviewMode  — 'normal' | 'probing' | 'pressure'
 *   consecutiveStrong / consecutiveWeak — drive mode switching
 */

const sessions = new Map();

const STAGES = {
  INTRO: 'intro',
  CV_DEEP_DIVE: 'cv_deep_dive',
  TECHNICAL: 'technical',
  BEHAVIORAL: 'behavioral',
  WRAP_UP: 'wrap_up'
};

const DIFFICULTIES = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' };

const MODES = { NORMAL: 'normal', PROBING: 'probing', PRESSURE: 'pressure' };

function createSession(cvText, structuredCV) {
  const id = Math.random().toString(36).substring(2, 11);

  const session = {
    id, cvText, structuredCV,
    skills: structuredCV.allSkills,
    jobTitle: structuredCV.jobTitle,
    messages: [],

    // v2
    currentStage: STAGES.INTRO,
    difficulty: DIFFICULTIES.EASY,
    scores: [],
    questionCount: 0,
    phase: 'interviewing',

    // v3 — human-like intelligence layer
    topics: [],           // [{topic, depthLevel:1-5, confidence:'low'|'medium'|'high', questionCount}]
    claims: [],           // [{claim, details, topic, turnIndex}]
    contradictions: [],   // [{claimA, claimB, description, surfaced:bool}]
    currentTopic: null,
    interviewMode: MODES.NORMAL,
    consecutiveStrong: 0, // streak of scores >= 4
    consecutiveWeak: 0    // streak of scores <= 2
  };

  sessions.set(id, session);
  return session;
}

function getSession(id) { return sessions.get(id) || null; }

function addMessage(id, role, content) {
  const s = sessions.get(id);
  if (!s) return null;
  s.messages.push({ role, content });
  if (role === 'assistant') s.questionCount += 1;
  return s;
}

function addScore(id, scoreEntry) {
  const s = sessions.get(id);
  if (!s) return null;
  s.scores.push(scoreEntry);
  // Update streaks for mode switching
  if (scoreEntry.score >= 4) { s.consecutiveStrong++; s.consecutiveWeak = 0; }
  else if (scoreEntry.score <= 2) { s.consecutiveWeak++; s.consecutiveStrong = 0; }
  else { s.consecutiveStrong = 0; s.consecutiveWeak = 0; }
  return s;
}

function addClaims(id, newClaims) {
  const s = sessions.get(id);
  if (!s) return null;
  s.claims.push(...newClaims);
  return s;
}

function addContradiction(id, contradiction) {
  const s = sessions.get(id);
  if (!s) return null;
  s.contradictions.push({ ...contradiction, surfaced: false });
  return s;
}

function upsertTopic(id, topicName, { depthDelta = 1, confidence } = {}) {
  const s = sessions.get(id);
  if (!s) return null;
  let t = s.topics.find(t => t.topic.toLowerCase() === topicName.toLowerCase());
  if (!t) {
    t = { topic: topicName, depthLevel: 1, confidence: 'low', questionCount: 0 };
    s.topics.push(t);
  }
  t.depthLevel = Math.min(5, Math.max(1, t.depthLevel + depthDelta));
  t.questionCount += 1;
  if (confidence) t.confidence = confidence;
  return s;
}

function updateSession(id, updates) {
  const s = sessions.get(id);
  if (!s) return null;
  Object.assign(s, updates);
  return s;
}

function updateStageAndDifficulty(id, { stage, difficulty }) {
  const s = sessions.get(id);
  if (!s) return null;
  if (stage) s.currentStage = stage;
  if (difficulty) s.difficulty = difficulty;
  return s;
}

function markCompleted(id) {
  const s = sessions.get(id);
  if (s) s.phase = 'completed';
}

module.exports = {
  createSession, getSession, addMessage, addScore,
  addClaims, addContradiction, upsertTopic, updateSession,
  updateStageAndDifficulty, markCompleted,
  STAGES, DIFFICULTIES, MODES
};
