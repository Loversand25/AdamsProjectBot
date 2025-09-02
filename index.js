require("dotenv").config();

// Get API keys from .env
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

// Import dependencies
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { deployToNetlify } = require("./netlify");
const { db, saveWebsiteData, getUserWebsites } = require("./firebase"); // 🔹 firebase imported here
const sessionTimeout = {}; // Track last activity timestamp per user
const SESSION_EXPIRY = 10 * 60 * 1000; // 10 minutes

// ====== Send File Helper ======
const mimeTypes = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime"
};

const telegramTypes = {
  pdf: "document",
  docx: "document",
  doc: "document",
  png: "photo",
  jpg: "photo",
  jpeg: "photo",
  gif: "photo",
  mp3: "audio",
  wav: "audio",
  mp4: "video",
  mov: "video"
};

function sendFileAuto(bot, chatId, filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const sendType = telegramTypes[ext] || "document"; // fallback
  const filename = path.basename(filePath);
  const readStream = fs.createReadStream(filePath);

  const options = { filename, contentType };

  switch(sendType) {
    case "document":
      bot.sendDocument(chatId, readStream, {}, options);
      break;
    case "photo":
      bot.sendPhoto(chatId, readStream, {}, options);
      break;
    case "audio":
      bot.sendAudio(chatId, readStream, {}, options);
      break;
    case "video":
      bot.sendVideo(chatId, readStream, {}, options);
      break;
    default:
      bot.sendDocument(chatId, readStream, {}, options);
      break;
  }
}
// ====== End of helper ======//


// 🔹 Test Firebase connection
db.ref("test")
  .set({ status: "working" })
  .then(() => console.log("✅ Firebase connected and data written!"))
  .catch((err) => console.error("❌ Firebase error:", err));

// Initialize the Telegram bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ----------------- CANCEL COMMAND -----------------
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;

  // Clear all user flows
  delete userStates[chatId];
  delete siteSessions[chatId];
  delete userSessions[chatId];
  waitingForContactMessage.delete(chatId);
  delete sessionTimeout[chatId];

  bot.sendMessage(
    chatId,
    "🛑 All ongoing actions have been cancelled. You can start fresh with /start."
  );
});

bot.onText(/\/sendtest/, (msg) => {
  const chatId = msg.chat.id;
  sendFileAuto(bot, chatId, "./test.txt");
});

const usersSet = new Set();
const userStates = {}; // Track multi-step flows (flyer, website)
const userSessions = {}; // Flyer sessions
const waitingForContactMessage = new Set();

const dataFile = "users.json";
const templatesDir = path.join(__dirname, "templates");

// Auto-handle user-uploaded files
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  let fileId;

  if (msg.document) fileId = msg.document.file_id;
  else if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id; // best quality
  else if (msg.audio) fileId = msg.audio.file_id;
  else if (msg.video) fileId = msg.video.file_id;

  if (fileId) {
    bot.getFileLink(fileId).then((fileUrl) => {
      // You can download the file locally if you want
      // Or directly resend using sendFileAuto
      const filename = path.basename(fileUrl);
      const localPath = `./downloads/${filename}`;

      // Ensure downloads folder exists
      if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

      // Download file
      axios({ url: fileUrl, responseType: 'stream' })
        .then((response) => {
          const writer = fs.createWriteStream(localPath);
          response.data.pipe(writer);
          writer.on('finish', () => {
            sendFileAuto(bot, chatId, localPath); // Resend the file
          });
        })
        .catch((err) => console.error("❌ File download error:", err));
    });
  }
});

const WHATSAPP_LINK =
  "https://whatsapp.com/channel/0029VbAfoZZJ93wcr2oZkS0d";
const adminId = 7782756234;

// Load saved user data
let userData = {};
if (fs.existsSync(dataFile)) {
  userData = JSON.parse(fs.readFileSync(dataFile));
}
function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(userData, null, 2));
}

// Welcome image
const welcomeImageUrl =
  "https://i.postimg.cc/QCMcTy00/file-000000004f0c6246bfd5d5a4f4710cb4.png";

