"""
Minimal wrapper using traditional chat.completions API.
"""

from typing import Any, Dict, Optional
from openai import OpenAI
from config import Config


class ResponsesClient:
    """Client using OpenAI Responses API for reasoning models, chat.completions for others."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        # Initialize OpenAI client - explicitly avoid passing unsupported arguments
        api_key_value = api_key or Config.OPENAI_API_KEY
        
        # Fix for httpx version incompatibility with proxies parameter
        # Issue: httpx 0.28+ removed 'proxies' parameter, but OpenAI SDK may try to use it
        # Solution: Create httpx client explicitly and handle proxy env vars
        
        import os
        
        # Save and remove proxy environment variables to prevent auto-detection
        proxy_vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 
                     'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy']
        saved_proxies = {}
        for var in proxy_vars:
            if var in os.environ:
                saved_proxies[var] = os.environ.pop(var)
        
        try:
            # Try to create httpx client explicitly (works with newer httpx versions)
            try:
                import httpx
                # Create httpx client without proxies to avoid version conflicts
                http_client = httpx.Client(timeout=60.0)
                self.client = OpenAI(api_key=api_key_value, http_client=http_client)
            except (TypeError, AttributeError):
                # If that fails (e.g., httpx version issue), try without explicit client
                # but with proxy vars still removed
                self.client = OpenAI(api_key=api_key_value)
        except Exception as init_error:
            # If initialization still fails, restore env vars and try one more time
            # This handles edge cases where the error persists
            for var, value in saved_proxies.items():
                os.environ[var] = value
            
            # Last attempt - may work if the issue was something else
            try:
                self.client = OpenAI(api_key=api_key_value)
            except Exception:
                # If all else fails, provide helpful error message
                raise RuntimeError(
                    f"Failed to initialize OpenAI client. This may be due to httpx version incompatibility.\n"
                    f"Try: pip install httpx==0.27.2\n"
                    f"Or: pip install --upgrade openai\n"
                    f"Original error: {init_error}"
                ) from init_error
        finally:
            # Always restore proxy environment variables
            for var, value in saved_proxies.items():
                os.environ[var] = value
        
        self.model = model or Config.OPENAI_MODEL

    def json_response(
        self,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
        reasoning_effort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Use Responses API for reasoning models, chat.completions for others."""
        # Reasoning models use Responses API
        reasoning_models = ["gpt-5", "gpt-5.1", "gpt-5-mini", "gpt-5-nano", "o1", "o1-preview", "o1-mini"]
        is_reasoning_model = self.model in reasoning_models
        
        if is_reasoning_model:
            # Use Responses API for reasoning models
            # According to OpenAI docs: https://platform.openai.com/docs/guides/gpt-5
            # The input can be a string or array of message objects
            # For simplicity, we use a string combining system and user prompts
            
            # Check if responses API is available
            if not hasattr(self.client, 'responses'):
                raise RuntimeError(
                    f"Responses API not available in your OpenAI SDK version.\n"
                    f"Model '{self.model}' requires the Responses API which is only available in newer SDK versions.\n"
                    f"Please upgrade: pip install --upgrade openai\n"
                    f"Or use a non-reasoning model like 'gpt-4o' instead."
                )
            
            combined_input = f"{system_prompt}\n\n{user_prompt}"
            
            if json_schema:
                combined_input += f"\n\nReturn ONLY a single JSON object matching this schema (validate strictly): {json_schema}"
            else:
                combined_input += "\n\nReturn ONLY a single JSON object. No emojis, no markdown, just plain JSON."
            
            response_kwargs = {
                "model": self.model,
                "input": combined_input,
            }
            
            # Add reasoning effort if specified
            # According to OpenAI docs, reasoning effort should be: reasoning={"effort": "high"}
            # Valid values: "none", "low", "medium", "high"
            # Default is "none" for low-latency responses
            if reasoning_effort:
                # Validate reasoning_effort value
                valid_efforts = ["none", "low", "medium", "high"]
                effort_value = reasoning_effort.lower() if isinstance(reasoning_effort, str) else str(reasoning_effort).lower()
                if effort_value in valid_efforts:
                    response_kwargs["reasoning"] = {"effort": effort_value}
                else:
                    # If invalid, default to "medium" and log warning
                    import warnings
                    warnings.warn(
                        f"Invalid reasoning_effort '{reasoning_effort}'. "
                        f"Valid values: {valid_efforts}. Using 'medium'."
                    )
                    response_kwargs["reasoning"] = {"effort": "medium"}
            
            resp = self.client.responses.create(**response_kwargs)
            text = resp.output_text if hasattr(resp, 'output_text') else "{}"
        else:
            # Use chat.completions API for non-reasoning models
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
            if temperature is not None:
                chat_kwargs["temperature"] = temperature
            else:
                chat_kwargs["temperature"] = Config.TEMPERATURE
            
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
