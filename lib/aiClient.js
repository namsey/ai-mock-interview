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

// Load config once at module level
let config;
try {
  const configPath = path.join(process.cwd(), 'config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = { ai: { preferredProvider: 'anthropic' } };
}

/**
 * Selects which provider to use based on config + available API keys.
 * Falls back gracefully if preferred provider key is missing.
 */
function resolveProvider() {
  const preferred = config.ai?.preferredProvider || 'anthropic';

  if (preferred === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  if (preferred === 'openai' && process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  // Fallback: try the other one
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';

  throw new Error('No AI API keys configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local');
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
  const provider = resolveProvider();

  if (provider === 'anthropic') {
    return sendAnthropic(messages, maxTokens);
  }
  return sendOpenAI(messages, maxTokens);
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
    return JSON.parse(cleaned);
  } catch {
    // If parsing fails, return a safe fallback rather than crashing the interview
    console.error('[aiClient] Failed to parse structured response:', cleaned);
    return { score: 3, reasoning: 'Unable to evaluate — proceeding with neutral score.', keyPoints: [] };
  }
}

// ─── Anthropic Implementation ─────────────────────────────────────────────────
async function sendAnthropic(messages, maxTokens) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const models = config.ai?.providers?.anthropic?.models || ['claude-sonnet-4-20250514'];
  const model = models[0];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages
  });

  return response.content[0].text.trim();
}

// ─── OpenAI Implementation ────────────────────────────────────────────────────
async function sendOpenAI(messages, maxTokens) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const models = config.ai?.providers?.openai?.models || ['gpt-4o-mini'];
  const model = models[0];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages
  });

  return response.choices[0].message.content.trim();
}

module.exports = { sendMessage, sendStructuredMessage };
