-- Migration: Add reminded_at field to conversations table
-- This field tracks when a conversation was reminded via the follow-up module
-- Once reminded, conversations will not appear in follow-up lists again

-- Add the reminded_at column as a nullable timestamp
-- NULL means not reminded, a timestamp means it was reminded at that time
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ NULL;

-- Add a comment to document the field
COMMENT ON COLUMN conversations.reminded_at IS 
  'Timestamp when the conversation was reminded via follow-up module. NULL means not reminded yet.';

-- Create an index for faster queries when filtering out reminded conversations
CREATE INDEX IF NOT EXISTS idx_conversations_reminded_at 
ON conversations(reminded_at) 
WHERE reminded_at IS NOT NULL;

-- Optional: Create a composite index for common follow-up queries
-- This optimizes queries that filter by status, updated_at, and reminded_at
CREATE INDEX IF NOT EXISTS idx_conversations_followup_query 
ON conversations(status, updated_at, reminded_at) 
WHERE reminded_at IS NULL;
