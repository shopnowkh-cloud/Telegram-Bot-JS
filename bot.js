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
  keyboard: [
    ['បន្ថែមពាក្យថ្មី'],
    ['បញ្ជីពាក្យ កែប្រែ&លុប'],
  ],
  resize_keyboard: true,
  persistent: true,
};

const CANCEL_KEYBOARD = {
  keyboard: [['❌ បោះបង់']],
  resize_keyboard: true,
};

let state = null;
let pendingKeyword = null;

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

function buildListKeyboard(db) {
  const keys = Object.keys(db);
  if (keys.length === 0) return null;
  return {
    inline_keyboard: keys.map((kw) => [
      { text: `📝 ${kw}`, callback_data: `view:${kw}` },
      { text: '✏️', callback_data: `edit:${kw}` },
      { text: '🗑', callback_data: `del:${kw}` },
    ]),
  };
}

async function sendList(chatId) {
  const db = loadReplies();
  const keys = Object.keys(db);
  if (keys.length === 0) {
    await request('sendMessage', {
      chat_id: chatId,
      text: '📭 មិនទាន់មានពាក្យណាមួយទេ។\nសូមបន្ថែមពាក្យថ្មីជាមុន។',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }
  await request('sendMessage', {
    chat_id: chatId,
    text: `📋 បញ្ជីពាក្យឆ្លើយតប (${keys.length} ពាក្យ)\n\nចុច 📝 ដើម្បីមើល | ✏️ ដើម្បីកែ | 🗑 ដើម្បីលុប`,
    reply_markup: buildListKeyboard(db),
  });
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (msg.from.id !== ADMIN_ID) {
    const db = loadReplies();
    const keys = Object.keys(db);

    if (text === '/start') {
      if (keys.length === 0) {
        await request('sendMessage', { chat_id: chatId, text: 'សួស្តី! 👋' });
        return;
      }
      const rows = [];
      for (let i = 0; i < keys.length; i += 2) {
        rows.push(keys.slice(i, i + 2));
      }
      await request('sendMessage', {
        chat_id: chatId,
        text: 'សួស្តី! 👋 សូមជ្រើសរើស៖',
        reply_markup: { keyboard: rows, resize_keyboard: true },
      });
      return;
    }

    if (text) {
      const match = db[text.trim().toLowerCase()];
      if (match) await sendReply(chatId, match);
    }
    return;
  }

  if (text === '/start' || text === '❌ បោះបង់') {
    state = null;
    pendingKeyword = null;
    await request('sendMessage', {
      chat_id: chatId,
      text: '👨‍💻 ផ្ទាំងគ្រប់គ្រង Auto-Reply Bot\n\nសួស្ដីម្ចាស់គណនី សូមជ្រើសរើសមុខងារខាងក្រោម៖',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

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
    state = null;
    pendingKeyword = null;
    await sendList(chatId);
    return;
  }

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
}

async function handleCallbackQuery(cb) {
  if (cb.from.id !== ADMIN_ID) return;

  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const data = cb.data;

  await request('answerCallbackQuery', { callback_query_id: cb.id });

  if (data.startsWith('view:')) {
    const kw = data.slice(5);
    const db = loadReplies();
    if (!db[kw]) {
      await request('sendMessage', { chat_id: chatId, text: `⚠️ ពាក្យ [${kw}] មិនមានទេ។` });
      return;
    }
    await request('sendMessage', { chat_id: chatId, text: `👁 ការឆ្លើយតបសម្រាប់ពាក្យ [${kw}]៖` });
    await sendReply(chatId, db[kw]);
    return;
  }

  if (data.startsWith('del:')) {
    const kw = data.slice(4);
    const db = loadReplies();
    delete db[kw];
    saveReplies(db);

    const keys = Object.keys(db);
    if (keys.length === 0) {
      await request('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: '📭 មិនទាន់មានពាក្យណាមួយទេ។\nសូមបន្ថែមពាក្យថ្មីជាមុន។',
      });
    } else {
      await request('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `📋 បញ្ជីពាក្យឆ្លើយតប (${keys.length} ពាក្យ)\n\nចុច 📝 ដើម្បីមើល | ✏️ ដើម្បីកែ | 🗑 ដើម្បីលុប`,
        reply_markup: buildListKeyboard(db),
      });
    }
    await request('sendMessage', { chat_id: chatId, text: `🗑 បានលុបពាក្យ [${kw}] រួចរាល់។` });
    return;
  }

  if (data.startsWith('edit:')) {
    const kw = data.slice(5);
    state = 'waiting_reply';
    pendingKeyword = kw;
    await request('sendMessage', {
      chat_id: chatId,
      text: `✏️ កែប្រែពាក្យ [${kw}]\n\nសូមផ្ញើ អក្សរ, រូបភាព, វីដេអូ ឬ សំឡេង ថ្មី ដែលចង់តប៖`,
      reply_markup: CANCEL_KEYBOARD,
    });
    return;
  }
}

async function poll(offset = 0) {
  while (true) {
    try {
      const { result: updates } = await request('getUpdates', { offset, timeout: 30 });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
        if (update.callback_query) await handleCallbackQuery(update.callback_query);
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

console.log('Bot is running... Admin only mode.');
poll();
