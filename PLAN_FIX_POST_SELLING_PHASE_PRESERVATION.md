# Plan: Fix Post-Selling Phase Preservation

## Problem

When in `post_selling` phase and generating a response, it goes back to `doing_the_ask` (selling phase). This happens because:

1. The analyzer doesn't receive the current phase, so it can't preserve `post_selling`
2. The orchestrator's phase logic (lines 215-276) only handles `building_rapport` -> `doing_the_ask` transitions
3. The orchestrator overrides the analyzer's phase decision (line 264) without checking for `post_selling`
4. The orchestrator doesn't check what phase the analyzer actually returned (`analyzer_phase`)

## Solution

1. Pass `current_phase` to the analyzer so it knows the current phase
2. Update analyzer to preserve `post_selling` when appropriate
3. Update orchestrator to respect the analyzer's phase decision, especially for `post_selling`
4. Add logic to preserve `post_selling` when current phase is `post_selling`

## Implementation

### 1. Update `ai_module/analyzer.py`

**Action A: Update function signature** (line 43)

Change:

```python
def analyze_conversation(conv: Conversation) -> Dict[str, Any]:
```

To:

```python
def analyze_conversation(conv: Conversation, current_phase: str = None) -> Dict[str, Any]:
```

**Action B: Add current phase to user_prompt context** (around line 147)

Add after line 148:

```python
        f"- Current phase: {current_phase or 'unknown'}\n\n"
```

**Action C: Update user_prompt PHASE section** (lines 143-146)

Replace with:

```python
        "4. PHASE: Determine the conversation phase based on your move_forward decision and conversation state:\n"
        "   - CRITICAL: If current phase is 'post_selling' AND user asks a question, STAY in 'post_selling' (do not go back to 'doing_the_ask')\n"
        "   - If move_forward is False, set phase to 'building_rapport'\n"
        "   - If move_forward is True AND you have NOT yet pitched Prodicity (check conversation for pitch indicators: 'Prodicity', 'fellowship', 'application', 'Stanford/MIT mentors'), set phase to 'doing_the_ask'\n"
        "   - If move_forward is True AND you have ALREADY pitched Prodicity (found pitch indicators in conversation history) AND the user is asking follow-up questions, set phase to 'post_selling'\n"
        "   - If current phase is 'doing_the_ask' AND user asks a question after you've pitched (pitch indicators found), set phase to 'post_selling'\n\n"
```

### 2. Update `ai_module/orchestrator.py`

**Action A: Pass current_phase to analyzer** (line 171)

Change:

```python
        analysis = analyze_conversation(conv)
```

To:

```python
        analysis = analyze_conversation(conv, current_phase=current_phase)
```

**Action B: Update phase determination logic** (lines 215-276)

The current logic (lines 215-276) hardcodes phase decisions. Need to:

1. Check if current phase is `post_selling` - if so, preserve it unless analyzer explicitly says otherwise
2. Respect the analyzer's phase decision (`analyzer_phase`) instead of overriding it
3. Handle `post_selling` phase transitions

Replace the entire phase determination block (lines 215-276) with:

```python
    # Get analyzer's suggested phase
    analyzer_phase = analysis.get("phase", "building_rapport")

    # CRITICAL: Preserve post_selling phase if we're already in it
    # Once in post_selling, stay there unless explicitly transitioning away
    if current_phase == "post_selling":
        # Stay in post_selling unless analyzer explicitly says to go back (unlikely)
        if analyzer_phase == "post_selling" or (move_forward and analyzer_phase != "building_rapport"):
            phase = "post_selling"
            ready_for_ask = True  # Still ready for ask in post_selling
            if Config.DEBUG:
                print(f"[Orchestrator] Preserving post_selling phase (current={current_phase}, analyzer={analyzer_phase})")
        else:
            # Analyzer wants to go back - respect it (but this should be rare)
            phase = analyzer_phase
            ready_for_ask = (phase == "doing_the_ask" or phase == "post_selling")
    # Handle transition TO post_selling from doing_the_ask
    elif current_phase == "doing_the_ask" and analyzer_phase == "post_selling":
        # Transitioning from doing_the_ask to post_selling (pitch made, user asking questions)
        phase = "post_selling"
        ready_for_ask = True
        if Config.DEBUG:
            print(f"[Orchestrator] Transitioning to post_selling phase (current={current_phase}, analyzer={analyzer_phase})")
    # Handle permission gate for building_rapport -> doing_the_ask transition
    elif analyzer_phase == "doing_the_ask" and current_phase != "doing_the_ask":
        # Check if approval is needed for transition to selling phase
        if current_phase and current_phase != "doing_the_ask" and confirm_phase_change is not True:
            # Need approval - return early with approval request
            if Config.DEBUG:
                print(f"[Orchestrator] PERMISSION GATE: Approval required for phase transition (current={current_phase}, suggested={analyzer_phase})")
            return {
                "status": "approval_required",
                "suggested_phase": "doing_the_ask",
                "reasoning": reasoning,
                "phase": current_phase,
                "ready_for_ask": False,
                "instruction_for_writer": "Waiting for approval to transition to selling phase",
                "knowledge_context": [],
                "next_message_suggestion": {"text": "", "cta": None, "variables": {}},
                "conversation_guidance": {"next_step": "Approval required"},
                "raw_llm": analysis,
                "timestamps": {},
            }
        else:
            # Approved or no gate needed
            phase = "doing_the_ask"
            ready_for_ask = True
    # Handle user rejection
    elif confirm_phase_change is False:
        if Config.DEBUG:
            print("[Orchestrator] PERMISSION GATE: User rejected phase transition - staying in current phase")
        phase = current_phase or "building_rapport"
        ready_for_ask = (phase == "doing_the_ask" or phase == "post_selling")
        if phase == "building_rapport":
            instruction_for_writer = "Continue building rapport - ask about their interests, school, or current projects"
    # Default: use analyzer's phase decision
    else:
        phase = analyzer_phase
        ready_for_ask = (phase == "doing_the_ask" or phase == "post_selling")
        if Config.DEBUG:
            print(f"[Orchestrator] Using analyzer's phase decision: {phase}")
```

**Action C: Update KB query building** (around line 107)

Add `post_selling` handling:

```python
    elif phase == "post_selling":
        # In post-selling phase, they're asking specific questions - prioritize those topics
        query_terms.append("prodicity program pricing application details logistics")
    elif phase == "doing_the_ask":
```

## Files to Modify

1. `ai_module/analyzer.py`:

   - Update function signature to accept `current_phase` parameter (line 43)
   - Add current phase to user_prompt context (after line 148)
   - Update PHASE section to preserve `post_selling` (lines 143-146)

2. `ai_module/orchestrator.py`:
   - Pass `current_phase` to `analyze_conversation()` (line 171)
   - Replace phase determination logic (lines 215-276) with new logic that handles `post_selling`
   - Update KB query building for `post_selling` phase (around line 107)

## Expected Outcome

- When in `post_selling` phase, generating a response will preserve the phase as `post_selling`
- Phase will not revert back to `doing_the_ask` when user asks follow-up questions
- Transition from `doing_the_ask` to `post_selling` will work correctly
- Introduction scripts will remain excluded from context in `post_selling` phase
- The orchestrator will respect the analyzer's phase decisions instead of overriding them







