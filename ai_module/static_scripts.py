"""
Static sales scripts organised by phase and sub-phase.

Phase data is stored in a structured dictionary so it’s easy to add new
phases, variants, or copy blocks without touching application logic.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Any


# --------------------------------------------------------------------------- #
# Phase library
# --------------------------------------------------------------------------- #

PHASE_LIBRARY: Dict[str, Dict[str, Any]] = {
    "building_rapport": {
        "name": "Building Rapport",
        "summary": (
            "Engage the lead, ask questions, validate their responses, and build trust."
        ),
        "initial_message": (
            "hey {name}, I'm currently researching what students at {school} are working on "
            "outside of school, like nonprofits, research, internships, or passion projects. "
            "Are you working on any great projects or ideas?"
        ),
        "sections": {
            "engaging_with_lead": {
                "description": "Ask questions and validate their responses.",
                "probes": {
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
                },
            },
            "no_initiative": {
                "description": "Probes for students who aren't working on projects or ideas yet.",
                "probes": {
                    "uncover_interests_probe": (
                        "I see. What are you most excited about right now? What are your main interests outside of school?"
                    ),
                    "barriers_and_vision_probe": (
                        "What's holding you back from exploring those interests, like busy with class or finding direction? "
                        "If you could start something meaningful, what would that look like?"
                    ),
                },
            },
            "relevance_context": {
                "description": "Light touch context that keeps things personal.",
                "script": (
                    "I'm curious to see what students are doing outside of academics, "
                    "since I'm working on building a school to optimize learning"
                ),
            },
        },
        "guidelines": [
            "Ask follow-up questions to understand their project/idea deeply OR their interests if they're not working on anything yet.",
            "Show genuine interest and validate the student's work or interests.",
            "Use the appropriate probes based on their situation - whether they have initiative or not.",
            "Keep responses short, conversational, and natural.",
        ],
    },
    "doing_the_ask": {
        "name": "Selling / Doing the Ask",
        "summary": (
            "Introduce Prodicity naturally, highlight fit, and guide toward application."
        ),
        "sections": {
            "introduction": {
                "description": "Introduce Prodicity once the lead is engaged.",
                "variants": [
                    (
                        "My close friend from {school} pointed me towards the students here. "
                    ),
                    (
                        "They ran a quite successful nonprofit a few years ago."
                    ),
                    (
                       "From what you've told me about {their_idea_pain_vision}, it seems like Prodicity could line up well. It's a selective fellowship for exceptional high schoolers, guided by mentors from Stanford, MIT, and similar institutions, to achieve tangible outcomes like internships, research positions, or successful startups/nonprofits next summer."
                    ),
                    (
                       "We start in early 2026 with building up towards summer goals. If that sounds like a fit, I can share the application link. Let me know"
                    ),
                ],
            },
            "application": {
                "description": "How to follow up when the lead shows interest.",
                "script": (
                    "Sure, apply here: https://www.prodicity.org\n"
                    "Spots are limited, so if applying, aim to get it submitted by Dec 19th. "
                    "for interviews as we're finalizing applications\n"
                ),
                "cta_templates": [
                    "If that sounds like a fit, I can share the application link. Let me know",
                    "I can send over an application link if you'd be interested. Let me know",
                    "If you're interested, I can share the application link",
                ],
            },
            "social_proof": {
                "description": "Recent student wins that demonstrate credibility.",
                "script": (
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
                ),
            },
            "call_scheduling": {
                "description": "Offer a quick call if the lead seems strong.",
                "script": (
                    "Again, I don't usually do this but you seem like an interesting person so if you want, "
                    "you can schedule a 10 minute call with me this Saturday morning/noon: "
                    "https://calendly.com/theivanyeung/call"
                ),
            },
            "pricing": {
                "description": "Share the program fee when asked.",
                "script": (
                    "The application is free. If accepted, there's a program fee; it's on the premium side, "
                    "but we have financial aid and scholarships based on need. It's $485/month with a "
                    "$985 initial deposit. More details here: https://www.prodicity.org/fellowship"
                ),
            },
            "objection_handling": {
                "description": "Psychological scripts to isolate and overcome objections.",
                "tactics": {
                    "isolate_price": (
                        "If the application fee wasn't a factor, would you be ready to start this week? "
                        "(I want to separate the money from the motivation)."
                    ),
                    "isolate_fit": (
                        "Let's pretend for a second that money isn't an issue. "
                        "Do you feel like Prodicity is exactly what you need to get your project to the next level, "
                        "or are you still unsure about the value?"
                    ),
                    "scale_1_to_10": (
                        "On a scale of 1 to 10, how confident are you that this fellowship helps you hit your goals? "
                        "(If they say <10, ask: 'What would it take to get you to a 10?')"
                    ),
                    "the_takeaway": (
                        "It sounds like now might simply not be the right time, and that is totally okay. "
                        "We can always reconnect next semester if your schedule opens up. "
                        "(Often makes them chase you)."
                    )
                }
            },
        },
        "guidelines": [
            "Reference specific things the student told you about their project or pain points.",
            "Keep tone casual and understated—no hard selling.",
            "Offer the application link once they show interest.",
            "Support with social proof or a friendly CTA when appropriate.",
        ],
    },
}


# --------------------------------------------------------------------------- #
# Read helpers
# --------------------------------------------------------------------------- #

def list_phases() -> List[str]:
    """Return the available phase identifiers."""
    return list(PHASE_LIBRARY.keys())


def get_phase_config(phase: str) -> Dict[str, Any]:
    """Return the config dictionary for the requested phase."""
    return PHASE_LIBRARY.get(phase, {})


# --------------------------------------------------------------------------- #
# Accessors for existing code paths (backwards compatible)
# --------------------------------------------------------------------------- #

def get_initial_message_template() -> str:
    """Template for the initial outreach message."""
    return (
        PHASE_LIBRARY["building_rapport"]
        .get("initial_message", "")
        .strip()
    )


def get_question_probes() -> Dict[str, str]:
    """Question probes to uncover motivation, pain points, and vision (for students with initiative)."""
    return (
        PHASE_LIBRARY["building_rapport"]
        .get("sections", {})
        .get("engaging_with_lead", {})
        .get("probes", {})
    )


def get_no_initiative_probes() -> Dict[str, str]:
    """Question probes for students who aren't working on projects or ideas yet."""
    return (
        PHASE_LIBRARY["building_rapport"]
        .get("sections", {})
        .get("no_initiative", {})
        .get("probes", {})
    )


