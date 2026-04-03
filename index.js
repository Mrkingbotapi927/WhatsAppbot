// ============================================
// WHATSAPP OTP BOT (FINAL PRO VERSION)
// ============================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const axios = require('axios');
const pino = require('pino');

// =============== CONFIG ===============
const config = {
    OTP_API: "",
    CHANNEL_ID: "",
    OWNER_ID: "923273788442",
    INTERVAL: 10000,
    BRANDING: "Developed By: ALI SINDHI 🚀"
};

// =============== GLOBALS ===============
let CURRENT_API = "";
let running = false;
let pairingRequested = false;
const sent = new Set();
const userStates = {};

// =============== OTP LOOP ===============
async function startOtpLoop(sock) {
    while (running) {

        if (!CURRENT_API) {
            console.log("⚠️ No API Set!");
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        try {
            const { data } = await axios.get(CURRENT_API);

            if (!data?.result) continue;

            for (const v of data.result) {
                const id = v.number + v.otp;
                if (sent.has(id)) continue;

                const message =
`✨ OTP Message 🚀

📱 Number: ${v.number}
🔐 OTP: ${v.otp}
🛠 Service: ${v.service}

> ${config.BRANDING}`;

                if (config.CHANNEL_ID) {
                    await sock.sendMessage(config.CHANNEL_ID, { text: message });
                }

                sent.add(id);
            }

        } catch (e) {
            console.log("API ERROR:", e.message);
        }

        await new Promise(r => setTimeout(r, config.INTERVAL));
    }
}

// =============== BOT START ===============
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info/');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        browser: ["Windows", "Chrome", "120.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;

        if (connection === 'connecting' && !pairingRequested) {
            pairingRequested = true;

            setTimeout(async () => {
                let code = await sock.requestPairingCode(config.OWNER_ID);
                code = code.match(/.{1,4}/g).join("-");
                console.log("PAIR CODE:", code);
            }, 2000);
        }

        if (connection === 'open') {
            console.log("✅ WhatsApp Connected!");
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // =============== MESSAGE HANDLER ===============
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text || "";

        const sender = msg.key.remoteJid.split('@')[0].split(':')[0];

        if (sender !== config.OWNER_ID && !msg.key.fromMe) return;

        const command = text.toLowerCase().trim();

        // ===== STATE =====
        if (userStates[sender]) {

            if (userStates[sender] === "SET_API") {
                CURRENT_API = text;
                config.OTP_API = text;
                delete userStates[sender];

                return sock.sendMessage(msg.key.remoteJid, {
                    text: "✅ API Updated Successfully!"
                });
            }

            if (userStates[sender] === "SET_CHANNEL") {
                config.CHANNEL_ID = text;
                delete userStates[sender];

                return sock.sendMessage(msg.key.remoteJid, {
                    text: "✅ Channel Updated Successfully!"
                });
            }
        }

        // ===== MENU =====
        if (command === '.menu') {
            return sock.sendMessage(msg.key.remoteJid, {
                text:
`╔═══『 🤖 VIP CONTROL PANEL 』═══╗

👤 Owner: ${config.OWNER_ID}
⚙️ Status: ${running ? "🟢 ACTIVE" : "🔴 STOPPED"}

╠═══『 📡 API SYSTEM 』═══╣
➤ .api
➤ .api list
➤ .check

╠═══『 📢 CHANNEL SYSTEM 』═══╣
➤ .add

╠═══『 🚀 BOT CONTROL 』═══╣
➤ otpstart
➤ otpstop
➤ status

╠═══『 💎 INFO 』═══╣
✨ Developed By: ALI SINDHI 🚀

╚════════════════════════════╝`
            });
        }

        // ===== API =====
        else if (command === '.api') {
            userStates[sender] = "SET_API";
            return sock.sendMessage(msg.key.remoteJid, {
                text: "🌐 Send API URL"
            });
        }

        else if (command === '.api list') {
            return sock.sendMessage(msg.key.remoteJid, {
                text: CURRENT_API ? `📡 API:\n${CURRENT_API}` : "❌ No API Set"
            });
        }

        // ===== CHANNEL =====
        else if (command === '.add') {
            userStates[sender] = "SET_CHANNEL";
            return sock.sendMessage(msg.key.remoteJid, {
                text: "📡 Send Channel ID"
            });
        }

        // ===== CHECK =====
        else if (command === '.check') {
            if (!CURRENT_API) {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: "⚠️ Set API first using .api"
                });
            }

            try {
                const { data } = await axios.get(CURRENT_API);
                const total = data?.result?.length || 0;

                return sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ API Working\n📊 OTPs: ${total}`
                });
            } catch {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ API Error"
                });
            }
        }

        // ===== CONTROL =====
        else if (command === 'otpstart') {
            if (!CURRENT_API) {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: "⚠️ Set API first"
                });
            }

            running = true;
            startOtpLoop(sock);

            return sock.sendMessage(msg.key.remoteJid, {
                text: "🟢 OTP Forwarding Started"
            });
        }

        else if (command === 'otpstop') {
            running = false;
            return sock.sendMessage(msg.key.remoteJid, {
                text: "🔴 OTP Forwarding Stopped"
            });
        }

        else if (command === 'status') {
            return sock.sendMessage(msg.key.remoteJid, {
                text: running ? "🟢 Running" : "🔴 Stopped"
            });
        }

    });
}

// =============== START ===============
console.log("🚀 Starting Bot...");
startBot();
