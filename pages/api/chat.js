/**
 * pages/api/chat.js
 *
 * PHASE 2 CHANGES — the core interview loop is now fully orchestrated:
 *
 *  1. Receive user answer
 *  2. Score it with evaluator prompt (async, non-blocking to UX)
 *  3. Ask orchestrator: which stage? which difficulty? done?
 *  4. Update session (stage + difficulty)
 *  5a. If done → generate score-aware feedback
 *  5b. If new stage → generate stage-opening question
 *  5c. If same stage → generate adaptive follow-up
 *
 * Endpoint: POST /api/chat
 * Body:     { sessionId: string, answer: string }
 * Returns:
 *   { type: 'question', content, stage, difficulty, questionNum }
 *   { type: 'feedback', content, scores, averageScore }
 */

import {
  getSession,
  addMessage,
  addScore,
  updateStageAndDifficulty,
  markCompleted
} from '../../lib/sessionStore';
import {
  buildQuestionGeneratorPrompt,
  buildFollowUpPrompt,
  buildEvaluatorPrompt,
  buildFinalFeedbackPrompt
} from '../../lib/prompts';
import { orchestrate, summariseScores } from '../../lib/orchestrator';
import { sendMessage, sendStructuredMessage } from '../../lib/aiClient';
import { logError, logInfo, logWarn, logRequest } from '../../lib/logger';
import fs from 'fs';
import path from 'path';

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
} catch {
  config = { interview: { maxQuestions: 6, answerMaxLength: 5000 } };
}

const MAX_ANSWER_LENGTH = config.interview?.answerMaxLength || 5000;

export default async function handler(req, res) {
  const startTime = Date.now();
  
  if (req.method !== 'POST') {
    const duration = Date.now() - startTime;
    logRequest('/api/chat', req.method, '/api/chat', 405, duration);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, answer } = req.body;

  if (!sessionId || !answer?.trim()) {
    const duration = Date.now() - startTime;
    logError('/api/chat', 'Missing required fields', { sessionId: !!sessionId, hasAnswer: !!answer?.trim() });
    logRequest('/api/chat', 'POST', '/api/chat', 400, duration);
    return res.status(400).json({ error: 'sessionId and answer are required.' });
  }

  if (answer.trim().length > MAX_ANSWER_LENGTH) {
    const duration = Date.now() - startTime;
    logError('/api/chat', 'Answer too long', { length: answer.trim().length, max: MAX_ANSWER_LENGTH });
    logRequest('/api/chat', 'POST', '/api/chat', 400, duration);
    return res.status(400).json({ error: `Answer too long (max ${MAX_ANSWER_LENGTH} chars).` });
  }

  // ── Load session ────────────────────────────────────────────────────────────
  const session = getSession(sessionId);

  if (!session) {
    const duration = Date.now() - startTime;
    logError('/api/chat', 'Session not found', { sessionId });
    logRequest('/api/chat', 'POST', '/api/chat', 404, duration);
    return res.status(404).json({
      error: 'Session not found. The server may have restarted — please start a new interview.'
    });
  }
  if (session.phase === 'completed') {
    const duration = Date.now() - startTime;
    logWarn('/api/chat', 'Attempt to use completed session', { sessionId });
    logRequest('/api/chat', 'POST', '/api/chat', 400, duration);
    return res.status(400).json({ error: 'This interview is already completed.' });
  }

  const trimmedAnswer = answer.trim();

  // ── Step 1: Store user answer ───────────────────────────────────────────────
  addMessage(sessionId, 'user', trimmedAnswer);
  logInfo('/api/chat', `Answer received — session ${sessionId}, stage: ${session.currentStage}`);

  try {
    // ── Step 2: Score the answer (non-blocking — we fire and store) ───────────
    // We do NOT await this before generating the next question.
    // We use Promise.allSettled so a scoring failure never kills the interview.
    const lastQuestion = getLastQuestion(session.messages);

    const [scoreResult] = await Promise.allSettled([
      scoreAnswer(lastQuestion, trimmedAnswer, session)
    ]);

    // Store score if evaluation succeeded
    let lastScore = null;
    if (scoreResult.status === 'fulfilled' && scoreResult.value) {
      lastScore = scoreResult.value;
      addScore(sessionId, {
        ...lastScore,
        question: lastQuestion,
        answer: trimmedAnswer,
        stage: session.currentStage
      });
      logInfo('/api/chat', `Answer scored: ${lastScore.score}/5`);
    }

    // ── Step 3: Orchestrate — decide next stage, difficulty, or end ───────────
    // Re-fetch session to get updated scores array
    const updatedSession = getSession(sessionId);
    const decision = orchestrate(updatedSession);

    logInfo('/api/chat', `Orchestrator decision: stage=${decision.stage}, difficulty=${decision.difficulty}, shouldEnd=${decision.shouldEnd}`);

    // ── Step 4: Apply orchestrator decision to session ────────────────────────
    updateStageAndDifficulty(sessionId, {
      stage: decision.stage,
      difficulty: decision.difficulty
    });

    // ── Step 5: Generate response ─────────────────────────────────────────────
    if (decision.shouldEnd) {
      return await handleFeedback(getSession(sessionId), res);
    }

    return await handleNextQuestion(getSession(sessionId), decision, lastScore, res);

  } catch (err) {
    const duration = Date.now() - startTime;
    logError('/api/chat', 'Unhandled error in chat endpoint', err);

    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      logRequest('/api/chat', 'POST', '/api/chat', 429, duration, err);
      return res.status(429).json({ error: 'Rate limit reached. Please try again.' });
    }
    
    logRequest('/api/chat', 'POST', '/api/chat', 500, duration, err);
    return res.status(500).json({ error: 'Failed to generate next question. Please try again.' });
  }
}

