/**
 * lib/sessionStore.js
 *
 * In-memory session store using a plain Map.
 *
 * ⚠️  Phase 1 only: resets on server restart.
 * In production: replace with Redis or a proper DB.
 *
 * In Next.js dev mode the Node process is persistent across
 * API calls — sessions survive between requests, which is exactly
 * what we need for a stateful interview loop.
 */

const sessions = new Map();

/**
 * Creates a new interview session.
 * @param {string} cvText   - Raw CV text from the user
 * @param {string[]} skills - Extracted skills array from cvParser
 * @param {string} jobTitle - Inferred job title from cvParser
 * @returns {object} The new session object
 */
function createSession(cvText, skills, jobTitle) {
  try {
    // Validate inputs
    if (!cvText || typeof cvText !== 'string') {
      throw new Error('cvText must be a non-empty string');
    }
    if (!Array.isArray(skills)) {
      throw new Error('skills must be an array');
    }
    if (!jobTitle || typeof jobTitle !== 'string') {
      throw new Error('jobTitle must be a non-empty string');
    }

    // Simple random ID — no auth needed in Phase 1
    const id = Math.random().toString(36).substring(2, 11);

    const session = {
      id,
      cvText,
      skills,
      jobTitle,
      messages: [],        // Full conversation history kept for Claude context
      questionCount: 0,    // Counts only AI questions (not user answers)
      phase: 'interviewing' // 'interviewing' | 'completed'
    };

    sessions.set(id, session);
    return session;
  } catch (error) {
    console.error('[Session Store] Error creating session:', error.message);
    throw error;
  }
}

function getSession(id) {
  try {
    if (!id || typeof id !== 'string') {
      console.error('[Session Store] Invalid session ID provided');
      return null;
    }
    return sessions.get(id) || null;
  } catch (error) {
    console.error('[Session Store] Error retrieving session:', error.message);
    return null;
  }
}

/**
 * Appends a message and increments questionCount if the AI spoke.
 */
function addMessage(id, role, content) {
  try {
    // Validate inputs
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid session ID');
    }
    if (!role || !['user', 'assistant'].includes(role)) {
      throw new Error('Role must be either "user" or "assistant"');
    }
    if (!content || typeof content !== 'string') {
      throw new Error('Content must be a non-empty string');
    }

    const session = sessions.get(id);
    if (!session) {
      console.error('[Session Store] Session not found:', id);
      return null;
    }

    session.messages.push({ role, content });

    // Only count questions the AI (assistant) asks — not user answers
    if (role === 'assistant') {
      session.questionCount += 1;
    }

    return session;
  } catch (error) {
    console.error('[Session Store] Error adding message:', error.message);
    throw error;
  }
}

function markCompleted(id) {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid session ID');
    }

    const session = sessions.get(id);
    if (!session) {
      console.error('[Session Store] Session not found for completion:', id);
      return;
    }

    session.phase = 'completed';
  } catch (error) {
    console.error('[Session Store] Error marking session completed:', error.message);
    throw error;
  }
}

module.exports = { createSession, getSession, addMessage, markCompleted };
