/**
 * lib/aiClient.js
 *
 * Unified AI client that reads configuration from config.json
 * Supports both Anthropic and OpenAI APIs with automatic fallback
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logError, logWarn, logInfo } from './logger.js';
import fs from 'fs';
import path from 'path';

// Load configuration from config.json
let config;
try {
  const configPath = path.join(process.cwd(), 'config.json');
  const configFile = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configFile);
} catch (error) {
  logError('AI Client', 'Failed to load config.json, using defaults', error);
  config = {
    ai: {
      providers: {
        openai: { enabled: true, models: ['gpt-4o-mini'] },
        anthropic: { enabled: false, models: ['claude-sonnet-4-5'] }
      },
      preferredProvider: 'openai',
      maxTokens: 256
    }
  };
}

// Initialize clients based on configuration
const anthropicClient = config.ai.providers.anthropic.enabled && process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const openaiClient = config.ai.providers.openai.enabled && process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Get model lists from config
const ANTHROPIC_MODELS = config.ai.providers.anthropic.models || [];
const OPENAI_MODELS = config.ai.providers.openai.models || [];

// Support both old format (number) and new format (object with different token limits)
const DEFAULT_MAX_TOKENS = typeof config.ai.maxTokens === 'number' 
  ? config.ai.maxTokens 
  : config.ai.maxTokens?.followUpQuestion || 256;

// Determine provider order based on config
const PROVIDER_ORDER = getProviderOrder();

// Track if providers should be disabled during runtime
let anthropicDisabled = false;
let openaiDisabled = false;

/**
 * Sends a message to AI providers with automatic fallback
 * @param {Array} messages - Array of message objects with role and content
 * @param {number} maxTokens - Maximum tokens to generate (defaults to config value)
 * @returns {Promise<string>} - The generated response text
 */
export async function sendMessage(messages, maxTokens = DEFAULT_MAX_TOKENS) {
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

  // Validate that at least one provider is available
  if (!isProviderAvailable('openai') && !isProviderAvailable('anthropic')) {
    throw new Error('No AI providers available. Check config.json and ensure at least one provider is enabled with a valid API key in .env.local');
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

      // Disable provider for this session if models are not found
      if (isModelNotFoundError(error)) {
        if (provider === 'anthropic') {
          anthropicDisabled = true;
          logWarn('AI Client', 'Disabling Anthropic for this session - no configured models available');
        } else if (provider === 'openai') {
          openaiDisabled = true;
          logWarn('AI Client', 'Disabling OpenAI for this session - no configured models available');
        }
      }

      if (!hasFallbackProvider(provider)) {
        throw error;
      }

      logWarn('AI Client', `Attempting fallback from ${provider} to another provider...`);
    }
  }

  // If we get here, all providers failed
  logError('AI Client', 'All AI providers failed', lastError);
  throw lastError || new Error('All AI providers failed');
}

/**
 * Calls Anthropic API with configured models
 */
async function callAnthropic(messages, maxTokens) {
  if (ANTHROPIC_MODELS.length === 0) {
    throw new Error('No Anthropic models configured in config.json');
  }

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

      logWarn('AI Client', `Anthropic model '${model}' unavailable, trying next model...`);
    }
  }

  throw lastError || new Error('Anthropic API error: All configured models failed');
}

/**
 * Calls OpenAI API with configured models
 */
async function callOpenAI(messages, maxTokens) {
  if (OPENAI_MODELS.length === 0) {
    throw new Error('No OpenAI models configured in config.json');
  }

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

      logWarn('AI Client', `OpenAI model '${model}' unavailable, trying next model...`);
    }
  }

  throw lastError || new Error('OpenAI API error: All configured models failed');
}

/**
 * Gets provider order based on config
 */
function getProviderOrder() {
  const preferred = config.ai.preferredProvider?.toLowerCase() || 'openai';
  const enabledProviders = [];

  if (config.ai.providers.openai?.enabled) {
    enabledProviders.push('openai');
  }

  if (config.ai.providers.anthropic?.enabled) {
    enabledProviders.push('anthropic');
  }

  // Sort to put preferred provider first
  return enabledProviders.sort((a, b) => {
    if (a === preferred) return -1;
    if (b === preferred) return 1;
    return 0;
  });
}

/**
 * Checks if a provider is available and enabled
 */
function isProviderAvailable(provider) {
  if (provider === 'openai') {
    return config.ai.providers.openai?.enabled && Boolean(openaiClient) && !openaiDisabled;
  }

  if (provider === 'anthropic') {
    return config.ai.providers.anthropic?.enabled && Boolean(anthropicClient) && !anthropicDisabled;
  }

  return false;
}

/**
 * Checks if there's a fallback provider available
 */
function hasFallbackProvider(currentProvider) {
  return PROVIDER_ORDER.some((provider) => provider !== currentProvider && isProviderAvailable(provider));
}

/**
 * Checks if error indicates model not found
 */
function isModelNotFoundError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorStatus = error.status || error.statusCode || 0;

  return (
    errorStatus === 404 ||
    errorMessage.includes('does not exist') ||
    errorMessage.includes('not_found_error') ||
    errorMessage.includes('model_not_found') ||
    errorMessage.includes('unknown model')
  );
}

/**
 * Normalizes provider errors to consistent format
 */
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
