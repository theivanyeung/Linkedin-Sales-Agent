-- Migration: Add 'post_selling' phase to check constraint
-- This allows the post_selling phase to be stored in Supabase

-- Drop the existing constraint
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS check_phase_values;

-- Add the updated constraint with post_selling included
ALTER TABLE conversations
ADD CONSTRAINT check_phase_values
CHECK (phase IN ('building_rapport', 'doing_the_ask', 'post_selling'));

-- Verify the constraint was added
-- You can check this by running: SELECT * FROM information_schema.table_constraints WHERE constraint_name = 'check_phase_values';






