/**
 * lib/topicTracker.js — Phase 3 NEW
 *
 * Tracks which topics are being discussed, their exploration depth,
 * and selects the next best topic to pursue.
 *
 * Topics come from two sources:
 *  1. Structured CV skills (frontend, backend, devops, data categories)
 *  2. Topics that emerge organically during the conversation
 *
 * Depth levels (1-5):
 *  1 = mentioned but not explored
 *  2 = surface understanding confirmed
 *  3 = solid working knowledge shown
 *  4 = deep knowledge, design decisions discussed
 *  5 = expert — edge cases, failures, systemic thinking
 *
 * Confidence: derived from evaluator scores on that topic
 *  low    = score 1-2
 *  medium = score 3
 *  high   = score 4-5
 */

/**
 * Extract candidate topics from a structured CV.
 * Returns flat list of topic strings ordered by category priority.
 *
 * @param {object} structuredCV
 * @returns {string[]}
 */
function extractTopicsFromCV(structuredCV) {
  const { skills, topSkillCategory } = structuredCV;
  const topics = [];

  // Primary category first (most skills = probably primary expertise)
  const categoryOrder = [topSkillCategory, ...Object.keys(skills).filter(c => c !== topSkillCategory)];

  for (const cat of categoryOrder) {
    const catSkills = skills[cat] || [];
    // Take top 3 per category to avoid overwhelming the tracker
    topics.push(...catSkills.slice(0, 3));
  }

  return [...new Set(topics)]; // deduplicate
}

/**
 * Select the next topic to explore based on current state.
 *
 * Priority order:
 *  1. Current topic with low depth + high CV prominence → keep drilling
 *  2. Important CV topic not yet explored at all
 *  3. Topic with medium depth that showed confidence issues
 *  4. Anything not yet covered
 *
 * @param {Array}  topicEntries  — session.topics (already explored)
 * @param {Array}  cvTopics      — topics extracted from CV
 * @param {string} currentTopic  — what we're discussing now
 * @param {string} stage         — current interview stage
 * @returns {string} Next topic name
 */
function selectNextTopic(topicEntries, cvTopics, currentTopic, stage) {
  const explored = new Map(topicEntries.map(t => [t.topic.toLowerCase(), t]));

  // Unexplored CV topics
  const unexplored = cvTopics.filter(t => !explored.has(t.toLowerCase()) && t !== currentTopic);

  // Low-confidence explored topics (shown weakness — re-probe)
  const lowConfidence = topicEntries.filter(
    t => t.confidence === 'low' && t.depthLevel < 3 && t.topic !== currentTopic
  );

  // For technical stage: prefer unexplored technical topics
  if (stage === 'technical' && unexplored.length > 0) {
    return unexplored[0];
  }

  // If current topic is exhausted (depth >= 4 or asked 3+ questions), move on
  const currentEntry = topicEntries.find(t => t.topic.toLowerCase() === currentTopic?.toLowerCase());
  const currentExhausted = currentEntry && (currentEntry.depthLevel >= 4 || currentEntry.questionCount >= 3);

  if (!currentExhausted && currentTopic) {
    return currentTopic; // keep drilling current topic
  }

  if (lowConfidence.length > 0) return lowConfidence[0].topic;
  if (unexplored.length > 0) return unexplored[0];

  // Fallback: return the least-explored topic
  return topicEntries.sort((a, b) => a.depthLevel - b.depthLevel)[0]?.topic || currentTopic;
}

/**
 * Map a score to a confidence label.
 * @param {number} score 1-5
 * @returns {'low'|'medium'|'high'}
 */
function scoreToConfidence(score) {
  if (score >= 4) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/**
 * Get a depth instruction for the prompt based on current depth level.
 * @param {number} depthLevel 1-5
 * @returns {string}
 */
function depthLevelToInstruction(depthLevel) {
  switch (depthLevel) {
    case 1: return 'Ask a foundational question — confirm they understand the core concept.';
    case 2: return 'Ask about real usage — how they have applied this in practice.';
    case 3: return 'Ask about tradeoffs, design decisions, or performance considerations.';
    case 4: return 'Ask about failure modes, edge cases, or systemic design at scale.';
    case 5: return 'Ask an expert-level scenario — what breaks, how to recover, what alternatives exist.';
    default: return 'Ask a relevant question about this topic.';
  }
}

module.exports = { extractTopicsFromCV, selectNextTopic, scoreToConfidence, depthLevelToInstruction };
