/**
 * lib/aiClient.js
 *
 * Unified AI client that supports both Anthropic and OpenAI APIs
 * with automatic fallback when one provider's quota is exhausted.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logError, logWarn, logInfo } from './logger.js';

// Initialize clients
const anthropicClient = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Model mappings
const ANTHROPIC_MODELS = getAnthropicModels();
const OPENAI_MODELS = getOpenAIModels();
const PROVIDER_ORDER = getProviderOrder();
let anthropicDisabled = false;

/**
 * Sends a message to AI providers with automatic fallback
 * @param {Array} messages - Array of message objects with role and content
 * @param {number} maxTokens - Maximum tokens to generate
 * @returns {Promise<string>} - The generated response text
 */
export async function sendMessage(messages, maxTokens = 256) {
  // Validate inputs
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array');
  }

  // Validate message structure
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new Error('Each message must have role and content properties');
    }
  }

  if (typeof maxTokens !== 'number' || maxTokens <= 0) {
    throw new Error('maxTokens must be a positive number');
  }

  // Validate that at least one API key is configured
  if (!anthropicClient && !openaiClient) {
    throw new Error('No AI API keys configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local');
  }

  let lastError = null;

  for (const provider of PROVIDER_ORDER) {
    if (!isProviderAvailable(provider)) {
      continue;
    }

    try {
      const response = provider === 'openai'
        ? await callOpenAI(messages, maxTokens)
        : await callAnthropic(messages, maxTokens);

      logInfo('AI Client', `Successfully used ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API`);
      return response;
    } catch (error) {
      logError('AI Client', `${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API failed`, error);
      lastError = error;

      if (provider === 'anthropic' && isModelNotFoundError(error)) {
        anthropicDisabled = true;
        logWarn('AI Client', 'Disabling Anthropic for the rest of this server session because no configured Anthropic models are available.');
      }

      if (!hasFallbackProvider(provider)) {
        throw error;
      }

      logWarn('AI Client', `Attempting fallback from ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} to another provider...`);
    }
  }

  // If we get here, both providers failed
  logError('AI Client', 'All AI providers failed', lastError);
  throw lastError || new Error('All AI providers failed');
}

/**
 * Calls Anthropic API
 */
async function callAnthropic(messages, maxTokens) {
  let lastError = null;

  for (const model of ANTHROPIC_MODELS) {
    try {
      const response = await anthropicClient.messages.create({
        model,
        max_tokens: maxTokens,
        messages
      });

      // Validate response structure
      if (!response || !response.content || !Array.isArray(response.content) || response.content.length === 0) {
        throw new Error('Invalid response structure from Anthropic API');
      }

      const text = response.content[0].text;
      if (typeof text !== 'string') {
        throw new Error('Expected text response from Anthropic API');
      }

      return text.trim();
    } catch (error) {
      const normalizedError = normalizeProviderError('Anthropic', error, model);
      lastError = normalizedError;

      if (!isModelNotFoundError(normalizedError) || model === ANTHROPIC_MODELS[ANTHROPIC_MODELS.length - 1]) {
        throw normalizedError;
      }

      logWarn('AI Client', `Anthropic model unavailable, retrying with fallback model: ${model}`);
    }
  }

  throw lastError || new Error('Anthropic API error: All configured Anthropic models failed');
}

/**
 * Calls OpenAI API
 */
async function callOpenAI(messages, maxTokens) {
  let lastError = null;

  for (const model of OPENAI_MODELS) {
    try {
      const response = await openaiClient.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages
      });

      // Validate response structure
      if (!response || !response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
        throw new Error('Invalid response structure from OpenAI API');
      }

      const content = response.choices[0].message?.content;
      if (typeof content !== 'string') {
        throw new Error('Expected text content from OpenAI API');
      }

      return content.trim();
    } catch (error) {
      const normalizedError = normalizeProviderError('OpenAI', error, model);
      lastError = normalizedError;

      if (!isModelNotFoundError(normalizedError) || model === OPENAI_MODELS[OPENAI_MODELS.length - 1]) {
        throw normalizedError;
      }

      logWarn('AI Client', `OpenAI model unavailable, retrying with fallback model: ${model}`);
    }
  }

  throw lastError || new Error('OpenAI API error: All configured OpenAI models failed');
}

/**
 * Determines if an error is due to quota exhaustion or rate limiting
 */
function isExhaustedError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorStatus = error.status || error.statusCode || 0;
  
  // Check for common exhaustion indicators
  return (
    errorStatus === 429 || // Rate limit
    errorStatus === 402 || // Payment required (quota exceeded)
    errorMessage.includes('rate limit') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('insufficient') ||
    errorMessage.includes('exceeded')
  );
}

function getAnthropicModels() {
  return uniqueModels(
    process.env.ANTHROPIC_MODEL,
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-haiku-20240307'
  );
}

function getOpenAIModels() {
  return uniqueModels(
    process.env.OPENAI_MODEL,
    'gpt-4o-mini'
  );
}

function getProviderOrder() {
  const preferredProvider = (process.env.AI_PROVIDER || process.env.PREFERRED_AI_PROVIDER || 'openai').toLowerCase();

  if (preferredProvider === 'anthropic') {
    return ['anthropic', 'openai'];
  }

  return ['openai', 'anthropic'];
}

function uniqueModels(...models) {
  return models.filter((model, index) => model && models.indexOf(model) === index);
}

function isProviderAvailable(provider) {
  if (provider === 'openai') {
    return Boolean(openaiClient);
  }

  if (provider === 'anthropic') {
    return Boolean(anthropicClient) && !anthropicDisabled;
  }

  return false;
}

function hasFallbackProvider(currentProvider) {
  return PROVIDER_ORDER.some((provider) => provider !== currentProvider && isProviderAvailable(provider));
}

function isModelNotFoundError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorStatus = error.status || error.statusCode || 0;

  return (
    errorStatus === 404 ||
    errorMessage.includes('does not exist') ||
    errorMessage.includes('not_found_error') ||
    errorMessage.includes('model:') ||
    errorMessage.includes('unknown model')
  );
}

function normalizeProviderError(provider, error, model) {
  const errorMessage = error.message || 'Unknown error';
  const statusCode = error.status || error.statusCode;
  const message = statusCode
    ? `${provider} API error (${statusCode}) [model: ${model}]: ${errorMessage}`
    : `${provider} API error [model: ${model}]: ${errorMessage}`;

  const normalizedError = new Error(message);
  normalizedError.status = statusCode;
  normalizedError.statusCode = statusCode;
  return normalizedError;
}
