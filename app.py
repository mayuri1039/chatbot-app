import os
import sqlite3
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from openai import OpenAI

app = Flask(__name__)

api_key = os.environ.get("HF_TOKEN")
client = None

if api_key:
    client = OpenAI(
        base_url="https://router.huggingface.co/v1",
        api_key=api_key
    )
else:
    print("Warning: HF_TOKEN not found. Using mock responses.")

# Database setup
# Vercel's filesystem is read-only except for /tmp.
# If running on Vercel, we must use /tmp.
# We can detect if we are in a read-only environment or just default to /tmp for simplicity in cloud deployments,
# but for local dev, we want to keep it in the project root.
import platform

if platform.system() == "Linux": # Vercel runs on Linux
    DB_NAME = "/tmp/chat_history.db"
else:
    DB_NAME = "chat_history.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # Create sessions table
    c.execute('''CREATE TABLE IF NOT EXISTS sessions
                 (id TEXT PRIMARY KEY, title TEXT, created_at TIMESTAMP)''')
    # Create messages table
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, sender TEXT, content TEXT, timestamp TIMESTAMP,
                  FOREIGN KEY(session_id) REFERENCES sessions(id))''')
    conn.commit()
    conn.close()

# Initialize DB on startup
init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message")
    session_id = data.get("session_id")

    if not user_message:
        return jsonify({"error": "Message is required"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    # Create new session if needed
    if not session_id:
        session_id = str(uuid.uuid4())
        # Use first 30 chars of message as title
        title = user_message[:30] + "..." if len(user_message) > 30 else user_message
        c.execute("INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)",
                  (session_id, title, datetime.now()))
        conn.commit()

    # Save user message
    c.execute("INSERT INTO messages (session_id, sender, content, timestamp) VALUES (?, ?, ?, ?)",
              (session_id, 'user', user_message, datetime.now()))
    conn.commit()

    reply = ""
    if client:
        try:
            completion = client.chat.completions.create(
                model="meta-llama/Llama-3.1-8B-Instruct:novita",
                messages=[
                    {"role": "user", "content": user_message}
                ],
            )
            reply = completion.choices[0].message.content
        except Exception as e:
            reply = f"Error communicating with API: {str(e)}"
    else:
        # Mock response for UI testing
        import time
        time.sleep(1) # Simulate network delay
        reply = "This is a mock response because HF_TOKEN is not set. The UI is working correctly! 🤖"

    # Save bot message
    c.execute("INSERT INTO messages (session_id, sender, content, timestamp) VALUES (?, ?, ?, ?)",
              (session_id, 'bot', reply, datetime.now()))
    conn.commit()
    conn.close()

    return jsonify({"reply": reply, "session_id": session_id})

@app.route("/history", methods=["GET"])
def get_history():
    conn = get_db_connection()
    sessions = conn.execute("SELECT * FROM sessions ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify([dict(session) for session in sessions])

@app.route("/history/<session_id>", methods=["GET"])
def get_session_messages(session_id):
    conn = get_db_connection()
    messages = conn.execute("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", (session_id,)).fetchall()
    conn.close()
    return jsonify([dict(message) for message in messages])

if __name__ == "__main__":
    app.run(debug=True, port=5001)