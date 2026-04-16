/**
 * pages/api/chat.js
 *
 * POST /api/chat
 * Body:    { sessionId: string, answer: string }
 * Returns:
 *   { type: 'question', content: string }  — next interview question
 *   { type: 'feedback', content: string }  — final feedback (interview over)
 *
 * Flow:
 *  1. Load session (contains full history + CV + skills)
 *  2. Store user's answer in session history
 *  3. If questionCount >= MAX_QUESTIONS → generate structured feedback
 *  4. Else → generate next adaptive follow-up question
 */

import { getSession, addMessage, markCompleted } from '../../lib/sessionStore';
import { buildFollowUpPrompt, buildFeedbackPrompt } from '../../lib/prompts';
import { sendMessage } from '../../lib/aiClient';
import { logError, logInfo } from '../../lib/logger';

// After this many AI questions, wrap up and generate feedback
const MAX_QUESTIONS = 6;

export default async function handler(req, res) {
  try {
    // Validate HTTP method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { sessionId, answer } = req.body;

    // Validate required fields
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Valid sessionId is required' });
    }

    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      return res.status(400).json({ error: 'Answer is required and cannot be empty' });
    }

    if (answer.trim().length > 5000) {
      return res.status(400).json({ error: 'Answer is too long (max 5000 characters)' });
    }

    // Step 1: Load the session (includes full CV + history)
    let session;
    try {
      session = getSession(sessionId);
    } catch (sessionError) {
      logError('/api/chat', 'Session retrieval error', sessionError);
      return res.status(500).json({ error: 'Failed to retrieve session. Please try again.' });
    }

    if (!session) {
      logError('/api/chat', `Session not found: ${sessionId}`, null);
      return res.status(404).json({
        error: 'Session not found. The server may have restarted — please start a new interview.'
      });
    }

    if (session.phase === 'completed') {
      return res.status(400).json({ error: 'This interview is already completed.' });
    }

    // Step 2: Store the user's answer in session history
    try {
      addMessage(sessionId, 'user', answer.trim());
      logInfo('/api/chat', `Stored user answer for session: ${sessionId}`);
    } catch (messageError) {
      logError('/api/chat', 'Message storage error', messageError);
      return res.status(500).json({ error: 'Failed to store your answer. Please try again.' });
    }

    // Step 3: Decide — wrap up or continue?
    if (session.questionCount >= MAX_QUESTIONS) {
      logInfo('/api/chat', `Session ${sessionId} reached max questions, generating feedback`);
      return await generateFeedback(session, res);
    }

    // Step 4: Generate next adaptive question
    return await generateNextQuestion(session, res);

  } catch (err) {
    // Catch any unexpected errors
    logError('/api/chat', 'Unexpected error', err);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}

// ─── Generates the next adaptive interview question ───────────────────────────
async function generateNextQuestion(session, res) {
  try {
    const prompt = buildFollowUpPrompt(
      session.cvText,
      session.skills,
      session.jobTitle,
      session.messages,    // Full history gives complete conversation context
      session.questionCount
    );

    const question = await sendMessage(
      [{ role: 'user', content: prompt }],
      256
    );

    // Validate AI response
    if (!question || typeof question !== 'string' || !question.trim()) {
      throw new Error('Invalid response from AI service');
    }

    // Store the question so future calls include it in context
    try {
      addMessage(session.id, 'assistant', question);
      logInfo('/api/chat', `Generated next question for session: ${session.id}`);
    } catch (messageError) {
      logError('/api/chat/generateNextQuestion', 'Message storage error', messageError);
      // Non-fatal - we can still return the question
    }

    return res.status(200).json({ type: 'question', content: question });

  } catch (aiError) {
    logError('/api/chat/generateNextQuestion', 'AI error', aiError);
    
    // Provide specific error messages based on the error type
    if (aiError.message.includes('API keys configured')) {
      return res.status(500).json({
        error: 'AI service not configured. Please contact support.'
      });
    }
    
    if (aiError.message.includes('429') || aiError.message.includes('rate limit')) {
      return res.status(429).json({
        error: 'AI service rate limit reached. Please try again in a few moments.'
      });
    }
    
    if (aiError.message.includes('402') || aiError.message.includes('quota')) {
      return res.status(402).json({
        error: 'AI service quota exceeded. Please contact support.'
      });
    }
    
    return res.status(500).json({
      error: 'Failed to generate next question. Please try again.'
    });
  }
}

// ─── Generates structured post-interview feedback ─────────────────────────────
async function generateFeedback(session, res) {
  try {
    const prompt = buildFeedbackPrompt(
      session.cvText,
      session.skills,
      session.jobTitle,
      session.messages
    );

    const feedback = await sendMessage(
      [{ role: 'user', content: prompt }],
      600  // Feedback needs more space than a single question
    );

    // Validate AI response
    if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
      throw new Error('Invalid feedback response from AI service');
    }

    // Lock the session — no more answers accepted
    try {
      markCompleted(session.id);
      logInfo('/api/chat', `Generated feedback and completed session: ${session.id}`);
    } catch (completeError) {
      logError('/api/chat/generateFeedback', 'Session completion error', completeError);
      // Non-fatal - we can still return the feedback
    }

    return res.status(200).json({ type: 'feedback', content: feedback });

  } catch (aiError) {
    logError('/api/chat/generateFeedback', 'AI error', aiError);
    
    // Provide specific error messages based on the error type
    if (aiError.message.includes('API keys configured')) {
      return res.status(500).json({
        error: 'AI service not configured. Please contact support.'
      });
    }
    
    if (aiError.message.includes('429') || aiError.message.includes('rate limit')) {
      return res.status(429).json({
        error: 'AI service rate limit reached. Please try again in a few moments.'
      });
    }
    
    if (aiError.message.includes('402') || aiError.message.includes('quota')) {
      return res.status(402).json({
        error: 'AI service quota exceeded. Please contact support.'
      });
    }
    
    return res.status(500).json({
      error: 'Failed to generate interview feedback. Please try again.'
    });
  }
}
