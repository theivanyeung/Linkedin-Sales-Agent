"""Quick test to verify the proxies fix works."""
import sys

try:
    print("Testing ResponsesClient initialization...")
    from llm_service import ResponsesClient
    
    print("Creating client with test API key...")
    client = ResponsesClient(api_key="test-key-123")
    
    print("✅ SUCCESS: Client created without proxies error!")
    print(f"   Model: {client.model}")
    print(f"   Client type: {type(client.client)}")
    
    # Test that we can access the responses API
    if hasattr(client.client, 'responses'):
        print("✅ responses API available")
    else:
        print("⚠️  responses API not available (may need SDK update)")
    
    if hasattr(client.client, 'chat'):
        print("✅ chat API available")
    else:
        print("⚠️  chat API not available")
    
    print("\n✅ All tests passed!")
    sys.exit(0)
    
except TypeError as e:
    if "proxies" in str(e):
        print(f"❌ FAILED: Still getting proxies error: {e}")
        print("\nTry one of these fixes:")
        print("1. Downgrade httpx: pip install httpx==0.27.2")
        print("2. Upgrade OpenAI SDK: pip install --upgrade openai")
        sys.exit(1)
    else:
        print(f"❌ FAILED: TypeError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
except Exception as e:
    print(f"❌ FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)




