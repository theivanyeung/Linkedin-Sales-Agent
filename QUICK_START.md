# Quick Start Guide - LinkedIn Sales Agent

Complete setup guide to get your AI-powered LinkedIn sales agent running.

## Prerequisites

- Python 3.8+
- Google Chrome browser
- OpenAI API key
- Supabase project (already configured)

## Step 1: Set Up AI Module

### 1.1 Install Dependencies

```bash
cd ai_module
pip install -r requirements.txt
```

### 1.2 Configure Environment

```bash
# Create .env file
cp env_template.txt .env

# Edit .env and add your OPENAI_API_KEY
# OPENAI_API_KEY=your_key_here
```

### 1.3 Test the AI (Recommended)

Test the AI before using it in the extension:

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

### 1.4 Start AI Service

```bash
python main.py
```

You should see:

```
Starting LinkedIn Sales Agent AI on 127.0.0.1:5000
OpenAPI Model: gpt-4o
Temperature: 0.7
```

## Step 2: Load Chrome Extension

### 2.1 Open Extension Manager

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right)

### 2.2 Load Extension

1. Click "Load unpacked"
2. Select the project directory (`Linkedin-Sales-Agent/`)
3. Extension should appear in your toolbar

## Step 3: Use the Extension

### 3.1 Navigate to LinkedIn

1. Go to a LinkedIn conversation thread
2. Click the extension icon in your toolbar
3. Extension popup will open

### 3.2 Save Conversation

1. Click "Save to Cloud" button
2. Wait for success message
3. Conversation now saved to Supabase

### 3.3 Generate AI Response

1. Make sure Python AI service is running (Step 1.3)
2. Click "🤖 Generate Response" button
3. AI analyzes conversation and generates response
4. Response appears in LinkedIn input field
5. Review and send manually (you have full control!)

## How It Works

1. **Extraction**: Extension extracts conversation from LinkedIn DOM
2. **Storage**: Conversation saved to Supabase database
3. **AI Generation**: Python service analyzes conversation and generates response
4. **Injection**: Response injected into LinkedIn input field
5. **Manual Send**: You review and send the response

## Troubleshooting

### AI Service Not Available

**Problem**: "AI service is not available" error

**Solution**:

- Check Python service is running: `python main.py`
- Verify it's on http://127.0.0.1:5000
- Check OpenAI API key in .env

### No Conversation Data

**Problem**: "No conversation data found"

**Solution**:

- Make sure you clicked "Save to Cloud" first
- Reload the extension popup
- Check Supabase connection

### Response Not Injected

**Problem**: Button says "Success" but nothing in input field

**Solution**:

- Make sure you're on a LinkedIn messaging page
- Check browser console for errors
- Try clicking "Test Message Input" button to verify DOM access

## Configuration

### Change AI Service URL

Edit `ai-service.js`:

```javascript
this.baseUrl = "http://your-custom-url:port";
```

Or use environment variable:

```javascript
const config = await chrome.storage.sync.get("aiServiceUrl");
```

### Adjust Response Length

Edit `ai_module/config.py`:

```python
MAX_RESPONSE_LENGTH = 200  # Characters
```

### Modify Sales Scripts

Edit `ai_module/static_scripts.py` to customize:

- Initial message template
- Rapport building prompts
- Sales phase scripts

## API Endpoints

### Health Check

```bash
curl http://127.0.0.1:5000/health
```

### Generate Response

```bash
curl -X POST http://127.0.0.1:5000/generate \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"test","prospect_name":"John","messages":[]}'
```

## Next Steps

- Customize `ai_module/knowledge_base.py` with your product details
- Adjust `ai_module/conversation_analyzer.py` for different engagement thresholds
- Add custom scripts in `ai_module/static_scripts.py`

## Support

- Check `ai_module/README.md` for AI module details
- Check `README.md` for extension details
- Review browser console and Python terminal for error logs
