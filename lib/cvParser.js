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
const fs = require('fs');
const path = require('path');

// Load configuration
let config;
try {
  const configPath = path.join(process.cwd(), 'config.json');
  const configFile = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configFile);
} catch (error) {
  // Use defaults if config.json is not available
  config = {
    cvParsing: {
      skills: [
        'React', 'Vue', 'Angular', 'Next.js', 'TypeScript', 'JavaScript',
        'HTML', 'CSS', 'Tailwind', 'Redux', 'GraphQL',
        'Node.js', 'Express', 'Python', 'Django', 'FastAPI', 'Flask',
        'Java', 'Spring', 'Go', 'Rust', 'PHP', 'Laravel', 'Ruby', 'Rails',
        'Machine Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'SQL',
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
        'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'CI/CD',
        'Terraform', 'Jenkins', 'GitHub Actions', 'Linux',
        'REST API', 'Microservices', 'Agile', 'Scrum', 'TDD',
        'System Design', 'Git'
      ],
      minLength: 50
    }
  };
}

// Ordered by category so prompts can reference them meaningfully
const SKILL_PATTERNS = config.cvParsing?.skills || [
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

  const minLength = config.cvParsing?.minLength || 50;
  if (cvText.trim().length < minLength) {
    throw new Error(`CV text is too short. Please provide at least ${minLength} characters`);
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
