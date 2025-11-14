"""
Deterministic readiness gate combining analyzer metrics with simple thresholds.
"""

from typing import Dict, Any


DEFAULTS = {
    "engagement_threshold": 0.4,
    "sentiment_threshold": 0.2,
    "min_messages": 5,
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

    ready_for_ask = engagement_met and sentiment_met and message_count_met and has_questions

    return {
        "ready_for_ask": ready_for_ask,
        "criteria": {
            "engagement_threshold": engagement_met,
            "sentiment_threshold": sentiment_met,
            "message_count_threshold": message_count_met,
            "has_questions": has_questions,
        },
    }


























