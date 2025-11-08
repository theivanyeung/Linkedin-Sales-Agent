"""
Pipeline orchestrator: KB (stub) -> analyzer (single Responses call) -> readiness gate.
Emits unified AnalysisResult JSON.
"""

from typing import Dict, Any
from io_models import Conversation
from analyzer import analyze_conversation
from policies.readiness import evaluate_readiness
from knowledge_base import retrieve as kb_retrieve
from static_scripts import get_prompt_blocks, cta_templates, get_conversation_guidance


def run_pipeline(conv: Conversation) -> Dict[str, Any]:
    # Retrieve KB snippets (currently stub returns [])
    kb_snippets = kb_retrieve(query=f"{conv.title} {conv.description or ''}", k=5)

    # Analyze with single-pass LLM
    analysis = analyze_conversation(conv)

    sentiment = float(analysis.get("sentiment", 0.0))
    engagement = float(analysis.get("engagement", 0.0))
    has_questions = bool(analysis.get("has_questions", False))
    has_negative_signal = bool(analysis.get("has_negative_signal", False))
    phase = analysis.get("phase", "building_rapport")
    recommendation = analysis.get("recommendation", "Continue building rapport")

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