def get_rapport_context() -> str:
    """Context information to introduce relevance."""
    return (
        PHASE_LIBRARY["building_rapport"]
        .get("sections", {})
        .get("relevance_context", {})
        .get("script", "")
    )


def get_prodicity_introduction_variants() -> List[str]:
    """Variants for introducing Prodicity."""
    return (
        PHASE_LIBRARY["doing_the_ask"]
        .get("sections", {})
        .get("introduction", {})
        .get("variants", [])
    )


def get_prodicity_examples() -> str:
    """Examples of past students' successful outcomes."""
    return (
        PHASE_LIBRARY["doing_the_ask"]
        .get("sections", {})
        .get("social_proof", {})
        .get("script", "")
    )


def get_application_info() -> str:
    """Application link and deadline information."""
    return (
        PHASE_LIBRARY["doing_the_ask"]
        .get("sections", {})
        .get("application", {})
        .get("script", "")
    )


def get_call_scheduling() -> str:
    """Call scheduling information."""
    return (
        PHASE_LIBRARY["doing_the_ask"]
        .get("sections", {})
        .get("call_scheduling", {})
        .get("script", "")
    )


def get_pricing_info() -> str:
    """Pricing and financial aid information."""
    return (
        PHASE_LIBRARY["doing_the_ask"]
        .get("sections", {})
        .get("pricing", {})
        .get("script", "")
    )


# --------------------------------------------------------------------------- #
# Prompt assembly helpers
# --------------------------------------------------------------------------- #

