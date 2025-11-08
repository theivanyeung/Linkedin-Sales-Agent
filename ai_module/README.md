# LinkedIn Sales Agent AI Module

Minimal, modern AI analysis and decisioning using OpenAI Responses API (default model via `OPENAI_MODEL`).

## Overview

This module analyzes LinkedIn conversation context, applies static sales scripts, and generates contextually appropriate responses that build rapport and time the sales ask perfectly.

## Architecture

- **Flask REST API**: Server running on `http://127.0.0.1:5000`
- **OpenAI GPT-4o**: LLM for response generation
- **Conversation Analysis**: Sentiment and engagement scoring
- **Static Scripts**: Sales templates and knowledge base

## Setup

### 1. Install Dependencies

```bash
cd ai_module
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the `ai_module` directory:

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional (defaults shown)
OPENAI_MODEL=gpt-5
```

### 3. Test the AI (Simulator)

Run the CLI simulator (you play the engaged lead):

```bash
python -m ai_module.simulator
```

- Type messages as the prospect
- `/analyze` or `/phase` to view analysis
- `/exit` to quit

### 4. Run the AI Service

```bash
python main.py
```

The service will start on `http://127.0.0.1:5000`

## API Endpoints

### `POST /analyze`

Analyze conversation state without generating response.

```json
{
  "thread_id": "thread_123",
  "prospect_name": "John Doe",
  "messages": [
    {
      "sender": "you",
      "text": "Hey! What's up?",
      "timestamp": "10:30 AM"
    },
    {
      "sender": "prospect",
      "text": "Working on my startup!",
      "timestamp": "10:35 AM"
    }
  ],
  "app_link": "https://..." // optional
}
```

**Response:** Unified JSON with phase, readiness, scores, signals, criteria, recommendation.

### `GET /health`

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "service": "LinkedIn Sales Agent AI"
}
```

### `POST /analyze`

Analyze conversation state without generating response.

## How It Works

1. **Input**: Conversation history from Supabase
2. **Single-pass LLM analysis** (OpenAI Responses API): phase, sentiment, engagement, questions, negative signals, recommendation
3. **Readiness gate**: deterministic thresholds for sell timing
4. **Output**: Unified JSON for extension/backend

## Sales Principles

- **Short messages**: Max 200 characters
- **Friend-like tone**: Casual, engaging, not salesy
- **Build rapport first**: Establish relationship before selling
- **Perfect timing**: Only sell when engagement is at peak
- **Natural conversations**: Dynamic personalization

## Conversation Phases

1. **Initial**: First contact, gauge interest
2. **Rapport Build**: Build relationship through questions
3. **Sell Trigger**: Introduce Prodicity when engagement peaks
4. **Handle Response**: Address objections or questions
5. **Close**: Final ask for application

## Knowledge Base

Contains:

- **Value Proposition**: Core offer and mission
- **Business Model**: Pricing ($3,910 total, $1K deposit, $485/mo)
- **Program Details**: Timeline, workload, outcomes
- **Sales Scripts**: Initial message, rapport building, sell phase
- **Common Objections**: Pre-built responses

## Static Scripts

Located in `static_scripts.py`:

- Initial message template (personalized)
- Rapport building prompts (dynamic)
- Sales phase scripts (hybrid static+dynamic)
- Conversation phase definitions

## Integration with Chrome Extension

The extension calls this service to:

1. Get conversation from Supabase
2. Call `/generate` endpoint
3. Inject response into LinkedIn input field
4. User reviews and sends manually

## Troubleshooting

**Error: "AI service is not available"**

- Make sure Python server is running
- Check that port 5000 is not in use
- Verify FLASK_HOST and FLASK_PORT in .env

**Error: "Missing OpenAI API key"**

- Add `OPENAI_API_KEY` to .env file
- Restart the service

**Generated responses too long**

- Adjust `MAX_RESPONSE_LENGTH` in config.py
- Reduce `MAX_TOKENS` in config.py

## Development

### Project Structure

```
ai_module/
├── __init__.py
├── llm_service.py            # OpenAI Responses API wrapper
├── analyzer.py               # Single-pass analysis
├── policies/readiness.py     # Deterministic gate
├── orchestrator.py           # Pipeline
├── static_scripts.py         # Stubs for scripts
├── knowledge_base.py         # Stub KB retriever
├── io_models.py              # Data models
├── ingest.py                 # Normalization
├── simulator.py              # CLI simulator
├── config.py                  # Configuration
├── requirements.txt           # Dependencies
└── README.md                  # This file
```

### Testing

```bash
# Test health endpoint
curl http://127.0.0.1:5000/health

# Test generate endpoint
curl -X POST http://127.0.0.1:5000/generate \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"test","prospect_name":"John","messages":[]}'
```

## License

Same as main project license.
