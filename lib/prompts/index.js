/**
 * lib/prompts/index.js — Phase 3
 * Barrel export for all prompt builders.
 */

const { buildQuestionGeneratorPrompt } = require('./questionGenerator');
const { buildFollowUpPrompt } = require('./followUp');
const { buildEvaluatorPrompt } = require('./evaluator');
const { buildFinalFeedbackPrompt } = require('./finalFeedback');
const { buildChallengePrompt } = require('./challengePrompt');
const { buildContradictionPrompt } = require('./contradictionPrompt');

module.exports = {
  buildQuestionGeneratorPrompt,
  buildFollowUpPrompt,
  buildEvaluatorPrompt,
  buildFinalFeedbackPrompt,
  buildChallengePrompt,
  buildContradictionPrompt
};
