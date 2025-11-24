"""
Response generator that uses the orchestrator pipeline to generate actual responses.
This is the real AI module that should be used by both simulator and production.
"""

from typing import Dict, Any
from io_models import Conversation
from orchestrator import run_pipeline
from static_scripts import (
    get_prompt_blocks, 
    cta_templates,
    get_conversation_guidance,
    get_phase_specific_context,
    get_prodicity_introduction_variants,
    get_application_info,
    get_prodicity_examples,
)
from knowledge_base import retrieve as kb_retrieve
from config import Config


def generate_response(conv: Conversation) -> str:
    """
    Generate an AI response using the full orchestrator pipeline.
    This is the actual production response generator.
    """
    # Run the pipeline to get analysis
    result = run_pipeline(conv)
    
    phase = result["phase"]
    recommendation = result["recommendation"]
    knowledge_context = result["knowledge_context"]
    if Config.DEBUG:
        print(
            f"[Generator] Phase={phase} Recommendation={recommendation} "
            f"KB snippets={len(knowledge_context or [])}"
        )
    
    # Handle empty conversations
    if not conv.messages:
        if Config.DEBUG:
            print("[Generator] Warning: Empty conversation, using fallback")
        return "hey! what's up?"
    
    prospect_name = next((p.name for p in conv.participants if p.role == "prospect"), "Prospect")
    
    # Get recent messages for context (last 10 or all if fewer)
    recent_messages = conv.messages[-10:] if len(conv.messages) > 10 else conv.messages
    
    # Get conversation state for guidance
    conversation_state = {
        "message_count": len(conv.messages),
        "prospect_message_count": sum(1 for m in conv.messages if m.sender == "prospect"),
        "has_questions": result.get("signals", {}).get("has_questions", False),
        "engagement": result.get("scores", {}).get("engagement", 0.0),
        "sentiment": result.get("scores", {}).get("sentiment", 0.0),
    }
    
    # Get static scripts guidance
    guidance = get_conversation_guidance(phase, conversation_state)
    prompt_blocks = get_prompt_blocks(phase)
    phase_context = get_phase_specific_context(phase)
    if Config.DEBUG:
        print(
            "[Generator] Guidance next_step:",
            guidance.get("next_step", ""),
        )
        print("[Generator] Prompt blocks included:", len(prompt_blocks))
    
    # Build system prompt with KB context and static scripts
    kb_context_text = ""
    if knowledge_context:
        kb_context_text = "\n\n=== KNOWLEDGE BASE CONTEXT ===\n"
        kb_context_text += "Use this information to answer questions accurately. This includes background info, friends, schools, and other context:\n\n"
        for idx, snippet in enumerate(knowledge_context[:5], 1):  # Show up to 5 snippets
            source = snippet.get('source', 'General')
            snippet_text = snippet.get('snippet', snippet.get('answer', ''))
            question = snippet.get('question', '')
            
            # Format nicely
            if question:
                kb_context_text += f"{idx}. Q: {question}\n"
            if snippet_text:
                kb_context_text += f"   A: {snippet_text}\n"
            if source and source != 'General':
                kb_context_text += f"   Source: {source}\n"
            kb_context_text += "\n"
    
    # Build static scripts context - frame as GUIDELINES, not templates
    scripts_context = "\n\n=== CONVERSATION GUIDELINES (NOT TEMPLATES) ===\n"
    scripts_context += "IMPORTANT: The scripts below are GUIDELINES for conversation flow, NOT templates to copy word-for-word. "
    scripts_context += "You must adapt to the actual conversation naturally. If the student asks a question or the conversation "
    scripts_context += "takes an interesting turn, respond authentically to that - don't force the script. Build genuine rapport first.\n\n"
    
    scripts_context += phase_context + "\n\n"
    
    if prompt_blocks:
        scripts_context += "These are reference points for the conversation direction, but always prioritize natural flow:\n"
        scripts_context += "\n".join(prompt_blocks)
    
    # Add specific guidance for selling phase
    if phase == "doing_the_ask" and result.get("ready_for_ask", False):
        scripts_context += "\n\n=== READY FOR APPLICATION ===\n"
        scripts_context += "The lead is ready. You can introduce Prodicity naturally when it fits the conversation flow. "
        scripts_context += "Don't force it - wait for a natural opening.\n"
        scripts_context += f"Application info (use when they ask or show interest): {get_application_info()}\n"
        scripts_context += f"Examples (reference if relevant): {get_prodicity_examples()}\n"
    if Config.DEBUG:
        print("[Generator] System prompt prepared.")
    
    system_prompt = (
        "You are a sales agent for Prodicity, a selective fellowship helping high school students ship real outcomes "
        "(startups, research, internships, passion projects). Your goal is to build genuine rapport and guide students "
        "toward applying when they're ready.\n\n"
        "STYLE GUIDELINES:\n"
        "- Keep messages SHORT (max 200 chars) - like a text message\n"
        "- Casual, friendly tone - like talking to a friend, not a sales pitch\n"
        "- Be natural and understated - don't be overly enthusiastic or salesy\n"
        "- NO EMOJIS. NO MARKDOWN. Just plain text like a normal message\n"
        "- Show genuine interest in what they're working on\n\n"
        "CRITICAL CONVERSATION RULES:\n"
        "1. ALWAYS respond naturally to what the student actually says first\n"
        "2. If they ask a question, answer it directly and helpfully\n"
        "3. If the conversation goes in an interesting direction, follow it - don't force the script\n"
        "4. The guidelines below are for general direction, but actual conversation flow is more important\n"
        "5. Don't copy scripts verbatim - adapt them to the context naturally\n"
        "6. Build genuine rapport before selling - students can sense when you're just following a script\n\n"
        f"Current phase: {phase}\n"
        f"Analyst recommendation: {recommendation}\n"
        f"{scripts_context}"
        f"{kb_context_text}"
    )
    
    # Build multi-turn conversation messages array
    messages = []
    
    # 1. Add system message (contains instructions, scripts, KB)
    messages.append({"role": "system", "content": system_prompt})
    
    # 2. Add conversation history as alternating user/assistant messages
    # Only include messages up to (but not including) the last one
    conversation_history = recent_messages[:-1] if len(recent_messages) > 1 else []
    
    for msg in conversation_history:
        if msg.sender == "prospect":
            messages.append({"role": "user", "content": msg.text})
        elif msg.sender == "you":
            messages.append({"role": "assistant", "content": msg.text})
        # Skip "other" sender type
    
    # 3. Add current prospect message (what we're responding to)
    if recent_messages:
        last_msg = recent_messages[-1]
        if last_msg.sender == "prospect":
            # Build guidance hint for the current message
            guidance_hint = ""
            if phase == "building_rapport":
                guidance_hint = (
                    "\n\n[Guidance: Respond naturally to what they said. "
                    "If they asked a question, answer it directly. "
                    "Adapt the question probes from system prompt to the conversation.]"
                )
            elif phase == "doing_the_ask":
                guidance_hint = (
                    "\n\n[Guidance: Respond naturally first. "
                    "If appropriate, introduce Prodicity naturally. "
                    "Don't force it - wait for a natural opening.]"
                )
                if result.get("ready_for_ask", False):
                    guidance_hint += " The lead is ready - you can share the application link if they show interest."
            
            messages.append({
                "role": "user",
                "content": last_msg.text + guidance_hint
            })
        elif last_msg.sender == "you":
            # Last message is from us - this shouldn't happen in normal flow,
            # but handle it gracefully by not adding it (we already responded)
            if Config.DEBUG:
                print("[Generator] Warning: Last message is from us, skipping")
    
    # Ensure we have at least one user message
    if not any(msg["role"] == "user" for msg in messages):
        if Config.DEBUG:
            print("[Generator] Warning: No user messages in conversation, using fallback")
        return "hey! what's up?"
    
    if Config.DEBUG:
        print(f"[Generator] Built {len(messages)} messages (1 system + {len(messages)-1} conversation turns)")
    
    # Generate response using multi-turn conversation format
    from openai import OpenAI
    
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    
    try:
        # Calculate max_tokens: 200 chars ≈ 50-60 tokens, but give headroom for cleanup
        # Average English: ~4 chars per token, so 200 chars = ~50 tokens, use 80 for safety
        max_tokens_for_response = 80
        
        chat_kwargs = {
            "model": Config.OPENAI_MODEL,
            "messages": messages,  # Multi-turn format
            "max_tokens": max_tokens_for_response,
        }
        # Include temperature for gpt-4o (and most models except gpt-5)
        if Config.OPENAI_MODEL not in ["gpt-5"]:
            chat_kwargs["temperature"] = 0.7
        
        resp = client.chat.completions.create(**chat_kwargs)
        response_text = resp.choices[0].message.content.strip() if resp.choices else ""
        
        if response_text:
            # Clean up response - remove emojis and markdown
            import re
            # Remove emojis
            response_text = re.sub(r'[^\w\s\.,!?\-\(\)\']', '', response_text)
            response_text = response_text.strip().strip('"').strip("'")
            if len(response_text) > 200:
                response_text = response_text[:197] + "..."
            if response_text:
                return response_text
    except Exception as e:
        print(f"[Error generating response: {e}]")
    
    # Final fallback - use static scripts if available
    blocks = get_prompt_blocks(phase)
    if blocks and isinstance(blocks, list) and blocks:
        return blocks[0]
    
    # Last resort fallback
    if phase == "building_rapport":
        return "that's really cool — tell me more about that?"
    return "mind if i share a quick program that helps students actually ship outcomes?"


