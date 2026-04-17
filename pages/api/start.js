/**
 * pages/api/start.js
 *
 * PHASE 2 CHANGES:
 *  - Uses cvParser v2 (returns structuredCV with grouped skills + seniority)
 *  - Creates session with new Phase 2 schema (stage, difficulty, scores)
 *  - Uses buildQuestionGeneratorPrompt for the intro stage
 *  - Returns structuredCV metadata to UI (skillGroups, seniorityLevel)
 *
 * Endpoint: POST /api/start
 * Body:     { cvText: string }
 * Returns:  { sessionId, question, jobTitle, skills, skillGroups, seniorityLevel, currentStage, difficulty }
 */

import { extractCVInsights } from '../../lib/cvParser';
import { createSession, addMessage, STAGES } from '../../lib/sessionStore';
import { buildQuestionGeneratorPrompt } from '../../lib/prompts';
import { sendMessage } from '../../lib/aiClient';
import { logError, logInfo, logRequest } from '../../lib/logger';
import fs from 'fs';
import path from 'path';

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
} catch {
  config = { interview: { cvMinLength: 50 }, ai: { maxTokens: { openingQuestion: 300 } } };
}

export default async function handler(req, res) {
  const startTime = Date.now();
  
  if (req.method !== 'POST') {
    const duration = Date.now() - startTime;
    logRequest('/api/start', req.method, '/api/start', 405, duration);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cvText } = req.body;

  if (!cvText || typeof cvText !== 'string') {
    const duration = Date.now() - startTime;
    logError('/api/start', 'Missing or invalid CV text', { hasCV: !!cvText, type: typeof cvText });
    logRequest('/api/start', 'POST', '/api/start', 400, duration);
    return res.status(400).json({ error: 'CV text is required.' });
  }

  const minLength = config.interview?.cvMinLength || 50;
  if (cvText.trim().length < minLength) {
    const duration = Date.now() - startTime;
    logError('/api/start', 'CV too short', { length: cvText.trim().length, minLength });
    logRequest('/api/start', 'POST', '/api/start', 400, duration);
    return res.status(400).json({
      error: `CV is too short. Please provide at least ${minLength} characters.`
    });
  }

  try {
    // ── Step 1: Parse CV into structured profile (Phase 2 upgrade) ───────────
    const structuredCV = extractCVInsights(cvText);
    logInfo('/api/start', `CV parsed — role: ${structuredCV.jobTitle}, seniority: ${structuredCV.seniorityLevel}`);

    // ── Step 2: Create Phase 2 session (new schema with stage + scores) ───────
    const session = createSession(cvText.trim(), structuredCV);
    logInfo('/api/start', `Session created: ${session.id}`);

    // ── Step 3: Generate intro-stage opening question ─────────────────────────
    const prompt = buildQuestionGeneratorPrompt(
      structuredCV,
      STAGES.INTRO,
      'easy',   // always start easy — orchestrator escalates from here
      []        // no history yet
    );

    const maxTokens = config.ai?.maxTokens?.openingQuestion || 300;
    const question = await sendMessage([{ role: 'user', content: prompt }], maxTokens);

    // ── Step 4: Store opening question in session ─────────────────────────────
    addMessage(session.id, 'assistant', question);

    const duration = Date.now() - startTime;
    logInfo('/api/start', `Interview started for session ${session.id}`);
    logRequest('/api/start', 'POST', '/api/start', 200, duration);

    // ── Step 5: Return to UI ──────────────────────────────────────────────────
    return res.status(200).json({
      sessionId: session.id,
      question,
      jobTitle: structuredCV.jobTitle,
      seniorityLevel: structuredCV.seniorityLevel,
      estimatedYears: structuredCV.estimatedYears,
      skills: structuredCV.allSkills,       // flat list (UI skill tags)
      skillGroups: structuredCV.skills,     // grouped by category (new v2 UI)
      currentStage: STAGES.INTRO,
      difficulty: 'easy'
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    logError('/api/start', 'Unhandled error in start endpoint', err);

    if (err.message?.includes('API keys')) {
      logRequest('/api/start', 'POST', '/api/start', 500, duration, err);
      return res.status(500).json({ error: 'AI not configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local' });
    }
    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      logRequest('/api/start', 'POST', '/api/start', 429, duration, err);
      return res.status(429).json({ error: 'Rate limit reached. Please try again.' });
    }
    
    logRequest('/api/start', 'POST', '/api/start', 500, duration, err);
    return res.status(500).json({ error: 'Failed to start interview. Please try again.' });
  }
}