def get_prompt_blocks(phase: str) -> List[str]:
    """
    Return prompt blocks/guidance for the LLM based on the current phase.
    These provide context and guidance on what to say and how to progress.
    """
    config = get_phase_config(phase)
    if not config:
        return []

    blocks: List[str] = [
        f"PHASE: {config.get('name', phase).title()}",
        "",
        f"Goal: {config.get('summary', '')}",
        "",
    ]

    sections = config.get("sections", {})
    if phase == "building_rapport":
        # Probes for students WITH initiative (working on projects/ideas)
        probes = sections.get("engaging_with_lead", {}).get("probes", {})
        if probes:
            blocks.append("Available Question Probes (if they're working on projects/ideas):")
            for idx, (key, value) in enumerate(probes.items(), 1):
                label = key.replace("_", " ").title()
                blocks.append(f"{idx}. {label}: {value}")
            blocks.append("")

        # Probes for students WITHOUT initiative (not working on anything yet)
        no_initiative_probes = sections.get("no_initiative", {}).get("probes", {})
        if no_initiative_probes:
            blocks.append("Available Question Probes (if they're NOT working on anything):")
            for idx, (key, value) in enumerate(no_initiative_probes.items(), 1):
                label = key.replace("_", " ").title()
                blocks.append(f"{idx}. {label}: {value}")
            blocks.append("")

        context_text = get_rapport_context()
        if context_text:
            blocks.extend(
                [
                    "Context to share when relevant:",
                    context_text,
                    "",
                ]
            )

    elif phase == "doing_the_ask":
        intro_variants = get_prodicity_introduction_variants()
        if intro_variants:
            blocks.append("Introduction Approaches:")
            for idx, intro in enumerate(intro_variants, 1):
                blocks.append(f"{idx}. {intro}")
                blocks.append("")

        app_info = get_application_info()
        if app_info:
            blocks.extend(["When lead shows interest:", app_info, ""])

        social_proof = get_prodicity_examples()
        if social_proof:
            blocks.extend(["Supporting Examples:", social_proof, ""])

        call_script = get_call_scheduling()
        price_script = get_pricing_info()
        additional_lines: List[str] = []
        if call_script:
            additional_lines.append("- If appropriate, offer to schedule a call: " + call_script)
        if price_script:
            additional_lines.append("- If they ask about pricing: " + price_script)
        if additional_lines:
            blocks.extend(["Additional Options:", *additional_lines, ""])

    guidelines = config.get("guidelines", [])
    if guidelines:
        blocks.extend(["Guidelines:"] + [f"- {line}" for line in guidelines])

    return blocks


def cta_templates() -> List[str]:
    """Return CTA templates for the selling phase."""
    return (
        PHASE_LIBRARY["doing_the_ask"]
        .get("sections", {})
        .get("application", {})
        .get("cta_templates", [])
    )


# --------------------------------------------------------------------------- #
# Conversation progression helpers
# --------------------------------------------------------------------------- #

def get_conversation_guidance(
    phase: str,
    conversation_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Get guidance on how to progress the conversation based on phase and state.

    Returns a dictionary with:
        phase, next_step, key_questions, context_to_use, cta_if_ready, examples, ready_to_introduce_prodicity
    """
    guidance: Dict[str, Any] = {
        "phase": phase,
        "next_step": "",
        "key_questions": [],
        "context_to_use": "",
        "cta_if_ready": "",
        "examples": "",
        "ready_to_introduce_prodicity": False,
    }

    if phase == "building_rapport":
        probes = get_question_probes()
        no_initiative_probes = get_no_initiative_probes()
        all_questions = list(probes.values()) + list(no_initiative_probes.values())
        guidance.update(
            {
                "next_step": (
                    "Ask probing questions to understand their motivation, pain points, and vision. "
                    "Use probes for students WITH initiative if they're working on projects/ideas, "
                    "or probes for students WITHOUT initiative if they're not working on anything yet."
                ),
                "key_questions": all_questions,
                "context_to_use": get_rapport_context(),
            }
        )

        if conversation_state:
            messages_count = conversation_state.get("message_count", 0)
            prospect_messages = conversation_state.get("prospect_message_count", 0)
            has_questions = conversation_state.get("has_questions", False)

            if messages_count >= 5 and prospect_messages >= 2 and has_questions:
                guidance["ready_to_introduce_prodicity"] = True
                guidance[
                    "next_step"
                ] = "Consider introducing Prodicity if sentiment is positive"

    elif phase == "doing_the_ask":
        introduction_variants = get_prodicity_introduction_variants()
        primary_intro = introduction_variants[0] if introduction_variants else ""
        guidance.update(
            {
                "next_step": "Introduce Prodicity and guide toward application",
                "context_to_use": primary_intro,
                "cta_if_ready": get_application_info(),
                "examples": get_prodicity_examples(),
            }
        )

    return guidance


def get_phase_specific_context(phase: str) -> str:
    """Get a concise context string for the current phase to include in prompts."""
    if phase == "building_rapport":
        return (
            "You are in the BUILDING RAPPORT phase. Your goal is to engage the lead, "
            "ask thoughtful questions about their projects/ideas OR their interests if they're not working on anything yet, "
            "understand their motivation, pain points, and vision. Use the appropriate question probes based on their situation. "
            "Keep messages short, conversational, and show genuine interest."
        )
    if phase == "doing_the_ask":
        return (
            "You are in the SELLING/DOING THE ASK phase. Your goal is to introduce Prodicity "
            "in a way that's relevant to what they've shared, highlight the fit, and guide them "
            "toward the application. Reference specific things they've told you. When they show "
            "interest, provide the application link and deadline information."
        )
    return f"You are in the {phase} phase."
