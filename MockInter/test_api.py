import os
from dotenv import load_dotenv
from google import genai

print("=" * 60)
print("GEMINI 3.5 FLASH API TEST")
print("=" * 60)

# Load .env
load_dotenv()

api_key = os.getenv("API_KEY")

if not api_key:
    print("❌ API KEY NOT FOUND")
    print()
    print("Make sure .env contains:")
    print("GEMINI_API_KEY=YOUR_API_KEY")
    exit()

print("✅ API key found")
print("🔄 Connecting to Gemini 3.5 Flash...")

try:
    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents="Reply with exactly: Gemini 3.5 Flash is working!"
    )

    print()
    print("✅ SUCCESS!")
    print("-" * 60)
    print("Model response:")
    print(response.text)
    print("-" * 60)
    print("🎉 Gemini 3.5 Flash is working correctly!")

except Exception as e:
    print()
    print("❌ GEMINI API ERROR")
    print("-" * 60)
    print("Error type:", type(e).__name__)
    print("Error:", e)
    print("-" * 60)