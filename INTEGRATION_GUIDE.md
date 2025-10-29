# Integration Guide - AI Module with Chrome Extension

Complete guide showing how the AI module integrates with the Chrome extension to form a LinkedIn sales agent co-pilot.

## Architecture Flow

```
LinkedIn Conversation
    ↓
Extension Extracts (auto)
    ↓
Supabase Database (stores)
    ↓
Click "Generate Response"
    ↓
AI Module (Python) - analyzes conversation
    ↓
Returns suggested response
    ↓
Injected into LinkedIn input field
    ↓
You review and send manually ✓
```

## Complete Integration

### 1. Automatic Extraction & Storage

When you visit a LinkedIn conversation, the extension:

- Automatically detects the thread
- Extracts all messages from the DOM
- Saves to Supabase database
- Displays lead info in popup

**Code:** `popup.js` → `monitorUrlChanges()` → `autoSaveConversation()`

### 2. Manual AI Generation

You click the "🤖 Generate Response" button:

- Fetches conversation from Supabase
- Sends to AI module at `http://127.0.0.1:5000/generate`
- AI analyzes conversation phase (building_rapport or doing_the_ask)
- Returns suggested response
- Injects into LinkedIn input field
- Shows "🔄 Regenerate" button for another version

**Code:** `popup.js` → `generateAIResponse()` → `ai-service.js` → `generateAndInject()`

### 3. Conversation Analysis

The AI module analyzes:

- **Phase**: `building_rapport` (🤝) or `doing_the_ask` (💰)
- **Transition criteria**: Engagement, sentiment, message count, questions asked
- **Recommendation**: What to do next based on conversation state

**Code:** `conversation_analyzer.py` → `analyze_conversation_state()`

### 4. Response Generation

Based on phase:

- **building_rapport**: Asks questions, builds friendship, engages
- **doing_the_ask**: Introduces Prodicity, highlights value, addresses concerns

**Code:** `llm_service.py` → `generate_response()` → OpenAI GPT-4o

### 5. Manual Send

- You review the injected response
- Edit if needed
- Click "Regenerate" for another version
- Send when ready (you have full control!)

## How to Use

### Step 1: Start AI Module

```bash
cd ai_module
python main.py
```

Keep this running in a terminal.

### Step 2: Open LinkedIn Conversation

Navigate to any LinkedIn DM thread.

### Step 3: Save Conversation (auto or manual)

- Extension auto-saves when you open a thread
- Or click "Save to Cloud" to manually save

### Step 4: Generate Response

Click "🤖 Generate Response":

- Status shows: "Generating..."
- AI analyzes conversation
- Response injected into input field
- Shows phase (🤝 building_rapport or 💰 doing_the_ask)

### Step 5: Review & Regenerate (optional)

- Review the response in the LinkedIn input field
- Click "🔄 Regenerate" for another version
- Edit manually if needed

### Step 6: Send

- Click send in LinkedIn
- You maintain full control - nothing auto-sends!

## Data Flow

### Input to AI Module

```javascript
{
  "thread_id": "thread_123",
  "prospect_name": "Ivan",
  "messages": [
    {"sender": "you", "text": "hey Ivan, I'm looking at..."},
    {"sender": "prospect", "text": "Yeah! I'm building an app..."}
  ]
}
```

### AI Module Processing

1. **Analyze** → `conversation_analyzer.py`

   - Determine phase (building_rapport or doing_the_ask)
   - Extract prospect insights
   - Generate recommendation

2. **Generate** → `llm_service.py`

   - Build context with conversation history
   - Apply knowledge base (Prodicity info)
   - Generate response with GPT-4o
   - Keep under 200 chars, friendly tone

3. **Return** → Response text + phase + reasoning

### Output from AI Module

```json
{
  "response": "that's really cool—what sparked that idea?",
  "phase": "building_rapport",
  "reasoning": "Continue building rapport through questions about their projects and goals"
}
```

## Integration Points

### 1. `ai-service.js`

- Handles communication with Python backend
- Fetches conversation from Supabase
- Calls AI API endpoint
- Injects response into LinkedIn input

### 2. `popup.js`

- Initializes AIService
- Connects "Generate Response" button
- Shows status and phase info
- Handles regenerate button

### 3. `supabase-service.js`

- Stores conversations
- Fetches conversation data for AI

### 4. Python AI Module

- `main.py` - Flask API endpoints
- `llm_service.py` - OpenAI integration
- `conversation_analyzer.py` - Phase detection
- `knowledge_base.py` - Prodicity info
- `static_scripts.py` - Sales templates

## Two-Phase System

### Phase 1: Building Rapport 🤝

**Goal**: Build genuine friendship before selling

**What AI does**:

- Asks questions about their projects
- Shows interest and curiosity
- Keeps it short and friendly
- Relates to their situation
- **Never mentions Prodicity**

**When to transition to Phase 2**:

- 5+ messages exchanged
- Student asking questions (engaged)
- Positive sentiment
- Good engagement score

### Phase 2: Doing The Ask 💰

**Goal**: Introduce Prodicity and guide to application

**What AI does**:

- Naturally transitions from interests to Prodicity
- Highlights value proposition
- Addresses their specific needs
- Handles objections if they arise
- Guides toward application

**Stay in Phase 1 if**:

- Strong negative sentiment
- Student says "no" or "not interested"
- Low engagement

## Knowledge Base

The AI has access to:

- **Value Prop**: Help students ship outcomes (startups, research, internships)
- **Pricing**: $3,910 total ($1K deposit, $485/mo Jan-Jun)
- **Timeline**: Winter-spring, light workload
- **Aid**: Available if needed
- **Community**: Other ambitious students building

**Source:** `knowledge_base.py`

## Error Handling

### AI Service Not Available

- Error: "AI service is not available"
- Fix: Make sure `python main.py` is running

### No Conversation Data

- Error: "No conversation data found"
- Fix: Click "Save to Cloud" first

### OpenAI API Key Missing

- Error: "OPENAI_API_KEY not set"
- Fix: Add key to `ai_module/.env`

## Testing

### 1. Test Simulator

```bash
cd ai_module
python test_sales_simulator.py
```

Role-play as a prospect to test the AI's sales flow.

### 2. Test in Extension

1. Start AI service
2. Open LinkedIn conversation
3. Click "Generate Response"
4. Verify response in input field
5. Test "Regenerate" button

## Next Steps

- Fine-tune phase transition criteria in `conversation_analyzer.py`
- Adjust response length in `config.py`
- Customize scripts in `static_scripts.py`
- Add more knowledge base content in `knowledge_base.py`

## Files Involved

**Extension:**

- `popup.html` - UI with Generate/Regenerate buttons
- `popup.js` - Event handlers and integration
- `ai-service.js` - AI API communication
- `supabase-service.js` - Database operations

**AI Module:**

- `main.py` - Flask API server
- `llm_service.py` - Response generation
- `conversation_analyzer.py` - Phase detection
- `knowledge_base.py` - Prodicity info
- `static_scripts.py` - Sales templates

All integrated and working together! 🚀

