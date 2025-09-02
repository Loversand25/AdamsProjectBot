const userSessions = {}; // stores state for each user
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { deployTemplate } = require('./netlify');
const {
  registerUser,
  saveWebsiteData,
  getUserWebsites,
  addToWallet,
  getWallet,
  claimDailyBonus,
  getWalletHistory
} = require('./firebase');

const bot = new TelegramBot('7018583070:AAFWtNov9SO504Xci2p7ImwgoUWv7-O36k0', { polling: true });

const ADMIN_ID = '7782756234';

bot.onText(/\/start/, async (msg) => {
  const user = msg.from;
  await registerUser({
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    language: user.language_code,
    referralCode: `REF${user.id}`
  });

  bot.sendPhoto(user.id, 'https://i.postimg.cc/QCMcTy00/file-000000004f0c6246bfd5d5a4f4710cb4.png', {
    caption: `👋 Welcome ${user.first_name}!
I'm *AdamsProjectBot*, I help you create beautiful websites instantly.

📁 Choose a template:
- business
- paradigm
- spectral
- ethereal
- passion
- story

Use: /create <template>`
  });
});

// ✅ Command: /create <template>
bot.onText(/\/create (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const template = match[1].trim().toLowerCase();
  const allowed = ['business', 'paradigm', 'spectral', 'ethereal', 'passion', 'story'];

  if (!allowed.includes(template)) {
    return bot.sendMessage(chatId, '❌ Invalid template. Use /create <template>');
  }

  // Save user state
  userSessions[chatId] = {
    step: 'title',
    data: {
      template,
    },
  };

  bot.sendMessage(chatId, `🛠 Creating your *${template}* website...\n\n📌 What's the *title* of your website?`, {
    parse_mode: 'Markdown',
  });
});

// ✅ Command: /wallet
bot.onText(/\/wallet/, async (msg) => {
  const chatId = msg.chat.id;
  const uid = String(chatId);

  const balance = await getWallet(uid); // Firebase wallet read
  bot.sendMessage(chatId, `💰 Your wallet balance is: ₦${balance}`);
});

// ✅ Command: /mywebsites
bot.onText(/\/mywebsites/, async (msg) => {
  const chatId = msg.chat.id;
  const uid = String(chatId);

  const sites = await getUserWebsites(uid); // Firebase site read
  if (!sites || Object.keys(sites).length === 0) {
    return bot.sendMessage(chatId, '🚫 You have no websites yet.');
  }

  let text = '🌐 *Your Websites:*\n\n';
  for (let key in sites) {
    const site = sites[key];
    text += `- ${site.template}: ${site.url}\n`;
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/dailybonus/, async (msg) => {
  const userId = msg.from.id.toString();
  try {
    const balance = await claimDailyBonus(userId);
    bot.sendMessage(userId, `🎁 Bonus claimed! Your new balance is ₦${balance}`);
  } catch (e) {
    bot.sendMessage(userId, `⏱ You already claimed your daily bonus today.`);
  }
});

bot.onText(/\/transactions/, async (msg) => {
  const userId = msg.from.id.toString();
  const history = await getWalletHistory(userId);
  if (Object.keys(history).length === 0) return bot.sendMessage(userId, '🧾 No wallet history found.');

  let msgText = '🧾 *Wallet Transactions:*\n';
  for (let key in history) {
    const tx = history[key];
    const date = new Date(tx.time).toLocaleString();
    msgText += `- ${tx.type}: ${tx.amount} on ${date}
`;
  }
  bot.sendMessage(userId, msgText, { parse_mode: 'Markdown' });
});

bot.onText(/\/admin/, (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) return bot.sendMessage(msg.chat.id, '❌ Not authorized');
  bot.sendMessage(msg.chat.id, '🔐 Admin panel coming soon...');
});


