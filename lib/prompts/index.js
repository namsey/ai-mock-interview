/**
 * lib/prompts/index.js
 *
 * Barrel export — import all prompt builders from one place.
 *
 * Usage:
 *   const { buildQuestionGeneratorPrompt, buildFollowUpPrompt, ... } = require('../lib/prompts');
 */

const { buildQuestionGeneratorPrompt } = require('./questionGenerator');
const { buildFollowUpPrompt } = require('./followUp');
const { buildEvaluatorPrompt } = require('./evaluator');
const { buildFinalFeedbackPrompt } = require('./finalFeedback');

module.exports = {
  buildQuestionGeneratorPrompt,
  buildFollowUpPrompt,
  buildEvaluatorPrompt,
  buildFinalFeedbackPrompt
};
