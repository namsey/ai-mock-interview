/**
 * pages/api/start.js
 *
 * POST /api/start
 * Body:    { cvText: string }
 * Returns: { sessionId: string, question: string, jobTitle: string, skills: string[] }
 *
 * Flow:
 *  1. Extract skills + job title from CV text
 *  2. Create in-memory session
 *  3. Ask Claude for the opening question (grounded in CV)
 *  4. Store question in session history
 *  5. Return session ID + first question to the UI
 */

import { extractCVInsights } from '../../lib/cvParser';
import { createSession, addMessage } from '../../lib/sessionStore';
import { buildOpeningPrompt } from '../../lib/prompts';
import { sendMessage } from '../../lib/aiClient';
import { logError, logInfo } from '../../lib/logger';
import fs from 'fs';
import path from 'path';

// Load configuration
let config;
try {
  const configPath = path.join(process.cwd(), 'config.json');
  const configFile = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configFile);
} catch (error) {
  // Use defaults if config.json is not available
  config = {
    interview: { cvMinLength: 50 },
    ai: { maxTokens: { openingQuestion: 256 } }
  };
}

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

    const { cvText } = req.body;

    // Validate CV text
    if (!cvText || typeof cvText !== 'string') {
      return res.status(400).json({ error: 'CV text is required and must be a string' });
    }

    const minLength = config.interview?.cvMinLength || 50;
    if (cvText.trim().length < minLength) {
      return res.status(400).json({
        error: `CV text is too short. Please provide more detail (at least ${minLength} characters).`
      });
    }

    // Step 1: Parse CV for skills and inferred job title
    let skills, jobTitle;
    try {
      const insights = extractCVInsights(cvText);
      skills = insights.skills;
      jobTitle = insights.jobTitle;
      logInfo('/api/start', `Successfully parsed CV - Job: ${jobTitle}, Skills: ${skills.length}`);
    } catch (parseError) {
      logError('/api/start', 'CV parsing error', parseError);
      return res.status(400).json({
        error: 'Failed to parse CV. Please ensure your CV contains valid text content.'
      });
    }

    // Step 2: Create session in memory (stores CV + skills for the whole interview)
    let session;
    try {
      session = createSession(cvText.trim(), skills, jobTitle);
      logInfo('/api/start', `Created session: ${session.id}`);
    } catch (sessionError) {
      logError('/api/start', 'Session creation error', sessionError);
      return res.status(500).json({
        error: 'Failed to create interview session. Please try again.'
      });
    }

    // Step 3: Ask AI for the first question
    let question;
    try {
      const prompt = buildOpeningPrompt(cvText, skills, jobTitle);
      const maxTokens = typeof config.ai?.maxTokens === 'object'
        ? config.ai.maxTokens.openingQuestion || 256
        : config.ai?.maxTokens || 256;
      
      question = await sendMessage(
        [{ role: 'user', content: prompt }],
        maxTokens
      );
      logInfo('/api/start', 'Successfully generated opening question');
    } catch (aiError) {
      logError('/api/start', 'AI request error', aiError);
      
      // Provide specific error messages based on the error type
      if (aiError.message.includes('API keys configured')) {
        return res.status(500).json({
          error: 'AI service not configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local'
        });
      }
      
      if (aiError.message.includes('429') || aiError.message.includes('rate limit')) {
        return res.status(429).json({
          error: 'AI service rate limit reached. Please try again in a few moments.'
        });
      }
      
      if (aiError.message.includes('402') || aiError.message.includes('quota')) {
        return res.status(402).json({
          error: 'AI service quota exceeded. Please check your API account.'
        });
      }
      
      return res.status(500).json({
        error: 'Failed to generate opening question. Please try again.'
      });
    }

    // Step 4: Store AI's opening question in session history
    try {
      addMessage(session.id, 'assistant', question);
    } catch (messageError) {
      logError('/api/start', 'Message storage error', messageError);
      // Non-fatal - the session exists, just log and continue
    }

    // Step 5: Return everything the UI needs to begin the interview
    return res.status(200).json({
      sessionId: session.id,
      question,
      jobTitle,
      skills
    });

  } catch (err) {
    // Catch any unexpected errors
    logError('/api/start', 'Unexpected error', err);
    return res.status(500).json({
      error: 'An unexpected error occurred. Please try again.'
    });
  }
}
