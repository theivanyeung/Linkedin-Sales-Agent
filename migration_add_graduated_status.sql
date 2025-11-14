-- ============================================================================
-- Migration: Add 'graduated' status to conversations table
-- Run this in your Supabase SQL editor
-- ============================================================================

-- Drop the existing check constraint
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_status_check;

-- Add the new check constraint with 'graduated' included
ALTER TABLE public.conversations
ADD CONSTRAINT conversations_status_check 
CHECK (status IN ('unknown', 'uninterested', 'interested', 'enrolled', 'ambassador', 'graduated'));

-- Update the comment to reflect the new status option
COMMENT ON COLUMN public.conversations.status IS 
'Lead status: unknown (default), uninterested, interested, enrolled, ambassador, graduated';


