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
import { buildQuestionGeneratorPrompt } from '../../lib/prompts';
import { extractTopicsFromCV } from '../../lib/topicTracker';
import { sendMessage } from '../../lib/aiClient';
import { logError, logInfo } from '../../lib/logger';
import fs from 'fs';
import path from 'path';

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
} catch {
  config = { interview: { cvMinLength: 50 }, ai: { maxTokens: { openingQuestion: 300 } } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cvText } = req.body;
  if (!cvText || typeof cvText !== 'string') return res.status(400).json({ error: 'CV text is required.' });

  const minLen = config.interview?.cvMinLength || 50;
  if (cvText.trim().length < minLen) {
    return res.status(400).json({ error: `CV too short. Minimum ${minLen} characters.` });
  }

  try {
    const structuredCV = extractCVInsights(cvText);
    logInfo('/api/start', `CV parsed: ${structuredCV.jobTitle}, ${structuredCV.seniorityLevel}`);

    const session = createSession(cvText.trim(), structuredCV);

    // Phase 3: Prime topic tracker with CV topics
    const cvTopics = extractTopicsFromCV(structuredCV);
    const firstTopic = cvTopics[0] || structuredCV.jobTitle;

    // Pre-seed the session's current topic
    updateSession(session.id, { currentTopic: firstTopic });

    logInfo('/api/start', `Session ${session.id} created. First topic: ${firstTopic}`);

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
    logError('/api/start', 'Error', err);
    if (err.message?.includes('API keys')) {
      return res.status(500).json({ error: 'AI not configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local' });
    }
    if (err.message?.includes('429')) return res.status(429).json({ error: 'Rate limit reached.' });
    return res.status(500).json({ error: 'Failed to start interview. Please try again.' });
  }
}
