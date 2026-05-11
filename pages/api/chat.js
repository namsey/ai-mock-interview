/**
 * pages/api/chat.js — Phase 3
 *
 * Full intelligence loop:
 *  1. Store answer
 *  2. Parallel: score answer + extract claims
 *  3. Detect contradictions (pure JS — no AI call)
 *  4. Decide challenge (pure JS — no AI call)
 *  5. Update topic tracker
 *  6. Orchestrate → get action type
 *  7. Generate: contradiction | challenge | followup | new_topic | feedback
 *
 * All analysis runs in parallel (Promise.allSettled) so failures never crash the interview.
 */

import {
  getSession, addMessage, addScore, addClaims, addContradiction,
  upsertTopic, updateSession, updateStageAndDifficulty, markCompleted
} from '../../lib/sessionStore';
import {
  buildQuestionGeneratorPrompt, buildFollowUpPrompt, buildEvaluatorPrompt,
  buildFinalFeedbackPrompt, buildChallengePrompt, buildContradictionPrompt
} from '../../lib/prompts/index.js';
import { buildClaimExtractorPrompt, normalizeClaims } from '../../lib/claimExtractor';
import { detectContradiction } from '../../lib/contradictionDetector';
import { decidechallenge } from '../../lib/challengeEngine';
import { extractTopicsFromCV, selectNextTopic, scoreToConfidence } from '../../lib/topicTracker';
import { orchestrate, summariseScores } from '../../lib/orchestrator';
import { sendMessage, sendStructuredMessage } from '../../lib/aiClient';
import { logError, logInfo, logRequest, logWarn } from '../../lib/logger';
import fs from 'fs';
import path from 'path';

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
} catch {
  config = { interview: { answerMaxLength: 5000 } };
}

const MAX_ANSWER_LENGTH = config.interview?.answerMaxLength || 5000;

