"""
Flask API for LinkedIn Sales Agent AI Module.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from llm_service import SalesAgentLLM
from config import Config
import traceback

app = Flask(__name__)
CORS(app)  # Allow Chrome extension to make requests

# Initialize LLM service
llm_service = SalesAgentLLM(api_key=Config.OPENAI_API_KEY)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "LinkedIn Sales Agent AI"}), 200

@app.route('/generate', methods=['POST'])
def generate_response():
    """
    Generate a sales conversation response.
    
    Expected JSON input:
    {
        "thread_id": "...",
        "prospect_name": "John Doe",
        "messages": [
            {
                "sender": "you" or "prospect",
                "text": "message text",
                "timestamp": "..."
            }
        ],
        "app_link": "https://..." (optional)
    }
    
    Returns:
    {
        "response": "Generated response text",
        "strategy": "rapport_build",
        "reasoning": "explanation",
        "engagement_score": 0.7,
        "sentiment_score": 0.5
    }
    """
    try:
        # Validate request
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ["messages", "prospect_name"]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        # Extract data
        thread_id = data.get("thread_id", "unknown")
        prospect_name = data.get("prospect_name", "Unknown")
        messages = data.get("messages", [])
        app_link = data.get("app_link", "")
        
        # Validate messages
        if not isinstance(messages, list):
            return jsonify({"error": "messages must be a list"}), 400
        
        # Generate response
        result = llm_service.generate_response(
            messages=messages,
            prospect_name=prospect_name,
            thread_id=thread_id,
            app_link=app_link
        )
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error generating response: {e}")
        print(traceback.format_exc())
        return jsonify({
            "error": str(e),
            "response": "Thanks for sharing! Tell me more about that.",
            "strategy": "error_fallback"
        }), 500

@app.route('/analyze', methods=['POST'])
def analyze_conversation():
    """
    Analyze conversation state without generating response.
    
    Returns:
    {
        "phase": "rapport_build",
        "engagement": 0.6,
        "sentiment": 0.4,
        "recommendation": "...",
        "next_action": "continue_building_rapport"
    }
    """
    try:
        from conversation_analyzer import analyze_conversation_state
        
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.get_json()
        messages = data.get("messages", [])
        
        if not isinstance(messages, list):
            return jsonify({"error": "messages must be a list"}), 400
        
        state = analyze_conversation_state(messages)
        return jsonify(state), 200
    
    except Exception as e:
        print(f"Error analyzing conversation: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print(f"Starting LinkedIn Sales Agent AI on {Config.FLASK_HOST}:{Config.FLASK_PORT}")
    print(f"OpenAPI Model: {Config.OPENAI_MODEL}")
    print(f"Temperature: {Config.TEMPERATURE}")
    
    app.run(
        host=Config.FLASK_HOST,
        port=Config.FLASK_PORT,
        debug=Config.DEBUG
    )


