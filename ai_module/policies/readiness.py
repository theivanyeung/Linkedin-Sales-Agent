"""
Deterministic readiness gate combining analyzer metrics with simple thresholds.
"""

from typing import Dict, Any


DEFAULTS = {
    "engagement_threshold": 0.4,  # Lowered from 0.6 to make it easier to transition
    "sentiment_threshold": 0.2,    # Keep low - just need positive sentiment
    "min_messages": 5,             # Need at least 5 messages for context
}


def evaluate_readiness(
    *,
    sentiment: float,
    engagement: float,
    has_questions: bool,
    total_messages: int,
    config: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Compute readiness and criteria flags."""
    cfg = {**DEFAULTS, **(config or {})}
    engagement_met = engagement >= cfg["engagement_threshold"]
    sentiment_met = sentiment >= cfg["sentiment_threshold"]
    message_count_met = total_messages >= cfg["min_messages"]

    # Ready if: engagement + sentiment + message count are met
    # has_questions is a strong signal but not required (student can be ready without asking questions)
    # If has_questions is True, we're definitely ready
    # If has_questions is False but other criteria are strong, we can still be ready
    base_ready = engagement_met and sentiment_met and message_count_met
    ready_for_ask = base_ready and (has_questions or engagement >= 0.5 or sentiment >= 0.4)

    return {
        "ready_for_ask": ready_for_ask,
        "criteria": {
            "engagement_threshold": engagement_met,
            "sentiment_threshold": sentiment_met,
            "message_count_threshold": message_count_met,
            "has_questions": has_questions,
        },
    }






























