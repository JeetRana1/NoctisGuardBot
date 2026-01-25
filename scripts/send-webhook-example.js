#!/usr/bin/env node
// Example sender for the webhook listener. Useful for testing locally or from a dashboard service.
// Usage:
//   node scripts/send-webhook-example.js [WEBHOOK_URL] [WEBHOOK_SECRET] [JSON_PAYLOAD]
// Examples:
//   node scripts/send-webhook-example.js
//   node scripts/send-webhook-example.js "http://localhost:4000/webhook" "your_secret_here"
//   node scripts/send-webhook-example.js "http://localhost:4000/webhook" "secret" '{"type":"plugin_update","guildId":"1234","state":{"moderation":true}}'

require('dotenv').config();
const axios = require('axios');

const url = process.argv[2] || process.env.WEBHOOK_URL || `http://localhost:${process.env.BOT_WEBHOOK_PORT || 4000}/webhook`;
const secret = process.argv[3] || process.env.WEBHOOK_SECRET || '';
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