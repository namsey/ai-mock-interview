/**
 * lib/prompts/finalFeedback.js — Phase 3 UPGRADED
 *
 * Now includes:
 *  - Claims summary (what the candidate asserted)
 *  - Contradictions found (if any)
 *  - Topic depth coverage
 *  - Interview mode history (how they handled pressure)
 */

const { summariseScores, scoreToVerdict } = require('../orchestrator');

function buildFinalFeedbackPrompt(structuredCV, messages, scores, claims, contradictions, topics) {
  const { jobTitle, seniorityLevel, skills, estimatedYears } = structuredCV;
  const skillSummary = Object.values(skills).flat().slice(0, 8).join(', ');

  const transcript = messages
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  const scoreSummary = buildScoreSummary(scores);
  const claimsSummary = buildClaimsSummary(claims);
  const contradictionsSummary = buildContradictionsSummary(contradictions);
  const topicsSummary = buildTopicsSummary(topics);

  const { average } = summariseScores(scores);
  const verdict = scoreToVerdict(average);
  const numericScore = Math.round(average * 2);

  return `You are a senior engineering manager writing post-interview feedback. Be honest, specific, and direct.

Candidate: ${jobTitle} (${seniorityLevel}, ~${estimatedYears} yrs)
Skills from CV: ${skillSummary}

Per-answer scores:
${scoreSummary}

Candidate claims made during interview:
${claimsSummary}

${contradictionsSummary}

Topics covered and depth reached:
${topicsSummary}

Pre-calculated average: ${average}/5 → ${numericScore}/10 | Verdict: ${verdict}

Full transcript:
---
${transcript}
---

Write feedback in this EXACT format:

**Overall Score: ${numericScore}/10** (${verdict})

**Strengths**
- [Specific strength tied to something they actually said — quote or paraphrase]
- [Second strength]
- [Third if evidence exists]

**Areas for Improvement**
- [Specific gap — reference what was vague, missing, or incorrect]
- [Second gap]
- [Third if applicable]

**Claim Verification**
- [Comment on their most significant claim — was it backed up with evidence?]
${contradictions.length > 0 ? '- [Note the inconsistency found and how they handled the clarification]' : ''}

**Topic Coverage**
- [1 sentence on technical depth reached]
- [1 sentence on behavioral / soft skills]

**One-line verdict**: [One direct, honest sentence about their candidacy]

Rules: Reference specifics. Under 320 words. Use pre-calculated verdict: ${verdict}.`;
}

function buildScoreSummary(scores) {
  if (!scores.length) return 'No scores recorded.';
  return scores.map((s, i) =>
    `Q${i + 1} [${s.stage || '?'}] Score ${s.score}/5 — ${s.reasoning || ''}`
  ).join('\n');
}

function buildClaimsSummary(claims) {
  if (!claims.length) return 'No specific claims extracted.';
  return claims.slice(0, 6)
    .map(c => `- "${c.claim}" (${c.details || 'no detail'}) [${c.type}]`)
    .join('\n');
}

function buildContradictionsSummary(contradictions) {
  if (!contradictions.length) return '';
  return `Inconsistencies detected:\n${contradictions.map(c =>
    `- ${c.description}`
  ).join('\n')}`;
}

function buildTopicsSummary(topics) {
  if (!topics.length) return 'No topics tracked.';
  return topics.map(t =>
    `- ${t.topic}: depth ${t.depthLevel}/5, confidence ${t.confidence} (${t.questionCount} questions)`
  ).join('\n');
}

module.exports = { buildFinalFeedbackPrompt };
