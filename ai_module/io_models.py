"""
Data models for conversation and message inputs.
Only includes fields necessary for analysis - no IDs or timestamps.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Literal


@dataclass
class Participant:
    """Conversation participant."""
    id: str
    name: str
    role: Literal["you", "prospect", "other"]


@dataclass
class Link:
    """Message link attachment."""
    url: str
    title: Optional[str] = None


@dataclass
class Mention:
    """Message mention."""
    name: str
    profile_url: Optional[str] = None


@dataclass
class Reaction:
    """Message reaction."""
    type: str
    by: str
    timestamp: Optional[str] = None


@dataclass
class Attachment:
    """Message attachment."""
    type: str
    url: str
    filename: Optional[str] = None
    bytes: Optional[bytes] = None


@dataclass
class Message:
    """Conversation message (no IDs/timestamps - ordering handled by DB)."""
    sender: Literal["you", "prospect", "other"]
    text: str
    links: List[Link] = field(default_factory=list)
    mentions: List[Mention] = field(default_factory=list)
    reactions: List[Reaction] = field(default_factory=list)
    attachments: List[Attachment] = field(default_factory=list)

    def __post_init__(self):
        if not self.text or not self.text.strip():
            raise ValueError("Message text cannot be empty")
        if self.sender not in ["you", "prospect", "other"]:
            raise ValueError(f"Invalid sender: {self.sender}")


@dataclass
class Conversation:
    """Conversation thread (no IDs/timestamps)."""
    title: str
    description: Optional[str] = None
    participants: List[Participant] = field(default_factory=list)
    messages: List[Message] = field(default_factory=list)

    def __post_init__(self):
        if not self.title or not self.title.strip():
            raise ValueError("Conversation title cannot be empty")

"""
Data models for conversation and message inputs.
Only includes fields necessary for analysis - no IDs or timestamps.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Literal
from enum import Enum


class SenderRole(str, Enum):
    """Message sender roles."""
    YOU = "you"
    PROSPECT = "prospect"
    OTHER = "other"


@dataclass
class Participant:
    """Conversation participant."""
    id: str
    name: str
    role: Literal["you", "prospect", "other"]


@dataclass
class Link:
    """Message link attachment."""
    url: str
    title: Optional[str] = None


@dataclass
class Mention:
    """Message mention."""
    name: str
    profile_url: Optional[str] = None


@dataclass
class Reaction:
    """Message reaction."""
    type: str
    by: str
    timestamp: Optional[str] = None


@dataclass
class Attachment:
    """Message attachment."""
    type: str
    url: str
    filename: Optional[str] = None
    bytes: Optional[bytes] = None


@dataclass
class Message:
    """Conversation message (no IDs/timestamps - ordering handled by DB)."""
    sender: Literal["you", "prospect", "other"]
    text: str
    links: List[Link] = field(default_factory=list)
    mentions: List[Mention] = field(default_factory=list)
    reactions: List[Reaction] = field(default_factory=list)
    attachments: List[Attachment] = field(default_factory=list)
    
    def __post_init__(self):
        """Validate message."""
        if not self.text or not self.text.strip():
            raise ValueError("Message text cannot be empty")
        if self.sender not in ["you", "prospect", "other"]:
            raise ValueError(f"Invalid sender: {self.sender}")


@dataclass
class Conversation:
    """Conversation thread (no IDs/timestamps)."""
    title: str
    description: Optional[str] = None
    participants: List[Participant] = field(default_factory=list)
    messages: List[Message] = field(default_factory=list)
    
    def __post_init__(self):
        """Validate conversation."""
        if not self.title or not self.title.strip():
            raise ValueError("Conversation title cannot be empty")
        
        # Find prospect if available
        self.prospect_participant = next(
            (p for p in self.participants if p.role == "prospect"),
            None
        )
        
        # Count messages by sender
        self.prospect_messages = [m for m in self.messages if m.sender == "prospect"]
        self.your_messages = [m for m in self.messages if m.sender == "you"]

