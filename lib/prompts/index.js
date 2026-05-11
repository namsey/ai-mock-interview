/**
 * lib/prompts/index.js — Phase 3
 * Barrel export for all prompt builders.
 */

import { buildQuestionGeneratorPrompt } from './questionGenerator.js';
import { buildFollowUpPrompt } from './followUp.js';
import { buildEvaluatorPrompt } from './evaluator.js';
import { buildFinalFeedbackPrompt } from './finalFeedback.js';
import { buildChallengePrompt } from './challengePrompt.js';
import { buildContradictionPrompt } from './contradictionPrompt.js';

export {
  buildQuestionGeneratorPrompt,
  buildFollowUpPrompt,
  buildEvaluatorPrompt,
  buildFinalFeedbackPrompt,
  buildChallengePrompt,
  buildContradictionPrompt
};
