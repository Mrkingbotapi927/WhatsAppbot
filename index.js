// ============================================
// FINAL FIXED BOT (COMMAND FIX + NO AUTO BUG)
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

// =============== CONFIG ===============
const config = {
    OWNER_ID: "923273788442",
    CHANNEL_ID: "",
    INTERVAL: 10000
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
`OTP

Number: ${v.number}
OTP: ${v.otp}
Service: ${v.service}`;

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

// =============== MAIN BOT ===============
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

    // ===== MESSAGE HANDLER =====
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text || "";

// 🔥 YAH ADD KARO
if (!text) return;
        const sender = msg.key.remoteJid.split('@')[0];

        console.log("SENDER:", sender);
        console.log("TEXT:", text);

if (
  !sender.includes(config.OWNER_ID) &&
  !msg.key.fromMe
) return;

        const cmd = text.toLowerCase().trim();

        // ===== STATE =====
        if (text.startsWith(".")) {
    delete userStates[sender];
}

    // ❗ Ignore commands while waiting input
    if (text.startsWith(".")) {
        delete userStates[sender];
        return sock.sendMessage(msg.key.remoteJid, {
            text: "⚠️ Previous process cancelled."
        });
    }

    if (userStates[sender] === "SET_API") {

        if (!text.startsWith("http")) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Send valid API URL"
            });
        }

        CURRENT_API = text;
        delete userStates[sender];

        return sock.sendMessage(msg.key.remoteJid, {
            text: "✅ API Added Successfully!"
        });
    }

    if (userStates[sender] === "SET_CHANNEL") {

        if (!text.includes("@newsletter")) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Invalid Channel ID"
            });
        }

        config.CHANNEL_ID = text;
        delete userStates[sender];

        return sock.sendMessage(msg.key.remoteJid, {
            text: "✅ Channel Set Successfully!"
        });
    }
}

        if (cmd === '.menu') {
    return sock.sendMessage(msg.key.remoteJid, {
        text: `VIP PANEL

.api
.api list
.add
.check
otpstart
otpstop
status`
    });
}

        else if (cmd === '.api') {
            userStates[sender] = "SET_API";
            return sock.sendMessage(msg.key.remoteJid, {
                text: "Send API URL"
            });
        }

        else if (cmd === '.api list') {
            return sock.sendMessage(msg.key.remoteJid, {
                text: CURRENT_API || "No API"
            });
        }

        else if (cmd === '.add') {
            userStates[sender] = "SET_CHANNEL";
            return sock.sendMessage(msg.key.remoteJid, {
                text: "Send Channel ID"
            });
        }

        else if (cmd === '.check') {
            try {
                const { data } = await axios.get(CURRENT_API);
                return sock.sendMessage(msg.key.remoteJid, {
                    text: `OTPs: ${data?.result?.length || 0}`
                });
            } catch {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: "API Error"
                });
            }
        }

        else if (cmd === 'otpstart') {
            running = true;
            startOtpLoop(sock);
            return sock.sendMessage(msg.key.remoteJid, { text: "Started" });
        }

        else if (cmd === 'otpstop') {
            running = false;
            return sock.sendMessage(msg.key.remoteJid, { text: "Stopped" });
        }

        else if (cmd === 'status') {
            return sock.sendMessage(msg.key.remoteJid, {
                text: running ? "Running" : "Stopped"
            });
        }
    });
}

// =============== START ===============
console.log("🚀 Starting Bot...");
startBot();
