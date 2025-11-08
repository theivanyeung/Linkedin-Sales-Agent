"""
Supabase-backed knowledge base storage and retrieval helpers.
"""

from __future__ import annotations

from typing import List, Dict, Optional, Any

from supabase import create_client, Client
from openai import OpenAI

from config import Config

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

_supabase_client: Optional[Client] = None


def _get_supabase() -> Client:
    """Create or reuse a Supabase client."""
    global _supabase_client
    if _supabase_client is None:
        if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_KEY."
            )
        _supabase_client = create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_KEY,
        )
    return _supabase_client


def _embed_text(text: str) -> List[float]:
    """Generate embedding vector using OpenAI."""
    if not Config.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for embeddings.")
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    embedding = response.data[0].embedding
    if len(embedding) != EMBEDDING_DIM:
        raise ValueError(
            f"Unexpected embedding dimension {len(embedding)} (expected {EMBEDDING_DIM})"
        )
    return embedding


def add_document(
    *,
    question: Optional[str],
    answer: str,
    source: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Store a knowledge base entry with embedding.

    Returns the inserted Supabase row.
    """
    if not answer or not answer.strip():
        raise ValueError("Answer text cannot be empty.")

    text_to_embed = "\n".join(filter(None, [question, answer]))
    embedding = _embed_text(text_to_embed)

    supabase = _get_supabase()
    payload = {
        "source": source,
        "question": question,
        "answer": answer,
        "tags": tags or [],
        "embedding": embedding,
    }

    result = supabase.table("kb_documents").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Failed to insert knowledge base document.")
    return result.data[0]


def retrieve(query: str, k: int = 5, threshold: float = 0.7) -> List[Dict[str, Any]]:
    """
    Retrieve top-k knowledge base snippets for the given query.

    Returns list of dictionaries containing source, question, snippet, and similarity.
    """
    query = (query or "").strip()
    if not query:
        return []

    embedding = _embed_text(query)
    supabase = _get_supabase()

    try:
        response = supabase.rpc(
            "match_kb_documents",
            {
                "query_embedding": embedding,
                "match_threshold": threshold,
                "match_count": k,
            },
        ).execute()
    except Exception:
        # Fallback if RPC is not available
        response = (
            supabase.table("kb_documents")
            .select("id, source, question, answer, tags")
            .limit(k)
            .execute()
        )
        rows = response.data or []
        return [
            {
                "id": row.get("id"),
                "source": row.get("source"),
                "question": row.get("question"),
                "snippet": row.get("answer"),
                "tags": row.get("tags", []),
                "similarity": None,
            }
            for row in rows
        ]

    rows = response.data or []
    return [
        {
            "id": row.get("id"),
            "source": row.get("source"),
            "question": row.get("question"),
            "snippet": row.get("answer"),
            "tags": row.get("tags", []),
            "similarity": row.get("similarity"),
        }
        for row in rows
    ]


def list_recent(limit: int = 20) -> List[Dict[str, Any]]:
    """Return recent KB entries for UI display."""
    supabase = _get_supabase()
    response = (
        supabase.table("kb_documents")
        .select("id, source, question, answer, tags, created_at, updated_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


