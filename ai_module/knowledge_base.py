"""
Knowledge base for Prodicity - product information, value proposition, and sales data.
"""

# Value Proposition
PRODICITY_VALUE_PROP = {
    "mission": "Advance intelligence by seeding purpose in youth through optimized learning",
    "core_offer": "Help students actually ship outcomes—whether that's startups, research, internships, or passion projects",
    "target": "High school students (freshman-junior) from top Bay Area schools",
    "key_differentiator": "Light course load, community support, and focus on actual execution—not just learning",
}

# Business Model & Pricing
BUSINESS_MODEL = {
    "total_cost": 3910,
    "deposit": 1000,
    "monthly_payment": 485,
    "timeline": "January through June",
    "payment_plan": "Deposit upfront, then $485/month for 6 months",
    "aid_available": True,
    "aid_details": "Financial aid available for students who need it"
}

# Program Details
PROGRAM_DETAILS = {
    "duration": "Winter through Spring (January to June)",
    "workload": "Light course load - designed to work with existing commitments",
    "structure": "Mentorship, community support, structured environment",
    "outcome": "Student ships something real by the end of program",
    "community": "Other ambitious students who are building real projects",
}

# Sales Principles
SALES_PRINCIPLES = {
    "rapport_first": "Establish relationship quickly—make student feel like you're friends",
    "message_length": "Short and quick messages—long messages turn students off",
    "engagement": "Conversation must be very engaging—maintain good relationship",
    "timing": "Time the sell perfectly—when relationship and conversation is at max engagement",
    "timeline": "Typically takes about a week of back and forth messaging",
    "authenticity": "Some parts static (initial message), some dynamic (rapport building), some hybrid (selling)"
}

# Common Objections & Responses
COMMON_OBJECTIONS = {
    "busy": {
        "concern": "Student is too busy or has too many commitments",
        "response": "Totally get you're swamped. That's why it's structured to be light—we're not adding stress, we're helping you execute on what you're already passionate about"
    },
    "cost": {
        "concern": "Student is concerned about the price",
        "response": "It's $3,910 for the full program—$1K deposit and $485/mo for Jan through June. We also have aid available if you need it"
    },
    "time": {
        "concern": "Student doesn't have time",
        "response": "We designed it specifically to work with your existing commitments. The workload is intentionally light"
    },
    "uncertainty": {
        "concern": "Student isn't sure it's for them",
        "response": "I get it—it's a commitment. Think about it: where do you want to be 6 months from now? Doing the same thing, or actually having shipped something real?"
    },
    "priorities": {
        "concern": "Student needs to focus on school/grades first",
        "response": "Totally understand—grades matter. That's why this is designed to complement your schoolwork, not compete with it"
    }
}

# Conversation Flow Strategy
CONVERSATION_FLOW = {
    "initial_message": {
        "strategy": "Static template with name/school personalization",
        "goal": "Gauge interest in projects/ideas",
    },
    "rapport_phase": {
        "strategy": "Dynamic - ask questions, build relationship",
        "duration": "Couple days to a couple weeks",
        "goal": "Understand student's projects, goals, and motivations",
    },
    "sell_phase": {
        "strategy": "Somewhat static script with dynamic tweaks",
        "timing": "When rapport predicted to be at max",
        "goal": "Transition to introduction of Prodicity"
    }
}

def get_product_info():
    """Get complete product information dictionary."""
    return {
        "value_prop": PRODICITY_VALUE_PROP,
        "business_model": BUSINESS_MODEL,
        "program_details": PROGRAM_DETAILS,
        "sales_principles": SALES_PRINCIPLES,
    }

def get_acceptable_variations():
    """
    Acceptable variations of key terms (for flexibility in responses).
    """
    return {
        "company_name": ["Prodicity", "prodicity"],
        "outcomes": ["startup", "research", "internship", "passion project", "real project", "shipped outcome"],
        "community": ["ambitious students", "other builders", "students shipping", "community"],
        "support": ["mentorship", "structure", "guidance", "support", "environment"],
    }


