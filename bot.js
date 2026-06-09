import https from 'https';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);

if (!TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set.');
  process.exit(1);
}

if (!ADMIN_ID) {
  console.error('Error: ADMIN_CHAT_ID is not set.');
  process.exit(1);
}

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

async function poll(offset = 0) {
  while (true) {
    try {
      const { result: updates } = await request('getUpdates', { offset, timeout: 30 });
      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg) continue;

        if (msg.from.id !== ADMIN_ID) continue;

        if (msg.text === '/start') {
          await request('sendMessage', { chat_id: msg.chat.id, text: 'សួស្តី' });
        }
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

console.log('Bot is running... Admin only mode.');
poll();
