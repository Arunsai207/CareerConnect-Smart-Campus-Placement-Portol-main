import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("API_KEY")

if not api_key:
    print("ERROR: API_KEY not found in .env")
    exit()

print("API Key Loaded: True")

client = genai.Client(api_key=api_key)

print("\nAvailable Gemini models:\n")

try:
    for model in client.models.list():
        print("Model:", model.name)

except Exception as e:
    print("ERROR:", e)