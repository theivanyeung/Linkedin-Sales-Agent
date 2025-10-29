"""
Static scripts and templates for LinkedIn sales conversations.
Simplified for two-phase system: building_rapport and doing_the_ask
"""

def get_rapport_building_prompts():
    """Prompts for building rapport phase - keep it simple and natural."""
    return [
        "tell me more about that",
        "that's really cool—what sparked that?",
        "school's a grind, right? how do you balance everything?",
        "what's your vision for where you want to take this?",
        "what's next for you?"
    ]

def get_sell_phase_scripts():
    """Scripts for doing_the_ask phase."""
    return {
        "introduction": """your vibe around this is exactly what we're looking for at Prodicity. we're a program that helps students like you actually ship outcomes—whether that's a startup, research, internship, or passion project.""",
        
        "value_proposition": """the thing is, you have the drive and vision, but you need the right environment and support to execute. that's what Prodicity provides—structure, mentorship, and a community of other ambitious students.""",
        
        "cost": "it's $3,910 for the full program—$1K deposit and $485/mo for Jan through June. we also have aid available if you need it",
        
        "objection_busy": "totally get you're swamped. that's why it's structured to be light—we're not adding stress, we're helping you execute on what you're already passionate about",
        
        "objection_cost": "it's $3,910 total—$1K deposit and $485/mo for Jan through June. we also have aid available if you need it",
        
        "objection_time": "we designed it specifically to work with your existing commitments. the workload is intentionally light"
    }