// Template lists
const templateList = [
  "blog",
  "portfolio",
  "business",
  "simple",
  "cyberpunk",
  "elonx",
  "aitech",
  "futurify",
  "startupverse",
  "space-tech",
  "neonwave",
  "darkfusion",
  "quantumx",
  "minimalist-pro",
];
const premiumTemplates = [
  "cyberpunk",
  "elonx",
  "aitech",
  "futurify",
  "space-tech",
];

// ================== START COMMAND ==================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "there"; 
		
  // Clear any previous sessions for this user
delete userStates[chatId];
delete siteSessions[chatId];
delete userSessions[chatId];
delete waitingForContactMessage[chatId];
delete sessionTimeout[chatId];

  await bot.sendPhoto(chatId, welcomeImageUrl);

  const welcomeText = `👋 Hello *${name}*, welcome to *AdamsProjectBot* 🚀\n\nUse the buttons below to get started quickly.`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🌐 Create Website", callback_data: "create" },
          { text: "📂 My Websites", callback_data: "mywebsites" }
        ],
        [
          { text: "💎 Premium Templates", callback_data: "premium" },
          { text: "❓ Help", callback_data: "help" },
          { text: "🚫 Cancel", callback_data: "cancel" }  // ✅ Cancel button
        ],
        [
          { text: "🖼️ Flyer", callback_data: "flyer" },
          { text: "📩 Contact", callback_data: "contact" }
        ],
        [
          { text: "👑 Admin", callback_data: "admin" }
        ],
        [
          { text: "📢 Join WhatsApp", url: WHATSAPP_LINK }
        ]
      ]
    }
  };

  await bot.sendMessage(chatId, welcomeText, options);
});

// ================== WHATSAPP JOIN CONFIRMATION ==================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  if (text === "✅ joined" || text === "joined") {
    if (!userData[chatId]) userData[chatId] = {};
    userData[chatId].joinedWhatsApp = true;
    saveData();
    await bot.sendMessage(
      chatId,
      "🎉 Thanks for joining! Now you can create your website."
    );
  }
});

