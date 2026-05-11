/**
 * lib/aiClient.js
 *
 * Unified AI client that supports both Anthropic and OpenAI.
 * Provider is chosen based on config.json + environment variables.
 *
 * Phase 2 change: added sendStructuredMessage() for JSON-returning prompts
 * (used by the evaluator to return scored JSON responses).
 *
 * Usage:
 *   const text = await sendMessage(messages, maxTokens);
 *   const json = await sendStructuredMessage(messages, maxTokens);
 */

import fs from 'fs';
import path from 'path';
import { logError, logInfo, logWarn } from './logger.js';

// Load config once at module level
let config;
try {
  const configPath = path.join(process.cwd(), 'config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = { ai: { preferredProvider: 'anthropic' } };
}

/**
 * Returns available providers ordered by preference.
 * Falls back gracefully if the preferred provider is missing or fails.
 */
function resolveProviderChain() {
  const preferred = config.ai?.preferredProvider || 'anthropic';
  const providers = [];

  if (preferred === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    providers.push('anthropic');
  }
  if (preferred === 'openai' && process.env.OPENAI_API_KEY) {
    providers.push('openai');
  }

  const alternate = preferred === 'openai' ? 'anthropic' : 'openai';
  if (alternate === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    providers.push('anthropic');
  }
  if (alternate === 'openai' && process.env.OPENAI_API_KEY) {
    providers.push('openai');
  }

  const uniqueProviders = [...new Set(providers)];

  if (uniqueProviders.length === 0) {
    logError('aiClient', 'No AI API keys configured', new Error('Missing API keys'));
    throw new Error('No AI API keys configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local');
  }

  if (uniqueProviders[0] !== preferred) {
    logWarn('aiClient', 'Falling back to alternate provider because preferred provider key is missing', {
      preferred,
      fallback: uniqueProviders[0]
    });
  }

  return uniqueProviders;
}

/**
 * Sends messages to the configured AI provider.
 * Returns plain text response.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} maxTokens
 * @returns {Promise<string>}
 */
async function sendMessage(messages, maxTokens = 512) {
  const startTime = Date.now();
  const providers = resolveProviderChain();

  logInfo('aiClient', 'Sending message to AI', {
    providers,
    maxTokens, 
    messageCount: messages.length 
  });

  let lastError;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];

    try {
      let response;
      if (provider === 'anthropic') {
        response = await sendAnthropic(messages, maxTokens);
      } else {
        response = await sendOpenAI(messages, maxTokens);
      }

      const duration = Date.now() - startTime;
      logInfo('aiClient', 'AI response received', {
        provider,
        duration: `${duration}ms`,
        responseLength: response.length
      });

      return response;
    } catch (error) {
      lastError = error;
      const hasFallback = index < providers.length - 1;
      const duration = Date.now() - startTime;

      if (hasFallback) {
        logWarn('aiClient', 'AI provider failed; trying fallback provider', {
          provider,
          fallback: providers[index + 1],
          duration: `${duration}ms`,
          error: error.message
        });
      } else {
        logError('aiClient', 'AI request failed', error, {
          provider,
          duration: `${duration}ms`
        });
      }
    }
  }

  lastError.code = lastError.code || 'AI_PROVIDER_UNAVAILABLE';
  lastError.aiProviderUnavailable = true;
  throw lastError;
}

/**
 * Like sendMessage, but attempts to parse the response as JSON.
 * Used for evaluator prompt which returns structured scores.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} maxTokens
 * @returns {Promise<object>}
 */
async function sendStructuredMessage(messages, maxTokens = 512) {
  const raw = await sendMessage(messages, maxTokens);

  // Strip markdown code fences if present (Claude sometimes wraps JSON)
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    logInfo('aiClient', 'Structured response parsed successfully', { 
      hasScore: !!parsed.score 
    });
    return parsed;
  } catch (error) {
    // If parsing fails, return a safe fallback rather than crashing the interview
    logError('aiClient', 'Failed to parse structured response', error, { 
      responsePreview: cleaned.substring(0, 100) 
    });
    return { score: 3, reasoning: 'Unable to evaluate — proceeding with neutral score.', keyPoints: [] };
  }
}

// ─── Anthropic Implementation ─────────────────────────────────────────────────
async function sendAnthropic(messages, maxTokens) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const models = config.ai?.providers?.anthropic?.models || ['claude-sonnet-4-20250514'];
  const model = models[0];

  logInfo('aiClient', 'Calling Anthropic API', { model, maxTokens });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages
  });

  logInfo('aiClient', 'Anthropic API response', { 
    model,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    stopReason: response.stop_reason
  });

  return response.content[0].text.trim();
}

// ─── OpenAI Implementation ────────────────────────────────────────────────────
async function sendOpenAI(messages, maxTokens) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const models = config.ai?.providers?.openai?.models || ['gpt-4o-mini'];
  const model = models[0];

  logInfo('aiClient', 'Calling OpenAI API', { model, maxTokens });

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages
  });

  logInfo('aiClient', 'OpenAI API response', { 
    model,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
    totalTokens: response.usage?.total_tokens,
    finishReason: response.choices[0].finish_reason
  });

  return response.choices[0].message.content.trim();
}

module.exports = { sendMessage, sendStructuredMessage };
