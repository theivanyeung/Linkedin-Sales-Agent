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

- **Local only**: All data processing happens locally in your browser
- **No external calls**: Extension doesn't make any API calls or send data anywhere
- **Clipboard only**: Data is only copied to your local clipboard
- **No storage**: No conversation data is permanently stored by the extension

## Development

The extension consists of:

- `manifest.json` - Extension configuration (Manifest V3)
- `content.js` - Main extraction logic that runs on LinkedIn pages
- `popup.html` - Extension popup UI
- `popup.js` - Popup functionality and status management

## Next Steps

This extension provides the message extraction foundation. The next phase would be to build:

1. **AI Response Generator**: Python script that takes extracted JSON and generates response suggestions
2. **Auto-fill Integration**: Automatically fill LinkedIn message boxes with AI-generated responses
3. **Knowledge Base Integration**: Include Prodicity-specific context for better responses

## Troubleshooting

- **No messages extracted**: LinkedIn may have changed their DOM structure. Check browser console for errors
- **Extension not working**: Ensure you're on a LinkedIn messaging thread page
- **Clipboard issues**: Check that the extension has clipboard permissions

## Legal Notice

This extension is for personal use only. Please respect LinkedIn's Terms of Service and use responsibly.
