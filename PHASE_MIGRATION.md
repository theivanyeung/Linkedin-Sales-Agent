# Phase Storage Migration Guide

## Overview

The `phase` field is now stored in Supabase to support the Permission Gate feature. This allows the system to track whether a conversation is in "building_rapport" or "doing_the_ask" phase and require human approval before transitioning to the selling phase.

## Database Migration

You need to add a `phase` column to your Supabase `conversations` table.

### SQL Migration

Run this SQL in your Supabase SQL Editor:

```sql
-- Add phase column to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'building_rapport';

-- Add check constraint to ensure valid phase values
ALTER TABLE conversations
ADD CONSTRAINT check_phase_values
CHECK (phase IN ('building_rapport', 'doing_the_ask'));

-- Update existing rows to have default phase
UPDATE conversations
SET phase = 'building_rapport'
WHERE phase IS NULL;
```

## What Was Changed

### 1. `supabase-service.js`

- **Save**: Now saves `phase` field when saving/updating conversations
- **Retrieve**: Retrieves `phase` from Supabase (defaults to `'building_rapport'` if not set)
- **Preserve**: Preserves existing phase when updating conversations (unless explicitly provided)

### 2. `ai-service.js`

- **Request**: Sends `current_phase` from conversation data to the AI module
- **Approval**: Handles `confirm_phase_change` parameter for approval flow
- **Response**: Detects `status="approval_required"` and returns it to caller

### 3. `popup.js`

- **Approval Dialog**: New `showPhaseApprovalDialog()` function shows a modal when approval is needed
- **Phase Update**: New `updatePhaseInSupabase()` function updates phase in database
- **Generate Flow**: Updated `generateResponse()` to handle approval flow:
  - Shows approval dialog when `status="approval_required"`
  - Updates phase in Supabase based on user decision
  - Re-calls AI service with `confirm_phase_change` flag
- **Auto-Generate**: Updated `autoGenerateFromCloud()` and `autoGenerateResponse()` to skip approval (auto-generate doesn't require approval)

## How It Works

1. **Initial State**: New conversations default to `phase='building_rapport'`

2. **AI Analysis**: When AI determines `move_forward=True`:

   - If `current_phase == "building_rapport"` and no approval given → Returns `status="approval_required"`
   - Frontend shows approval dialog
   - User approves → Phase updated to `"doing_the_ask"`, pitch generated
   - User rejects → Phase stays `"building_rapport"`, rapport message generated

3. **Phase Persistence**: Phase is stored in Supabase and retrieved on each request, ensuring consistency across sessions

## Testing

After running the migration:

1. Open a LinkedIn conversation
2. Click "Generate Response"
3. If AI wants to transition to selling phase, you should see an approval dialog
4. Check Supabase - the `phase` field should be updated based on your decision

## Notes

- Auto-generate functions skip approval (they just log it) to avoid blocking background processes
- Manual "Generate Response" button requires approval for phase transitions
- Phase is preserved when updating conversations (won't overwrite unless explicitly set)