// ================== CALLBACK QUERY HANDLER ==================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;

  // Admin check
  if (data.startsWith("admin") && userId !== adminId) {
    return bot.answerCallbackQuery(query.id, {
      text: "🚫 Not authorized.",
      show_alert: true,
    });
  }

  switch (data) {
    case "create":
      if (!userData[chatId]?.joinedWhatsApp) {
        await bot.sendMessage(
          chatId,
          `🚀 To create a website, you must first join our WhatsApp Channel.\n\n👉 [Join Channel](${WHATSAPP_LINK})\n\nAfter joining, type "✅ Joined" here.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      startCreateFlow(chatId);
      break;

    case "mywebsites":
      showMyWebsites(chatId);
      break;

    case "premium":
      showPremium(chatId);
      break;

    case "pricing":
      showPricing(chatId);
      break;

    case "help":
      sendHelp(chatId);
      break;

    case "flyer":
      startFlyerFlow(chatId);
      break;

    case "contact":
      waitingForContactMessage.add(chatId);
      bot.sendMessage(chatId, "Please type your message and send it to me.");
      break;

    case "admin":
      showAdminPanel(chatId);
      break; 
     case "cancel":  // ✅ Handle Cancel button
      // Clear all ongoing flows
      delete userStates[chatId];
      delete siteSessions[chatId];
      delete userSessions[chatId];
      waitingForContactMessage.delete(chatId);
      delete sessionTimeout[chatId];

      bot.sendMessage(chatId, "🛑 All ongoing actions have been cancelled. You can start fresh with /start.");
      await bot.answerCallbackQuery(query.id).catch(() => {});
      break;
  }

  // Always acknowledge the callback to remove "loading" state
  await bot.answerCallbackQuery(query.id).catch(() => {});
});

     // ================== CONTACT HANDLER ==================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (waitingForContactMessage.has(chatId)) {
    const userName = msg.from.username || msg.from.first_name || "User";
    const userId = msg.from.id;
    const userMessage = text;

    const forwardMsg = `📩 New contact message from @${userName} (ID: ${userId}):\n\n${userMessage}`;

    bot
      .sendMessage(adminId, forwardMsg)
      .then(() => bot.sendMessage(chatId, "✅ Message sent to Adams x projecit!"))
      .catch(() =>
        bot.sendMessage(chatId, "❌ Failed to send message. Try again later.")
      );

    waitingForContactMessage.delete(chatId);
    return;
  }
});

// ================== WEBSITE FLOW ==================
function startCreateFlow(chatId) {
  userStates[chatId] = { step: "template" };
  bot.sendMessage(
    chatId,
    `🎨 Choose a template from the list below:\n\n${templateList.join(
      ", "
    )}\n\nType the *template name* to continue.`,
    { parse_mode: "Markdown" }
  );
 }

// ================== TEMPLATE SELECTION HANDLER ==================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

// Reset session activity timer
sessionTimeout[chatId] = Date.now();
  if (!userStates[chatId] || userStates[chatId].step !== "template") return;

  const choice = msg.text.trim().toLowerCase();
  if (templateList.includes(choice)) {
    userStates[chatId].step = "website_qna"; // move to next stage
    if (!siteSessions[chatId]) {
      siteSessions[chatId] = { step: 1, data: { template: choice } };
      bot.sendMessage(chatId, `✅ You selected the *${choice}* template.\n\n🌐 Step 1: What is your website title?`, { parse_mode: "Markdown" });
    }
  } else {
    bot.sendMessage(chatId, "❌ Invalid choice. Please type one of the listed templates.");
  }

});

// ================== WEBSITE CREATOR Q&A ==================

// Store sessions for each user
const siteSessions = {}; 

const websiteQuestions = [
  { key: "title", text: "📛 What is your website title? (You can text any title of your choice, heading....)" },

  { key: "style", text: "🎨 What design style do you want? (modern, futuristic, simple...)" },

  { key: "features", text: "⚙️ What features do you want? (shop, contact form, gallery, payments...)" },

  { key: "colors", text: "🌈 Do you have brand colors or logo? (paste image URL or type skip)" },

  { key: "mode", text: "☀️ Do you prefer Light 🌞 or Dark 🌙 mode?" }
];

// Handle Q&A flow
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!userStates[chatId]) return;

  if (!siteSessions[chatId]) {
    siteSessions[chatId] = { step: 0, data: {} };
    return bot.sendMessage(chatId, websiteQuestions[0].text);
  }

  const session = siteSessions[chatId];
  const step = session.step;
  const answer = msg.text;

  // Save answer
  const key = websiteQuestions[step].key;
  session.data[key] = answer;

  // Next step
  if (step + 1 < websiteQuestions.length) {
    session.step++;
    bot.sendMessage(chatId, websiteQuestions[session.step].text);
  } else {
    // Finished: summary//
const d = session.data;
const summary = `
✅ Done! Here’s your website plan:

🌐 Template: ${d.template}
📛 Title: ${d.title}
🎨 Style: ${d.style}
⚙️ Features: ${d.features}
🌈 Colors/Logo: ${d.colors}
☀️ Mode: ${d.mode}

👉 Next: I will generate the design & HTML for you.
`;
    bot.sendMessage(chatId, summary);
    console.log("Website vision:", d);

    delete siteSessions[chatId]; // Clear session
  }
});

async function showMyWebsites(chatId) {
  let websites = await getUserWebsites(chatId);

  if (!websites) {
    return bot.sendMessage(
      chatId,
      "🔎 You have not deployed any website yet. Use /create to get started."
    );
  }

  if (!Array.isArray(websites)) websites = Object.values(websites);

  if (websites.length === 0) {
    return bot.sendMessage(
      chatId,
      "🔎 You have not deployed any website yet. Use /create to get started."
    );
  }

  const list = websites
    .map((s, i) => `🔗 Site ${i + 1}: [${s.name}](${s.url})`)
    .join("\n");

  bot.sendMessage(chatId, `📂 *Your Websites:*\n\n${list}`, {
    parse_mode: "Markdown",
  });
}

function showPremium(chatId) {
  const message = `💎 *Premium Templates*:\n\n${premiumTemplates.join(
    ", "
  )}\n\nContact admin for access.`;

  bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📞 Contact Admin", url: "https://t.me/Adamprojec" }],
      ],
    },
  });
}

function sendHelp(chatId) {
  const helpMessage = `🧠 *AdamsProjectBot Commands*:
✅ /create – Build website
✅ /mywebsites – View sites
💎 /premium – Premium templates
🖼️ /flyer – Generate flyer
📩 /contact – Send message
👑 /admin – Admin panel
❓ /help – Show this message
👥 /cancel-restart this awesome bot
🚀 Powered by AdamsProjectBot`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
}

function showAdminPanel(chatId) {
  const adminMessage = `👑 *Admin Panel*\n\nAvailable commands:`;
  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "👥 List Users", callback_data: "admin_users" },
          { text: "📁 Website Data", callback_data: "admin_websitedata" },
        ],
        [
          { text: "📊 Usage Stats", callback_data: "admin_stats" },
          { text: "👤 Show User Count", callback_data: "show_users" },
        ],
      ],
    },
  };
  bot.sendMessage(chatId, adminMessage, options);
}

// ================== ADMIN CALLBACKS ==================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;

  if (userId !== adminId) return;

  switch (data) {
    case "admin_users":
      bot.sendMessage(chatId, `👥 Total users: ${usersSet.size}`);
      break;
    case "admin_websitedata":
      bot.sendMessage(
        chatId,
        `📂 User data:\n\`\`\`${JSON.stringify(userData, null, 2)}\`\`\``,
        { parse_mode: "Markdown" }
      );
      break;
    case "admin_stats":
      bot.sendMessage(chatId, "📊 Usage stats coming soon...");
      break;
    case "show_users":
      bot.sendMessage(
        chatId,
        `👤 Users IDs:\n${[...usersSet].join(", ")}`
      );
      break;
  }

  bot.answerCallbackQuery(query.id).catch(() => {});
});

