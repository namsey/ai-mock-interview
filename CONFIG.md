# Configuration Guide

## Overview

All AI model and provider configurations are managed through the `config.json` file. This makes it easy to change models, enable/disable providers, and adjust settings without modifying code.

## Configuration File: config.json

### Structure

```json
{
  "ai": {
    "providers": {
      "openai": {
        "enabled": true,
        "models": ["gpt-4o-mini", "gpt-3.5-turbo"]
      },
      "anthropic": {
        "enabled": false,
        "models": ["claude-sonnet-4-5", "claude-haiku-4-5"]
      }
    },
    "preferredProvider": "openai",
    "maxTokens": 256
  }
}
```

### Configuration Options

#### Provider Settings

**`providers.openai.enabled`** (boolean)
- Set to `true` to enable OpenAI API
- Set to `false` to disable OpenAI API
- Default: `true`

**`providers.openai.models`** (array)
- List of OpenAI models to try in order
- The system will try each model until one succeeds
- Common models:
  - `gpt-4o-mini` (recommended, cost-effective)
  - `gpt-4o` (more capable, higher cost)
  - `gpt-3.5-turbo` (fastest, lowest cost)

**`providers.anthropic.enabled`** (boolean)
- Set to `true` to enable Anthropic API
- Set to `false` to disable Anthropic API
- Default: `false`

**`providers.anthropic.models`** (array)
- List of Anthropic models to try in order
- Common models:
  - `claude-sonnet-4-5` (balanced performance)
  - `claude-haiku-4-5` (fast, cost-effective)
  - `claude-3-haiku-20240307` (legacy fallback)

#### General Settings

**`preferredProvider`** (string)
- Which provider to try first: `"openai"` or `"anthropic"`
- The system will automatically fall back to the other provider if the preferred one fails
- Default: `"openai"`

**`maxTokens`** (number)
- Maximum number of tokens to generate per response
- Higher values allow longer responses but cost more
- Default: `256`

## How It Works

### Provider Fallback

1. The system tries the **preferred provider** first (based on `preferredProvider`)
2. If that provider is disabled or fails, it automatically falls back to the other provider
3. Within each provider, it tries each configured model in order

### Model Fallback

If a specific model fails (e.g., not available, quota exceeded):
1. The system tries the next model in the list
2. If all models for a provider fail, it moves to the next provider
3. Only fails completely if all providers and models have been exhausted

## Common Configuration Scenarios

### Scenario 1: OpenAI Only (Default)

```json
{
  "ai": {
    "providers": {
      "openai": {
        "enabled": true,
        "models": ["gpt-4o-mini"]
      },
      "anthropic": {
        "enabled": false,
        "models": []
      }
    },
    "preferredProvider": "openai",
    "maxTokens": 256
  }
}
```

### Scenario 2: Anthropic Only

```json
{
  "ai": {
    "providers": {
      "openai": {
        "enabled": false,
        "models": []
      },
      "anthropic": {
        "enabled": true,
        "models": ["claude-sonnet-4-5", "claude-haiku-4-5"]
      }
    },
    "preferredProvider": "anthropic",
    "maxTokens": 256
  }
}
```

### Scenario 3: Both Providers with Fallback

```json
{
  "ai": {
    "providers": {
      "openai": {
        "enabled": true,
        "models": ["gpt-4o-mini", "gpt-3.5-turbo"]
      },
      "anthropic": {
        "enabled": true,
        "models": ["claude-sonnet-4-5", "claude-haiku-4-5"]
      }
    },
    "preferredProvider": "openai",
    "maxTokens": 256
  }
}
```

### Scenario 4: Multiple OpenAI Models with Fallback

```json
{
  "ai": {
    "providers": {
      "openai": {
        "enabled": true,
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]
      },
      "anthropic": {
        "enabled": false,
        "models": []
      }
    },
    "preferredProvider": "openai",
    "maxTokens": 512
  }
}
```

## How to Change Configuration

### Step 1: Edit config.json

Open `config.json` in your editor and modify the settings according to your needs.

### Step 2: Ensure API Keys are Set

Make sure you have the required API keys in your `.env.local` file:

```bash
# For OpenAI
OPENAI_API_KEY=sk-proj-your-actual-key

# For Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key
```

### Step 3: Restart the Application

If the application is running, restart it to load the new configuration:

```bash
npm run dev
```

## Troubleshooting

### "No AI providers available" Error

**Cause:** No providers are enabled in config.json or no API keys are set

**Solution:**
1. Check that at least one provider is enabled in `config.json`
2. Verify the corresponding API key is set in `.env.local`

### "All configured models failed" Error

**Cause:** All models in the provider's list are unavailable or invalid

**Solution:**
1. Check that model names are correct
2. Verify your API account has access to these models
3. Try adding fallback models to the list

### Provider Not Working After Changes

**Cause:** Configuration file not loaded or application not restarted

**Solution:**
1. Restart the development server
2. Check logs for JSON parsing errors in `config.json`

## Best Practices

1. **Always keep at least one provider enabled** to ensure the application works
2. **List models from most preferred to least preferred** in the models array
3. **Use multiple models** as fallbacks to improve reliability
4. **Start with cost-effective models** (like gpt-4o-mini) and add premium models as fallbacks if needed
5. **Set reasonable maxTokens** to balance response quality and cost

## Example: Adding a New Model

To add a new model (e.g., `gpt-4`), simply add it to the models array:

```json
{
  "ai": {
    "providers": {
      "openai": {
        "enabled": true,
        "models": ["gpt-4", "gpt-4o-mini", "gpt-3.5-turbo"]
      }
    }
  }
}
```

The system will try `gpt-4` first, then fall back to `gpt-4o-mini`, then `gpt-3.5-turbo` if needed.
