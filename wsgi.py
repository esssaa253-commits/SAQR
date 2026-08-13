"""WSGI entry point for Gunicorn deployment"""
import threading
from server import app, socketio, run_telegram_bot

# Start Telegram bot in background thread
tg_thread = threading.Thread(target=run_telegram_bot, daemon=True)
tg_thread.start()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
