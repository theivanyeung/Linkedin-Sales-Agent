"""
Adapter retained for backward compatibility. Delegates to the new orchestrator pipeline.
"""

from typing import List, Dict, Any
from ingest import build_conversation
from orchestrator import run_pipeline


def analyze_conversation_state(messages: List[Dict[str, Any]], prospect_name: str = "") -> Dict[str, Any]:
    if not messages:
        return {
            "phase": "building_rapport",
            "recommendation": "Start with initial outreach to build rapport",
            "analysis_details": {
                "sentiment_score": 0.0,
                "engagement_score": 0.0,
                "has_questions": False,
                "total_messages": 0,
                "prospect_message_count": 0,
                "ready_for_ask": False,
                "criteria_met": {}
            }
        }

    thread_data = {
        "title": f"Conversation with {prospect_name}" if prospect_name else "Conversation",
        "description": None,
        "participants": [
            {"id": "you", "name": "You", "role": "you"},
            {"id": "prospect", "name": prospect_name or "Prospect", "role": "prospect"},
        ],
    }

    conv = build_conversation(thread_data, messages)
    result = run_pipeline(conv)

    # Map to legacy-ish structure
    return {
        "phase": result["phase"],
        "recommendation": result["recommendation"],
        "analysis_details": {
            "sentiment_score": result["scores"]["sentiment"],
            "engagement_score": result["scores"]["engagement"],
            "has_questions": result["signals"]["has_questions"],
            "total_messages": result["signals"]["message_count"],
            "prospect_message_count": result["signals"]["prospect_message_count"],
            "ready_for_ask": result["ready_for_ask"],
            "has_negative_signal": result["signals"]["has_negative_signal"],
            "criteria_met": result["criteria_met"],
        },
    }


