/**
 * pages/api/start.js — Phase 3
 *
 * Changes from v2:
 *  - Initializes currentTopic from CV's top skill
 *  - Primes topic tracker with CV-derived topics
 *  - Returns interviewMode in response
 */

import { extractCVInsights } from '../../lib/cvParser';
import { createSession, addMessage, upsertTopic, updateSession, STAGES } from '../../lib/sessionStore';
import { buildQuestionGeneratorPrompt } from '../../lib/prompts/index.js';
import { extractTopicsFromCV } from '../../lib/topicTracker';
import { sendMessage } from '../../lib/aiClient';
import { logError, logInfo, logRequest, logWarn } from '../../lib/logger';
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
  
  logInfo('/api/start', 'Request received', { method: req.method });
  
  if (req.method !== 'POST') {
    logRequest('/api/start', req.method, '/api/start', 405, Date.now() - startTime);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cvText } = req.body;
  if (!cvText || typeof cvText !== 'string') {
    logWarn('/api/start', 'Missing or invalid CV text');
    logRequest('/api/start', 'POST', '/api/start', 400, Date.now() - startTime);
    return res.status(400).json({ error: 'CV text is required.' });
  }

  const minLen = config.interview?.cvMinLength || 50;
  if (cvText.trim().length < minLen) {
    logWarn('/api/start', 'CV too short', { length: cvText.trim().length, minLength: minLen });
    logRequest('/api/start', 'POST', '/api/start', 400, Date.now() - startTime);
    return res.status(400).json({ error: `CV too short. Minimum ${minLen} characters.` });
  }

  try {
    logInfo('/api/start', 'Parsing CV', { cvLength: cvText.trim().length });
    const structuredCV = extractCVInsights(cvText);
    logInfo('/api/start', 'CV parsed successfully', { 
      jobTitle: structuredCV.jobTitle, 
      seniorityLevel: structuredCV.seniorityLevel,
      skillsCount: structuredCV.allSkills?.length || 0
    });

    const session = createSession(cvText.trim(), structuredCV);
    logInfo('/api/start', 'Session created', { sessionId: session.id });

    // Phase 3: Prime topic tracker with CV topics
    const cvTopics = extractTopicsFromCV(structuredCV);
    const firstTopic = cvTopics[0] || structuredCV.jobTitle;

    // Pre-seed the session's current topic
    updateSession(session.id, { currentTopic: firstTopic });

    logInfo('/api/start', 'Topic tracker initialized', { 
      sessionId: session.id, 
      firstTopic, 
      topicsCount: cvTopics.length 
    });

    logInfo('/api/start', 'Generating opening question', { sessionId: session.id, topic: firstTopic });
    const prompt = buildQuestionGeneratorPrompt(
      structuredCV,
      STAGES.INTRO,
      'easy',
      [],
      firstTopic,
      null,
      'normal'
    );

    const maxTokens = config.ai?.maxTokens?.openingQuestion || 300;
    const question = await sendMessage([{ role: 'user', content: prompt }], maxTokens);

    addMessage(session.id, 'assistant', question);

    const duration = Date.now() - startTime;
    logInfo('/api/start', 'Interview started successfully', { 
      sessionId: session.id, 
      duration: `${duration}ms` 
    });
    logRequest('/api/start', 'POST', '/api/start', 200, duration);

    return res.status(200).json({
      sessionId: session.id,
      question,
      jobTitle: structuredCV.jobTitle,
      seniorityLevel: structuredCV.seniorityLevel,
      estimatedYears: structuredCV.estimatedYears,
      skills: structuredCV.allSkills,
      skillGroups: structuredCV.skills,
      currentStage: STAGES.INTRO,
      difficulty: 'easy',
      interviewMode: 'normal',
      currentTopic: firstTopic
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    logError('/api/start', 'Failed to start interview', err);
    
    if (err.message?.includes('API keys')) {
      logRequest('/api/start', 'POST', '/api/start', 500, duration, err);
      return res.status(500).json({ error: 'AI not configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local' });
    }
    if (err.message?.includes('429')) {
      logRequest('/api/start', 'POST', '/api/start', 429, duration, err);
      return res.status(429).json({ error: 'Rate limit reached.' });
    }
    if (isAIProviderUnavailable(err)) {
      logRequest('/api/start', 'POST', '/api/start', 503, duration, err);
      return res.status(503).json({
        error: 'AI provider unavailable. Check your network connection or try the alternate provider.'
      });
    }
    
    logRequest('/api/start', 'POST', '/api/start', 500, duration, err);
    return res.status(500).json({ error: 'Failed to start interview. Please try again.' });
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
