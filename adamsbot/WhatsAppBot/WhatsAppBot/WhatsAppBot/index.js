const { Boom } = require('@hapi/boom');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useSingleFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');

const { state, saveState } = useSingleFileAuthState('./auth_info.json');
const premiumUsers = new Set(); // Store user JIDs (you can extend with a database later)

const startSock = async () => {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state
  });

  sock.ev.on('creds.update', saveState);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (body.startsWith('.menu')) {
      const menuText = `
🌟 *Welcome to Adams WhatsApp Bot!*

👤 *User:* @${sender.split('@')[0]}
📌 *Commands:*
- .menu — show this menu
- .addprem @user — add premium
- .removeprem @user — remove premium
- .status — check your premium status

🚀 Powered by AdamsProject
`;

      await sock.sendMessage(from, {
        image: { url: 'https://i.postimg.cc/QCMcTy00/file-000000004f0c6246bfd5d5a4f4710cb4.png' },
        caption: menuText,
        mentions: [sender]
      });
    }

    if (body.startsWith('.addprem')) {
      const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return sock.sendMessage(from, { text: '❌ Please mention a user to add as premium.' });

      premiumUsers.add(mentionedJid);
      sock.sendMessage(from, { text: `✅ @${mentionedJid.split('@')[0]} is now a premium user.`, mentions: [mentionedJid] });
    }

    if (body.startsWith('.removeprem')) {
      const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) return sock.sendMessage(from, { text: '❌ Please mention a user to remove from premium.' });

      premiumUsers.delete(mentionedJid);
      sock.sendMessage(from, { text: `❌ @${mentionedJid.split('@')[0]} has been removed from premium.`, mentions: [mentionedJid] });
    }

    if (body.startsWith('.status')) {
      const isPremium = premiumUsers.has(sender);
      sock.sendMessage(from, { text: isPremium ? '✅ You are a premium user.' : '🚫 You are not a premium user.' });
    }
  });
};

startSock();
