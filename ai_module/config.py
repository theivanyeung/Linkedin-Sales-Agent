"""
Configuration settings for the AI module.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Application configuration."""
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = "gpt-4o"
    TEMPERATURE = 0.7
    MAX_TOKENS = 500
    
    # Flask Configuration
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
    DEBUG = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    
    # Supabase Configuration (for future integration)
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
    
    # AI Strategy Configuration
    MAX_CONVERSATION_LENGTH = 50  # Max messages to consider for context
    MIN_MESSAGES_FOR_SELL = 5  # Minimum messages before considering sell phase
    ENGAGEMENT_THRESHOLD = 0.6  # Sentiment threshold for sell phase
    
    # Response Generation
    MAX_RESPONSE_LENGTH = 200  # Characters
    MIN_RESPONSE_LENGTH = 20   # Characters
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present."""
        if not cls.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required. Set it in .env file or environment.")
        return True

# Validate configuration on import
try:
    Config.validate()
except ValueError as e:
    # Log warning but don't fail (for development)
    print(f"Warning: {e}")


