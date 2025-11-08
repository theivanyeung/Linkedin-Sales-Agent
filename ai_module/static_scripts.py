"""
Static scripts for building rapport and selling phases.

Provides templates, question probes, and context to guide the LLM in
progressing conversations from engaged lead → application pipeline.
"""

from typing import List, Dict, Optional


# ============================================================================
# BUILDING RAPPORT PHASE
# ============================================================================

def get_initial_message_template() -> str:
    """Template for the initial outreach message."""
    return (
        "hey {name}, I'm currently researching what students at {school} are working on "
        "outside of school, like nonprofits, research, internships, or passion projects. "
        "Are you working on any great projects or ideas?"
    )


def get_question_probes() -> Dict[str, str]:
    """Question probes to uncover motivation, pain points, and vision."""
    return {
        "initial_probe": (
            "What got you interested in that project/idea, especially with the "
            "high-stakes grind at {school}?"
        ),
        "pain_roadblock_probe": (
            "Anything holding it back? burnout from APs, lack of direction, "
            "or fitting it around everything else"
        ),
        "vision_aspiration_probe": (
            "What's your goal for it? Where do you see it going in the future?"
        ),
    }


def get_rapport_context() -> str:
    """Context information to introduce relevance."""
    return (
        "I'm curious to see what students are doing outside of academics, "
        "since I'm working on building a school to optimize learning"
    )


# ============================================================================
# SELLING PHASE
# ============================================================================

def get_prodicity_introduction_variants() -> List[str]:
    """Variants for introducing Prodicity."""
    return [
        (
            "My close friend from {school} pointed me towards the students here. "
            "They ran a quite successful nonprofit a few years ago.\n\n"
            "From what you've told me about {their_idea/pain/vision}, it seems like "
            "Prodicity could line up well. It's a selective fellowship for exceptional "
            "high schoolers, guided by mentors from Stanford, MIT, and similar institutions, "
            "to achieve tangible outcomes like internships, research positions, or successful "
            "startups/nonprofits next summer.\n\n"
            "We start in early 2026 with building up towards summer goals. If that sounds "
            "like a fit, I can share the application link. Let me know"
        ),
        (
            "Based on our conversations, I think you'd be a solid fit. I usually don't do this, "
            "but I can send over an application link if you'd be interested. Let me know"
        ),
    ]


def get_prodicity_examples() -> str:
    """Examples of past students' successful outcomes."""
    return (
        "Examples:\n\n"
        "Worked with a uk student on providing students with meaningful and impactful "
        "volunteering work throughout London: https://equitygroupuk.org/\n\n"
        "Interactive music sessions to improve the cognition and lives of elderly with "
        "neurodegenerative diseases, servicing most care facilities and rehabilitation efforts "
        "throughout dallas: https://www.musicforthemind.live/\n\n"
        "Mental wellness for high schoolers throughout the bay especially since it's a "
        "hypercompetitive environment which isn't that healthy for youth: "
        "https://www.linkedin.com/company/share-onnonprofit/\n\n"
        "These are the most recent ones but yeah, our students are quite fulfilled even if "
        "what they did was difficult since it was meaningful and had purpose"
    )


def get_application_info() -> str:
    """Application link and deadline information."""
    return (
        "Sure, apply here: https://app.prodicity.org/application\n\n"
        "Spots are limited, so if applying, aim to get it submitted by Nov 23nd, "
        "for interviews as we're finalizing applications"
    )


def get_call_scheduling() -> str:
    """Call scheduling information."""
    return (
        "Again, I don't usually do this but you seem like an interesting person so if you want, "
        "you can schedule a 10 minute call with me this Saturday morning/noon: "
        "https://calendly.com/theivanyeung/call"
    )


def get_pricing_info() -> str:
    """Pricing and financial aid information."""
    return (
        "The application is free. If accepted, there's a program fee; it's on the premium side, "
        "but we have financial aid and scholarships based on need. It's $485/month with a "
        "$985 initial deposit. More details here: https://www.prodicity.org/fellowship"
    )


# ============================================================================
# PROMPT BLOCKS FOR LLM CONTEXT
# ============================================================================

