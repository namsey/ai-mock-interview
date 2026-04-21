/**
 * lib/orchestrator.js — Phase 3
 *
 * UPGRADED: Non-linear interview flow + mode switching + flexible ending.
 *
 * Changes from v2:
 *  - Stage progression is now ADVISORY not mandatory
 *    Topic depth and answer quality drive flow, not strict questionCount ranges
 *  - Interview ends when enough signal is collected OR hard max reached
 *  - Three interviewer modes: normal | probing | pressure
 *  - Mode switches based on consecutive strong/weak answer streaks
 *  - Decision object now includes: interviewMode, nextTopic, actionType
 *
 * Action types (what the API should generate next):
 *  'contradiction' — surface a detected contradiction
 *  'challenge'     — challenge a claim (via challengeEngine decision)
 *  'followup'      — standard adaptive follow-up in current topic
 *  'new_topic'     — move to next topic/stage
 *  'feedback'      — end interview and generate feedback
 */

const { STAGES, DIFFICULTIES, MODES } = require('./sessionStore');

// Minimum questions before we can end (ensures enough signal)
const MIN_QUESTIONS = 5;
// Hard maximum (interview always ends here regardless)
const MAX_QUESTIONS = 10;
// How many questions per topic before we force a topic switch
const MAX_QUESTIONS_PER_TOPIC = 3;

/**
 * Core orchestration function — Phase 3 version.
 *
 * @param {object} session       — full session object
 * @param {object} challengeDecision — from challengeEngine.decidechallenge()
 * @param {object} contradictionResult — from contradictionDetector.detectContradiction()
 * @param {string} nextTopic     — from topicTracker.selectNextTopic()
 * @returns {{
 *   shouldEnd: boolean,
 *   actionType: string,
 *   stage: string,
 *   difficulty: string,
 *   interviewMode: string,
 *   nextTopic: string
 * }}
 */
function orchestrate(session, challengeDecision = {}, contradictionResult = {}, nextTopic = null) {
  const {
    questionCount, scores, difficulty: currentDifficulty,
    currentStage, currentTopic, contradictions,
    consecutiveStrong, consecutiveWeak, interviewMode
  } = session;

  // ── 1. Check flexible ending condition ───────────────────────────────────
  const shouldEnd = checkShouldEnd(questionCount, scores, consecutiveStrong);
  if (shouldEnd) {
    return {
      shouldEnd: true,
      actionType: 'feedback',
      stage: STAGES.WRAP_UP,
      difficulty: currentDifficulty,
      interviewMode,
      nextTopic: null
    };
  }

  // ── 2. Adapt difficulty ───────────────────────────────────────────────────
  const nextDifficulty = adaptDifficulty(scores, currentDifficulty);

  // ── 3. Switch interviewer mode based on streaks ───────────────────────────
  const nextMode = resolveMode(consecutiveStrong, consecutiveWeak, questionCount);

  // ── 4. Decide action type (priority order) ────────────────────────────────

  // Priority 1: Surface an unsurfaced contradiction (only once per contradiction)
  const unsurfacedContradiction = session.contradictions?.find(c => !c.surfaced);
  if (unsurfacedContradiction) {
    return {
      shouldEnd: false,
      actionType: 'contradiction',
      stage: currentStage,
      difficulty: nextDifficulty,
      interviewMode: nextMode,
      nextTopic: currentTopic
    };
  }

  // Priority 2: Challenge if engine says so (but not too frequently)
  const lastChallenge = session.scores?.findIndex(s => s.wasChallenge);
  const questionsSinceChallenge = lastChallenge === -1 ? 99 : questionCount - lastChallenge;
  if (challengeDecision.shouldChallenge && questionsSinceChallenge >= 2) {
    return {
      shouldEnd: false,
      actionType: 'challenge',
      stage: currentStage,
      difficulty: nextDifficulty,
      interviewMode: nextMode,
      nextTopic: currentTopic,
      challengeType: challengeDecision.type,
      challengeAngle: challengeDecision.angle
    };
  }

  // Priority 3: Decide stage + topic transition
  const topicEntry = session.topics?.find(t =>
    t.topic.toLowerCase() === currentTopic?.toLowerCase()
  );
  const topicExhausted = topicEntry &&
    (topicEntry.depthLevel >= 4 || topicEntry.questionCount >= MAX_QUESTIONS_PER_TOPIC);

  const resolvedNextTopic = nextTopic || currentTopic;
  const topicChanged = resolvedNextTopic !== currentTopic;

  // Resolve next stage based on question count (still advisory)
  const nextStage = resolveStage(questionCount, currentStage, topicExhausted);
  const stageChanged = nextStage !== currentStage;

  return {
    shouldEnd: false,
    actionType: topicChanged || stageChanged ? 'new_topic' : 'followup',
    stage: nextStage,
    difficulty: nextDifficulty,
    interviewMode: nextMode,
    nextTopic: resolvedNextTopic,
    stageChanged,
    topicChanged
  };
}

