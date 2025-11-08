"""
Single-pass analyzer that returns phase + key metrics via Responses API.
"""

from typing import Dict, Any, List
from io_models import Conversation
from llm_service import ResponsesClient


ANALYSIS_SCHEMA: Dict[str, Any] = {
    "name": "AnalysisResult",
    "schema": {
        "type": "object",
        "properties": {
            "phase": {"type": "string", "enum": ["building_rapport", "doing_the_ask"]},
            "sentiment": {"type": "number"},
            "engagement": {"type": "number"},
            "has_questions": {"type": "boolean"},
            "has_negative_signal": {"type": "boolean"},
            "recommendation": {"type": "string"},
        },
        "required": [
            "phase",
            "sentiment",
            "engagement",
            "has_questions",
            "has_negative_signal",
            "recommendation",
        ],
        "additionalProperties": False,
    },
}


def _conversation_to_text(conv: Conversation) -> str:
    lines: List[str] = []
    for m in conv.messages[-10:] if len(conv.messages) > 10 else conv.messages:
        who = "You" if m.sender == "you" else (conv.participants[0].name if conv.participants else "Prospect")
        if m.sender == "prospect":
            who = "Prospect"
        lines.append(f"{who}: {m.text}")
    return "\n".join(lines)


def analyze_conversation(conv: Conversation) -> Dict[str, Any]:
    """Run a single Responses API call to analyze the conversation."""
    system_prompt = (
        "You are a sales conversation analyst for Prodicity. "
        "Return ONLY a JSON object as per the provided schema."
    )

    user_prompt = (
        "Analyze the conversation below and produce: phase, sentiment (-1..1), "
        "engagement (0..1), has_questions (bool), has_negative_signal (bool), recommendation.\n\n"
        f"Conversation title: {conv.title}\n"
        f"Description: {conv.description or ''}\n\n"
        f"Recent conversation:\n{_conversation_to_text(conv)}\n"
    )

    client = ResponsesClient()
    result = client.json_response(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=ANALYSIS_SCHEMA,
        temperature=0.3,
        max_output_tokens=300,
    )
    return result













