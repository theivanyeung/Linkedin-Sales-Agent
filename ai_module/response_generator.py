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
    
    # Build conversation context
    recent_messages = conv.messages[-10:] if len(conv.messages) > 10 else conv.messages
    conversation_text = "\n".join([
        f"{'You' if msg.sender == 'you' else 'Prospect'}: {msg.text}"
        for msg in recent_messages
    ])
    
    prospect_name = next((p.name for p in conv.participants if p.role == "prospect"), "Prospect")
    
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
        kb_context_text = "\n\nKnowledge Base Context:\n" + "\n".join([
            f"- {snippet.get('source', '')}: {snippet.get('snippet', '')}"
            for snippet in knowledge_context[:3]
        ])
    
    # Build static scripts context
    scripts_context = "\n\n=== STATIC SCRIPTS & GUIDANCE ===\n"
    scripts_context += phase_context + "\n\n"
    if prompt_blocks:
        scripts_context += "\n".join(prompt_blocks)
    
    # Add specific guidance for selling phase
    if phase == "doing_the_ask" and result.get("ready_for_ask", False):
        scripts_context += "\n\n=== READY FOR APPLICATION ===\n"
        scripts_context += "The lead is ready. You can introduce Prodicity and share the application link if they show interest.\n"
        scripts_context += f"Application info: {get_application_info()}\n"
        scripts_context += f"Examples: {get_prodicity_examples()}\n"
    if Config.DEBUG:
        print("[Generator] System prompt prepared.")
    
    system_prompt = (
        "You are a sales agent for Prodicity, helping high school students ship real outcomes "
        "(startups, research, internships, passion projects). "
        "Keep messages SHORT (max 200 chars), casual, friendly, like talking to a friend. "
        "Be natural and understated - don't be overly enthusiastic or salesy. "
        "NO EMOJIS. NO MARKDOWN. Just plain text like a normal text message.\n\n"
        f"Current phase: {phase}\n"
        f"Recommendation: {recommendation}\n"
        f"{scripts_context}"
        f"{kb_context_text}"
    )
    
    # Build user prompt with conversation context and guidance
    guidance_hint = ""
    if phase == "building_rapport":
        guidance_hint = "\n\nGuidance: Ask thoughtful questions to understand their project/idea. Use the question probes provided in the system prompt."
    elif phase == "doing_the_ask":
        guidance_hint = "\n\nGuidance: If appropriate, introduce Prodicity in a way that's relevant to what they've shared. Reference specific things from the conversation."
        if result.get("ready_for_ask", False):
            guidance_hint += " The lead is ready - you can share the application link if they show interest."
    if Config.DEBUG:
        print("[Generator] User prompt guidance:", guidance_hint.strip())
    
    user_prompt = (
        f"Generate your next response to {prospect_name} based on this conversation:\n\n"
        f"{conversation_text}\n"
        f"{guidance_hint}\n\n"
        f"Your response (SHORT, casual, friendly, max 200 chars, JUST plain text message, NO emojis, NO markdown):"
    )
    
    # Generate response using traditional chat.completions
    from openai import OpenAI
    
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    
    try:
        chat_kwargs = {
            "model": Config.OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 100,
        }
        # Only include temperature if model supports it
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


