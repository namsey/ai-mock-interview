/**
 * lib/prompts/questionGenerator.js
 *
 * PHASE 2: Generates the FIRST question of each stage.
 *
 * Used when:
 *  - The very first question (intro stage)
 *  - Transitioning into a new stage (cv_deep_dive, technical, behavioral)
 *
 * Each stage has its own targeted instruction so the interviewer
 * naturally changes gear without an awkward "now let's talk about X" announcement.
 *
 * Output: A single plain-text question. No JSON.
 */

const INTERVIEWER_PERSONA = require('./persona');

/**
 * Builds a stage-opening question prompt.
 *
 * @param {object} structuredCV    - From cvParser.extractCVInsights()
 * @param {string} stage           - Current interview stage (STAGES constant)
 * @param {string} difficulty      - 'easy' | 'medium' | 'hard'
 * @param {Array}  messages        - Full conversation history (for context)
 * @returns {string} Prompt to send to AI
 */
function buildQuestionGeneratorPrompt(structuredCV, stage, difficulty, messages = []) {
  const { jobTitle, seniorityLevel, skills, experienceSignals, estimatedYears } = structuredCV;

  const skillSummary = buildSkillSummary(skills);
  const historySnippet = messages.length > 0
    ? `\nConversation so far (last 2 exchanges):\n${getRecentHistory(messages, 2)}`
    : '';

  const stageInstruction = getStageInstruction(stage, structuredCV, difficulty);

  return `${INTERVIEWER_PERSONA}

Candidate profile:
- Role: ${jobTitle}
- Seniority: ${seniorityLevel} (~${estimatedYears} years experience)
- Key skills by area: ${skillSummary}
- Experience signals from CV: ${experienceSignals.slice(0, 6).join(', ') || 'not detected'}
${historySnippet}

Current interview stage: ${stage.toUpperCase()}
Difficulty level: ${difficulty.toUpperCase()}

${stageInstruction}

Output ONLY the question. No preamble, no stage labels, no explanation.`;
}

// ─── Stage-Specific Instructions ─────────────────────────────────────────────

function getStageInstruction(stage, structuredCV, difficulty) {
  const { skills, jobTitle, topSkillCategory } = structuredCV;

  switch (stage) {
    case 'intro':
      return `Open the interview with a warm but focused question. 
Rules:
- Reference something SPECIFIC from their background (a role, a skill set, a domain)
- Must be open-ended — lets them establish their narrative
- Must NOT be "tell me about yourself" or "walk me through your resume"
- Set a confident, professional tone
- Easy difficulty: keep it broad`;

    case 'cv_deep_dive': {
      const primarySkills = Object.values(skills).flat().slice(0, 4).join(', ');
      const difficultyGuidance = difficulty === 'easy'
        ? 'Ask about a specific project they mentioned — what was their role and what did they ship?'
        : difficulty === 'medium'
        ? 'Probe a technical decision they made in a past project — what was the tradeoff?'
        : 'Challenge a specific claim in their CV — ask for hard numbers, scale, or failure modes.';

      return `You are now doing a CV deep-dive. Focus on their primary skills: ${primarySkills}.
${difficultyGuidance}
Do NOT ask a generic "tell me about a project" question. Be specific to what you know about their background.`;
    }

    case 'technical': {
      const techArea = topSkillCategory || 'backend';
      const difficultyGuidance = difficulty === 'easy'
        ? 'Ask a foundational technical question — core concepts, standard patterns.'
        : difficulty === 'medium'
        ? 'Ask about system design, architecture decisions, or performance considerations.'
        : 'Ask a hard scenario: "What would you do if X fails at 10x scale?", edge cases, or failure recovery.';

      return `You are now in the technical depth phase. Focus on their strongest area: ${techArea}.
${difficultyGuidance}
Ask ONE technical question that reveals genuine understanding — not trivia, but applied thinking.
Do not ask questions that can be answered by reciting a definition.`;
    }

    case 'behavioral':
      return `You are in the behavioral round. Ask ONE situational question about:
- A time they disagreed with a technical decision and what they did
- Or: how they handled a project that went sideways
- Or: how they collaborated with non-technical stakeholders
Pick the angle most relevant to a ${jobTitle} role.
Ask for a specific past example using the STAR framing (without naming STAR).
Difficulty: ${difficulty} — ${difficulty === 'hard' ? 'push for ownership and lessons learned' : 'focus on the situation and their actions'}.`;

    default:
      return `Ask the next logical interview question for a ${jobTitle} at ${difficulty} difficulty.`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSkillSummary(skills) {
  return Object.entries(skills)
    .map(([cat, list]) => `${cat}: ${list.slice(0, 3).join(', ')}`)
    .join(' | ');
}

function getRecentHistory(messages, n) {
  return messages
    .slice(-n * 2)
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n');
}

module.exports = { buildQuestionGeneratorPrompt };