export default async function handler(req, res) {
  const startTime = Date.now();
  
  logInfo('/api/chat', 'Request received', { method: req.method });
  
  if (req.method !== 'POST') {
    logRequest('/api/chat', req.method, '/api/chat', 405, Date.now() - startTime);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, answer } = req.body;
  if (!sessionId || !answer?.trim()) {
    logWarn('/api/chat', 'Missing sessionId or answer');
    logRequest('/api/chat', 'POST', '/api/chat', 400, Date.now() - startTime);
    return res.status(400).json({ error: 'sessionId and answer are required.' });
  }
  if (answer.trim().length > MAX_ANSWER_LENGTH) {
    logWarn('/api/chat', 'Answer too long', { length: answer.trim().length, maxLength: MAX_ANSWER_LENGTH });
    logRequest('/api/chat', 'POST', '/api/chat', 400, Date.now() - startTime);
    return res.status(400).json({ error: `Answer too long (max ${MAX_ANSWER_LENGTH} chars).` });
  }

  const session = getSession(sessionId);
  if (!session) {
    logWarn('/api/chat', 'Session not found', { sessionId });
    logRequest('/api/chat', 'POST', '/api/chat', 404, Date.now() - startTime);
    return res.status(404).json({ error: 'Session not found. Please start a new interview.' });
  }
  if (session.phase === 'completed') {
    logWarn('/api/chat', 'Interview already completed', { sessionId });
    logRequest('/api/chat', 'POST', '/api/chat', 400, Date.now() - startTime);
    return res.status(400).json({ error: 'Interview already completed.' });
  }

  const trimmedAnswer = answer.trim();
  addMessage(sessionId, 'user', trimmedAnswer);
  logInfo('/api/chat', 'Processing answer', { 
    sessionId, 
    stage: session.currentStage, 
    mode: session.interviewMode,
    answerLength: trimmedAnswer.length
  });

  try {
    const lastQuestion = getLastQuestion(session.messages);
    const turnIndex = session.questionCount;

    // ── Phase 3: Run analysis in parallel ──────────────────────────────────
    const [scoreResult, claimsResult] = await Promise.allSettled([
      scoreAnswer(lastQuestion, trimmedAnswer, session),
      extractClaims(lastQuestion, trimmedAnswer, turnIndex)
    ]);

    // Process score
    let lastScore = null;
    if (scoreResult.status === 'fulfilled' && scoreResult.value) {
      lastScore = scoreResult.value;
      addScore(sessionId, {
        ...lastScore,
        question: lastQuestion,
        answer: trimmedAnswer,
        stage: session.currentStage
      });
      logInfo('/api/chat', 'Answer scored', { 
        sessionId, 
        score: `${lastScore.score}/5`,
        reasoning: lastScore.reasoning?.substring(0, 100) 
      });
    } else if (scoreResult.status === 'rejected') {
      logWarn('/api/chat', 'Failed to score answer', { sessionId, error: scoreResult.reason?.message });
    }

    // Process claims
    let newClaims = [];
    if (claimsResult.status === 'fulfilled' && claimsResult.value?.length) {
      newClaims = claimsResult.value;
      addClaims(sessionId, newClaims);
      logInfo('/api/chat', 'Claims extracted', { sessionId, claimsCount: newClaims.length });
    } else if (claimsResult.status === 'rejected') {
      logWarn('/api/chat', 'Failed to extract claims', { sessionId, error: claimsResult.reason?.message });
    }

    // ── Pure JS analysis (no AI, no latency) ───────────────────────────────
    const freshSession = getSession(sessionId);

    // Contradiction detection
    const contradictionResult = detectContradiction(newClaims, freshSession.claims.slice(0, -newClaims.length));
    if (contradictionResult.found) {
      addContradiction(sessionId, contradictionResult.contradiction);
      logInfo('/api/chat', 'Contradiction detected', { 
        sessionId,
        claim1: contradictionResult.contradiction.claim1?.claim.substring(0, 50),
        claim2: contradictionResult.contradiction.claim2?.claim.substring(0, 50)
      });
    }

    // Topic tracking
    const cvTopics = extractTopicsFromCV(freshSession.structuredCV);
    const currentTopicEntry = freshSession.topics.find(
      t => t.topic.toLowerCase() === freshSession.currentTopic?.toLowerCase()
    );
    if (freshSession.currentTopic && lastScore) {
      upsertTopic(sessionId, freshSession.currentTopic, {
        depthDelta: lastScore.score >= 4 ? 1 : 0,
        confidence: scoreToConfidence(lastScore.score)
      });
    }

    // Challenge decision
    const challengeDecision = decidechallenge(
      trimmedAnswer,
      newClaims,
      lastScore,
      currentTopicEntry,
      freshSession.interviewMode
    );

    // Next topic selection
    const nextTopicName = selectNextTopic(
      getSession(sessionId).topics,
      cvTopics,
      freshSession.currentTopic,
      freshSession.currentStage
    );

    // ── Orchestrate ─────────────────────────────────────────────────────────
    const latestSession = getSession(sessionId);
    const decision = orchestrate(latestSession, challengeDecision, contradictionResult, nextTopicName);
    logInfo('/api/chat', 'Decision made', { 
      sessionId,
      actionType: decision.actionType,
      interviewMode: decision.interviewMode,
      stage: decision.stage,
      difficulty: decision.difficulty,
      shouldEnd: decision.shouldEnd
    });

    // Apply session updates
    updateStageAndDifficulty(sessionId, { stage: decision.stage, difficulty: decision.difficulty });
    updateSession(sessionId, {
      interviewMode: decision.interviewMode,
      currentTopic: decision.nextTopic || latestSession.currentTopic
    });

    // ── Generate response ───────────────────────────────────────────────────
    if (decision.shouldEnd) {
      logInfo('/api/chat', 'Generating final feedback', { sessionId });
      return await generateFeedback(getSession(sessionId), res, startTime);
    }
    return await generateNextTurn(getSession(sessionId), decision, lastScore, newClaims, res, startTime);

  } catch (err) {
    const duration = Date.now() - startTime;
    logError('/api/chat', 'Failed to process chat request', err);
    
    if (err.message?.includes('429')) {
      logRequest('/api/chat', 'POST', '/api/chat', 429, duration, err);
      return res.status(429).json({ error: 'Rate limit reached. Please try again.' });
    }
    if (isAIProviderUnavailable(err)) {
      logRequest('/api/chat', 'POST', '/api/chat', 503, duration, err);
      return res.status(503).json({
        error: 'AI provider unavailable. Check your network connection or try again.'
      });
    }
    
    logRequest('/api/chat', 'POST', '/api/chat', 500, duration, err);
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' });
  }
}

