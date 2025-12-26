"""
Pipeline orchestrator: KB retrieval -> analyzer (pure agentic decision) -> unified result.
Emits unified AnalysisResult JSON based on GPT-5-mini's strategic assessment.
"""

import time
from typing import Dict, Any, List
from io_models import Conversation
from analyzer import analyze_conversation
from knowledge_base import retrieve as kb_retrieve
from static_scripts import get_prompt_blocks, cta_templates, get_conversation_guidance
from config import Config


def _build_kb_query(conv: Conversation, phase: str) -> str:
    """
    Build an intelligent query for knowledge base retrieval based on conversation content.
    Extracts key topics, questions, school names, and context from recent messages.
    This helps retrieve relevant KB entries about friends, schools, background, etc.
    """
    import re
    
    # Get recent messages (last 10 or all if fewer)
    recent_messages = conv.messages[-10:] if len(conv.messages) > 10 else conv.messages
    
    # Extract text from prospect messages (they're asking questions/mentioning things)
    prospect_texts = [msg.text for msg in recent_messages if msg.sender == "prospect"]
    all_texts = [msg.text for msg in recent_messages]
    
    # Combine all recent conversation text (lowercase for matching)
    conversation_text = " ".join(all_texts).lower()
    prospect_conversation = " ".join(prospect_texts)
    
    # Keywords to look for that indicate what information might be needed
    query_terms = []
    
    # Look for questions about friends/connections (high priority for KB)
    friend_patterns = [
        r"who.*friend", r"who.*your friend", r"friend.*from", r"know.*from",
        r"how.*know", r"how.*met", r"connection", r"introduced", r"background"
    ]
    for pattern in friend_patterns:
        if re.search(pattern, conversation_text, re.IGNORECASE):
            query_terms.append("friend background connection school")
            break
    
    # Look for school mentions (extract school names)
    school_patterns = [
        r"school", r"high school", r"college", r"university", r"academy",
        r"at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",  # "at School Name"
        r"from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)"  # "from School Name"
    ]
    school_mentioned = False
    for pattern in school_patterns:
        if re.search(pattern, prospect_conversation, re.IGNORECASE):
            school_mentioned = True
            query_terms.append("school friend background")
            # Try to extract school name
            matches = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b', prospect_conversation)
            if matches:
                # Add potential school names (capitalized multi-word phrases)
                for match in matches[:2]:  # Take first 2 potential school names
                    if len(match.split()) <= 3:  # Likely a school name if 1-3 words
                        query_terms.append(match.lower())
            break
    
    # Look for questions about "who" - often asking about friends/people
    # But be careful - "who" alone might be too generic, check for context
    who_patterns = [r"\bwho\b.*\?", r"\bwho\b.*friend", r"\bwho\b.*you", r"\bwho\b.*from"]
    if any(re.search(pattern, conversation_text, re.IGNORECASE) for pattern in who_patterns):
        query_terms.append("friend who background")
    
    # Look for pricing/cost questions
    pricing_keywords = ["cost", "price", "pricing", "expensive", "afford", "fee", "money", "pay", "how much"]
    for keyword in pricing_keywords:
        if keyword in conversation_text:
            query_terms.append("pricing cost financial aid program fee")
            break
    
    # Look for program details questions
    program_keywords = ["program", "fellowship", "what is", "how does", "works", "about prodicity", "tell me about"]
    for keyword in program_keywords:
        if keyword in conversation_text:
            query_terms.append("program fellowship details prodicity")
            break
    
    # Look for application questions
    app_keywords = ["apply", "application", "deadline", "when", "how to apply", "interested"]
    for keyword in app_keywords:
        if keyword in conversation_text:
            query_terms.append("application deadline how to apply")
            break
    
    # Extract capitalized words (likely names, schools, places) from prospect messages
    capitalized_words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', prospect_conversation)
    if capitalized_words:
        # Filter for likely school names or person names (2-3 words, capitalized)
        potential_names = [w for w in capitalized_words if 1 <= len(w.split()) <= 3]
        if potential_names:
            query_terms.extend([w.lower() for w in potential_names[:3]])
    
    # Phase-specific default queries
    if phase == "building_rapport":
        # In rapport phase, they often ask about background, friends, connections
        if not any("friend" in term or "background" in term for term in query_terms):
            query_terms.append("friend background school connection")
    elif phase == "post_selling":
        # In post-selling phase, they're asking specific questions - prioritize those topics
        query_terms.append("prodicity program pricing application details logistics")
    elif phase == "doing_the_ask":
        # In selling phase, they might ask about program details, pricing, application
        query_terms.append("prodicity program pricing application")
    
    # Combine all query terms (remove duplicates, keep order)
    seen = set()
    unique_terms = []
    for term in query_terms:
        if term not in seen:
            seen.add(term)
            unique_terms.append(term)
    
    query = " ".join(unique_terms)
    
    # Fallback: if no specific terms found, extract meaningful words
    if not query.strip() or len(query.strip()) < 5:
        # Extract longer words (likely more meaningful)
        words = re.findall(r'\b\w{5,}\b', conversation_text)
        if words:
            # Take unique longer words, sorted by length
            unique_words = sorted(set(words), key=len, reverse=True)[:5]
            query = " ".join(unique_words)
        else:
            # Last resort: use conversation title or default
            query = conv.title.lower() if conv.title else "prodicity"
    
    # Add description if available
    if conv.description:
        query = f"{query} {conv.description.lower()}"
    
    # Clean up: remove extra spaces
    query = re.sub(r'\s+', ' ', query).strip()
    
    if Config.DEBUG:
        print(f"[Orchestrator] KB query built: {query[:150]}")
        if query_terms:
            print(f"[Orchestrator] Query terms detected: {query_terms[:5]}")
    
    return query


