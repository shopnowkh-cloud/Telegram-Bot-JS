import https from 'https';
import fs from 'fs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const DB_FILE = './replies.json';

if (!TOKEN) { console.error('Error: TELEGRAM_BOT_TOKEN is not set.'); process.exit(1); }
if (!ADMIN_ID) { console.error('Error: ADMIN_CHAT_ID is not set.'); process.exit(1); }

const BASE = `https://api.telegram.org/bot${TOKEN}`;

function request(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(`${BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function loadReplies() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveReplies(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const MAIN_KEYBOARD = {
  keyboard: [['បន្ថែមពាក្យថ្មី'], ['បញ្ជីពាក្យ កែប្រែ&លុប']],
  resize_keyboard: true,
  persistent: true,
};

const CANCEL_KEYBOARD = {
  keyboard: [['❌ បោះបង់']],
  resize_keyboard: true,
};

const ACTION_KEYBOARD = {
  keyboard: [['👁 មើល', '✏️ កែ', '🗑 លុប'], ['❌ បោះបង់']],
  resize_keyboard: true,
};

function buildListKeyboard(db) {
  const keys = Object.keys(db);
  const rows = [];
  for (let i = 0; i < keys.length; i += 2) rows.push(keys.slice(i, i + 2));
  rows.push(['❌ បោះបង់']);
  return { keyboard: rows, resize_keyboard: true };
}

let state = null;
let pendingKeyword = null;
let selectedKeyword = null;

async function sendReply(chatId, replyContent) {
  if (replyContent.type === 'text') {
    await request('sendMessage', { chat_id: chatId, text: replyContent.content });
  } else if (replyContent.type === 'photo') {
    await request('sendPhoto', { chat_id: chatId, photo: replyContent.content, caption: replyContent.caption });
  } else if (replyContent.type === 'video') {
    await request('sendVideo', { chat_id: chatId, video: replyContent.content, caption: replyContent.caption });
  } else if (replyContent.type === 'voice') {
    await request('sendVoice', { chat_id: chatId, voice: replyContent.content });
  } else if (replyContent.type === 'audio') {
    await request('sendAudio', { chat_id: chatId, audio: replyContent.content, caption: replyContent.caption });
  }
}

function getReplyContent(msg) {
  if (msg.text) return { type: 'text', content: msg.text };
  if (msg.photo) return { type: 'photo', content: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption || '' };
  if (msg.video) return { type: 'video', content: msg.video.file_id, caption: msg.caption || '' };
  if (msg.voice) return { type: 'voice', content: msg.voice.file_id };
  if (msg.audio) return { type: 'audio', content: msg.audio.file_id, caption: msg.caption || '' };
  return null;
}

async function handleUserMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const db = loadReplies();
  const keys = Object.keys(db);

  const isStart = text === '/start' || text?.startsWith('/start@');

  if (isStart) {
    if (keys.length === 0) {
      await request('sendMessage', { chat_id: chatId, text: 'សួស្តី! 👋' });
      return;
    }
    const rows = [];
    for (let i = 0; i < keys.length; i += 2) rows.push(keys.slice(i, i + 2));
    await request('sendMessage', {
      chat_id: chatId,
      text: `📋 បញ្ជីពាក្យឆ្លើយតប (${keys.length} ពាក្យ)\n\nសូមជ្រើសរើសពាក្យ៖`,
      reply_markup: isGroup ? { remove_keyboard: true } : { keyboard: rows, resize_keyboard: true },
    });
    if (isGroup) {
      await request('sendMessage', {
        chat_id: chatId,
        text: rows.map(r => r.join('   ')).join('\n'),
      });
    }
    return;
  }

  if (text) {
    const match = db[text.trim().toLowerCase()];
    if (match) {
      try {
        await request('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
      } catch (_) {}
      await sendReply(chatId, match);
    }
  }
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  // Group messages → always user experience
  if (isGroup) {
    await handleUserMessage(msg);
    return;
  }

  // Private chat, non-admin → user experience
  if (msg.from.id !== ADMIN_ID) {
    await handleUserMessage(msg);
    return;
  }

  // --- ADMIN ---

  if (text === '/start' || text === '❌ បោះបង់') {
    state = null;
    pendingKeyword = null;
    selectedKeyword = null;
    await request('sendMessage', {
      chat_id: chatId,
      text: '👨‍💻 ផ្ទាំងគ្រប់គ្រង Auto-Reply Bot\n\nសួស្ដីម្ចាស់គណនី សូមជ្រើសរើសមុខងារខាងក្រោម៖',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // Main menu
  if (text === 'បន្ថែមពាក្យថ្មី') {
    state = 'waiting_keyword';
    pendingKeyword = null;
    await request('sendMessage', {
      chat_id: chatId,
      text: '🛠 ប្រព័ន្ធបន្ថែមពាក្យឆ្លើយតប\n\nជំហានទី១: សូមវាយ ពាក្យគន្លឹះ\n\n💡 ឧទាហរណ៍៖ សុំ qr, qr aba, qr code',
      reply_markup: CANCEL_KEYBOARD,
    });
    return;
  }

  if (text === 'បញ្ជីពាក្យ កែប្រែ&លុប') {
    const db = loadReplies();
    const keys = Object.keys(db);
    state = 'browsing_list';
    selectedKeyword = null;
    if (keys.length === 0) {
      state = null;
      await request('sendMessage', {
        chat_id: chatId,
        text: '📭 មិនទាន់មានពាក្យណាមួយទេ។\nសូមបន្ថែមពាក្យថ្មីជាមុន។',
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }
    await request('sendMessage', {
      chat_id: chatId,
      text: `📋 បញ្ជីពាក្យឆ្លើយតប (${keys.length} ពាក្យ)\n\nសូមជ្រើសរើសពាក្យ៖`,
      reply_markup: buildListKeyboard(db),
    });
    return;
  }

  // Browsing list — user tapped a keyword
  if (state === 'browsing_list') {
    const db = loadReplies();
    const kw = text.trim().toLowerCase();
    if (!db[kw]) return;
    selectedKeyword = kw;
    state = 'keyword_action';
    await request('sendMessage', {
      chat_id: chatId,
      text: `📝 ពាក្យ: [${kw}]\n\nសូមជ្រើសរើសសកម្មភាព៖`,
      reply_markup: ACTION_KEYBOARD,
    });
    return;
  }

  // Action on selected keyword
  if (state === 'keyword_action' && selectedKeyword) {
    if (text === '👁 មើល') {
      const db = loadReplies();
      await request('sendMessage', { chat_id: chatId, text: `👁 ការឆ្លើយតបសម្រាប់ [${selectedKeyword}]៖` });
      await sendReply(chatId, db[selectedKeyword]);
      return;
    }

    if (text === '✏️ កែ') {
      pendingKeyword = selectedKeyword;
      state = 'waiting_reply';
      selectedKeyword = null;
      await request('sendMessage', {
        chat_id: chatId,
        text: `✏️ កែប្រែពាក្យ [${pendingKeyword}]\n\nសូមផ្ញើ អក្សរ, រូបភាព, វីដេអូ ឬ សំឡេង ថ្មី ដែលចង់តប៖`,
        reply_markup: CANCEL_KEYBOARD,
      });
      return;
    }

    if (text === '🗑 លុប') {
      const db = loadReplies();
      const kw = selectedKeyword;
      delete db[kw];
      saveReplies(db);
      const keys = Object.keys(db);
      state = null;
      selectedKeyword = null;
      if (keys.length === 0) {
        await request('sendMessage', {
          chat_id: chatId,
          text: `🗑 បានលុបពាក្យ [${kw}] រួចរាល់។\n\n📭 មិនទាន់មានពាក្យណាមួយទេ។`,
          reply_markup: MAIN_KEYBOARD,
        });
      } else {
        state = 'browsing_list';
        await request('sendMessage', {
          chat_id: chatId,
          text: `🗑 បានលុបពាក្យ [${kw}] រួចរាល់។\n\n📋 បញ្ជីពាក្យ (${keys.length} ពាក្យ)\n\nសូមជ្រើសរើសពាក្យ៖`,
          reply_markup: buildListKeyboard(db),
        });
      }
      return;
    }
  }

  // Add keyword flow
  if (state === 'waiting_keyword' && text) {
    pendingKeyword = text.trim().toLowerCase();
    state = 'waiting_reply';
    await request('sendMessage', {
      chat_id: chatId,
      text: `✅ ទទួលពាក្យ: ${text.trim()}\n\nជំហានទី២: សូមផ្ញើ អក្សរ, រូបភាព, វីដេអូ ឬ សំឡេង ដែលចង់តប៖`,
      reply_markup: CANCEL_KEYBOARD,
    });
    return;
  }

  if (state === 'waiting_reply') {
    const replyContent = getReplyContent(msg);
    if (!replyContent) {
      await request('sendMessage', {
        chat_id: chatId,
        text: '⚠️ មិនទទួលស្គាល់ប្រភេទនេះទេ។ សូមផ្ញើ អក្សរ, រូបភាព, វីដេអូ ឬ សំឡេង។',
        reply_markup: CANCEL_KEYBOARD,
      });
      return;
    }

    const db = loadReplies();
    db[pendingKeyword] = replyContent;
    saveReplies(db);

    const displayKeyword = pendingKeyword;
    state = null;
    pendingKeyword = null;

    await request('sendMessage', {
      chat_id: chatId,
      text: `🎉 រៀបចំរួចរាល់!\nពាក្យ [${displayKeyword}] វានឹងបង្ហាញលទ្ធផលដែលបានបញ្ចូល៖`,
      reply_markup: MAIN_KEYBOARD,
    });
    await sendReply(chatId, replyContent);
    return;
  }

  // Fallback: admin tests a keyword when no state is active
  if (!state && text) {
    const db = loadReplies();
    const match = db[text.trim().toLowerCase()];
    if (match) {
      await request('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
      await sendReply(chatId, match);
    }
  }
}

async function poll(offset = 0) {
  while (true) {
    try {
      const res = await request('getUpdates', { offset, timeout: 30 });
      if (!res.ok || !Array.isArray(res.result)) {
        console.error('Bad response from Telegram:', JSON.stringify(res));
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

console.log('Bot is running... Admin only mode.');
poll();