def get_prompt_blocks(phase: str) -> List[str]:
    """
    Return prompt blocks/guidance for the LLM based on the current phase.
    These provide context and guidance on what to say and how to progress.
    """
    blocks = []
    
    if phase == "building_rapport":
        blocks.extend([
            "PHASE: Building Rapport",
            "",
            "Goal: Engage the lead, ask questions, validate their responses, and build trust.",
            "",
            "Available Question Probes:",
            f"1. Initial Probe (uncover motivation): {get_question_probes()['initial_probe']}",
            f"2. Pain/Roadblock Probe (highlight barriers): {get_question_probes()['pain_roadblock_probe']}",
            f"3. Vision/Aspiration Probe (steer to impact): {get_question_probes()['vision_aspiration_probe']}",
            "",
            "Context to share when relevant:",
            get_rapport_context(),
            "",
            "Guidelines:",
            "- Ask follow-up questions to understand their project/idea deeply",
            "- Show genuine interest and validate their work",
            "- Use the probes strategically based on what they've shared",
            "- Keep messages short and conversational",
        ])
    
    elif phase == "doing_the_ask":
        blocks.extend([
            "PHASE: Selling / Introducing Prodicity",
            "",
            "Goal: Introduce Prodicity, highlight fit, and guide toward application.",
            "",
            "When to introduce Prodicity:",
            "- Lead has shown engagement (answered questions, shared details about their project)",
            "- You understand their motivation, pain points, or vision",
            "- Sentiment is positive and engagement is high",
            "",
            "Introduction Approaches:",
        ])
        # Add introduction variants
        for i, intro in enumerate(get_prodicity_introduction_variants(), 1):
            blocks.append(f"{i}. {intro}")
            blocks.append("")
        
        blocks.extend([
            "When lead shows interest:",
            get_application_info(),
            "",
            "Supporting Examples:",
            get_prodicity_examples(),
            "",
            "Additional Options:",
            "- If appropriate, offer to schedule a call: " + get_call_scheduling(),
            "- If they ask about pricing: " + get_pricing_info(),
            "",
            "Guidelines:",
            "- Reference specific things they've told you about their project/idea",
            "- Make it personal and relevant to their situation",
            "- Provide the application link when they show interest",
            "- Be helpful and answer questions about the program",
        ])
    
    return blocks


def cta_templates() -> List[str]:
    """Return CTA templates for the selling phase."""
    return [
        "If that sounds like a fit, I can share the application link. Let me know",
        "I can send over an application link if you'd be interested. Let me know",
        "If you're interested, I can share the application link",
    ]


# ============================================================================
# CONVERSATION PROGRESSION HELPERS
# ============================================================================

def get_conversation_guidance(phase: str, conversation_state: Optional[Dict] = None) -> Dict[str, str]:
    """
    Get guidance on how to progress the conversation based on phase and state.
    
    Returns:
        Dict with 'next_step', 'key_questions', 'context_to_use', etc.
    """
    guidance = {
        "phase": phase,
        "next_step": "",
        "key_questions": [],
        "context_to_use": "",
        "cta_if_ready": "",
    }
    
    if phase == "building_rapport":
        probes = get_question_probes()
        guidance.update({
            "next_step": "Ask probing questions to understand their motivation, pain points, and vision",
            "key_questions": list(probes.values()),
            "context_to_use": get_rapport_context(),
            "ready_to_introduce_prodicity": False,
        })
        
        # Check if we've gathered enough information
        if conversation_state:
            messages_count = conversation_state.get("message_count", 0)
            prospect_messages = conversation_state.get("prospect_message_count", 0)
            has_questions = conversation_state.get("has_questions", False)
            
            if messages_count >= 5 and prospect_messages >= 2 and has_questions:
                guidance["ready_to_introduce_prodicity"] = True
                guidance["next_step"] = "Consider introducing Prodicity if sentiment is positive"
    
    elif phase == "doing_the_ask":
        guidance.update({
            "next_step": "Introduce Prodicity and guide toward application",
            "context_to_use": get_prodicity_introduction_variants()[0],
            "cta_if_ready": get_application_info(),
            "examples": get_prodicity_examples(),
        })
    
    return guidance


def get_phase_specific_context(phase: str) -> str:
    """Get a concise context string for the current phase to include in prompts."""
    if phase == "building_rapport":
        return (
            "You are in the BUILDING RAPPORT phase. Your goal is to engage the lead, "
            "ask thoughtful questions about their projects/ideas, understand their motivation, "
            "pain points, and vision. Use the provided question probes strategically. "
            "Keep messages short, conversational, and show genuine interest."
        )
    elif phase == "doing_the_ask":
        return (
            "You are in the SELLING/DOING THE ASK phase. Your goal is to introduce Prodicity "
            "in a way that's relevant to what they've shared, highlight the fit, and guide them "
            "toward the application. Reference specific things they've told you. When they show "
            "interest, provide the application link and deadline information."
        )
    else:
        return f"You are in the {phase} phase."
