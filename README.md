# LinkedIn Message Extractor

A Chrome extension that automatically extracts LinkedIn conversation messages for sales automation.

## Features

- **Auto-extraction**: Automatically detects when you switch LinkedIn conversations and extracts messages
- **Manual extraction**: Click the extension button to manually extract current conversation
- **Clipboard integration**: Extracted data is automatically copied to your clipboard as JSON
- **Stealth operation**: Uses only DOM reading, no API calls to avoid detection
- **Real-time status**: Shows extraction status and last extraction details

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your Chrome toolbar

## Usage

1. Navigate to any LinkedIn conversation thread (e.g., `https://www.linkedin.com/messaging/thread/...`)
2. The extension will automatically detect the conversation and extract messages
3. Switch to another conversation - the extension will auto-extract the new thread
4. Click the extension icon to manually extract or view status
5. Extracted data is automatically copied to your clipboard as JSON

## Data Format

The extension extracts conversation data in this JSON format:

```json
{
  "threadId": "conversation-thread-id",
  "timestamp": "2025-01-27T10:30:00.000Z",
  "url": "https://www.linkedin.com/messaging/thread/...",
  "messages": [
    {
      "index": 0,
      "text": "Hello! Thanks for connecting.",
      "isFromYou": false,
      "timestamp": "10:30 AM",
      "element": {
        "tagName": "DIV",
        "className": "msg-s-event-list__msg",
        "id": ""
      }
    }
  ]
}
```

## Privacy & Security

- **Local AI**: AI service runs on your local machine
- **Database**: Conversations stored in your Supabase database
- **Manual Send**: All responses require manual review and send
- **No Auto-Posting**: Extension never automatically sends messages
- **API Keys**: Stored locally in Python environment, never exposed to extension

## Development

The extension consists of:

- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Background service worker
- `popup.html` - Extension popup UI
- `popup.js` - Popup functionality and status management
- `supabase-config.js` - Supabase configuration
- `supabase-service.js` - Database operations
- `ai-service.js` - AI API integration
- `ai_module/` - Python AI service (separate README)

## AI Module (NEW!)

This extension now includes an AI module for generating intelligent sales responses.

### Quick Start

1. **Install Python dependencies:**

```bash
cd ai_module
pip install -r requirements.txt
```

2. **Configure OpenAI API key:**
   Create `.env` file in `ai_module/` directory:

```
OPENAI_API_KEY=your_key_here
```

3. **Test the AI (recommended):**

```bash
python test_sales_simulator.py
```

You'll role-play as a prospect while the AI tries to sell you Prodicity!

4. **Start the AI service:**

```bash
python main.py
```

5. **Use in extension:**

- Open LinkedIn conversation
- Click "🤖 Generate Response" button
- AI fills the input field (review and send manually)

See `ai_module/README.md` for complete setup and API documentation.

## Troubleshooting

- **No messages extracted**: LinkedIn may have changed their DOM structure. Check browser console for errors
- **Extension not working**: Ensure you're on a LinkedIn messaging thread page
- **Clipboard issues**: Check that the extension has clipboard permissions

## Legal Notice

This extension is for personal use only. Please respect LinkedIn's Terms of Service and use responsibly.