function isAIProviderUnavailable(err) {
  const message = err.message || '';
  return err.aiProviderUnavailable
    || err.code === 'AI_PROVIDER_UNAVAILABLE'
    || message.includes('Connection error')
    || message.includes('fetch failed')
    || message.includes('timeout');
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

async function scoreAnswer(question, answer, session) {
  if (!question) return null;
  const prompt = buildEvaluatorPrompt(question, answer, session.structuredCV, session.currentStage);
  return sendStructuredMessage([{ role: 'user', content: prompt }], 300);
}

async function extractClaims(question, answer, turnIndex) {
  if (!question) return [];
  const prompt = buildClaimExtractorPrompt(question, answer, turnIndex);
  const raw = await sendStructuredMessage([{ role: 'user', content: prompt }], 300);
  return normalizeClaims(raw, turnIndex);
}

// ─── Response generators ──────────────────────────────────────────────────────

async function generateNextTurn(session, decision, lastScore, newClaims, res, startTime) {
  const { structuredCV, messages, currentStage, difficulty, interviewMode, topics, currentTopic } = session;

  const topicEntry = topics.find(t => t.topic?.toLowerCase() === currentTopic?.toLowerCase());
  const recentClaims = session.claims.slice(-6);

  let prompt;
  let responseType = 'question';

  switch (decision.actionType) {
    case 'contradiction': {
      // Mark the contradiction as surfaced so we don't ask twice
      const unsurfaced = session.contradictions.find(c => !c.surfaced);
      if (unsurfaced) {
        unsurfaced.surfaced = true;
        prompt = buildContradictionPrompt(unsurfaced, messages);
        logInfo('/api/chat', 'Generating contradiction question', { sessionId: session.id });
      } else {
        // Fallback to follow-up if none found
        prompt = buildFollowUpPrompt(structuredCV, messages, currentStage, difficulty, lastScore, topicEntry, recentClaims, interviewMode);
        logInfo('/api/chat', 'No unsurfaced contradiction, generating follow-up', { sessionId: session.id });
      }
      break;
    }

    case 'challenge':
      prompt = buildChallengePrompt(
        messages,
        decision.challengeType,
        decision.challengeAngle,
        difficulty,
        interviewMode
      );
      logInfo('/api/chat', 'Generating challenge question', { 
        sessionId: session.id, 
        challengeType: decision.challengeType 
      });
      break;

    case 'new_topic':
      prompt = buildQuestionGeneratorPrompt(
        structuredCV,
        currentStage,
        difficulty,
        messages,
        currentTopic,
        topicEntry,
        interviewMode
      );
      logInfo('/api/chat', 'Generating new topic question', { 
        sessionId: session.id, 
        topic: currentTopic 
      });
      break;

    case 'followup':
    default:
      prompt = buildFollowUpPrompt(
        structuredCV,
        messages,
        currentStage,
        difficulty,
        lastScore,
        topicEntry,
        recentClaims,
        interviewMode
      );
  }

  const question = await sendMessage([{ role: 'user', content: prompt }], 300);
  addMessage(session.id, 'assistant', question);

  // Update topic depth after question generated
  if (currentTopic) {
    upsertTopic(session.id, currentTopic, { depthDelta: 0 }); // just increment questionCount
  }

  const duration = Date.now() - startTime;
  logInfo('/api/chat', 'Question generated successfully', { 
    sessionId: session.id, 
    questionNum: session.questionCount,
    duration: `${duration}ms`
  });
  logRequest('/api/chat', 'POST', '/api/chat', 200, duration);

  return res.status(200).json({
    type: responseType,
    content: question,
    stage: currentStage,
    difficulty,
    interviewMode,
    questionNum: session.questionCount,
    actionType: decision.actionType
  });
}

async function generateFeedback(session, res, startTime) {
  const { structuredCV, messages, scores, claims, contradictions, topics } = session;
  const prompt = buildFinalFeedbackPrompt(structuredCV, messages, scores, claims, contradictions, topics);
  const feedback = await sendMessage([{ role: 'user', content: prompt }], 800);
  markCompleted(session.id);

  const scoreSummary = summariseScores(scores);
  const duration = Date.now() - startTime;
  
  logInfo('/api/chat', 'Interview completed', { 
    sessionId: session.id,
    averageScore: scoreSummary.average,
    totalAnswered: scoreSummary.totalAnswered,
    topicsCovered: topics.length,
    claimsCount: claims.length,
    contradictionsCount: contradictions.length,
    duration: `${duration}ms`
  });
  logRequest('/api/chat', 'POST', '/api/chat', 200, duration);

  return res.status(200).json({
    type: 'feedback',
    content: feedback,
    scores: scores.map(s => ({ score: s.score, stage: s.stage, reasoning: s.reasoning })),
    averageScore: scoreSummary.average,
    totalAnswered: scoreSummary.totalAnswered,
    claimsCount: claims.length,
    contradictionsFound: contradictions.length,
    topicsCovered: topics.map(t => ({ topic: t.topic, depth: t.depthLevel, confidence: t.confidence }))
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function getLastQuestion(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i].content;
  }
  return null;
}
