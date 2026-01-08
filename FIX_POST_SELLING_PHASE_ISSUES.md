# Fix: Post-Selling Phase Issues

## Problems Identified

1. **Database Constraint Error**: Supabase rejects `post_selling` phase because the check constraint only allows `building_rapport` and `doing_the_ask`
2. **Phase Not Passed Correctly**: When manually setting phase to `post_selling`, it wasn't being respected in the phase override logic

## Solutions Applied

### 1. Database Migration (REQUIRED)

**File**: `migration_add_post_selling_phase.sql`

Run this SQL in your Supabase SQL Editor to update the check constraint:

```sql
-- Drop the existing constraint
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS check_phase_values;

-- Add the updated constraint with post_selling included
ALTER TABLE conversations
ADD CONSTRAINT check_phase_values
CHECK (phase IN ('building_rapport', 'doing_the_ask', 'post_selling'));
```

**⚠️ IMPORTANT**: You must run this migration in Supabase before `post_selling` phase will work!

### 2. Frontend Update (COMPLETED)

**File**: `popup.js` (line 199)

Updated the phase override logic to include `post_selling`:

```javascript
// Before:
if (convo.phase === "doing_the_ask") {

// After:
if (convo.phase === "doing_the_ask" || convo.phase === "post_selling") {
```

This ensures that when you manually set the phase to `post_selling`, it's respected by the orchestrator.

## How to Test

1. **Run the SQL migration** in Supabase SQL Editor
2. **Open a conversation** that has already been pitched (has pitch indicators in messages)
3. **Manually set phase** to `post_selling` using the dropdown
4. **Generate a response** - it should:
   - Stay in `post_selling` phase
   - Not revert to `doing_the_ask`
   - Generate Q&A responses (not introduction scripts)

## Expected Behavior After Fix

- ✅ `post_selling` phase can be saved to Supabase
- ✅ Manual phase selection to `post_selling` is respected
- ✅ AI preserves `post_selling` phase when generating responses
- ✅ No more database constraint errors when setting phase to `post_selling`
- ✅ Phase transitions work correctly: `doing_the_ask` → `post_selling`

## Troubleshooting

If you still see issues after running the migration:

1. **Check Supabase**: Verify the constraint was updated:

   ```sql
   SELECT * FROM information_schema.table_constraints
   WHERE constraint_name = 'check_phase_values';
   ```

2. **Check Phase Value**: Make sure the phase is actually being saved:

   ```sql
   SELECT thread_id, phase FROM conversations
   WHERE thread_id = 'your-thread-id';
   ```

3. **Check Logs**: Look for `[Orchestrator] Preserving post_selling phase` in the console logs