// ================== POLLING ERROR HANDLER ==================
bot.on("polling_error", (err) => {
  console.error("❌ Polling error:", err);
});

// ================== PRICING FUNCTION ==================
function showPricing(chatId) {
  const pricingText = `
💰 AdamsProjectBot Pricing Plans

🔹 Basic Website – 8k
Blog, portfolio, or simple business site
1 free update

🔹 Premium Website – 10k
All Basic features + custom design
Free hosting setup
Priority support

Team: Adams x project
`;
  bot.sendMessage(chatId, pricingText, { parse_mode: "Markdown" });
}

// ================== FLYER BUILDER ==================

// Trigger via typed command too
bot.onText(/\/flyer/, (msg) => startFlyerFlow(msg.chat.id));

function startFlyerFlow(chatId) {
  userSessions[chatId] = { step: 1, data: {} };
  bot.sendMessage(
    chatId,
    "🎨 Welcome to Flyer Generator!\n\nStep 1: What is the type of your flyer? (e.g., Event, Sale, Party)"
  );
}

// Handle the flyer step-by-step messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const session = userSessions[chatId];
  if (!session) return;                // only act if user is in flyer flow
  if (!text || text.startsWith("/")) return;

  switch (session.step) {
    case 1:
      session.data.type = text;
      session.step = 2;
      return bot.sendMessage(chatId, "Step 2: Enter the title:");
    case 2:
      session.data.title = text;
      session.step = 3;
      return bot.sendMessage(chatId, "Step 3: Enter a short description:");
    case 3:
      session.data.description = text;
      session.step = 4;
      return bot.sendMessage(chatId, "Step 4: Enter your contact info (phone/email/etc):");
    case 4:
      session.data.contact = text;
      session.step = 5;
      return bot.sendMessage(chatId, "Optional: Send a background image URL or type 'skip':");
    case 5:
      session.data.bgImageUrl = text.toLowerCase() === "skip" ? null : text;
      session.step = 6;
      return bot.sendMessage(chatId, "Optional: Send a logo image URL or type 'skip':");
    case 6:
      session.data.logoUrl = text.toLowerCase() === "skip" ? null : text;
      session.step = 7;
      bot.sendMessage(chatId, "✨ Generating your flyer...");
      try {
        const flyerPath = await generateFlyer(session.data);
        await bot.sendPhoto(chatId, flyerPath, {
          caption: "🎨 Here’s your flyer!",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Regenerate Flyer", callback_data: "regenerate_flyer" }],
              [{ text: "✅ Done", callback_data: "done_flyer" }],
            ],
          },
        });
      } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ Failed to generate the flyer. Try again.");
        delete userSessions[chatId];
      }
      return;
    case 8:
      // field edit menu (after "Regenerate Flyer")
      switch (text) {
        case "1": session.step = 1; return bot.sendMessage(chatId, "Enter new type:");
        case "2": session.step = 2; return bot.sendMessage(chatId, "Enter new title:");
        case "3": session.step = 3; return bot.sendMessage(chatId, "Enter new description:");
        case "4": session.step = 4; return bot.sendMessage(chatId, "Enter new contact info:");
        case "5": session.step = 5; return bot.sendMessage(chatId, "Enter new background URL (or type 'skip'):");
        case "6": session.step = 6; return bot.sendMessage(chatId, "Enter new logo URL (or type 'skip'):");
        default:  return bot.sendMessage(chatId, "❌ Invalid option. Choose 1–6.");
      }
    default:
      return;
  }
});

