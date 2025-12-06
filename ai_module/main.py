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
from static_scripts import PHASE_LIBRARY, get_phase_config
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
        "reasoning": "strategic reasoning from GPT-5.1",
        "engagement_score": 0.0,
        "sentiment_score": 0.0,
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
        
        # Run analysis once - reuse for both response generation and metadata
        analysis = run_pipeline(conv)
        
        # Generate response using the orchestrator pipeline (pass analysis to avoid duplicate call)
        response_text = generate_response(conv, analysis_result=analysis)
        
        # Build response in expected format
        result = {
            "response": response_text,
            "phase": analysis["phase"],
            "reasoning": analysis["reasoning"],  # Map reasoning directly
            "engagement_score": 0.0,  # Hardcoded - no longer calculated
            "sentiment_score": 0.0,  # Hardcoded - no longer calculated
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


@app.route('/scripts/initial-message', methods=['GET'])
def get_initial_message_template():
    """Return the initial message template for placeholder extraction."""
    try:
        from static_scripts import get_initial_message_template
        template = get_initial_message_template()
        return jsonify({"template": template}), 200
    except Exception as e:
        print(f"Error getting initial message template: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/scripts/list', methods=['GET'])
def list_scripts():
    """Return all available scripts organized by phase for UI insertion."""
    try:
        scripts = {}
        for phase_id, phase_data in PHASE_LIBRARY.items():
            phase_name = phase_data.get("name", phase_id)
            scripts[phase_id] = {
                "name": phase_name,
                "summary": phase_data.get("summary", ""),
                "templates": [],
            }
            
            # Building Rapport phase templates
            if phase_id == "building_rapport":
                # Note: Initial message is not exposed as it's already sent to all leads
                
                probes = phase_data.get("sections", {}).get("engaging_with_lead", {}).get("probes", {})
                if "initial_probe" in probes:
                    scripts[phase_id]["templates"].append({
                        "id": "initial_probe",
                        "label": "Ask About Motivation",
                        "text": probes["initial_probe"],
                    })
                if "pain_roadblock_probe" in probes:
                    scripts[phase_id]["templates"].append({
                        "id": "pain_probe",
                        "label": "Ask About Barriers",
                        "text": probes["pain_roadblock_probe"],
                    })
                if "vision_aspiration_probe" in probes:
                    scripts[phase_id]["templates"].append({
                        "id": "vision_probe",
                        "label": "Ask About Vision",
                        "text": probes["vision_aspiration_probe"],
                    })
                
                context = phase_data.get("sections", {}).get("relevance_context", {}).get("script", "")
                if context:
                    scripts[phase_id]["templates"].append({
                        "id": "relevance_context",
                        "label": "Relevance Context",
                        "text": context,
                    })
            
            # Selling phase templates
            elif phase_id == "doing_the_ask":
                intro_variants = phase_data.get("sections", {}).get("introduction", {}).get("variants", [])
                # Label variants with descriptive names based on content
                variant_labels = [
                    "Friend Context",
                    "Success Story",
                    "Prodicity Intro",
                    "Timeline & CTA",
                ]
                
                for i, variant in enumerate(intro_variants):
                    label = variant_labels[i] if i < len(variant_labels) else f"Intro Part {i+1}"
                    scripts[phase_id]["templates"].append({
                        "id": f"intro_variant_{i+1}",
                        "label": label,
                        "text": variant,
                    })
                
                application = phase_data.get("sections", {}).get("application", {}).get("script", "")
                if application:
                    scripts[phase_id]["templates"].append({
                        "id": "application",
                        "label": "Application Link",
                        "text": application,
                    })
                
                call_scheduling = phase_data.get("sections", {}).get("call_scheduling", {}).get("script", "")
                if call_scheduling:
                    scripts[phase_id]["templates"].append({
                        "id": "call_scheduling",
                        "label": "Call Scheduling",
                        "text": call_scheduling,
                    })
                
                pricing = phase_data.get("sections", {}).get("pricing", {}).get("script", "")
                if pricing:
                    scripts[phase_id]["templates"].append({
                        "id": "pricing",
                        "label": "Pricing Info",
                        "text": pricing,
                    })
                
                social_proof = phase_data.get("sections", {}).get("social_proof", {}).get("script", "")
                if social_proof:
                    scripts[phase_id]["templates"].append({
                        "id": "social_proof",
                        "label": "Social Proof Examples",
                        "text": social_proof,
                    })
        
        return jsonify({"phases": scripts}), 200
    except Exception as e:
        print(f"Error listing scripts: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/scripts/get', methods=['GET'])
def get_script():
    """Get a specific script template by phase and template ID."""
    try:
        phase = request.args.get('phase')
        template_id = request.args.get('template_id')
        
        if not phase or not template_id:
            return jsonify({"error": "Both 'phase' and 'template_id' parameters are required"}), 400
        
        phase_config = get_phase_config(phase)
        if not phase_config:
            return jsonify({"error": f"Phase '{phase}' not found"}), 404
        
        # Extract the template based on ID
        text = None
        
        if phase == "building_rapport":
            if template_id == "initial_message":
                text = phase_config.get("initial_message", "")
            elif template_id == "initial_probe":
                text = phase_config.get("sections", {}).get("engaging_with_lead", {}).get("probes", {}).get("initial_probe", "")
            elif template_id == "pain_probe":
                text = phase_config.get("sections", {}).get("engaging_with_lead", {}).get("probes", {}).get("pain_roadblock_probe", "")
            elif template_id == "vision_probe":
                text = phase_config.get("sections", {}).get("engaging_with_lead", {}).get("probes", {}).get("vision_aspiration_probe", "")
            elif template_id == "relevance_context":
                text = phase_config.get("sections", {}).get("relevance_context", {}).get("script", "")
        elif phase == "doing_the_ask":
            if template_id.startswith("intro_variant_"):
                idx = int(template_id.split("_")[-1]) - 1
                variants = phase_config.get("sections", {}).get("introduction", {}).get("variants", [])
                if 0 <= idx < len(variants):
                    text = variants[idx]
            elif template_id == "application":
                text = phase_config.get("sections", {}).get("application", {}).get("script", "")
            elif template_id == "call_scheduling":
                text = phase_config.get("sections", {}).get("call_scheduling", {}).get("script", "")
            elif template_id == "pricing":
                text = phase_config.get("sections", {}).get("pricing", {}).get("script", "")
            elif template_id == "social_proof":
                text = phase_config.get("sections", {}).get("social_proof", {}).get("script", "")
        
        if not text:
            return jsonify({"error": f"Template '{template_id}' not found in phase '{phase}'"}), 404
        
        return jsonify({"text": text, "phase": phase, "template_id": template_id}), 200
    except Exception as e:
        print(f"Error getting script: {e}")
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