// ─── Score the candidate's last answer ───────────────────────────────────────
async function scoreAnswer(question, answer, session) {
  if (!question) return null;

  const prompt = buildEvaluatorPrompt(
    question,
    answer,
    session.structuredCV,
    session.currentStage
  );

  // sendStructuredMessage parses JSON and returns a safe fallback on failure
  const result = await sendStructuredMessage(
    [{ role: 'user', content: prompt }],
    300
  );

  return result;
}

// ─── Generate the next question (follow-up or new stage opener) ──────────────
async function handleNextQuestion(session, decision, lastScore, res) {
  const { structuredCV, messages, currentStage, difficulty } = session;
  let prompt;

  if (decision.stageChanged) {
    // First question of a new stage → use stage-specific opener
    prompt = buildQuestionGeneratorPrompt(
      structuredCV,
      currentStage,
      difficulty,
      messages
    );
    logInfo('/api/chat', `Stage changed → generating opener for stage: ${currentStage}`);
  } else {
    // Same stage → generate an adaptive follow-up based on last answer + score
    prompt = buildFollowUpPrompt(
      structuredCV,
      messages,
      currentStage,
      difficulty,
      lastScore
    );
  }

  const question = await sendMessage([{ role: 'user', content: prompt }], 300);

  // Store the AI's question
  addMessage(session.id, 'assistant', question);

  logInfo('/api/chat', `Question generated successfully for session ${session.id}`);
  
  return res.status(200).json({
    type: 'question',
    content: question,
    stage: currentStage,
    difficulty,
    questionNum: session.questionCount + 1  // +1 because addMessage already ran above
  });
}

// ─── Generate final feedback ──────────────────────────────────────────────────
async function handleFeedback(session, res) {
  const { structuredCV, messages, scores } = session;

  const prompt = buildFinalFeedbackPrompt(structuredCV, messages, scores);
  const feedback = await sendMessage([{ role: 'user', content: prompt }], 700);

  markCompleted(session.id);

  const scoreSummary = summariseScores(scores);
  logInfo('/api/chat', `Interview completed for session ${session.id}. Avg score: ${scoreSummary.average}`);

  return res.status(200).json({
    type: 'feedback',
    content: feedback,
    scores: scores.map(s => ({ score: s.score, stage: s.stage, reasoning: s.reasoning })),
    averageScore: scoreSummary.average,
    totalAnswered: scoreSummary.totalAnswered
  });
}

// ─── Utility: get the last question the AI asked ─────────────────────────────
function getLastQuestion(messages) {
  // Walk backwards through messages to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return messages[i].content;
    }
  }
  return null;
}
