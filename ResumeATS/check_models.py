from google import genai
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("API_KEY")

if not api_key:
    print("❌ GEMINI_API_KEY not found")
    exit()

client = genai.Client(api_key=api_key)

print("Available Gemini Models:\n")

for model in client.models.list():
    print(model.name)