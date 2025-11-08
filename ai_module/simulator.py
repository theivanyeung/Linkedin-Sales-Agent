"""
CLI simulator: you play the engaged lead, AI tries to convert you.

Usage:
  python -m ai_module.simulator
"""

from typing import List, Dict
from io_models import Conversation, Participant, Message
from orchestrator import run_pipeline
from response_generator import generate_response


def _print_header():
    print("\n=== Prodicity Sales Simulator ===")
    print("Type your message as the prospect.")
    print("Commands: /analyze, /phase, /exit")




def main():
    _print_header()

    title = "Simulator Conversation"
    description = None
    participants = [
        Participant(id="you", name="You", role="you"),
        Participant(id="prospect", name="Prospect", role="prospect"),
    ]

    messages: List[Message] = []

    # Initial connection message from AI (personalized)
    initial_text = (
        "hey Ivan, I'm currently researching what students at lynbrook are working on outside of school, "
        "like nonprofits, research, internships, or passion projects. Are you working on any great projects or ideas?"
    )
    messages.append(Message(sender="you", text=initial_text))
    print(f"ai> {initial_text}")

    while True:
        user_input = input("prospect> ").strip()
        if not user_input:
            continue
        if user_input.lower() == "/exit":
            print("bye!")
            break

        # Add prospect message
        messages.append(Message(sender="prospect", text=user_input))

        # Build conversation and analyze
        conv = Conversation(title=title, description=description, participants=participants, messages=messages)
        result: Dict = run_pipeline(conv)

        if user_input.lower() in {"/analyze", "/phase"}:
            print({
                "phase": result["phase"],
                "ready_for_ask": result["ready_for_ask"],
                "scores": result["scores"],
                "signals": result["signals"],
                "criteria_met": result["criteria_met"],
                "recommendation": result["recommendation"],
            })
            continue

        # Use the actual AI module's response generator
        ai_text = generate_response(conv)

        # Add AI message
        messages.append(Message(sender="you", text=ai_text))
        print(f"ai> {ai_text}")


if __name__ == "__main__":
    main()


