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
        "You are a sales conversation analyst for Prodicity, a selective fellowship for high school students. "
        "Analyze conversations to determine the right sales phase and engagement level. "
        "Return ONLY a JSON object as per the provided schema.\n\n"
        "Phase Guidelines:\n"
        "- 'building_rapport': Early stage, building relationship, asking questions, not selling yet\n"
        "- 'doing_the_ask': Ready to introduce Prodicity, student is engaged and asking questions\n\n"
        "Sentiment: -1 (very negative) to 1 (very positive). Consider tone, enthusiasm, interest.\n"
        "Engagement: 0 (no engagement) to 1 (highly engaged). Consider response length, questions asked, enthusiasm.\n"
        "has_questions: True if student is asking questions (shows interest/engagement).\n"
        "has_negative_signal: True if student shows disinterest, says no, or is negative.\n"
        "recommendation: Brief actionable recommendation for next step."
    )

    # Count messages for context
    total_messages = len(conv.messages)
    prospect_messages = sum(1 for m in conv.messages if m.sender == "prospect")
    
    user_prompt = (
        "Analyze this sales conversation and determine:\n"
        "- phase: 'building_rapport' or 'doing_the_ask'\n"
        "- sentiment: -1 to 1 (how positive/negative is the student's tone?)\n"
        "- engagement: 0 to 1 (how engaged is the student?)\n"
        "- has_questions: true if student is asking questions\n"
        "- has_negative_signal: true if student shows disinterest or says no\n"
        "- recommendation: what should the sales agent do next?\n\n"
        f"Conversation context:\n"
        f"- Title: {conv.title}\n"
        f"- Total messages: {total_messages} (Prospect: {prospect_messages})\n"
        f"- Description: {conv.description or 'None'}\n\n"
        f"Recent conversation:\n{_conversation_to_text(conv)}\n\n"
        "Be accurate and conservative. Only move to 'doing_the_ask' if student is clearly engaged and asking questions."
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






























