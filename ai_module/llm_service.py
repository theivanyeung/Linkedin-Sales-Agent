"""
LangChain service for generating conversation responses using GPT-4o.
"""

from openai import OpenAI

from config import Config
from static_scripts import get_rapport_building_prompts, get_sell_phase_scripts
from knowledge_base import get_product_info
from conversation_analyzer import analyze_conversation_state, extract_prospect_insights


class SalesAgentLLM:
    """LLM service for generating sales conversation responses."""
    
    def __init__(self, api_key=None):
        """Initialize the LLM service."""
        self.api_key = api_key or Config.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)
        self.model = Config.OPENAI_MODEL
        self.temperature = Config.TEMPERATURE
        self.max_tokens = Config.MAX_TOKENS
        
        # Get knowledge base
        self.knowledge_base = get_product_info()
        self.static_scripts = {
            "rapport": get_rapport_building_prompts(),
            "sell": get_sell_phase_scripts()
        }
    
    def build_context(self, messages, prospect_name, thread_id=None):
        """
        Build conversation context for the LLM.
        
        Args:
            messages: List of conversation messages
            prospect_name: Name of the prospect
            thread_id: Optional thread ID
        
        Returns:
            Context string for the LLM
        """
        # Analyze conversation state
        state = analyze_conversation_state(messages)
        insights = extract_prospect_insights(messages)
        
        # Build recent conversation history
        recent_messages = messages[-10:] if len(messages) > 10 else messages
        conversation_text = "\n".join([
            f"{'You' if msg.get('sender') == 'you' else prospect_name}: {msg.get('text', '')}"
            for msg in recent_messages
        ])
        
        # Build context
        phase = state['phase']
        
        context = f"""You are a sales agent for Prodicity, helping high school students ship real outcomes like startups, research, internships, or passion projects.

PROSPECT: {prospect_name}
CONVERSATION PHASE: {phase}

CONVERSATION CONTEXT:
{conversation_text}

KNOWLEDGE BASE:
- Value Prop: {self.knowledge_base['value_prop']['core_offer']}
- Cost: ${self.knowledge_base['business_model']['total_cost']} total (${self.knowledge_base['business_model']['deposit']} deposit, ${self.knowledge_base['business_model']['monthly_payment']}/mo)
- Timeline: {self.knowledge_base['program_details']['duration']}, light workload

SALES PRINCIPLES:
- Keep messages SHORT (max {Config.MAX_RESPONSE_LENGTH} chars)
- Sound like FRIENDS, not a salesperson
- Stay ENGAGING and conversational
- Only introduce Prodicity in "doing_the_ask" phase

TOPICS MENTIONED: {insights['mentioned_topics']}

Generate a natural response that:
1. Is in the {phase} phase
2. Follows the recommendation: {state['recommendation']}
3. Stays SHORT and FRIENDLY
4. Maintains casual, buddy-to-buddy tone
5. References their interests/topics naturally
"""
        
        return context, state
    
    def generate_response(self, messages, prospect_name, thread_id=None, app_link=None):
        """
        Generate a sales conversation response.
        
        Args:
            messages: List of conversation messages
            prospect_name: Name of the prospect
            thread_id: Optional thread ID
            app_link: Optional application link for CTA
        
        Returns:
            dict with response text, strategy, and reasoning
        """
        # Build context
        context, state = self.build_context(messages, prospect_name, thread_id)
        
        # Create prompt
        prompt = f"""{context}

Based on the conversation above, generate your next response. Keep it SHORT (under 200 chars), natural, and friendly.

Your response (JUST the message text, nothing else):"""
        
        try:
            # Call OpenAI API directly
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful sales agent for a program called Prodicity."},
                    {"role": "user", "content": prompt}
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            
            result = response.choices[0].message.content
            
            # Clean up response
            response_text = result.strip().replace('"', '').strip()
            
            # Enforce length limits
            if len(response_text) > Config.MAX_RESPONSE_LENGTH:
                response_text = response_text[:Config.MAX_RESPONSE_LENGTH - 3] + "..."
            
            return {
                "response": response_text,
                "reasoning": state['recommendation'],
                "phase": state['phase']
            }
        except Exception as e:
            # Fallback to basic response if LLM fails
            return {
                "response": "Thanks for sharing! Tell me more about that.",
                "phase": "building_rapport",
                "reasoning": f"LLM error: {str(e)}"
            }
    
    def generate_with_script(self, script_type, context_dict):
        """
        Generate a response using a specific static script template.
        
        Args:
            script_type: Type of script (initial, rapport, sell)
            context_dict: Dict with variables for script interpolation
        
        Returns:
            Response text
        """
        if script_type == "initial":
            from static_scripts import get_initial_message_template
            template = get_initial_message_template()
            return template.format(**context_dict)
        
        elif script_type == "rapport":
            prompts = self.static_scripts["rapport"]
            # Return a generic prompt
            return "Tell me more about that!"
        
        elif script_type == "sell":
            scripts = self.static_scripts["sell"]
            # Use soft introduction script
            return scripts.get("soft_introduction", "").format(**context_dict)
        
        return "Tell me more about that!"

