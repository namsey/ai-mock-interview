/**
 * lib/cvParser.js
 *
 * PHASE 2 UPGRADE: Structured CV parsing.
 *
 * v1: returned a flat skill array + job title string.
 * v2: returns a structuredCV object with:
 *   - skills grouped by category (frontend, backend, devops, data, other)
 *   - experience signals (action verbs that suggest real ownership)
 *   - seniority level (junior | mid | senior)
 *   - years of experience estimate
 *   - notable keywords for question targeting
 *
 * This structured data feeds directly into phase-specific prompt templates
 * so the interviewer can ask targeted questions per stage.
 */

// ─── Skill Taxonomy ───────────────────────────────────────────────────────────
const SKILL_GROUPS = {
  frontend: [
    'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'TypeScript', 'JavaScript',
    'HTML', 'CSS', 'Tailwind', 'Redux', 'Zustand', 'GraphQL', 'Webpack', 'Vite'
  ],
  backend: [
    'Node.js', 'Express', 'Python', 'Django', 'FastAPI', 'Flask', 'Ruby', 'Rails',
    'Java', 'Spring', 'Go', 'Rust', 'PHP', 'Laravel', 'NestJS', 'Hapi',
    'gRPC', 'REST API', 'WebSockets'
  ],
  data: [
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
    'BigQuery', 'Snowflake', 'dbt', 'Kafka', 'RabbitMQ',
    'Machine Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Spark'
  ],
  devops: [
    'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'CI/CD',
    'Terraform', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'Ansible',
    'Linux', 'Nginx', 'Prometheus', 'Grafana', 'ECS', 'Lambda'
  ],
  practices: [
    'Microservices', 'System Design', 'TDD', 'DDD', 'Agile', 'Scrum',
    'Git', 'Code Review', 'Pair Programming', 'API Design',
    'Event-Driven', 'CQRS', 'Serverless'
  ]
};

// Action verbs that signal real ownership vs. just exposure
const EXPERIENCE_SIGNALS = [
  'built', 'led', 'designed', 'architected', 'shipped', 'launched',
  'scaled', 'migrated', 'reduced', 'improved', 'implemented', 'developed',
  'optimized', 'refactored', 'managed', 'mentored', 'deployed', 'created',
  'increased', 'decreased', 'automated', 'integrated', 'founded', 'owned'
];

// Year indicators in CV text
const YEAR_PATTERNS = [
  /(\d{4})\s*[-–]\s*(\d{4}|present|current|now)/gi,
  /\b(20\d{2})\b/g
];


/**
 * Main export — returns a fully structured CV profile.
 *
 * @param {string} cvText - Raw CV text
 * @returns {{
 *   jobTitle: string,
 *   seniorityLevel: string,
 *   skills: object,           // grouped by category
 *   allSkills: string[],      // flat list for backwards compat
 *   experienceSignals: string[],
 *   estimatedYears: number,
 *   topSkillCategory: string  // most represented category
 * }}
 */
function extractCVInsights(cvText) {
  const lower = cvText.toLowerCase();

  // 1. Group skills by category
  const skills = {};
  let allSkills = [];

  for (const [category, patterns] of Object.entries(SKILL_GROUPS)) {
    const found = patterns.filter(skill =>
      cvText.toUpperCase().includes(skill.toUpperCase())
    );
    if (found.length > 0) {
      skills[category] = found;
      allSkills = [...allSkills, ...found];
    }
  }

  // Default if nothing detected
  if (allSkills.length === 0) {
    allSkills = ['Software Development'];
    skills.other = ['Software Development'];
  }

  // 2. Find experience signals (what they actually DID)
  const experienceSignals = EXPERIENCE_SIGNALS.filter(verb =>
    lower.includes(verb)
  );

  // 3. Estimate seniority
  const seniorityLevel = inferSeniority(cvText, lower);

  // 4. Infer job title
  const jobTitle = inferJobTitle(lower, skills);

  // 5. Estimate years of experience
  const estimatedYears = estimateYearsOfExperience(cvText);

  // 6. Find top skill category (most skills detected)
  const topSkillCategory = Object.entries(skills)
    .sort(([, a], [, b]) => b.length - a.length)[0]?.[0] || 'backend';

  return {
    jobTitle,
    seniorityLevel,
    skills,
    allSkills,
    experienceSignals,
    estimatedYears,
    topSkillCategory
  };
}

// ─── Helper: Seniority Detection ──────────────────────────────────────────────
function inferSeniority(cvText, lower) {
  if (
    lower.includes('senior') || lower.includes('lead') ||
    lower.includes('principal') || lower.includes('staff') ||
    lower.includes('architect') || lower.includes('head of')
  ) return 'senior';

  if (
    lower.includes('junior') || lower.includes('graduate') ||
    lower.includes('intern') || lower.includes('entry')
  ) return 'junior';

  // Mid-level is the default when no signal is found
  return 'mid';
}

// ─── Helper: Job Title ────────────────────────────────────────────────────────
function inferJobTitle(lower, skills) {
  if (lower.includes('senior') && lower.includes('full stack')) return 'Senior Full Stack Engineer';
  if (lower.includes('senior') && lower.includes('frontend')) return 'Senior Frontend Engineer';
  if (lower.includes('senior') && lower.includes('backend')) return 'Senior Backend Engineer';
  if (lower.includes('senior')) return 'Senior Software Engineer';
  if (lower.includes('lead') || lower.includes('principal')) return 'Lead Software Engineer';
  if (lower.includes('full stack') || lower.includes('fullstack')) return 'Full Stack Developer';
  if (lower.includes('frontend') || lower.includes('front-end')) return 'Frontend Developer';
  if (lower.includes('backend') || lower.includes('back-end')) return 'Backend Developer';
  if (lower.includes('data scientist')) return 'Data Scientist';
  if (lower.includes('ml engineer') || lower.includes('machine learning')) return 'ML Engineer';
  if (lower.includes('devops') || lower.includes('sre')) return 'DevOps / SRE Engineer';
  if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) return 'Mobile Developer';
  if (lower.includes('junior')) return 'Junior Software Engineer';

  // Fallback: pick title based on most skills found
  if (skills.data?.length > 3) return 'Data Engineer';
  if (skills.devops?.length > 3) return 'DevOps Engineer';
  if (skills.frontend?.length > skills.backend?.length) return 'Frontend Developer';

  return 'Software Engineer';
}

// ─── Helper: Years of Experience ─────────────────────────────────────────────
function estimateYearsOfExperience(cvText) {
  // Try to find year ranges like "2019 - 2023"
  const yearMatches = [...cvText.matchAll(/(\d{4})\s*[-–]\s*(\d{4}|present|current|now)/gi)];

  if (yearMatches.length === 0) {
    // Try to find explicit mentions like "5 years of experience"
    const explicitMatch = cvText.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i);
    if (explicitMatch) return parseInt(explicitMatch[1]);
    return 3; // safe default
  }

  const currentYear = new Date().getFullYear();
  let minYear = currentYear;

  for (const match of yearMatches) {
    const year = parseInt(match[1]);
    if (year >= 2000 && year < currentYear) {
      minYear = Math.min(minYear, year);
    }
  }

  return Math.max(1, currentYear - minYear);
}

module.exports = { extractCVInsights };
