/**
 * lib/challengeEngine.js — Phase 3 NEW
 *
 * Pure JS decision engine. Decides whether to challenge the candidate's
 * last answer and which challenge type to apply.
 *
 * The AI should NOT always accept what the candidate says. This engine
 * triggers a challenge when:
 *  - A strong/bold claim lacks specifics (high score but vague details)
 *  - The answer uses vague superlatives ("best", "always", "never", "huge")
 *  - A specific claim begs for numbers the candidate didn't give
 *  - The same topic has been answered shallowly multiple times
 *
 * Challenge types:
 *  'numbers'    — ask for quantifiable evidence
 *  'tradeoffs'  — why this approach vs alternatives
 *  'failure'    — what went wrong / what would break
 *  'depth'      — drill further into a vague answer
 *  'why'        — reasoning behind a decision
 *
 * Returns:
 *  { shouldChallenge: boolean, type?: string, angle?: string }
 */

// Patterns that signal a challengeable claim
const BOLD_CLAIM_PATTERNS = [
  /\b(best|optimal|perfect|always|never|fastest|most efficient|revolutionary|world.class)\b/i,
  /\b(significantly|dramatically|massively|hugely|greatly)\b/i,
  /\b(i single.handedly|i alone|completely|entirely by myself)\b/i
];

// Patterns indicating vague scale — should be challenged for numbers
const VAGUE_SCALE_PATTERNS = [
  /\b(many users|lots of|a lot of|many requests|high traffic|large scale|millions)\b/i,
  /\b(improved performance|faster|more efficient|better|reduced)\b/i // without numbers
];

// Number patterns — if claim has vague scale AND no numbers, challenge
const HAS_NUMBERS = /\b\d+[\s]*(k|m|%|ms|gb|tb|users|requests|seconds|minutes|days|months|years)\b/i;

/**
 * @param {string}       answer        — candidate's last answer text
 * @param {Array}        newClaims     — claims just extracted
 * @param {object|null}  lastScore     — {score, reasoning, answerQuality}
 * @param {object|null}  topicEntry    — current topic's tracker entry
 * @param {string}       interviewMode — current mode
 * @returns {{ shouldChallenge: boolean, type: string, angle: string }}
 */
function decidechallenge(answer, newClaims, lastScore, topicEntry, interviewMode) {
  const score = lastScore?.score ?? 3;
  const quality = lastScore?.answerQuality ?? 'adequate';

  // In pressure mode, challenge more aggressively
  const pressureMultiplier = interviewMode === 'pressure' ? 0.7 : 1.0;

  // 1. Bold unqualified claim with no numbers → ask for numbers
  const hasBoldClaim = BOLD_CLAIM_PATTERNS.some(p => p.test(answer));
  const hasVagueScale = VAGUE_SCALE_PATTERNS.some(p => p.test(answer));
  const hasNumbers = HAS_NUMBERS.test(answer);

  if ((hasBoldClaim || hasVagueScale) && !hasNumbers) {
    return {
      shouldChallenge: true,
      type: 'numbers',
      angle: 'The candidate made a bold or scale claim without specific numbers. Challenge them: ask for concrete metrics.'
    };
  }

  // 2. Strong score (4-5) but answer was very short (under 80 words) → probe depth
  const wordCount = answer.split(/\s+/).length;
  if (score >= 4 && wordCount < 80 && interviewMode !== 'normal') {
    return {
      shouldChallenge: true,
      type: 'depth',
      angle: 'The answer was high quality but brief. Push for more detail — what exactly did they do, and what was hard about it?'
    };
  }

  // 3. Topic has been explored 2+ times with consistently medium scores → try failure angle
  if (topicEntry && topicEntry.questionCount >= 2 && score === 3) {
    return {
      shouldChallenge: true,
      type: 'failure',
      angle: 'They have given adequate but non-distinctive answers on this topic. Ask: what went wrong? What would they do differently?'
    };
  }

  // 4. Score is 4-5 but no tradeoff mentioned → ask about alternatives
  const mentionsAlternative = /\b(alternative|instead|versus|vs|compared to|opted for|decided against|trade.?off)\b/i;
  if (score >= 4 && !mentionsAlternative.test(answer) && interviewMode === 'probing') {
    return {
      shouldChallenge: true,
      type: 'tradeoffs',
      angle: 'Strong answer, but no tradeoffs were mentioned. Ask: why this approach and not an alternative? What were the cons of the chosen approach?'
    };
  }

  // 5. Pressure mode: randomly challenge with 'why' regardless (every 2nd question)
  if (interviewMode === 'pressure' && score >= 3 && Math.random() < (0.5 * pressureMultiplier)) {
    return {
      shouldChallenge: true,
      type: 'why',
      angle: "Pressure mode: challenge their reasoning. Ask 'why specifically that approach?' or 'what data informed that decision?'"
    };
  }

  return { shouldChallenge: false };
}

module.exports = { decidechallenge };
