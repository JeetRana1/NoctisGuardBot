#!/usr/bin/env node
// Starts the webhook listener and performs a single authenticated test POST.
require('dotenv').config();
const axios = require('axios');
const s = require('../src/bot/webhook').startWebhookListener();

(async ()=>{
  try{
    const secret = process.env.BOT_NOTIFY_SECRET || process.env.WEBHOOK_SECRET || '';
    const ngrok = process.env.NGROK_URL ? process.env.NGROK_URL.replace(/\/$/, '') : '';
    const base = process.env.BOT_NOTIFY_URL || (ngrok ? `${ngrok}` : `http://localhost:${process.env.BOT_WEBHOOK_PORT||4000}`);
    const url = base.replace(/\/$/, '').replace(/\/webhook$/,'') + '/webhook';
    console.log('Testing webhook POST to', url);
    const r = await axios.post(url, { type: 'plugin_update', guildId: 'test', state: { moderation: true } }, { headers: { 'x-dashboard-secret': secret }, timeout: 5000 });
    console.log('POST success', r.status, r.data);
  }catch(e){
    console.error('POST failed', e && e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data)) : e.message || e);
  }
  try{ s.close(); }catch(e){}
  process.exit(0);
})();
