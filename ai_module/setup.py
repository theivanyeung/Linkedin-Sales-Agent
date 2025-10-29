"""
Setup script for LinkedIn Sales Agent AI Module
"""

import os
import sys

def main():
    print("LinkedIn Sales Agent AI Module - Setup")
    print("=" * 50)
    
    # Check if .env exists
    if not os.path.exists('.env'):
        print("\n⚠️  No .env file found!")
        print("Creating .env file from template...")
        
        # Create .env from template
        if os.path.exists('env_template.txt'):
            with open('env_template.txt', 'r') as template:
                content = template.read()
            with open('.env', 'w') as env_file:
                env_file.write(content)
            print("✅ Created .env file")
            print("\n📝 Please edit .env and add your OPENAI_API_KEY")
        else:
            print("❌ Template file not found")
            sys.exit(1)
    else:
        print("✅ .env file exists")
    
    # Check for API key
    from dotenv import load_dotenv
    load_dotenv()
    api_key = os.getenv('OPENAI_API_KEY', '')
    
    if not api_key or api_key == 'your_openai_api_key_here':
        print("\n⚠️  OPENAI_API_KEY not configured in .env")
        print("Please edit .env and add your OpenAI API key")
    else:
        print("✅ OPENAI_API_KEY configured")
    
    print("\n🚀 Setup complete!")
    print("\nTo start the AI service:")
    print("  python main.py")
    print("\nThe service will run on http://127.0.0.1:5000")

if __name__ == '__main__':
    main()