def run_pipeline(conv: Conversation, current_phase: str = None, confirm_phase_change: bool = None) -> Dict[str, Any]:
    pipeline_start = time.time()
    
    # Handle empty conversations
    # Note: Edge case where len(conv.messages) == 0 is handled here.
    # If history ingest misses the first message but we have a prospect reply,
    # response_generator.py will inject context to prevent re-introduction.
    if not conv.messages:
        return {
            "phase": "building_rapport",
            "ready_for_ask": False,
            "instruction_for_writer": "Start conversation with initial outreach",
            "reasoning": "No messages yet - beginning conversation",
            "knowledge_context": [],
            "next_message_suggestion": {"text": "", "cta": None, "variables": {}},
            "conversation_guidance": {"next_step": "Start with initial message"},
            "raw_llm": {},
            "timestamps": {},
        }
    
    # Analyze with GPT-5-mini to get strategic decision
    analyzer_start = time.time()
    try:
        analysis = analyze_conversation(conv, current_phase=current_phase)
        analyzer_time = time.time() - analyzer_start
        if Config.DEBUG:
            if analyzer_time < 1:
                print(f"[Orchestrator] Analyzer (OpenAI API) completed: {analyzer_time*1000:.0f}ms")
            else:
                print(f"[Orchestrator] Analyzer (OpenAI API) completed: {analyzer_time:.2f}s")
    except Exception as e:
        error_msg = str(e)
        if Config.DEBUG:
            print(f"[Orchestrator] Analysis error: {error_msg}, using defaults")
            # Provide helpful context for common errors
            if "proxies" in error_msg.lower():
                print("[Orchestrator] Note: This may be a Supabase client version conflict. KB retrieval may fail but analysis should continue.")
            elif "api_key" in error_msg.lower() or "authentication" in error_msg.lower():
                print("[Orchestrator] Note: Check OPENAI_API_KEY in .env file")
            elif "model" in error_msg.lower() and ("not found" in error_msg.lower() or "invalid" in error_msg.lower()):
                print("[Orchestrator] Note: GPT-5.1 model may not be available. Consider using 'o1-preview' or 'o1' as fallback.")
        # Fallback analysis
        analysis = {
            "reasoning": f"Error occurred during analysis: {error_msg[:100]}",
            "move_forward": False,
            "instruction_for_writer": "Continue building rapport - ask about their interests or school",
            "phase": "building_rapport",
        }
    
    # Extract strategic plan from analyzer
    reasoning = analysis.get("reasoning", "No reasoning provided")
    move_forward = analysis.get("move_forward", False)
    instruction_for_writer = analysis.get("instruction_for_writer", "")
    analyzer_phase = analysis.get("phase", "building_rapport")
    
    if Config.DEBUG:
        print(
            "[Orchestrator] Analyzer strategic decision -> "
            f"move_forward={move_forward}, analyzer_phase={analyzer_phase}, "
            f"messages={len(conv.messages)}"
        )
        print(f"[Orchestrator] Reasoning: {reasoning[:200]}...")
        print(f"[Orchestrator] Instruction for writer: {instruction_for_writer}")
        print(f"[Orchestrator] Permission Gate: current_phase={current_phase}, confirm_phase_change={confirm_phase_change}")
    
    # CRITICAL: Preserve post_selling phase if we're already in it
    # Once in post_selling, stay there - NEVER transition away from it unless explicitly going back to building_rapport
    if current_phase == "post_selling":
        # ALWAYS preserve post_selling - this is a one-way phase (can't go back to doing_the_ask)
        # Only allow transition to building_rapport if analyzer explicitly says so (very rare)
        if analyzer_phase == "building_rapport":
            # Analyzer wants to go back to rapport - respect it (but this should be very rare)
            phase = "building_rapport"
            ready_for_ask = False
            if Config.DEBUG:
                print(f"[Orchestrator] Analyzer wants to go back to building_rapport from post_selling - respecting (current={current_phase}, analyzer={analyzer_phase})")
        else:
            # Stay in post_selling - IGNORE analyzer if it says doing_the_ask (we're past that point)
            phase = "post_selling"
            ready_for_ask = True  # Still ready for ask in post_selling
            if Config.DEBUG:
                print(f"[Orchestrator] Preserving post_selling phase (current={current_phase}, analyzer={analyzer_phase}) - ignoring analyzer's phase suggestion")
    # CRITICAL: Preserve doing_the_ask phase if manually set (user manually switched to selling phase)
    # If user manually set phase to doing_the_ask (indicated by confirm_phase_change=True), preserve it
    elif current_phase == "doing_the_ask" and confirm_phase_change is True:
        # User manually set phase to doing_the_ask - preserve it even if analyzer disagrees
        phase = "doing_the_ask"
        ready_for_ask = True
        if Config.DEBUG:
            print(f"[Orchestrator] Preserving manually set doing_the_ask phase (current={current_phase}, analyzer={analyzer_phase}, confirm_phase_change={confirm_phase_change})")
    # CRITICAL: Preserve doing_the_ask phase if manually set (user manually switched to selling phase)
    # If user manually set phase to doing_the_ask (indicated by confirm_phase_change=True), preserve it
    elif current_phase == "doing_the_ask" and confirm_phase_change is True:
        # User manually set phase to doing_the_ask - preserve it even if analyzer disagrees
        phase = "doing_the_ask"
        ready_for_ask = True
        if Config.DEBUG:
            print(f"[Orchestrator] Preserving manually set doing_the_ask phase (current={current_phase}, analyzer={analyzer_phase}, confirm_phase_change={confirm_phase_change})")
    # Handle transition TO post_selling from doing_the_ask
    elif current_phase == "doing_the_ask" and analyzer_phase == "post_selling":
        # Transitioning from doing_the_ask to post_selling (pitch made, user asking questions)
        phase = "post_selling"
        ready_for_ask = True
        if Config.DEBUG:
            print(f"[Orchestrator] Transitioning to post_selling phase (current={current_phase}, analyzer={analyzer_phase})")
    # Handle permission gate for building_rapport -> doing_the_ask transition
    # BUT: Skip this if current_phase is post_selling or doing_the_ask (already handled above)
    elif analyzer_phase == "doing_the_ask" and current_phase != "doing_the_ask" and current_phase != "post_selling":
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
            if Config.DEBUG:
                print(f"[Orchestrator] PERMISSION GATE: Approved or no gate needed - phase='doing_the_ask' (current_phase={current_phase})")
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
    
    # Build intelligent KB query based on conversation content and phase
    kb_query_start = time.time()
    kb_query = _build_kb_query(conv, phase)
    kb_query_time = time.time() - kb_query_start
    if Config.DEBUG:
        if kb_query_time < 0.001:
            print(f"[Orchestrator] KB query building completed: {kb_query_time*1000:.2f}ms")
        else:
            print(f"[Orchestrator] KB query building completed: {kb_query_time*1000:.2f}ms")
    
    # Retrieve KB snippets (with error handling)
    kb_start = time.time()
    try:
        kb_snippets = kb_retrieve(query=kb_query, k=5)
        kb_time = time.time() - kb_start
        if Config.DEBUG:
            if kb_time < 1:
                print(f"[Orchestrator] KB retrieval completed: {kb_time*1000:.0f}ms")
            else:
                print(f"[Orchestrator] KB retrieval completed: {kb_time:.2f}s")
        if Config.DEBUG:
            print(f"[Orchestrator] KB query: {kb_query[:100]}")
            print(f"[Orchestrator] KB snippets retrieved: {len(kb_snippets)}")
            if kb_snippets:
                print(f"[Orchestrator] KB sources: {[s.get('source', 'N/A') for s in kb_snippets[:3]]}")
    except Exception as e:
        kb_time = time.time() - kb_start
        if Config.DEBUG:
            if kb_time < 1:
                print(f"[Orchestrator] KB retrieval error (after {kb_time*1000:.0f}ms): {e}")
            else:
                print(f"[Orchestrator] KB retrieval error (after {kb_time:.2f}s): {e}")
        kb_snippets = []  # Fallback to empty list on error
    
    # Get conversation state for guidance (minimal - only what's needed)
    conversation_state = {
        "message_count": len(conv.messages),
        "prospect_message_count": sum(1 for m in conv.messages if m.sender == "prospect"),
    }
    
    # Get guidance from static scripts
    guidance = get_conversation_guidance(phase, conversation_state)
    
    # Optional next message suggestion placeholder (uses scripts)
    blocks = get_prompt_blocks(phase)
    ctas = cta_templates()
    next_message = None
    if phase == "doing_the_ask" and ready_for_ask and ctas:
        next_message = {"text": "", "cta": ctas[0] if isinstance(ctas, list) and ctas else None, "variables": {}}
    else:
        next_message = {"text": "", "cta": None, "variables": {}}
    if Config.DEBUG:
        print("[Orchestrator] Guidance:", guidance.get("next_step"))
        print("[Orchestrator] Prompt blocks:", len(blocks))
        print("[Orchestrator] Ready for ask:", ready_for_ask)
    
    pipeline_time = time.time() - pipeline_start
    if Config.DEBUG:
        if pipeline_time < 1:
            print(f"[Orchestrator] Total pipeline time: {pipeline_time*1000:.0f}ms")
        else:
            print(f"[Orchestrator] Total pipeline time: {pipeline_time:.2f}s")

    return {
        "phase": phase,
        "ready_for_ask": ready_for_ask,
        "instruction_for_writer": instruction_for_writer,
        "reasoning": reasoning,
        "recommendation": instruction_for_writer,  # Use instruction as recommendation for backward compatibility
        "knowledge_context": kb_snippets,
        "next_message_suggestion": next_message,
        "conversation_guidance": guidance,
        "raw_llm": analysis,
        "timestamps": {},
    }






