# Plan: Add Pitch Detection Logic for Post-Selling Phase

## Problem

The `post_selling` phase was added to the codebase, but the analyzer doesn't have explicit logic to detect when a pitch has already been made. The phase transition logic says "if you have ALREADY pitched Prodicity" but doesn't explain HOW to detect this, so the analyzer never transitions to `post_selling`.

## Solution

Add explicit pitch detection criteria to the analyzer prompts so it can identify when Prodicity has been pitched and transition to `post_selling` phase.

## Implementation

### Update `ai_module/analyzer.py`

**Action 1: Add PITCH DETECTION section to system_prompt** (after CRITICAL RULE, around line 102)

Insert after line 102:

```python
        "PITCH DETECTION (for phase transition):\n\n"
        "To determine if Prodicity has ALREADY been pitched, check the conversation history for these indicators:\n"
        "- Mentions of 'Prodicity', 'fellowship', 'selective fellowship'\n"
        "- References to 'Stanford/MIT mentors' or 'mentors from Stanford'\n"
        "- Mentions of 'application', 'application link', or 'apply'\n"
        "- References to 'tangible outcomes', 'internships', 'research positions', 'startups/nonprofits'\n"
        "- If ANY of these appear in messages from 'you', the pitch has been made.\n"
        "- If the current phase is 'doing_the_ask' AND a pitch has been made AND the user asks a question -> transition to 'post_selling'.\n\n"
```

**Action 2: Update system_prompt Phase Guidelines** (line 66)

Replace:

```python
"- 'post_selling': The pitch has already been made. User is asking questions (price, details, logistics). We are clarifying, not introducing.\n\n"
```

With:

```python
"- 'post_selling': The pitch has already been made (check conversation for 'Prodicity', 'fellowship', 'application', 'Stanford/MIT mentors'). User is asking follow-up questions (price, details, logistics). We are clarifying, not introducing. Transition here when in 'doing_the_ask' phase and user asks questions after pitch.\n\n"
```

**Action 3: Update user_prompt PHASE section** (lines 143-146)

Replace:

```python
        "4. PHASE: Determine the conversation phase based on your move_forward decision and conversation state:\n"
        "   - If move_forward is False, set phase to 'building_rapport'\n"
        "   - If move_forward is True AND you have NOT yet pitched Prodicity, set phase to 'doing_the_ask'\n"
        "   - If move_forward is True AND you have ALREADY pitched Prodicity (or user is asking follow-up questions after a pitch), set phase to 'post_selling'\n\n"
```

With:

```python
        "4. PHASE: Determine the conversation phase based on your move_forward decision and conversation state:\n"
        "   - If move_forward is False, set phase to 'building_rapport'\n"
        "   - If move_forward is True AND you have NOT yet pitched Prodicity (check conversation for pitch indicators: 'Prodicity', 'fellowship', 'application', 'Stanford/MIT mentors'), set phase to 'doing_the_ask'\n"
        "   - If move_forward is True AND you have ALREADY pitched Prodicity (found pitch indicators in conversation history) AND the user is asking follow-up questions, set phase to 'post_selling'\n"
        "   - If current phase is 'doing_the_ask' AND user asks a question after you've pitched (pitch indicators found), set phase to 'post_selling'\n\n"
```

## Files to Modify

1. `ai_module/analyzer.py`:
   - Add PITCH DETECTION section after CRITICAL RULE (after line 102)
   - Update Phase Guidelines (line 66) with detection criteria
   - Update user_prompt PHASE section (lines 143-146) with explicit detection logic

## Expected Outcome

- Analyzer will detect when a pitch has been made by checking conversation history for pitch indicators
- Phase will automatically transition from `doing_the_ask` to `post_selling` when user asks questions after pitch
- Post-selling phase will appear in the UI once the transition is detected
- No more looping pitch bug - introduction scripts removed from context in post_selling phase











