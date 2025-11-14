# Data Extraction Verification

## Data Flow

### 1. Content Script Extraction (`content-script.js`)

**Extracted Fields:**
- ✅ `threadId` - From URL
- ✅ `url` - Current page URL
- ✅ `title` - Prospect name (cleaned)
- ✅ `description` - Prospect title/headline (cleaned)
- ✅ `timestamp` - ISO timestamp
- ✅ `messageCount` - Number of messages
- ✅ `participants` - Array of participant names
- ✅ `statistics` - Message statistics object
- ✅ `messages` - Array of message objects

**Message Object Structure:**
- ✅ `index` - Message position
- ✅ `text` - Message text content
- ✅ `sender` - "you" or "prospect"
- ✅ `attachments` - Array of attachment objects
- ✅ `reactions` - Array of reaction objects
- ✅ `mentions` - Array of mention strings
- ✅ `links` - Array of link objects

### 2. Popup Processing (`popup.js`)

**Data Received from Content Script:**
- All fields from extraction are preserved
- Additional processing:
  - Placeholders extraction (from initial message)
  - Status assignment

### 3. Supabase Storage (`supabase-service.js`)

**Saved Fields:**
- ✅ `thread_id` - Maps from `threadId`
- ✅ `url` - Preserved
- ✅ `title` - Preserved (or existing if updating)
- ✅ `description` - Preserved (or existing if updating)
- ✅ `messages` - Normalized array
- ✅ `message_count` - Count of messages
- ✅ `status` - Conversation status
- ✅ `placeholders` - JSONB object
- ✅ `created_at` - Timestamp (new records)
- ✅ `updated_at` - Timestamp (always updated)

**Message Normalization:**
- ✅ `index` - Reindexed if needed
- ✅ `text` - Preserved
- ✅ `sender` - Preserved ("you" or "prospect")
- ✅ `attachments` - Array preserved
- ✅ `reactions` - Array preserved
- ✅ `mentions` - Array preserved
- ✅ `links` - Array preserved

## Console Logging Added

### 1. Extraction Logging (`popup.js` - `extractConversationFromActiveTab`)
**Tag:** `EXTRACTION`
**Shows:**
- threadId
- title
- description (preview)
- messageCount
- participants
- hasStatistics
- url
- timestamp
- sampleMessages (first 3) with previews

### 2. Pre-Save Logging (`popup.js` - `persistConversation`)
**Tag:** `DB` - "Preparing to save to Supabase"
**Shows:**
- threadId
- title
- description (preview)
- messageCount
- url
- hasPlaceholders
- placeholders object
- status
- participants
- hasStatistics
- messagesPreview (first 3) with details

### 3. Supabase Save Logging (`supabase-service.js` - `saveConversation`)
**Tag:** `DB` - "Saving to Supabase (INSERT)" or "Saving to Supabase (UPDATE)"
**Shows:**
- threadId
- title
- description (preview)
- messageCount
- url
- status
- placeholders
- messagesSample (first 3) with full details
- totalMessages

## Verification Checklist

When testing, check the console logs for:

1. **Extraction Phase:**
   - ✅ Title is extracted (not "Unknown")
   - ✅ Description is extracted (if available)
   - ✅ Message count matches visible messages
   - ✅ Messages have correct sender ("you" vs "prospect")
   - ✅ Messages have text content
   - ✅ Attachments/reactions/links are captured if present

2. **Pre-Save Phase:**
   - ✅ All extraction data is present
   - ✅ Placeholders are extracted (if initial message exists)
   - ✅ Status is set

3. **Supabase Save Phase:**
   - ✅ Data matches pre-save data
   - ✅ Messages are normalized correctly
   - ✅ All fields are present in payload

## Testing Instructions

1. Open LinkedIn conversation
2. Open extension popup
3. Click "Extract" or let auto-extraction run
4. Check console logs in popup UI
5. Verify:
   - EXTRACTION log shows all data
   - DB "Preparing to save" shows same data
   - DB "Saving to Supabase" shows final payload
   - All fields are present and correct

## Data Completeness

All necessary data is extracted and saved:
- ✅ Title (prospect name)
- ✅ Description (prospect title/headline)
- ✅ Messages (full content with metadata)
- ✅ Attachments
- ✅ Reactions
- ✅ Links
- ✅ Mentions
- ✅ Thread ID
- ✅ URL
- ✅ Placeholders (from initial message)
- ✅ Status




