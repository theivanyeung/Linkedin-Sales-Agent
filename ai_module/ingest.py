"""
Ingest Supabase/LinkedIn data and normalize to Conversation model.
"""

from typing import Dict, List, Any
from io_models import Conversation, Message, Participant, Link, Mention, Reaction, Attachment


def normalize_message(data: Dict[str, Any]) -> Message:
    """
    Normalize a message dict from Supabase to Message model.

    Expected fields:
    - sender: "you" | "prospect" | "other"
    - text: string
    - links?: [{ url, title? }]
    - mentions?: [{ name, profile_url? }]
    - reactions?: [{ type, by, timestamp? }]
    - attachments?: [{ type, url, filename?, bytes? }]

    Optional fields (ignored): message_id, thread_id, timestamp
    """
    return Message(
        sender=data["sender"],
        text=data["text"],
        links=[Link(url=link["url"], title=link.get("title")) for link in data.get("links", [])],
        mentions=[Mention(name=mention["name"], profile_url=mention.get("profile_url")) for mention in data.get("mentions", [])],
        reactions=[Reaction(type=r["type"], by=r["by"], timestamp=r.get("timestamp")) for r in data.get("reactions", [])],
        attachments=[Attachment(type=a["type"], url=a["url"], filename=a.get("filename"), bytes=a.get("bytes")) for a in data.get("attachments", [])],
    )


def normalize_participant(data: Dict[str, Any]) -> Participant:
    """
    Normalize a participant dict to Participant model.

    Expected fields:
    - id: string
    - name: string
    - role: "you" | "prospect" | "other"
    """
    return Participant(id=data["id"], name=data["name"], role=data["role"])


def build_conversation(thread_data: Dict[str, Any], messages_data: List[Dict[str, Any]]) -> Conversation:
    """
    Build a Conversation from thread and messages data.

    Args:
        thread_data: Dict with 'title', 'description?', 'participants?'
        messages_data: List of message dicts (already sorted by DB)

    Returns:
        Normalized Conversation model
    """
    participants = [normalize_participant(p) if isinstance(p, dict) else p for p in thread_data.get("participants", [])]
    messages = [normalize_message(msg) for msg in messages_data]
    return Conversation(
        title=thread_data["title"],
        description=thread_data.get("description"),
        participants=participants,
        messages=messages,
    )
