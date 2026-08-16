from pymongo import MongoClient
from datetime import datetime

try:
    print("Connecting to MongoDB...")

    client = MongoClient(
        "mongodb://localhost:27017/",
        serverSelectionTimeoutMS=5000
    )

    # Test connection
    client.admin.command("ping")

    print("MongoDB connected successfully")

    # Database
    db = client["mock_interviews"]

    # Collections
    interviews = db["interviews"]
    feedbacks = db["feedbacks"]
    face_logs = db["face_logs"]

    # Insert test document
    test_data = {
        "test": True,
        "message": "MongoDB connection test successful",
        "timestamp": datetime.now()
    }

    result = interviews.insert_one(test_data)

    print("Test document inserted")
    print("Document ID:", result.inserted_id)

    # Read it back
    document = interviews.find_one(
        {"_id": result.inserted_id}
    )

    print("\nRetrieved document:")
    print(document)

    print("\nMongoDB TEST PASSED")

except Exception as e:

    print("\nMongoDB TEST FAILED")
    print(type(e).__name__)
    print(e)