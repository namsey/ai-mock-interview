/**
 * lib/claimExtractor.js — Phase 3 NEW
 *
 * Extracts structured claims from a candidate's answer via AI.
 *
 * A "claim" is any assertable statement the candidate makes about:
 *  - Their role or ownership ("I led...", "I built...")
 *  - Scale or impact ("10k users", "50% reduction")
 *  - Team context ("I worked alone", "my team of 5")
 *  - Technical decisions ("we chose Redis because...", "I designed...")
 *  - Timeline ("6 months", "in my last job at X")
 *
 * Claims are stored in the session and used by:
 *  - followUp prompts (reference what they said)
 *  - contradictionDetector (compare claims across turns)
 *  - challengeEngine (decide what to challenge)
 *
 * Output JSON from AI:
 * [
 *   { claim: "led backend team", details: "team of 4", topic: "leadership", type: "ownership" },
 *   { claim: "scaled to 50k users", details: "50k concurrent", topic: "system design", type: "scale" }
 * ]
 */

/**
 * Build the prompt for claim extraction.
 * This is sent to the AI to extract structured claims from the answer.
 *
 * @param {string} question  — The question asked
 * @param {string} answer    — The candidate's answer
 * @param {number} turnIndex — Which turn this is (for referencing later)
 * @returns {string}
 */
function buildClaimExtractorPrompt(question, answer, turnIndex) {
  return `Extract verifiable claims from this interview answer. Focus on specific assertions about ownership, scale, impact, team context, or technical decisions.

Question: "${question}"
Answer: "${answer}"

Return ONLY a JSON array (no markdown). Each item:
{
  "claim": "<short verb phrase describing what they claimed>",
  "details": "<specific numbers, names, or qualifiers they gave>",
  "topic": "<skill or domain this relates to>",
  "type": "<ownership|scale|decision|team|timeline|technical>"
}

Rules:
- Only extract things that are SPECIFIC and VERIFIABLE
- Skip vague statements like "I worked on various projects"
- Maximum 4 claims per answer
- If no specific claims exist, return []
- turnIndex for all items: ${turnIndex}

Return ONLY the JSON array.`;
}

/**
 * Parse and validate the AI's claim extraction response.
 * Returns safe fallback (empty array) if parsing fails.
 *
 * @param {object|Array} raw — parsed JSON from sendStructuredMessage
 * @param {number} turnIndex
 * @returns {Array}
 */
function normalizeClaims(raw, turnIndex) {
  try {
    const arr = Array.isArray(raw) ? raw : (raw.claims || []);
    return arr
      .filter(c => c && typeof c.claim === 'string' && c.claim.length > 2)
      .slice(0, 4)
      .map(c => ({
        claim: String(c.claim).trim(),
        details: String(c.details || '').trim(),
        topic: String(c.topic || 'general').trim(),
        type: String(c.type || 'general').trim(),
        turnIndex
      }));
  } catch {
    return [];
  }
}

module.exports = { buildClaimExtractorPrompt, normalizeClaims };