// ─── Flexible ending ──────────────────────────────────────────────────────────
function checkShouldEnd(questionCount, scores, consecutiveStrong) {
  if (questionCount >= MAX_QUESTIONS) return true;
  if (questionCount < MIN_QUESTIONS) return false;

  // Enough signal: 6+ questions and last 3 were all strong (candidate proven)
  if (questionCount >= 6 && consecutiveStrong >= 3) return true;

  // Enough signal: scored on all major stages
  const stages = [...new Set(scores.map(s => s.stage))];
  const coveredAllStages = ['intro', 'technical', 'behavioral'].every(s => stages.includes(s));
  if (questionCount >= 7 && coveredAllStages) return true;

  return false;
}

// ─── Mode resolution ──────────────────────────────────────────────────────────
function resolveMode(consecutiveStrong, consecutiveWeak, questionCount) {
  // Pressure mode: candidate is doing very well → push them
  if (consecutiveStrong >= 2 && questionCount >= 3) return MODES.PRESSURE;
  // Probing mode: mixed but interesting answers → dig deep
  if (consecutiveStrong >= 1 && consecutiveWeak === 0 && questionCount >= 2) return MODES.PROBING;
  // Normal: default or when candidate is struggling (don't pile on)
  return MODES.NORMAL;
}

// ─── Stage resolution (advisory — influenced by topics, not just count) ───────
function resolveStage(questionCount, currentStage, topicExhausted) {
  // Never go backwards
  const stageOrder = [STAGES.INTRO, STAGES.CV_DEEP_DIVE, STAGES.TECHNICAL, STAGES.BEHAVIORAL];
  const currentIdx = stageOrder.indexOf(currentStage);

  // Advance when topic is exhausted + minimum questions in stage met
  if (topicExhausted && currentIdx < stageOrder.length - 1) {
    return stageOrder[currentIdx + 1];
  }

  // Force advance based on question count minimums
  if (questionCount >= 8) return STAGES.BEHAVIORAL;
  if (questionCount >= 5) return currentIdx >= 2 ? currentStage : STAGES.TECHNICAL;
  if (questionCount >= 2) return currentIdx >= 1 ? currentStage : STAGES.CV_DEEP_DIVE;

  return currentStage;
}

// ─── Difficulty adaptation (unchanged from v2) ────────────────────────────────
function adaptDifficulty(scores, current) {
  if (!scores.length) return current;
  const recent = scores.slice(-2);
  const avg = recent.reduce((s, e) => s + e.score, 0) / recent.length;
  const ladder = [DIFFICULTIES.EASY, DIFFICULTIES.MEDIUM, DIFFICULTIES.HARD];
  const idx = ladder.indexOf(current);
  if (avg >= 4) return ladder[Math.min(idx + 1, 2)];
  if (avg <= 1.5) return ladder[Math.max(idx - 1, 0)];
  return current;
}

// ─── Score utilities ──────────────────────────────────────────────────────────
function summariseScores(scores) {
  if (!scores.length) return { average: 3, highest: 3, lowest: 3, totalAnswered: 0 };
  const vals = scores.map(s => s.score);
  return {
    average: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    highest: Math.max(...vals),
    lowest: Math.min(...vals),
    totalAnswered: vals.length
  };
}

function scoreToVerdict(avg) {
  if (avg >= 4.5) return 'Strong Hire';
  if (avg >= 3.5) return 'Good Candidate';
  if (avg >= 2.5) return 'Average';
  return 'Needs Improvement';
}

module.exports = { orchestrate, summariseScores, scoreToVerdict };
