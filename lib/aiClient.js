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
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const OPENAI_MODEL = 'gpt-4-turbo-preview';

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

  // Try Anthropic first (if configured)
  if (anthropicClient) {
    try {
      const response = await callAnthropic(messages, maxTokens);
      logInfo('AI Client', 'Successfully used Anthropic API');
      return response;
    } catch (error) {
      logError('AI Client', 'Anthropic API failed', error);
      lastError = error;
      
      // If OpenAI is not available as fallback, throw the error immediately
      if (!openaiClient) {
        throw error;
      }
      
      logWarn('AI Client', 'Attempting fallback to OpenAI...');
    }
  }

  // Try OpenAI as fallback (or first choice if Anthropic not configured)
  if (openaiClient) {
    try {
      const response = await callOpenAI(messages, maxTokens);
      logInfo('AI Client', 'Successfully used OpenAI API');
      return response;
    } catch (error) {
      logError('AI Client', 'OpenAI API failed', error);
      lastError = error;
      
      // If Anthropic wasn't configured or already failed, throw the OpenAI error
      if (!anthropicClient || isExhaustedError(error)) {
        throw error;
      }
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
  try {
    const response = await anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: messages
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
    // Add context to the error
    const errorMessage = error.message || 'Unknown error';
    const statusCode = error.status || error.statusCode;
    
    if (statusCode) {
      throw new Error(`Anthropic API error (${statusCode}): ${errorMessage}`);
    }
    throw new Error(`Anthropic API error: ${errorMessage}`);
  }
}

/**
 * Calls OpenAI API
 */
async function callOpenAI(messages, maxTokens) {
  try {
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: messages
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
    // Add context to the error
    const errorMessage = error.message || 'Unknown error';
    const statusCode = error.status || error.statusCode;
    
    if (statusCode) {
      throw new Error(`OpenAI API error (${statusCode}): ${errorMessage}`);
    }
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }
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
