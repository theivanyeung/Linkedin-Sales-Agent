"""
Pipeline orchestrator: KB (stub) -> analyzer (single Responses call) -> readiness gate.
Emits unified AnalysisResult JSON.
"""

from typing import Dict, Any, List
from io_models import Conversation
from analyzer import analyze_conversation
from policies.readiness import evaluate_readiness
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


def run_pipeline(conv: Conversation) -> Dict[str, Any]:
    # Handle empty conversations
    if not conv.messages:
        return {
            "phase": "building_rapport",
            "ready_for_ask": False,
            "scores": {"sentiment": 0.0, "engagement": 0.0},
            "signals": {
                "has_questions": False,
                "has_negative_signal": False,
                "message_count": 0,
                "prospect_message_count": 0,
            },
            "criteria_met": {},
            "recommendation": "Start conversation with initial outreach",
            "knowledge_context": [],
            "next_message_suggestion": {"text": "", "cta": None, "variables": {}},
            "conversation_guidance": {"next_step": "Start with initial message"},
            "raw_llm": {},
            "timestamps": {},
        }
    
    # Analyze with single-pass LLM to get phase and metrics
    try:
        analysis = analyze_conversation(conv)
    except Exception as e:
        if Config.DEBUG:
            print(f"[Orchestrator] Analysis error: {e}, using defaults")
        # Fallback analysis
        analysis = {
            "phase": "building_rapport",
            "sentiment": 0.0,
            "engagement": 0.0,
            "has_questions": False,
            "has_negative_signal": False,
            "recommendation": "Continue building rapport",
        }
    
    phase = analysis.get("phase", "building_rapport")
    
    # Build intelligent KB query based on conversation content and phase
    kb_query = _build_kb_query(conv, phase)
    
    # Retrieve KB snippets (with error handling)
    try:
        kb_snippets = kb_retrieve(query=kb_query, k=5)
        if Config.DEBUG:
            print(f"[Orchestrator] KB query: {kb_query[:100]}")
            print(f"[Orchestrator] KB snippets retrieved: {len(kb_snippets)}")
            if kb_snippets:
                print(f"[Orchestrator] KB sources: {[s.get('source', 'N/A') for s in kb_snippets[:3]]}")
    except Exception as e:
        if Config.DEBUG:
            print(f"[Orchestrator] KB retrieval error: {e}")
        kb_snippets = []  # Fallback to empty list on error

    sentiment = float(analysis.get("sentiment", 0.0))
    engagement = float(analysis.get("engagement", 0.0))
    has_questions = bool(analysis.get("has_questions", False))
    has_negative_signal = bool(analysis.get("has_negative_signal", False))
    phase = analysis.get("phase", "building_rapport")
    recommendation = analysis.get("recommendation", "Continue building rapport")
    if Config.DEBUG:
        print(
            "[Orchestrator] Analyzer metrics -> "
            f"phase={phase}, sentiment={sentiment}, engagement={engagement}, "
            f"has_questions={has_questions}, negative_signal={has_negative_signal}"
        )

    readiness = evaluate_readiness(
        sentiment=sentiment,
        engagement=engagement,
        has_questions=has_questions,
        total_messages=len(conv.messages),
    )

    ready_for_ask = readiness["ready_for_ask"]
    
    # Phase transition logic: if analyzer says "doing_the_ask" but not ready, stay in rapport
    if phase == "doing_the_ask" and not ready_for_ask:
        phase = "building_rapport"

    # Also check if we should transition TO "doing_the_ask" if ready but still in rapport
    # This helps guide the conversation progression
    if phase == "building_rapport" and ready_for_ask:
        # Check if we have enough engagement to suggest moving to selling
        if engagement >= 0.5 and sentiment >= 0.3:
            # Keep in rapport but signal readiness - let the LLM decide when to transition
            pass
    
    # Get conversation state for guidance
    conversation_state = {
        "message_count": len(conv.messages),
        "prospect_message_count": sum(1 for m in conv.messages if m.sender == "prospect"),
        "has_questions": has_questions,
        "engagement": engagement,
        "sentiment": sentiment,
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

    return {
        "phase": phase,
        "ready_for_ask": ready_for_ask,
        "scores": {"sentiment": sentiment, "engagement": engagement},
        "signals": {
            "has_questions": has_questions,
            "has_negative_signal": has_negative_signal,
            "message_count": len(conv.messages),
            "prospect_message_count": sum(1 for m in conv.messages if m.sender == "prospect"),
        },
        "criteria_met": readiness["criteria"],
        "recommendation": recommendation,
        "knowledge_context": kb_snippets,
        "next_message_suggestion": next_message,
        "conversation_guidance": guidance,  # Add guidance for progression tracking
        "raw_llm": analysis,
        "timestamps": {},
    }






