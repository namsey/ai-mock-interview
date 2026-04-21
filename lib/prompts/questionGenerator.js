/**
 * lib/prompts/questionGenerator.js — Phase 3 UPGRADED
 *
 * Now receives:
 *  - nextTopic      — specific topic to open on (from topicTracker)
 *  - topicEntry     — depth + confidence for that topic
 *  - interviewMode  — affects tone
 *  - recentClaims   — so opener can reference what candidate already said
 */

const INTERVIEWER_PERSONA = require('./persona');
const { depthLevelToInstruction } = require('../topicTracker');

function buildQuestionGeneratorPrompt(
  structuredCV,
  stage,
  difficulty,
  messages = [],
  nextTopic = null,
  topicEntry = null,
  interviewMode = 'normal'
) {
  const { jobTitle, seniorityLevel, skills, experienceSignals, estimatedYears } = structuredCV;
  const skillSummary = buildSkillSummary(skills);
  const historySnippet = messages.length > 0
    ? `\nRecent context:\n${messages.slice(-4).map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`).join('\n')}`
    : '';

  const topicInstruction = nextTopic
    ? `Focus this question on: "${nextTopic}". ${topicEntry ? depthLevelToInstruction(topicEntry.depthLevel) : ''}`
    : '';

  const stageInstruction = getStageInstruction(stage, structuredCV, difficulty);
  const modeNote = interviewMode === 'pressure'
    ? '\nTone: Direct and challenging. No softening. Be brief.'
    : interviewMode === 'probing'
    ? '\nTone: Intellectually curious. Go deep immediately.'
    : '';

  return `${INTERVIEWER_PERSONA}

Candidate: ${jobTitle} (${seniorityLevel}, ~${estimatedYears} yrs)
Skills: ${skillSummary}
Experience signals: ${experienceSignals.slice(0, 5).join(', ') || 'not detected'}
${historySnippet}

Stage: ${stage.toUpperCase()} | Difficulty: ${difficulty.toUpperCase()} | Mode: ${interviewMode.toUpperCase()}
${topicInstruction}

${stageInstruction}
${modeNote}

Output ONLY the question. No preamble.`;
}

function getStageInstruction(stage, structuredCV, difficulty) {
  const { skills, jobTitle, topSkillCategory } = structuredCV;

  switch (stage) {
    case 'intro':
      return `Open with ONE question referencing something specific from their background.
Not "tell me about yourself". Set a focused, professional tone. ${difficulty === 'easy' ? 'Keep it broad.' : ''}`;

    case 'cv_deep_dive': {
      const primary = Object.values(skills).flat().slice(0, 3).join(', ');
      return `Probe a specific project or decision from their CV. Focus on: ${primary}.
${difficulty === 'easy' ? 'Ask about role and what they shipped.' : difficulty === 'medium' ? 'Ask about a specific technical decision and tradeoff.' : 'Challenge a specific CV claim — ask for hard numbers or failure modes.'}`;
    }

    case 'technical': {
      return `Ask a technical depth question focused on: ${topSkillCategory || 'their primary skill area'}.
${difficulty === 'easy' ? 'Foundational concept question.' : difficulty === 'medium' ? 'System design or architecture decision.' : 'Hard scenario: failure recovery, edge case, or "what if X breaks at 10x scale?"'}`;
    }

    case 'behavioral':
      return `Ask ONE behavioral question relevant to a ${jobTitle} role.
Ask for a specific past example (use STAR framing implicitly).
${difficulty === 'hard' ? 'Focus on ownership, failure, or a difficult decision.' : 'Focus on collaboration or a challenging situation.'}`;

    default:
      return `Ask a relevant question for a ${jobTitle} at ${difficulty} difficulty.`;
  }
}

function buildSkillSummary(skills) {
  return Object.entries(skills)
    .map(([cat, list]) => `${cat}: ${list.slice(0, 3).join(', ')}`)
    .join(' | ');
}

module.exports = { buildQuestionGeneratorPrompt };
