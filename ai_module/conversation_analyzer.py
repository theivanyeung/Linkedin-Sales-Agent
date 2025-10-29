"""
Conversation analysis to determine conversation state and optimal next action.
"""

import re
from collections import Counter

# Keywords for sentiment analysis
POSITIVE_KEYWORDS = [
    "interested", "excited", "awesome", "cool", "love", "perfect", 
    "amazing", "great", "yes", "definitely", "sure", "absolutely",
    "tell me more", "that sounds", "I'd love", "want to"
]

NEGATIVE_KEYWORDS = [
    "busy", "not sure", "maybe", "later", "expensive", "cost", 
    "don't have time", "can't", "won't", "no", "not interested",
    "probably not", "not for me", "too busy"
]

INTEREST_SIGNALS = [
    "what", "how", "tell me more", "can you", "is it", "do you",
    "?", "details", "information", "learn more"
]

ENGAGEMENT_KEYWORDS = [
    "you", "your", "I", "me", "my", "we", "our", "together"
]

def analyze_sentiment(text):
    """
    Simple sentiment analysis based on keyword matching.
    Returns a sentiment score between -1 (negative) and 1 (positive).
    """
    text_lower = text.lower()
    
    positive_count = sum(1 for keyword in POSITIVE_KEYWORDS if keyword in text_lower)
    negative_count = sum(1 for keyword in NEGATIVE_KEYWORDS if keyword in text_lower)
    
    total_sentiment_words = positive_count + negative_count
    
    if total_sentiment_words == 0:
        return 0.0  # Neutral
    
    sentiment_score = (positive_count - negative_count) / total_sentiment_words
    return sentiment_score

def detect_engagement(text):
    """
    Detect engagement level based on message length and personal pronouns.
    Returns a score between 0 (low) and 1 (high).
    """
    text_lower = text.lower()
    
    # Count engagement keywords
    engagement_words = sum(1 for keyword in ENGAGEMENT_KEYWORDS if keyword in text_lower)
    
    # Calculate engagement score
    # Longer messages with personal pronouns = higher engagement
    word_count = len(text.split())
    engagement_score = min(engagement_words / 3 + (word_count / 50), 1.0)
    
    return engagement_score

def detect_questions(text):
    """Detect if message contains questions (sign of interest)."""
    questions = re.findall(r'\?', text)
    question_words = ["what", "how", "when", "where", "why", "who", "can", "will", "is", "are"]
    text_lower = text.lower()
    
    has_question_mark = "?" in text
    has_question_word = any(word + " " in text_lower for word in question_words)
    
    return has_question_mark or has_question_word

def analyze_conversation_state(messages):
    """
    Analyze the entire conversation to determine current phase.
    Only two phases: building_rapport or doing_the_ask
    
    Args:
        messages: List of message dicts with 'sender', 'text', 'timestamp'
    
    Returns:
        dict with phase
    """
    if not messages or len(messages) == 0:
        return {
            "phase": "building_rapport",
            "recommendation": "Start with initial outreach to build rapport"
        }
    
    # Analyze recent messages (last 5)
    recent_messages = messages[-5:] if len(messages) > 5 else messages
    prospect_messages = [m for m in recent_messages if m.get("sender") == "prospect"]
    
    # If no prospect messages yet, still building rapport
    if not prospect_messages:
        return {
            "phase": "building_rapport",
            "recommendation": "Waiting for prospect to respond"
        }
    
    # Analyze sentiment and engagement
    sentiment_scores = [analyze_sentiment(msg.get("text", "")) for msg in prospect_messages]
    engagement_scores = [detect_engagement(msg.get("text", "")) for msg in prospect_messages]
    
    avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
    avg_engagement = sum(engagement_scores) / len(engagement_scores) if engagement_scores else 0
    
    # Detect questions (interest signal)
    has_questions = any(detect_questions(msg.get("text", "")) for msg in prospect_messages)
    
    # Determine conversation phase
    total_messages = len(messages)
    
    # Check if ready to transition to "doing_the_ask"
    # Criteria:
    # - Positive sentiment (interested)
    # - Good engagement (longer messages, asking back)
    # - At least 5+ messages (built some rapport)
    ready_for_ask = (
        avg_engagement >= 0.4 and 
        avg_sentiment >= 0.2 and 
        total_messages >= 5 and
        has_questions  # They're asking questions = engaged
    )
    
    # Check for strong negative signals (back to rapport building)
    if avg_sentiment < -0.3 or any(msg.get("text", "").lower().startswith(("no", "not interested", "can't", "won't")) for msg in prospect_messages):
        return {
            "phase": "building_rapport",
            "recommendation": "Address concerns and rebuild rapport before asking"
        }
    
    # Decide phase
    if ready_for_ask and total_messages >= 5:
        return {
            "phase": "doing_the_ask",
            "recommendation": "Time to introduce Prodicity - prospect is engaged and ready"
        }
    else:
        return {
            "phase": "building_rapport",
            "recommendation": "Continue building rapport through questions about their projects and goals"
        }

def extract_prospect_insights(messages):
    """
    Extract insights about the prospect from the conversation.
    Returns dict with topics, interests, projects mentioned, etc.
    """
    prospect_messages = [m for m in messages if m.get("sender") == "prospect"]
    
    # Extract mentioned topics (simple keyword extraction)
    all_text = " ".join([m.get("text", "") for m in prospect_messages])
    
    # Look for project/passion keywords
    project_keywords = ["project", "startup", "research", "internship", "app", "website", 
                         "nonprofit", "club", "hackathon", "contest", "competition"]
    
    mentioned_topics = []
    text_lower = all_text.lower()
    for keyword in project_keywords:
        if keyword in text_lower:
            mentioned_topics.append(keyword)
    
    return {
        "mentioned_topics": mentioned_topics,
        "message_count": len(prospect_messages)
    }

