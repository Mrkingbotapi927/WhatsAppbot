// ============================================
// WHATSAPP OTP FORWARD BOT
// ============================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const axios = require('axios');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const pino = require('pino');
const fs = require('fs');

// =============== CONFIGURATION ===============
const config = {
    OTP_API: "http://147.135.212.197/crapi/had/viewstats?toke=Q05WNEVBj0loV45WXGqMcouScXRjdWeLdIGUUl9ub4WEmGJoY5A",
    CHANNEL_ID: "0029VaSudNI4dTnSwd5Q4K1Z@newsletter",
    OWNER_ID: "923273788442",
    INTERVAL: 10000,
    BRANDING: "Developed By : SAMI ULLAH 🚀"
};

// =============== GLOBALS ===============
let running = false;
let pairingRequested = false;
const sent = new Set();

// =============== HELPERS ===============
function getCountryInfo(number) {
    try {
        const parsed = parsePhoneNumberFromString("+" + number);
        if (!parsed) throw new Error("Invalid");
        const region = parsed.country;
        const callingCode = parsed.countryCallingCode;
        let flag = "🌍";
        if (region && region.length === 2) {
            const base = 127462 - 65;
            flag = String.fromCodePoint(base + region.charCodeAt(0)) +
                   String.fromCodePoint(base + region.charCodeAt(1));
        }
        return { countryName: `${callingCode} (${region})`, flag };
    } catch {
        return { countryName: "Unknown", flag: "🌍" };
    }
}

function hideNumber(number) {
    number = String(number);
    if (number.length >= 8) return number.slice(0, 4) + "••••" + number.slice(-4);
    return number;
}

// =============== OTP LOOP ===============
async function startOtpLoop(sock) {
    while (running) {
        try {
            if (!sock?.user) {
                console.log("Socket disconnected, stopping OTP loop.");
                running = false;
                break;
            }

            const { data } = await axios.get(config.OTP_API, { timeout: 10000 });

            if (!data.result || !Array.isArray(data.result)) {
                await new Promise(r => setTimeout(r, config.INTERVAL));
                continue;
            }

            for (const v of data.result) {
                const id = v.number + v.otp;
                if (sent.has(id)) continue;

                const { countryName, flag } = getCountryInfo(v.number);
                const hiddenNumber = hideNumber(v.number);

                const messageText =
                    `✨ *${flag} ${countryName} | ${v.service} Message* 🚀\n\n` +
                    `> *Time:* ${v.time}\n` +
                    `> *Country:* ${flag} ${countryName}\n` +
                    `> *Number:* ${hiddenNumber}\n` +
                    `> *Service:* ${v.service}\n` +
                    `> *OTP:* *${v.otp}*\n\n` +
                    `> *Join For Numbers:*\n` +
                    `> https://wa.me/channel/0029VaSudNI4dTnSwd5Q4K1Z\n\n` +
                    `*Full Message:*\n` +
                    `> Your ${v.service} code is ${v.otp}. Do not share.\n\n` +
                    `> ${config.BRANDING}`;

                await sock.sendMessage(config.CHANNEL_ID, { text: messageText });
                sent.add(id);

                if (sent.size > 5000) sent.clear();
            }
        } catch (e) {
            console.log("[OTP ERROR]", e.message);
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

    sock.ev.on('messages.upsert', async ({ messages }) => {
    console.log("MESSAGE RECEIVED");
        if (!msg.message || msg.key.fromMe) return;

        const text = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text || ""
        ).trim();

        const sender = msg.key.remoteJid.split('@')[0].split(':')[0];
        if (!sender.includes(config.OWNER_ID)) return;

        const args = text.split(' ');
        const command = args[0].toLowerCase();

        if (command === 'otpstart') {
            if (running) return sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Already running!" });
            running = true;
            await sock.sendMessage(msg.key.remoteJid, { text: "✅ OTP Forwarding Started" });
            startOtpLoop(sock);

        } else if (command === 'otpstop') {
            running = false;
            await sock.sendMessage(msg.key.remoteJid, { text: "⏹️ OTP Forwarding Stopped" });

        } else if (command === 'status') {
            const status = running ? "🟢 Active" : "🔴 Stopped";
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✨ *Bot Status:* ${status}\n\n> ${config.BRANDING}`
            });

        } else if (command === 'help') {
            await sock.sendMessage(msg.key.remoteJid, {
                text:
                    `📋 *Commands:*\n\n` +
                    `*otpstart* - Start OTP forwarding\n` +
                    `*otpstop*  - Stop OTP forwarding\n` +
                    `*status*   - Check bot status\n\n` +
                    `> ${config.BRANDING}`
            });
        }
    });
}

// =============== START ===============
console.log("🚀 Starting Bot...");
startBot().catch(err => console.error("Startup Error:", err));