// Handle flyer inline buttons (won’t affect other buttons)
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = userSessions[chatId];
  if (!session) return; // ignore if not in flyer flow

  if (data === "regenerate_flyer") {
    await bot.answerCallbackQuery(query.id).catch(() => {});
    session.step = 8;
    return bot.sendMessage(
      chatId,
      "Which field do you want to edit?\n1️⃣ Type\n2️⃣ Title\n3️⃣ Description\n4️⃣ Contact\n5️⃣ Background URL\n6️⃣ Logo URL"
    );
  }

  if (data === "done_flyer") {
    await bot.answerCallbackQuery(query.id).catch(() => {});
    delete userSessions[chatId];
    return bot.sendMessage(chatId, "🎉 Flyer creation complete!");
  }
});

// Generate the flyer image
async function generateFlyer(details) {
  const { type, title, description, contact, bgImageUrl, logoUrl } = details;
  const width = 800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  if (bgImageUrl) {
    try {
      const bg = await loadImage(bgImageUrl);
      ctx.drawImage(bg, 0, 0, width, height);
    } catch {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);
  }

  // Optional logo
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl);
      ctx.drawImage(logo, width / 2 - 75, 20, 150, 150);
    } catch {}
  }

  ctx.textAlign = "center";

  // Header
  ctx.fillStyle = "#e94560";
  ctx.font = "bold 50px Arial";
  ctx.fillText(`${type} Flyer`, width / 2, 200);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px Arial";
  wrapText(ctx, title, width / 2, 280, 700, 40);

  // Description
  ctx.fillStyle = "#dcdde1";
  ctx.font = "28px Arial";
  wrapText(ctx, description, width / 2, 380, 700, 34);

  // Contact
  ctx.fillStyle = "#00ffcc";
  ctx.font = "30px Arial";
  wrapText(ctx, `Contact: ${contact}`, width / 2, height - 120, 700, 34);

  // Watermark
  ctx.fillStyle = "#ffffffaa";
  ctx.font = "20px Arial";
  ctx.fillText("Powered by AdamsProjectBot", width / 2, height - 30);

  const flyerPath = path.join(__dirname, `flyer-${Date.now()}.png`);
  fs.writeFileSync(flyerPath, canvas.toBuffer("image/png"));
  return flyerPath;
}

// Helper: wrap centered text to a max width
function wrapText(ctx, text, x, startY, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  let y = startY;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const w = ctx.measureText(testLine).width;
    if (w > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// ----------------- AUTO-CLEAR INACTIVE SESSIONS -----------------
setInterval(() => {
  const now = Date.now();
  for (const chatId in sessionTimeout) {
    if (now - sessionTimeout[chatId] > SESSION_EXPIRY) {
      // Clear all sessions for this user
      delete userStates[chatId];
      delete siteSessions[chatId];
      delete userSessions[chatId];
      waitingForContactMessage.delete(chatId);
      delete sessionTimeout[chatId];

      // Optional: notify user
      bot.sendMessage(chatId, "⏰ Your previous session expired due to inactivity. You can start fresh with /start.");
    }
  }
}, 60 * 1000); // check every 60 seconds

// SAVE USER DATA PERIODICALLY
setInterval(() => {
  saveData();
}, 60000); // every 60 seconds
