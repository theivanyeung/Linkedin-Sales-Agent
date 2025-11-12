# CRM Fields Guide for LinkedIn Sales Agent

## Essential Fields (Already Added)

### Status
- **Purpose**: Track where the lead is in your funnel
- **Values**: `unknown`, `uninterested`, `interested`, `enrolled`, `ambassador`
- **Usage**: Quick filter to see which leads need attention

## Recommended Additional Fields

### 1. **School** (High Priority)
- **Why**: Your templates reference `{school}` - track this for personalization
- **Use Case**: Filter leads by school, see which schools convert best
- **Example**: "Stanford High School", "MIT Prep"

### 2. **Last Activity Date** (High Priority)
- **Why**: Know when you last talked to them (don't let leads go cold)
- **Use Case**: Sort by "last contacted" to prioritize follow-ups
- **Auto-updated**: Set automatically when messages are saved

### 3. **Tags** (Medium Priority)
- **Why**: Flexible categorization beyond status
- **Use Case**: Tag by project type ("nonprofit", "research", "startup"), interests, etc.
- **Example**: `["nonprofit", "research", "high-priority"]`

### 4. **Notes** (Medium Priority)
- **Why**: Store context that doesn't fit in messages
- **Use Case**: "Likes music therapy", "Mentioned financial constraints", "Referred by John"
- **Manual Entry**: You'll add these yourself

### 5. **Pipeline Stage** (Medium Priority)
- **Why**: More granular than status for sales process
- **Values**: `new`, `contacted`, `qualified`, `proposal`, `negotiation`, `closed_won`, `closed_lost`
- **Use Case**: Track progression through your sales funnel

### 6. **Next Follow-up Date** (Medium Priority)
- **Why**: Never forget to follow up
- **Use Case**: Set reminders for when to reach out again
- **Manual Entry**: You set this after each conversation

### 7. **Lead Score** (Low Priority - Start Simple)
- **Why**: Quantify lead quality automatically
- **Use Case**: Score based on engagement, message count, sentiment
- **Auto-calculated**: Can be computed from conversation metrics

### 8. **Priority** (Low Priority)
- **Why**: Manual override for important leads
- **Values**: `low`, `medium`, `high`
- **Use Case**: Mark high-value prospects manually

### 9. **Profile URL** (Low Priority)
- **Why**: Quick access to LinkedIn profile
- **Use Case**: Open profile in new tab, check for updates
- **Auto-extracted**: From LinkedIn conversation

### 10. **Enrollment Value** (Low Priority - For Later)
- **Why**: Track revenue per lead
- **Use Case**: Calculate ROI, see which leads convert to paid
- **Manual Entry**: Set when they enroll

## Fields to Skip (For Now)

- **Email/Phone**: Not available from LinkedIn messages
- **Company**: Not relevant for high school students
- **Location**: Can extract from LinkedIn if needed later
- **Owner/Assigned To**: Only you for now

## Implementation Priority

**Phase 1 (Do Now)**:
1. ✅ Status (already done)
2. School (high value, used in templates)
3. Last Activity Date (auto-update on save)

**Phase 2 (Next)**:
4. Tags (flexible categorization)
5. Notes (store context)
6. Next Follow-up Date (reminders)

**Phase 3 (Later)**:
7. Pipeline Stage (if you want more granular tracking)
8. Lead Score (automated scoring)
9. Priority (manual override)

## How to Use

1. **Run the migration**: Execute `conversations_crm_fields_migration.sql` in Supabase
2. **Update UI**: Add fields to the popup for manual entry
3. **Auto-populate**: Extract school from LinkedIn, update last_activity on save
4. **Filter/Query**: Use these fields to filter leads in Supabase dashboard

## Example Queries

```sql
-- Find all interested leads from Stanford
SELECT * FROM conversations 
WHERE status = 'interested' AND school ILIKE '%stanford%';

-- Find leads that need follow-up (no activity in 7 days)
SELECT * FROM conversations 
WHERE last_activity_at < NOW() - INTERVAL '7 days'
AND status NOT IN ('uninterested', 'closed_lost');

-- Find high-priority leads
SELECT * FROM conversations 
WHERE priority = 'high' AND status = 'interested';
```




