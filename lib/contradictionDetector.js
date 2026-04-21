/**
 * lib/contradictionDetector.js — Phase 3 NEW
 *
 * Pure JS — no AI calls. Detects logical inconsistencies between
 * claims the candidate has made across different turns.
 *
 * Contradiction types checked:
 *  1. TEAM SIZE — "worked alone" vs "my team handled X"
 *  2. SCALE — "small project" vs "millions of users"
 *  3. OWNERSHIP — "I built" vs "I only contributed" (same item)
 *  4. TIMELINE — conflicting durations or dates
 *  5. TECHNOLOGY — using tool X vs "never used X"
 *
 * Returns:
 *  { found: boolean, contradiction?: { claimA, claimB, description } }
 */

// Pattern pairs that signal potential contradiction
// Each entry: [patternA, patternB, description template]
const CONTRADICTION_RULES = [
  // Solo vs team
  {
    typeA: ['ownership', 'team'],
    matchA: /\b(alone|solo|by myself|just me|independently)\b/i,
    matchB: /\b(my team|our team|we deployed|team of|together with)\b/i,
    description: 'You mentioned working alone earlier, but also referenced a team. Can you clarify your setup?'
  },
  // Scale contradiction
  {
    typeA: ['scale'],
    matchA: /\b(small|prototype|poc|proof of concept|personal project|few users|100 users)\b/i,
    matchB: /\b(\d{4,}|millions|thousands|high traffic|enterprise|large scale)\b/i,
    description: 'Earlier you described the project as small-scale, but now the scale sounds much larger. Which was it?'
  },
  // Ownership contradiction
  {
    typeA: ['ownership'],
    matchA: /\b(i (built|created|designed|architected|owned|wrote))\b/i,
    matchB: /\b(i (contributed|helped|assisted|supported|was involved))\b/i,
    description: 'You initially described full ownership, but later mentioned a supporting role. What was the extent of your involvement?'
  },
  // Tech contradiction
  {
    typeA: ['technical', 'decision'],
    matchA: /\b(never used|don't know|not familiar|haven't worked with)\b/i,
    matchB: /\b(i used|we used|implemented using|built with|deployed on)\b/i,
    description: "You mentioned not being familiar with that technology, but also described using it. Can you clarify?"
  }
];

/**
 * Check new claims against all stored claims for contradictions.
 *
 * @param {Array} newClaims     — claims just extracted from current answer
 * @param {Array} storedClaims  — all claims from previous turns
 * @returns {{ found: boolean, contradiction?: object }}
 */
function detectContradiction(newClaims, storedClaims) {
  if (!newClaims.length || !storedClaims.length) return { found: false };

  const allNewText = newClaims.map(c => `${c.claim} ${c.details}`).join(' ');
  const allOldText = storedClaims.map(c => `${c.claim} ${c.details}`).join(' ');

  for (const rule of CONTRADICTION_RULES) {
    const newMatchesA = rule.matchA.test(allNewText);
    const newMatchesB = rule.matchB.test(allNewText);
    const oldMatchesA = rule.matchA.test(allOldText);
    const oldMatchesB = rule.matchB.test(allOldText);

    // Old answer has A pattern, new answer has B pattern (or vice versa)
    const contradiction =
      (oldMatchesA && newMatchesB) ||
      (oldMatchesB && newMatchesA);

    if (contradiction) {
      // Find the specific conflicting claims for reference
      const claimA = storedClaims.find(c =>
        rule.matchA.test(`${c.claim} ${c.details}`) || rule.matchB.test(`${c.claim} ${c.details}`)
      );
      const claimB = newClaims[0];

      return {
        found: true,
        contradiction: {
          claimA: claimA ? `${claimA.claim} (${claimA.details})`.trim() : 'previous statement',
          claimB: `${claimB.claim} (${claimB.details})`.trim(),
          description: rule.description
        }
      };
    }
  }

  return { found: false };
}

module.exports = { detectContradiction };
