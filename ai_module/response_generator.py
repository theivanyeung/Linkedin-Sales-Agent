"""
Response generator that uses the orchestrator pipeline to generate actual responses.
This is the real AI module that should be used by both simulator and production.
"""

import time
from typing import Dict, Any, Optional
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
from anthropic import Anthropic


def generate_response(conv: Conversation, analysis_result: Optional[Dict[str, Any]] = None) -> str:
    """
    Generate an AI response using the full orchestrator pipeline.
    This is the actual production response generator.
    
    Args:
        conv: The conversation to generate a response for
        analysis_result: Optional pre-computed analysis result. If provided, skips calling run_pipeline.
    """
    # Use provided analysis result if available, otherwise run pipeline
    result = analysis_result if analysis_result is not None else run_pipeline(conv)
    
    phase = result["phase"]
    knowledge_context = result["knowledge_context"]
    instruction_for_writer = result.get("instruction_for_writer", "")
    if Config.DEBUG:
        print(
            f"[Generator] Phase={phase} Instruction={instruction_for_writer} "
            f"KB snippets={len(knowledge_context or [])}"
        )
        if instruction_for_writer:
            print(f"[Generator] Strategic instruction: {instruction_for_writer}")
    
    # Handle empty conversations
    if not conv.messages:
        if Config.DEBUG:
            print("[Generator] Warning: Empty conversation, cannot generate response")
        return ""  # Return empty string, don't generate response
    
    prospect_name = next((p.name for p in conv.participants if p.role == "prospect"), "Prospect")
    
    # Safety check: If conversation history is missing the initial message but we have a prospect reply
    # (Edge case where history ingest misses the first message)
    has_our_messages = any(m.sender == "you" for m in conv.messages)
    initial_message_context = ""
    if not has_our_messages and len(conv.messages) > 0:
        # We have prospect messages but no "you" messages - initial outreach is missing from history
        initial_message_context = "\n\n=== IMPORTANT CONTEXT ===\n"
        initial_message_context += "Note: You have already sent the initial outreach. The user has replied. "
        initial_message_context += "Do not re-introduce yourself or send the initial message again.\n"
        if Config.DEBUG:
            print("[Generator] Warning: Conversation history missing initial message - injecting context")
    
    # Get recent messages for context (last 10 or all if fewer)
    recent_messages = conv.messages[-10:] if len(conv.messages) > 10 else conv.messages
    
    # Check if last message is from us - if so, don't generate response
    if recent_messages:
        last_msg = recent_messages[-1]
        if last_msg.sender == "you":
            if Config.DEBUG:
                print("[Generator] Last message is from us - no response needed")
            return ""  # Return empty string, don't generate response
    
    # Get conversation state for guidance (minimal - only message counts)
    conversation_state = {
        "message_count": len(conv.messages),
        "prospect_message_count": sum(1 for m in conv.messages if m.sender == "prospect"),
    }
    
    # Get static scripts guidance
    prompt_build_start = time.time()
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
    prompt_build_time = time.time() - prompt_build_start
    if Config.DEBUG:
        print("[Generator] System prompt prepared.")
        if prompt_build_time < 0.001:
            print(f"[Generator] Prompt building completed: {prompt_build_time*1000:.2f}ms")
        else:
            print(f"[Generator] Prompt building completed: {prompt_build_time*1000:.2f}ms")
    
    # Dynamic length instruction based on whether we have a strategic instruction
    if instruction_for_writer:
        length_instruction = (
            "You have a STRATEGIC INSTRUCTION to execute. You are allowed to write up to 400-500 characters "
            "to fully execute the Strategy (Pitch + Options + Question). Do not skip parts of the instruction just to be brief."
        )
    else:
        length_instruction = "Keep messages SHORT (aim for ~200 chars) - like a text message."
    
    # Note: Strategic instruction is now injected directly into the user message content
    # This ensures Claude treats it as an immediate task rather than a background suggestion
    
    system_prompt = (
        "You are a sales agent for Prodicity, a selective fellowship helping high school students ship real outcomes "
        "(startups, research, internships, passion projects). Your goal is to build genuine rapport and guide students "
        "toward applying when they're ready.\n\n"
        "STYLE GUIDELINES:\n"
        f"- {length_instruction}\n"
        "- If the response needs to be longer to answer their question properly, that's okay\n"
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
        "6. Build genuine rapport before selling - students can sense when you're just following a script\n"
        "7. ANTI-WALL-OF-TEXT RULE: If you Pitch the product, DO NOT ask deep discovery questions in the same message. Pitching + CTA is enough. Keep it under 600 characters max.\n\n"
        f"Current phase: {phase}\n"
        f"{initial_message_context}"
        f"{scripts_context}"
        f"{kb_context_text}"
    )
    
    # Build conversation messages for Anthropic API
    # Anthropic uses separate system parameter and messages array
    message_build_start = time.time()
    anthropic_messages = []
    
    # 1. Add conversation history as alternating user/assistant messages
    # Only include messages up to (but not including) the last one
    conversation_history = recent_messages[:-1] if len(recent_messages) > 1 else []
    
    for msg in conversation_history:
        if msg.sender == "prospect":
            anthropic_messages.append({"role": "user", "content": msg.text})
        elif msg.sender == "you":
            anthropic_messages.append({"role": "assistant", "content": msg.text})
        # Skip "other" sender type
    
    # 2. Add current prospect message (what we're responding to)
    # Note: We already checked above that last message is from prospect, so this should always be true
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
            
            # Build final user content
            user_content = last_msg.text + guidance_hint
            
            # INJECT STRATEGY HERE - This forces Claude to treat it as an immediate constraint
            if instruction_for_writer:
                user_content += (
                    f"\n\n[[SYSTEM: STRATEGY ORDER: {instruction_for_writer}. "
                    f"IGNORE standard brevity if needed to pitch, but MAX 650 chars.]]"
                )
            
            anthropic_messages.append({
                "role": "user",
                "content": user_content
            })
        else:
            # This shouldn't happen since we checked above, but handle gracefully
            if Config.DEBUG:
                print("[Generator] Warning: Last message is not from prospect, cannot generate response")
            return ""
    
    # Ensure we have at least one user message
    if not any(msg["role"] == "user" for msg in anthropic_messages):
        if Config.DEBUG:
            print("[Generator] Warning: No user messages in conversation, cannot generate response")
        return ""  # Return empty string, don't return status message
    
    message_build_time = time.time() - message_build_start
    if Config.DEBUG:
        print(f"[Generator] Built {len(anthropic_messages)} conversation messages")
        if message_build_time < 0.001:
            print(f"[Generator] Message building completed: {message_build_time*1000:.2f}ms")
        else:
            print(f"[Generator] Message building completed: {message_build_time*1000:.2f}ms")
    
    # Generate response using Anthropic Claude
    if not Config.ANTHROPIC_API_KEY:
        if Config.DEBUG:
            print("[Generator] Error: ANTHROPIC_API_KEY not set")
        return ""
    
    anthropic_client = Anthropic(api_key=Config.ANTHROPIC_API_KEY)
    
    try:
        # Calculate max_tokens: Hard safety limit to prevent walls of text
        # Average English: ~4 chars per token
        # 250 tokens ≈ 1000 chars - safe ceiling for all responses
        # Let the prompt control brevity, not the token limit
        max_tokens_for_response = 250
        
        # Time the Anthropic API call
        api_start = time.time()
        if Config.DEBUG:
            print("[Generator] Calling Anthropic API (claude-sonnet-4-5)...")
        
        # Use Claude Sonnet 4.5
        resp = anthropic_client.messages.create(
            model="claude-sonnet-4-5",
            system=system_prompt,
            messages=anthropic_messages,
            max_tokens=max_tokens_for_response,
            temperature=0.7,
        )
        
        api_time = time.time() - api_start
        if Config.DEBUG:
            if api_time < 1:
                print(f"[Generator] Anthropic API call completed: {api_time*1000:.0f}ms")
            else:
                print(f"[Generator] Anthropic API call completed: {api_time:.2f}s")
        
        response_text = resp.content[0].text.strip() if resp.content else ""
        
        if response_text:
            # Clean up response - remove emojis and markdown
            processing_start = time.time()
            import re
            # Remove emojis
            response_text = re.sub(r'[^\w\s\.,!?\-\(\)\':/=&_]', '', response_text)
            response_text = response_text.strip().strip('"').strip("'")
            processing_time = time.time() - processing_start
            if Config.DEBUG:
                if processing_time < 0.001:
                    print(f"[Generator] Response processing completed: {processing_time*1000:.2f}ms")
                else:
                    print(f"[Generator] Response processing completed: {processing_time*1000:.2f}ms")
            
            # Log if response is longer than recommended (but don't truncate)
            if len(response_text) > 200:
                if Config.DEBUG:
                    print(f"[Generator] Warning: Response is {len(response_text)} chars (recommended max: 200)")
            
            if response_text:
                return response_text
    except Exception as e:
        error_msg = str(e)
        if Config.DEBUG:
            print(f"[Generator] Error generating response: {error_msg}")
            import traceback
            traceback.print_exc()
        
        # Provide helpful error messages for common issues
        if "credit" in error_msg.lower() or "balance" in error_msg.lower():
            if Config.DEBUG:
                print("[Generator] Anthropic API: Low credit balance. Please add credits to your account.")
        elif "api_key" in error_msg.lower() or "authentication" in error_msg.lower():
            if Config.DEBUG:
                print("[Generator] Anthropic API: Invalid API key. Check ANTHROPIC_API_KEY in .env file.")
    
    # If we get here, generation failed - return empty string
    # Don't return fallback messages as they're not real responses
    if Config.DEBUG:
        print("[Generator] Failed to generate response, returning empty string")
    return ""


