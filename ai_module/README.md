# LinkedIn Sales Agent AI Module

Python AI service for generating natural sales conversation responses using LangChain and GPT-4o.

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
FLASK_HOST=127.0.0.1
FLASK_PORT=5000
FLASK_DEBUG=True
```

### 3. Test the AI (Recommended)

Test the AI before using it in production:

```bash
python test_sales_simulator.py
```

You'll role-play as a student prospect while the AI tries to sell you Prodicity!

**Commands:**

- Type your message to respond as the prospect
- `analyze` - Show conversation analysis
- `history` - View full conversation
- `ai` - Force AI to respond
- `exit` - Quit simulator

### 4. Run the AI Service

```bash
python main.py
```

The service will start on `http://127.0.0.1:5000`

## API Endpoints

### `POST /generate`

Generate a sales conversation response.

**Request:**

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

**Response:**

```json
{
  "response": "That's awesome! Tell me more about your startup.",
  "strategy": "rapport_build",
  "reasoning": "Build rapport through questions about their projects",
  "engagement_score": 0.7,
  "sentiment_score": 0.8,
  "phase": "rapport_build",
  "next_action": "continue_building_rapport",
  "is_ready_for_sell": false
}
```

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
2. **Analysis**:
   - Sentiment analysis (positive/negative keywords)
   - Engagement scoring (message length, personal pronouns)
   - Phase detection (initial → rapport → sell)
3. **Context Building**:
   - Recent conversation history
   - Knowledge base (Prodicity info)
   - Sales principles and static scripts
4. **Generation**:
   - GPT-4o generates natural, short response
   - Based on current conversation phase
   - Personalized to prospect's interests
5. **Output**: Suggested response text with strategy and reasoning

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
├── main.py                    # Flask app
├── llm_service.py            # OpenAI integration
├── conversation_analyzer.py  # Sentiment & phase detection
├── static_scripts.py          # Sales scripts
├── knowledge_base.py          # Prodicity info
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
