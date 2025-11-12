"""
Minimal wrapper using traditional chat.completions API.
"""

from typing import Any, Dict, Optional
from openai import OpenAI
from config import Config


class ResponsesClient:
    """Thin client using chat.completions API (renamed for compatibility)."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.client = OpenAI(api_key=api_key or Config.OPENAI_API_KEY)
        self.model = model or Config.OPENAI_MODEL

    def json_response(
        self,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Use chat.completions API to get JSON response."""
        sys_prompt = system_prompt
        if json_schema:
            sys_prompt += "\nReturn ONLY a single JSON object matching this schema (validate strictly): " + str(json_schema)
        else:
            sys_prompt += "\nReturn ONLY a single JSON object. No emojis, no markdown, just plain JSON."

        chat_kwargs = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        
        # Add temperature if model supports it
        if self.model not in ["gpt-5"]:
            temp_val = temperature if temperature is not None else Config.TEMPERATURE
            chat_kwargs["temperature"] = temp_val
        
        # Add max tokens
        if max_output_tokens is not None:
            chat_kwargs["max_tokens"] = max_output_tokens
        elif Config.MAX_TOKENS:
            chat_kwargs["max_tokens"] = Config.MAX_TOKENS
        
        resp = self.client.chat.completions.create(**chat_kwargs)
        text = resp.choices[0].message.content if resp.choices else "{}"

        import json
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON substring
            import re
            match = re.search(r"\{[\s\S]*\}$", text.strip())
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            return {"_raw": text}


