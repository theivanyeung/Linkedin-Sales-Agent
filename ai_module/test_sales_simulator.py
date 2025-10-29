"""
Interactive Sales Simulator for LinkedIn Sales Agent
Test the AI's ability to sell Prodicity by role-playing as a student prospect
"""

import os
import sys
from llm_service import SalesAgentLLM
from conversation_analyzer import analyze_conversation_state
from config import Config

# ANSI color codes for terminal
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(60)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}\n")

def print_message(sender, text, color=""):
    sender_label = f"{color}{Colors.BOLD}{sender}:{Colors.ENDC}"
    print(f"{sender_label} {text}\n")

def print_analysis(state):
    print(f"\n{Colors.OKCYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.ENDC}")
    print(f"{Colors.OKCYAN}CONVERSATION ANALYSIS{Colors.ENDC}")
    print(f"{Colors.OKCYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.ENDC}")
    print(f"Phase: {state['phase']}")
    print(f"Recommendation: {state['recommendation']}")
    print(f"{Colors.OKCYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.ENDC}\n")

def main():
    print_header("LinkedIn Sales Agent - Interactive Simulator")
    
    print(f"{Colors.OKBLUE}Welcome! You're role-playing as a high school student prospect.{Colors.ENDC}")
    print(f"{Colors.OKBLUE}The AI will try to sell you Prodicity through natural conversation.{Colors.ENDC}")
    print(f"{Colors.WARNING}Commands: 'analyze', 'history', 'ai', 'exit'{Colors.ENDC}\n")
    
    # Initialize AI service
    try:
        if not Config.OPENAI_API_KEY:
            print(f"{Colors.FAIL}Error: OPENAI_API_KEY not set in environment or .env file{Colors.ENDC}")
            print(f"Set it in ai_module/.env file")
            sys.exit(1)
        
        print(f"{Colors.OKGREEN}✓ AI service initialized{Colors.ENDC}")
        llm = SalesAgentLLM()
        print(f"{Colors.OKGREEN}✓ Connected to OpenAI (model: {Config.OPENAI_MODEL}){Colors.ENDC}\n")
    except Exception as e:
        print(f"{Colors.FAIL}Error initializing AI: {e}{Colors.ENDC}")
        sys.exit(1)
    
    # Simulated prospect info
    prospect_name = "Ivan"
    school = "Lynbrook"
    
    # Initial message from you (the sales agent)
    initial_message = f"hey {prospect_name}, I'm currently looking at what students at {school.lower()} are working on outside of school, like nonprofits, research, internships, or passion projects. Are you working on any great projects or ideas?"
    
    # Conversation history
    messages = [
        {
            "sender": "you",
            "text": initial_message,
            "timestamp": "Initial outreach"
        }
    ]
    
    print_header("CONVERSATION STARTED")
    print_message("You (Sales Agent)", initial_message, Colors.OKGREEN)
    
    # Main conversation loop
    while True:
        # Get user input
        user_input = input(f"{Colors.BOLD}You (as student): {Colors.ENDC}").strip()
        
        if not user_input:
            continue
        
        # Handle commands
        if user_input.lower() == 'exit':
            print(f"\n{Colors.WARNING}Conversation ended{Colors.ENDC}")
            break
        
        elif user_input.lower() == 'analyze':
            state = analyze_conversation_state(messages)
            print_analysis(state)
            continue
        
        elif user_input.lower() == 'history':
            print(f"\n{Colors.OKCYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.ENDC}")
            print(f"{Colors.OKCYAN}CONVERSATION HISTORY{Colors.ENDC}")
            print(f"{Colors.OKCYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.ENDC}")
            for i, msg in enumerate(messages, 1):
                sender = "You" if msg['sender'] == 'you' else "Prospect"
                color = Colors.OKGREEN if msg['sender'] == 'you' else Colors.OKBLUE
                print(f"{i}. {color}{sender}:{Colors.ENDC} {msg['text']}")
            print(f"{Colors.OKCYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.ENDC}\n")
            continue
        
        elif user_input.lower() == 'ai':
            # Force AI to respond
            pass
        else:
            # Add user's message to conversation
            messages.append({
                "sender": "prospect",
                "text": user_input,
                "timestamp": "now"
            })
            
            print_message("Prospect", user_input, Colors.OKBLUE)
        
        # Generate AI response
        try:
            print(f"{Colors.WARNING}Generating AI response...{Colors.ENDC}")
            result = llm.generate_response(
                messages=messages,
                prospect_name=prospect_name,
                thread_id="simulator"
            )
            
            # Add AI response to conversation
            messages.append({
                "sender": "you",
                "text": result['response'],
                "timestamp": "now"
            })
            
            print_message("AI Agent", result['response'], Colors.OKGREEN)
            
            # Show phase info
            phase_emoji = "🤝" if result['phase'] == "building_rapport" else "💰"
            print(f"{Colors.OKCYAN}{phase_emoji} Phase: {result['phase']}{Colors.ENDC}")
            print()
            
            # Check if transitioning to sell phase
            if result['phase'] == "doing_the_ask":
                print(f"{Colors.WARNING}⚠️  AI has transitioned to DOING THE ASK phase!{Colors.ENDC}")
                print()
        
        except Exception as e:
            print(f"{Colors.FAIL}Error generating response: {e}{Colors.ENDC}\n")
    
    # Final analysis
    print(f"\n{Colors.HEADER}Final Conversation Summary{Colors.ENDC}")
    state = analyze_conversation_state(messages)
    print(f"Phase: {state['phase']}")
    
    # Show final phase
    if state['phase'] == "doing_the_ask":
        print(f"{Colors.OKGREEN}✓ Conversation progressed to sell phase{Colors.ENDC}")
    else:
        print(f"{Colors.WARNING}⚠ Conversation stayed in rapport building phase{Colors.ENDC}")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}\nConversation interrupted{Colors.ENDC}")
    except Exception as e:
        print(f"{Colors.FAIL}\nUnexpected error: {e}{Colors.ENDC}")
        import traceback
        traceback.print_exc()

