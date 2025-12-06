# Upgrade OpenAI SDK to Use Responses API

## Issue

Your current OpenAI SDK version doesn't support the Responses API, which is required for reasoning models like `gpt-5.1` and `o1`.

**Error:** `'OpenAI' object has no attribute 'responses'`

## Solution

Upgrade the OpenAI SDK to the latest version:

```bash
pip install --upgrade openai
```

This will install a version that includes the Responses API.

## Verify Installation

After upgrading, verify the Responses API is available:

```python
from openai import OpenAI
client = OpenAI()
print(hasattr(client, 'responses'))  # Should print True
```

## Alternative: Use Non-Reasoning Models

If you can't upgrade right now, you can use non-reasoning models that use the `chat.completions` API:

- `gpt-4o` (recommended)
- `gpt-4-turbo`
- `gpt-3.5-turbo`

These models work with older SDK versions and don't require the Responses API.

## Update Your Configuration

If you want to use a non-reasoning model temporarily, update your `.env` file:

```bash
OPENAI_MODEL=gpt-4o
```

Or in your code:

```python
client = ResponsesClient(model="gpt-4o")
```

## Why Upgrade?

The Responses API provides:

- Better support for reasoning models (gpt-5.1, o1, etc.)
- More efficient API structure
- Latest features and improvements
- Better error handling

## Check Your Current Version

```bash
pip show openai
```

Look for a version number. The Responses API was added in recent versions (around 1.40+).


