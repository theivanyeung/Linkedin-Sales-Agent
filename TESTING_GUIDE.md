# How to Test Auto-Generation

## Step 1: Start AI Service

```bash
cd ai_module
python main.py
```

You should see:

```
Starting LinkedIn Sales Agent AI on 127.0.0.1:5000
```

## Step 2: Test Auto-Generation

1. **Open a LinkedIn conversation thread**
2. **Open extension popup** (click extension icon in toolbar)
3. **Watch the status messages** in the popup

You should see:

- Status changes to "Auto-generating..."
- Then "Response ready! Phase: building_rapport"
- Response appears in LinkedIn input field

## Step 3: Check Console Logs

Press F12 to open DevTools Console, look for:

```
✅ Auto-saved conversation: [threadId]
🚀 Triggering auto-generation...
🎯 Auto-generating AI response for thread: [threadId]
✓ AI service is healthy
✓ Got conversation data, generating response...
✓ Generated response: [response text]
✓ Found LinkedIn tab, injecting response...
✅ Auto-generated and injected response: [response text]
```

## Troubleshooting

### If Status Shows "AI not running":

- Start Python server: `cd ai_module && python main.py`
- Check it's running on http://127.0.0.1:5000

### If No Status Changes:

- Popup needs to be open for auto-generation to work
- Check browser console for errors

### If Response Doesn't Appear:

- Check browser console for errors
- Make sure you're on the LinkedIn messaging page
- The LinkedIn tab must be open

## Manual Test

If auto-generation isn't working:

1. Open LinkedIn conversation
2. Click "🤖 Generate Response" button
3. Response should appear

This will show if the AI service is working.

