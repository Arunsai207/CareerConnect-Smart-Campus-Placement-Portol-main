from google import genai
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("API_KEY")

if not api_key:
    print("❌ API Key not found")
    exit()

client = genai.Client(api_key=api_key)

try:
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents="Reply only: Resume ATS API is working successfully"
    )

    print("✅ Gemini API Connected Successfully!")
    print("--------------------------------")
    print(response.text)

except Exception as e:
    print("❌ Gemini API Error:")
    print(e)