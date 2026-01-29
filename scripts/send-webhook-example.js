#!/usr/bin/env node
// Example sender for the webhook listener. Useful for testing locally or from a dashboard service.
// Usage:
//   node scripts/send-webhook-example.js [WEBHOOK_URL|BOT_NOTIFY_URL] [WEBHOOK_SECRET|BOT_NOTIFY_SECRET] [JSON_PAYLOAD]
// Examples:
//   node scripts/send-webhook-example.js
//   node scripts/send-webhook-example.js "https://abcd1234.ngrok.io/webhook" "your_secret_here"
//   node scripts/send-webhook-example.js "https://noctis-guard.vercel.app/webhook" "secret" '{"type":"plugin_update","guildId":"1234","state":{"moderation":true}}'
// By default the script prefers (in order):
//  1) CLI argument
//  2) BOT_NOTIFY_URL (env)
//  3) NGROK_URL (env) -> used as NGROK_URL + '/webhook'
//  4) WEBHOOK_URL (env)
//  5) localhost fallback

require('dotenv').config();
const axios = require('axios');

const envNgrok = process.env.NGROK_URL ? process.env.NGROK_URL.replace(/\/$/, '') : '';
const url = process.argv[2] || process.env.BOT_NOTIFY_URL || (envNgrok ? `${envNgrok}/webhook` : process.env.WEBHOOK_URL) || `http://localhost:${process.env.BOT_WEBHOOK_PORT || 4000}/webhook`;
const secret = process.argv[3] || process.env.BOT_NOTIFY_SECRET || process.env.WEBHOOK_SECRET || '';
if (!secret) console.warn('Warning: no webhook secret provided; request may be rejected by the listener');
let payload = { type: 'plugin_update', guildId: '1234567890', state: { moderation: true, music: false } };
if (process.argv[4]) {
  try {
    payload = JSON.parse(process.argv[4]);
  } catch (e) {
    console.error('Failed to parse payload JSON:', e.message || e);
    process.exit(1);
  }
}

(async () => {
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'x-dashboard-secret': secret,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    console.log('Status:', res.status);
    console.log(res.data);
  } catch (e) {
    console.error('Request failed:', e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data)) : e.message || e);
    process.exit(1);
  }
})();