"""
Single-pass analyzer that returns phase + key metrics via Responses API.
"""

import time
from typing import Dict, Any, List
from io_models import Conversation
from llm_service import ResponsesClient
from config import Config


ANALYSIS_SCHEMA: Dict[str, Any] = {
    "name": "AnalysisResult",
    "schema": {
        "type": "object",
        "properties": {
            "reasoning": {"type": "string"},
            "move_forward": {"type": "boolean"},
            "instruction_for_writer": {"type": "string"},
            "phase": {"type": "string", "enum": ["building_rapport", "doing_the_ask", "post_selling"]},
        },
        "required": [
            "reasoning",
            "move_forward",
            "instruction_for_writer",
            "phase",
        ],
        "additionalProperties": False,
    },
}


def _conversation_to_text(conv: Conversation) -> str:
    lines: List[str] = []
    for m in conv.messages[-10:] if len(conv.messages) > 10 else conv.messages:
        who = "You" if m.sender == "you" else (conv.participants[0].name if conv.participants else "Prospect")
        if m.sender == "prospect":
            who = "Prospect"
        lines.append(f"{who}: {m.text}")
    return "\n".join(lines)


def analyze_conversation(conv: Conversation, current_phase: str = None) -> Dict[str, Any]:
    """Run a single Responses API call to analyze the conversation."""
    system_prompt = (
        "You are a strategic sales conversation analyst for Prodicity, a selective fellowship for high school students. "
        "Your role is to think like a strategist, not just an observer. Analyze conversations deeply and provide "
        "explicit strategic instructions for how to proceed.\n\n"
        "STRATEGIC THINKING:\n"
        "- Think about WHY the student said what they said - what are their underlying motivations, concerns, or interests?\n"
        "- Consider the context: where are we in the relationship? What signals are they sending?\n"
        "- Make a clear strategic decision: should we advance the sale or stay put?\n"
        "- Provide a specific, actionable instruction for the copywriter to execute.\n\n"
        "CRITICAL RULE: ONE GOAL PER TURN\n"
        "- Do NOT instruct the writer to \"Ask Discovery Questions\" AND \"Pitch Prodicity\" in the same message.\n"
        "- IF the user invites the pitch (e.g., \"let me know if you can help\"), SKIP the discovery questions and go straight to the Pitch + CTA.\n"
        "- IF you need more information before pitching, ASK the questions only. Do not pitch yet.\n"
        "- A message should never exceed 2 distinct paragraphs.\n\n"
        "CRITICAL RULE FOR PITCHING:\n"
        "- If you decide to PITCH (Phase: doing_the_ask), do NOT instruct the writer to ask \"discovery questions\" (e.g., \"What is your biggest challenge?\") in the same message.\n"
        "- The Pitch + The CTA is enough. Adding questions makes the message too long.\n"
        "- Your instruction should be: \"Validate their project, then immediately pivot to the Pitch. Do not ask discovery questions.\"\n\n"
        "Phase Guidelines:\n"
        "- 'building_rapport': Early stage, building relationship, asking questions, not selling yet\n"
        "- 'doing_the_ask': Ready to introduce Prodicity, student is engaged and asking questions\n"
        "- 'post_selling': The pitch has already been made. User is asking questions (price, details, logistics). We are clarifying, not introducing.\n"
        "CRITICAL PHASE RULES:\n"
        "1. 'post_selling' is a ONE-WAY phase. Once you are in 'post_selling', you MUST stay in 'post_selling'. You can NEVER go back to 'doing_the_ask' or 'building_rapport' from 'post_selling'.\n"
        "2. If current phase is 'doing_the_ask', you MUST generate an instruction to introduce/pitch Prodicity. Do NOT generate instructions to 'continue building rapport' - the phase is already set to selling, so you must sell.\n"
        "3. If current phase is 'building_rapport', you can generate instructions to continue building rapport or to move forward to selling (if ready).\n\n"
        "SILENT OBJECTION DETECTION & STRATEGY (Priority 2 - only if no direct question):\n\n"
        "Analyze the prospect's text for these specific hidden barriers ONLY if they haven't asked a direct question. If detected, set the 'instruction_for_writer' to the corresponding TACTIC.\n\n"
        "1. THE \"BUSY\" OBJECTION (Time/Stress)\n"
        "   - Signals: Mentions \"AP exams\", \"SATs\", \"junior year\", \"busy\", \"overwhelmed\", \"grind\", \"studying\".\n"
        "   - Analysis: They want to do this but fear burnout.\n"
        "   - TACTIC: \"Validate their high-achieving workload (empathy). Then, pivot to how Prodicity is designed to be flexible and low-lift compared to normal internships. Do not let them ghost.\"\n\n"
        "2. THE \"COST\" OBJECTION (Money)\n"
        "   - Signals: Asks \"Is this free?\", \"How much?\", \"Tuition\", \"Cost\", or mentions \"affordability\".\n"
        "   - Analysis: They are price-sensitive. If you drop the price ($485) without value, they will ghost.\n"
        "   - TACTIC: \"Frame the VALUE first (Ivy League mentors, tangible outcomes) before mentioning the price. IMMEDIATELY mention that financial aid is available to lower resistance.\"\n\n"
        "3. THE \"IMPOSTER\" OBJECTION (Self-Doubt)\n"
        "   - Signals: \"I don't have a project yet\", \"I'm just a beginner\", \"Is this for experienced people?\", \"I don't know what to build\".\n"
        "   - Analysis: They feel unqualified.\n"
        "   - TACTIC: \"Reassure them immediately. Explain that Prodicity is specifically designed to help them FIND and START their project. They don't need to be an expert yet.\"\n\n"
        "GATEKEEPING RULES (WHEN TO SELL):\n\n"
        "You generally CANNOT set `move_forward=True` (Selling Phase) until you have uncovered the following \"Three Layers of Rapport\":\n\n"
        "1. The Project: What are they working on? (You usually have this).\n\n"
        "2. The Pain/Motivation: Why are they doing it? What is hard? (e.g., burnout, lack of direction, technical hurdles).\n\n"
        "3. The Vision: Where do they want to take it? (e.g., non-profit, research paper, startup).\n\n"
        "LOGIC FLOW:\n\n"
        "- IF you know the Project but NOT the Pain/Motivation -> `move_forward=False`. Instruction: \"Ask the Pain Probe (e.g., is it hard balancing with APs?)\"\n\n"
        "- IF you know the Pain but NOT the Vision -> `move_forward=False`. Instruction: \"Ask the Vision Probe (e.g., where do you see this going?)\"\n\n"
        "- ONLY IF you have a clear picture of their Project + Pain/Motivation + Vision -> `move_forward=True` (Pitch Prodicity).\n\n"
        "EXCEPTION:\n\n"
        "- If the student EXPLICITLY asks for help/mentorship/advising (e.g., \"Can you help me?\"), you can skip the checklist and `move_forward=True`.\n\n"
        "SALES CONVERSATION MANAGEMENT (Phase: 'doing_the_ask'):\n\n"
        "Once you have pitched Prodicity, the user will often ask questions. Do NOT repeat the pitch.\n\n"
        "1. INFO REQUESTS (\"Tell me more\", \"What is it?\"):\n"
        "   - DO NOT use the generic introduction script again.\n"
        "   - TACTIC: \"Explain the program mechanics specifically: Mentors (Stanford/MIT), Weekly Structure (Flexible), and Outcomes (Research/Startup). End with a check-in: 'Does that align with your goals?'\"\n\n"
        "2. PRICE QUESTIONS (\"How much?\", \"Cost?\"):\n"
        "   - TACTIC: \"State the price clearly ($485/mo) BUT immediately sandwich it with value: 1. Mentorship caliber, 2. The Price + Aid availability, 3. The ROI (College portfolio). End with a question: 'Is that within your budget range?'\"\n\n"
        "3. GENERAL OBJECTIONS (\"I'm busy\", \"I need to ask parents\"):\n"
        "   - TACTIC: \"Validate the concern, offer a specific solution (e.g., flexible schedule, parent info packet), and ask a closing question.\"\n\n"
        "CRITICAL RULE:\n"
        "- If the user asks a question, your Instruction MUST be: \"Answer the question directly using [Specific Info]. Then ask a follow-up question to keep control.\"\n\n"
        "Required Output Fields:\n"
        "- reasoning: Your internal monologue explaining WHY the student said what they said. What are their underlying motivations, concerns, or interests? What signals are they sending about their readiness?\n"
        "- move_forward: Boolean decision - True if we should advance the sale (introduce Prodicity), False if we should continue building rapport. Base this on your strategic assessment of the student's readiness, not on rigid rules.\n"
        "- instruction_for_writer: A direct, actionable command for the copywriter. Follow the priority order: (1) Answer direct questions first using SALES CONVERSATION MANAGEMENT tactics, (2) If no direct question, handle Silent Objections, (3) Otherwise provide general guidance. CONSTRAINT: If you instruct the writer to PITCH, do NOT instruct them to ask discovery questions in the same message. Pitch + CTA is enough. Examples:\n"
        "  * 'Acknowledge the price concern, but deflect by asking about their specific project interest first.'\n"
        "  * 'They're showing interest - introduce Prodicity naturally by connecting it to their mentioned project.'\n"
        "  * 'Continue building rapport - ask about their school or current projects to deepen the relationship.'\n"
        "  * 'They seem hesitant - address their concern directly and provide reassurance before moving forward.'\n"
        "  * 'BUSY OBJECTION DETECTED: Validate their workload with empathy, then pivot to Prodicity being flexible and low-lift.'\n"
        "  * 'COST OBJECTION DETECTED: Frame value first (Ivy mentors, outcomes), then mention price and financial aid availability.'\n"
        "  * 'IMPOSTER OBJECTION DETECTED: Reassure immediately that Prodicity helps them FIND and START projects - no expertise needed yet.'\n"
        "  * 'INFO REQUEST: Explain program mechanics specifically (Mentors: Stanford/MIT, Weekly Structure: Flexible, Outcomes: Research/Startup). End with: Does that align with your goals?'\n"
        "  * 'PRICE QUESTION: State price clearly ($485/mo) with value sandwich (1. Mentorship caliber, 2. Price + Aid availability, 3. ROI: College portfolio). End with: Is that within your budget range?'\n"
        "  * 'GENERAL OBJECTION: Validate the concern, offer specific solution (flexible schedule/parent info packet), and ask a closing question.'\n"
        "- phase: The current conversation phase - 'building_rapport' if we're still building relationship, or 'doing_the_ask' if we're ready to introduce Prodicity. This should align with your move_forward decision."
    )

    # Count messages for context
    total_messages = len(conv.messages)
    prospect_messages = sum(1 for m in conv.messages if m.sender == "prospect")
    
    user_prompt = (
        "Analyze this sales conversation strategically and provide a strategic plan:\n\n"
        "1. REASONING: Explain WHY the student said what they said. What are their underlying motivations, concerns, or interests? "
        "What signals are they sending about their readiness?\n\n"
        "2. MOVE_FORWARD: Make a clear strategic decision - should we advance the sale (introduce Prodicity) or continue building rapport? "
        "Base this on your assessment of the student's readiness, not on rigid rules. A highly engaged student after 3 messages might be ready, "
        "while a disinterested student after 10 messages might not be.\n\n"
        "3. INSTRUCTION_FOR_WRITER: Give a specific, actionable command for the copywriter.\n"
        "   - CRITICAL: If current phase is 'doing_the_ask', you MUST instruct the writer to introduce/pitch Prodicity. Do NOT instruct them to 'continue building rapport' - the phase is already set to selling.\n"
        "   - PRIORITY 1 (DIRECT QUESTIONS): Did the prospect ask a specific question (e.g., 'How much?', 'What is it?', 'Tell me more')? IF YES -> You MUST instruct the writer to answer it using the 'SALES CONVERSATION MANAGEMENT' tactics. Do not ignore the question to pitch.\n"
        "   - PRIORITY 2 (SILENT OBJECTIONS): If (and ONLY if) there is no direct question, check for Silent Objections (Busy, Cost, Imposter). If detected, use the corresponding TACTIC.\n"
        "   - PRIORITY 3 (DEFAULT): If neither, provide general guidance to advance the conversation:\n"
        "     * If current phase is 'doing_the_ask': You MUST instruct to introduce Prodicity (e.g., 'Introduce Prodicity naturally by connecting it to their mentioned project. Reference what they told you. End with application CTA.')\n"
        "     * If current phase is 'building_rapport': Continue building rapport (e.g., 'Continue building rapport - ask about their school or current projects to deepen the relationship.')\n"
        "   Examples:\n"
        "   - 'PRICE QUESTION: State price ($485/mo) with value sandwich (Mentorship caliber, Price + Aid, ROI). End with: Is that within your budget range?'\n"
        "   - 'INFO REQUEST: Explain program mechanics (Mentors, Structure, Outcomes). End with: Does that align with your goals?'\n"
        "   - 'BUSY OBJECTION: Validate workload, pivot to flexibility and low-lift nature.'\n"
        "   - 'COST OBJECTION: Frame value first, then price + financial aid.'\n"
        "   - 'IMPOSTER OBJECTION: Reassure that Prodicity helps them find and start projects - no expertise needed.'\n"
        "   - 'Introduce Prodicity naturally by connecting it to their mentioned project. Reference what they told you. End with application CTA.'\n"
        "   - 'Continue building rapport - ask about their school or current projects to deepen the relationship.'\n\n"
        "4. PHASE: Determine the conversation phase based on your move_forward decision and conversation state:\n"
        "   - CRITICAL RULE #1: If current phase is 'post_selling', you MUST set phase to 'post_selling'. This is a one-way phase - once in post_selling, you NEVER go back to 'doing_the_ask' or 'building_rapport' (unless explicitly transitioning away, which is rare).\n"
        "   - If move_forward is False, set phase to 'building_rapport'\n"
        "   - If move_forward is True AND you have NOT yet pitched Prodicity (check conversation for pitch indicators: 'Prodicity', 'fellowship', 'application', 'Stanford/MIT mentors'), set phase to 'doing_the_ask'\n"
        "   - If move_forward is True AND you have ALREADY pitched Prodicity (found pitch indicators in conversation history) AND the user is asking follow-up questions, set phase to 'post_selling'\n"
        "   - If current phase is 'doing_the_ask' AND user asks a question after you've pitched (pitch indicators found), set phase to 'post_selling'\n\n"
        f"Conversation context:\n"
        f"- Title: {conv.title}\n"
        f"- Total messages: {total_messages} (Prospect: {prospect_messages})\n"
        f"- Description: {conv.description or 'None'}\n"
        f"- Current phase: {current_phase or 'unknown'}\n\n"
        f"Recent conversation:\n{_conversation_to_text(conv)}\n\n"
        "Strategic Guidelines:\n"
        "- Think contextually: Don't rely on rigid message counts. A highly engaged student might be ready after 3 messages, "
        "while a disinterested one might need 10+ messages.\n"
        "- Consider all signals: Questions asked, enthusiasm shown, interest level, responsiveness, and overall engagement.\n"
        "- Be decisive: Make a clear move_forward decision based purely on your strategic assessment of their readiness.\n"
        "- Give actionable instructions: Your instruction_for_writer should be specific enough that the copywriter knows exactly what to do."
    )

    # Use GPT-5-mini with Responses API
    client = ResponsesClient(model="gpt-5-mini")
    
    # Time the API call
    api_start = time.time()
    if Config.DEBUG:
        print("[Analyzer] Calling OpenAI API (gpt-5-mini)...")
    
    result = client.json_response(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=ANALYSIS_SCHEMA,
        reasoning_effort="low",
    )
    
    api_time = time.time() - api_start
    if Config.DEBUG:
        if api_time < 1:
            print(f"[Analyzer] OpenAI API call completed: {api_time*1000:.0f}ms")
        else:
            print(f"[Analyzer] OpenAI API call completed: {api_time:.2f}s")
    
    return result






























