import https from 'https';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);

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

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (msg.from.id !== ADMIN_ID) return;

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
}

async function poll(offset = 0) {
  while (true) {
    try {
      const { result: updates } = await request('getUpdates', { offset, timeout: 30 });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

console.log('Bot is running... Admin only mode.');
poll();
