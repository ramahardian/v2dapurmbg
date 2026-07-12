const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '..', 'wa_auth_info');
let sock = null;
let connected = false;
let connecting = false;

async function init() {
  if (connecting) return;
  connecting = true;

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    syncFullHistory: false,
    browser: ['MBG Kitchen', 'Safari', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      connected = true;
      connecting = false;
      console.log('✓ WhatsApp Bot terhubung');
    }

    if (connection === 'close') {
      connected = false;
      connecting = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('WhatsApp Bot putus, reconnect dalam 5 detik...');
        setTimeout(init, 5000);
      } else {
        console.log('WhatsApp Bot logout. Hapus folder wa_auth_info untuk scan ulang.');
        sock = null;
      }
    }
  });
}

async function sendMessage(to, text) {
  if (!process.env.WA_ADMIN_NUMBER) {
    throw new Error('WA_ADMIN_NUMBER belum diisi di .env');
  }

  let target = process.env.WA_ADMIN_NUMBER.replace(/[^0-9]/g, '');
  if (target.startsWith('0')) target = '62' + target.slice(1);
  if (!target.startsWith('62')) target = '62' + target;
  target = target + '@s.whatsapp.net';

  if (!sock) throw new Error('WhatsApp Bot belum diinisialisasi');
  if (!connected) throw new Error('WhatsApp Bot belum terhubung. Scan QR code di terminal.');

  await sock.sendMessage(target, { text });
  return true;
}

function getStatus() {
  return {
    connected,
    authExists: fs.existsSync(path.join(AUTH_DIR, 'creds.json')),
  };
}

module.exports = { init, sendMessage, getStatus };
