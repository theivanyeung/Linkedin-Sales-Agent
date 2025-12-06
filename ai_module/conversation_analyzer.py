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
                "sentiment_score": 0.0,  # Legacy field - kept for backward compatibility
                "engagement_score": 0.0,  # Legacy field - kept for backward compatibility
                "has_questions": False,  # Legacy field - kept for backward compatibility
                "total_messages": 0,
                "prospect_message_count": 0,
                "ready_for_ask": False,
                "criteria_met": {},  # Legacy field - kept for backward compatibility
                "has_negative_signal": False,  # Legacy field - kept for backward compatibility
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

    # Map to legacy structure for backward compatibility
    # Note: sentiment_score and engagement_score are now hardcoded to 0.0 since we use pure agentic decision
    return {
        "phase": result["phase"],
        "recommendation": result.get("recommendation", result.get("instruction_for_writer", "")),
        "analysis_details": {
            "sentiment_score": 0.0,  # Legacy field - no longer calculated
            "engagement_score": 0.0,  # Legacy field - no longer calculated
            "has_questions": False,  # Legacy field - no longer calculated
            "total_messages": len(messages),
            "prospect_message_count": sum(1 for m in messages if m.get("sender") == "prospect"),
            "ready_for_ask": result["ready_for_ask"],
            "has_negative_signal": False,  # Legacy field - no longer calculated
            "criteria_met": {},  # Legacy field - no longer used
        },
    }


