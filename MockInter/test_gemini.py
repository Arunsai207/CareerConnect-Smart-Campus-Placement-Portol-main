import os
from dotenv import load_dotenv
from google import genai

# Load .env
load_dotenv()

# Read API key
api_key = os.getenv("GEMINI_API_KEY")

if api_key:
    print("✅ API KEY FOUND")
    print(api_key[:10] + "********")
else:
    print("❌ API KEY NOT FOUND")
    exit()

# Connect Gemini
client = genai.Client(api_key=api_key)

try:
    print("\nTesting Gemini API...")

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Say hello in one sentence"
    )

    print("\n✅ Gemini API Working")
    print("Response:")
    print(response.text)

except Exception as e:
    print("\n❌ Gemini API Failed")
    print(e)