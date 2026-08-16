import os
from dotenv import load_dotenv
from google import genai

# Load .env
load_dotenv()

# Create Gemini client
client = genai.Client(api_key=os.getenv("API_KEY"))

try:
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents="""
        Generate a short motivational interview preparation message
        for a candidate. Keep it under 100 words.
        """
    )

    print("========================================")
    print("✅ Gemini API Connected Successfully!")
    print("========================================")
    print("\n📢 Prepare for Interview Message:\n")
    print(response.text)

except Exception as e:
    print("========================================")
    print("❌ Gemini API Connection Failed!")
    print("========================================")
    print("Error:", e)