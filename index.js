// ============================================
// WHATSAPP OTP BOT (FINAL - NO AUTO RECONNECT)
// ============================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const axios = require('axios');
const pino = require('pino');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

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

// =============== HELPERS ===============
function getServiceIcon(service) {
    const s = (service || "").toLowerCase();
    if (s.includes("whatsapp")) return "🟢";
    if (s.includes("telegram")) return "🔵";
    if (s.includes("facebook")) return "📘";
    return "📱";
}

function getCountryInfo(number) {
    try {
        if (!number.startsWith("+")) number = "+" + number;
        const parsed = parsePhoneNumberFromString(number);
        if (!parsed) return { country: "Unknown", flag: "🌍" };

        const region = parsed.country || "Unknown";
        let flag = "🌍";

        if (region.length === 2) {
            const base = 127462 - 65;
            flag =
                String.fromCodePoint(base + region.charCodeAt(0)) +
                String.fromCodePoint(base + region.charCodeAt(1));
        }

        return { country: region, flag };
    } catch {
        return { country: "Unknown", flag: "🌍" };
    }
}

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

                const { country, flag } = getCountryInfo(v.number);
                const icon = getServiceIcon(v.service);

                const message =
`✨ *${flag} ${icon} ${v.service} OTP* 🚀

⏰ Time: ${v.time}
🌍 Country: ${country}
📞 Number: ${v.number}
🔐 OTP: *${v.otp}*

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

// =============== START BOT ===============
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
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        logger: pino({ level: 'silent' }),
        syncFullHistory: false,
        markOnlineOnConnect: true,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting' && !state.creds.me && !pairingRequested) {
            pairingRequested = true;
            console.log("⏳ Waiting 2s...");
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(config.OWNER_ID);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(`\n🔑 PAIRING CODE: ${code}`);
                    console.log(`👉 WhatsApp → Linked Devices → Link with phone number\n`);
                } catch (err) {
                    console.error("❌ Pairing Error:", err.message);
                    pairingRequested = false;
                }
            }, 2000);
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
            pairingRequested = false;
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                pairingRequested = false;
                startBot();
            } else {
                console.log('❌ Logged out. Delete auth_info/ and restart.');
            }
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
                delete userStates[sender];
                return sock.sendMessage(msg.key.remoteJid, { text: "✅ API Updated!" });
            }

            if (userStates[sender] === "SET_CHANNEL") {
                config.CHANNEL_ID = text;
                delete userStates[sender];
                return sock.sendMessage(msg.key.remoteJid, { text: "✅ Channel Updated!" });
            }
        }

        // ===== MENU =====
        if (command === '.menu') {
            return sock.sendMessage(msg.key.remoteJid, {
                text:
`╔═══『 😈BY ALI SINDHI PANEL👻 』═══╗

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
👨‍💻 Co-Dev: SAMI ULLAH

╚════════════════════════════╝`
            });
        }

if (userStates[sender]) {

    // ===== API SET =====
    if (userStates[sender] === "SET_API") {

        if (!text || text.startsWith(".")) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Please send a valid API URL"
            });
        }

        if (!text.startsWith("http")) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Invalid API URL!"
            });
        }

        CURRENT_API = text;
        delete userStates[sender];

        return sock.sendMessage(msg.key.remoteJid, {
            text: "✅ API Updated Successfully!"
        });
    }

    // ===== CHANNEL SET =====
    if (userStates[sender] === "SET_CHANNEL") {

        if (!text.includes("@newsletter")) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Invalid Channel ID!"
            });
        }

        config.CHANNEL_ID = text;
        delete userStates[sender];

        return sock.sendMessage(msg.key.remoteJid, {
            text: "✅ Channel Updated Successfully!"
        });
    }
}

        // ===== CHECK =====
        else if (command === '.check') {
            try {
                const { data } = await axios.get(CURRENT_API);
                return sock.sendMessage(msg.key.remoteJid, {
                    text: `📊 OTPs: ${data?.result?.length || 0}`
                });
            } catch {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ API Error"
                });
            }
        }

        // ===== CONTROL =====
        else if (command === 'otpstart') {
            running = true;
            startOtpLoop(sock);
            return sock.sendMessage(msg.key.remoteJid, { text: "🟢 Started" });
        }

        else if (command === 'otpstop') {
            running = false;
            return sock.sendMessage(msg.key.remoteJid, { text: "🔴 Stopped" });
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
