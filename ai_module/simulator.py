"""
CLI simulator: you play the engaged lead, AI tries to convert you.

Usage:
  python -m ai_module.simulator
"""

import time
from typing import List, Dict
from io_models import Conversation, Participant, Message
from orchestrator import run_pipeline
from response_generator import generate_response


def _format_time(seconds: float) -> str:
    """Format time in a human-readable way."""
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    else:
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins}m {secs:.2f}s"


def _print_timing(label: str, elapsed: float, indent: int = 0):
    """Print timing information with consistent formatting."""
    indent_str = "  " * indent
    time_str = _format_time(elapsed)
    print(f"{indent_str}⏱️  {label}: {time_str}")


def _print_header():
    print("\n=== Prodicity Sales Simulator ===")
    print("Type your message as the prospect.")
    print("Commands: /analyze, /phase, /exit")
    print("\n⏱️  Timing information will be displayed for each response.\n")




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

        # Start total timing
        total_start = time.time()
        print("\n" + "="*60)
        print("⏱️  TIMING: Processing your message...")
        print("="*60)

        # Add prospect message
        messages.append(Message(sender="prospect", text=user_input))

        # Build conversation
        build_start = time.time()
        conv = Conversation(title=title, description=description, participants=participants, messages=messages)
        build_time = time.time() - build_start
        _print_timing("Build conversation", build_time, indent=1)

        # Run pipeline (includes analyzer API call and KB retrieval)
        # Note: Individual component timings are printed by the components themselves
        pipeline_start = time.time()
        result: Dict = run_pipeline(conv)
        pipeline_time = time.time() - pipeline_start
        _print_timing("run_pipeline (OpenAI analyzer + KB retrieval)", pipeline_time, indent=1)

        if user_input.lower() in {"/analyze", "/phase"}:
            total_time = time.time() - total_start
            print("\n" + "="*60)
            _print_timing("TOTAL TIME", total_time)
            print("="*60 + "\n")
            print({
                "phase": result["phase"],
                "ready_for_ask": result["ready_for_ask"],
                "scores": result["scores"],
                "signals": result["signals"],
                "criteria_met": result["criteria_met"],
                "recommendation": result["recommendation"],
            })
            continue

        # Generate response (includes prompt building + Anthropic API call + processing)
        # Note: Individual component timings are printed by the components themselves
        generation_start = time.time()
        ai_text = generate_response(conv, analysis_result=result)
        generation_time = time.time() - generation_start
        _print_timing("generate_response (prompt building + Anthropic API + processing)", generation_time, indent=1)

        # Handle empty response (e.g., API errors, low credits)
        if not ai_text or not ai_text.strip():
            total_time = time.time() - total_start
            print("\n" + "="*60)
            _print_timing("TOTAL TIME", total_time)
            print("="*60 + "\n")
            print("ai> [Error: Could not generate response. Check API keys and credits.]")
            print("    [Tip: Make sure OPENAI_API_KEY and ANTHROPIC_API_KEY are set correctly]")
            print("    [Tip: Check Anthropic account has sufficient credits]")
            # Don't add empty message to conversation
            continue

        # Add AI message
        messages.append(Message(sender="you", text=ai_text))
        
        # Calculate and display total time
        total_time = time.time() - total_start
        print("\n" + "="*60)
        _print_timing("TOTAL TIME (input → output)", total_time)
        print("="*60)
        
        # Display response
        print(f"\nai> {ai_text}\n")


if __name__ == "__main__":
    main()


