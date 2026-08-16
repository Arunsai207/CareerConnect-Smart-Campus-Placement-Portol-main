import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

api_key = os.getenv("API_KEY")

if not api_key:
    print("ERROR: API_KEY not found")
    exit()

genai.configure(api_key=api_key)

MODEL_NAME = "gemini-3.5-flash"

try:
    model = genai.GenerativeModel(MODEL_NAME)

    prompt = """
Generate exactly 5 interview questions for a Python Developer.

Return ONLY the questions.
Put each question on a separate line.
Number them from 1 to 5.
"""

    response = model.generate_content(prompt)

    print("\nGemini response:")
    print("----------------------")
    print(response.text)
    print("----------------------")

except Exception as e:
    print("\nGemini ERROR:")
    print(e)