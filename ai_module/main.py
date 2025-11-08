"""
Flask API for LinkedIn Sales Agent AI Module.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from config import Config
from ingest import build_conversation
from response_generator import generate_response
from orchestrator import run_pipeline
from knowledge_base import (
    add_document as kb_add_document,
    retrieve as kb_retrieve,
    list_recent as kb_list_recent,
)
import traceback

app = Flask(__name__)
CORS(app)  # Allow Chrome extension to make requests

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "LinkedIn Sales Agent AI"}), 200

@app.route('/generate', methods=['POST'])
def generate_response_endpoint():
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
    }
    
    Returns:
    {
        "response": "Generated response text",
        "phase": "building_rapport" or "doing_the_ask",
        "reasoning": "recommendation text",
        "engagement_score": 0.7,
        "sentiment_score": 0.5,
        "ready_for_ask": false,
        "input": {...}
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
        
        # Validate messages
        if not isinstance(messages, list):
            return jsonify({"error": "messages must be a list"}), 400
        
        # Build conversation from request data
        thread_data = {
            "title": data.get("title", f"Conversation with {prospect_name}"),
            "description": data.get("description"),
            "participants": [
                {"id": "you", "name": "You", "role": "you"},
                {"id": "prospect", "name": prospect_name, "role": "prospect"},
            ],
        }
        
        conv = build_conversation(thread_data, messages)
        
        # Generate response using the orchestrator pipeline
        response_text = generate_response(conv)
        
        # Run analysis for metadata
        analysis = run_pipeline(conv)
        
        # Build response in expected format
        result = {
            "response": response_text,
            "phase": analysis["phase"],
            "reasoning": analysis["recommendation"],
            "engagement_score": analysis["scores"]["engagement"],
            "sentiment_score": analysis["scores"]["sentiment"],
            "ready_for_ask": analysis["ready_for_ask"],
            "input": {
                "thread_id": thread_id,
                "prospect_name": prospect_name,
                "title": data.get("title", ""),
                "description": data.get("description", ""),
                "message_count": len(messages),
                "recent_messages_preview": [
                    {
                        "sender": msg.get("sender", "unknown"),
                        "text_preview": (msg.get("text", "")[:100] + "..." if len(msg.get("text", "")) > 100 else msg.get("text", ""))
                    }
                    for msg in messages[-3:]
                ]
            }
        }
        
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
        "phase": "building_rapport" or "doing_the_ask",
        "recommendation": "...",
        "analysis_details": {
            "sentiment_score": 0.4,
            "engagement_score": 0.6,
            "has_questions": true,
            "ready_for_ask": false,
            "criteria_met": {...}
        }
    }
    """
    try:
        from conversation_analyzer import analyze_conversation_state
        
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.get_json()
        messages = data.get("messages", [])
        prospect_name = data.get("prospect_name", "")
        
        if not isinstance(messages, list):
            return jsonify({"error": "messages must be a list"}), 400
        
        state = analyze_conversation_state(messages, prospect_name)
        return jsonify(state), 200
    
    except Exception as e:
        print(f"Error analyzing conversation: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/kb/add', methods=['POST'])
def add_kb_entry():
    """Add a new knowledge base document."""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400

        data = request.get_json()
        answer = data.get("answer")

        if not answer or not str(answer).strip():
            return jsonify({"error": "'answer' is required"}), 400

        question = data.get("question")
        source = data.get("source")
        tags = data.get("tags")

        if tags is not None and not isinstance(tags, list):
            return jsonify({"error": "'tags' must be a list of strings"}), 400

        document = kb_add_document(
            question=question,
            answer=answer,
            source=source,
            tags=tags,
        )

        return jsonify({"ok": True, "document": document}), 201
    except Exception as e:
        print(f"Error adding KB document: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/kb/search', methods=['GET'])
def search_kb():
    """Search the knowledge base for relevant snippets."""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        try:
            k = int(request.args.get('k', '5'))
        except ValueError:
            return jsonify({"error": "Parameter 'k' must be an integer"}), 400

        results = kb_retrieve(query, k=k)
        return jsonify({"items": results, "count": len(results)}), 200
    except Exception as e:
        print(f"Error searching KB: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/kb/recent', methods=['GET'])
def recent_kb():
    """Return the most recent knowledge base entries."""
    try:
        try:
            limit = int(request.args.get('limit', '20'))
        except ValueError:
            return jsonify({"error": "Parameter 'limit' must be an integer"}), 400

        documents = kb_list_recent(limit=limit)
        return jsonify({"items": documents, "count": len(documents)}), 200
    except Exception as e:
        print(f"Error listing KB documents: {e}")
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


