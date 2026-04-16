/**
 * lib/cvParser.js
 *
 * Phase 1: Simple keyword-based CV skill extraction.
 *
 * No NLP library needed. We scan for known tech terms and
 * soft-skill signals. This gives Claude enough context to
 * ask targeted, relevant questions.
 *
 * Phase 2 upgrade: replace extractCVInsights() with an LLM call
 * to extract a structured profile (role, YOE, key projects, education).
 */

const { logError, logWarn } = require('./logger');

// Ordered by category so prompts can reference them meaningfully
const SKILL_PATTERNS = [
  // Frontend
  'React', 'Vue', 'Angular', 'Next.js', 'TypeScript', 'JavaScript',
  'HTML', 'CSS', 'Tailwind', 'Redux', 'GraphQL',
  // Backend
  'Node.js', 'Express', 'Python', 'Django', 'FastAPI', 'Flask',
  'Java', 'Spring', 'Go', 'Rust', 'PHP', 'Laravel', 'Ruby', 'Rails',
  // Data / AI
  'Machine Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'SQL',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
  // Cloud / DevOps
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'CI/CD',
  'Terraform', 'Jenkins', 'GitHub Actions', 'Linux',
  // Practices
  'REST API', 'Microservices', 'Agile', 'Scrum', 'TDD',
  'System Design', 'Git',
];

/**
 * Extracts skills and a rough job title from raw CV text.
 * Case-insensitive matching.
 *
 * @param {string} cvText
 * @returns {{ skills: string[], jobTitle: string }}
 */
function extractCVInsights(cvText) {
  // Validate input
  if (!cvText || typeof cvText !== 'string') {
    throw new Error('CV text must be a non-empty string');
  }

  if (cvText.trim().length < 50) {
    throw new Error('CV text is too short. Please provide at least 50 characters');
  }

  try {
    const upper = cvText.toUpperCase();

    const skills = SKILL_PATTERNS.filter(skill =>
      upper.includes(skill.toUpperCase())
    );

    // Simple heuristic for seniority — used to calibrate question depth
    const jobTitle = inferJobTitle(cvText);

    // Log warning if no skills were detected
    if (skills.length === 0) {
      logWarn('CV Parser', 'No specific skills detected in CV, using default');
    }

    return {
      skills: skills.length > 0 ? skills : ['Software Development'],
      jobTitle
    };
  } catch (error) {
    logError('CV Parser', 'Error extracting insights', error);
    // Return safe defaults if parsing fails
    return {
      skills: ['Software Development'],
      jobTitle: 'Software Engineer'
    };
  }
}

function inferJobTitle(cvText) {
  if (!cvText || typeof cvText !== 'string') {
    return 'Software Engineer'; // safe default
  }

  const lower = cvText.toLowerCase();

  if (lower.includes('senior') || lower.includes('lead') || lower.includes('principal')) {
    return 'Senior Engineer';
  }
  if (lower.includes('junior') || lower.includes('graduate') || lower.includes('intern')) {
    return 'Junior Developer';
  }
  if (lower.includes('full stack') || lower.includes('fullstack')) {
    return 'Full Stack Developer';
  }
  if (lower.includes('frontend') || lower.includes('front-end')) {
    return 'Frontend Developer';
  }
  if (lower.includes('backend') || lower.includes('back-end')) {
    return 'Backend Developer';
  }
  if (lower.includes('data scientist') || lower.includes('ml engineer')) {
    return 'Data / ML Engineer';
  }
  return 'Software Engineer'; // safe default
}

module.exports = { extractCVInsights };
