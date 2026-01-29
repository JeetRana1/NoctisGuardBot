#!/usr/bin/env node
// Helper: update .env with the provided NGROK URL and derive BOT_NOTIFY_URL / BOT_PRESENCE_URL
// Usage: node scripts/use-ngrok.js https://abcd1234.ngrok.io
// Or: npm run set-ngrok -- https://abcd1234.ngrok.io

const fs = require('fs');
const path = require('path');

const arg = process.argv[2] || process.env.NGROK_URL;
if (!arg) {
  console.error('Usage: node scripts/use-ngrok.js <NGROK_URL>');
  process.exit(1);
}
let url = String(arg).trim();
if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
url = url.replace(/\/$/, '');

const envPath = path.join(__dirname, '..', '.env');
let env = '';
try{
  env = fs.readFileSync(envPath, 'utf8');
}catch(e){
  console.error('Failed to read .env:', e.message || e);
  process.exit(1);
}

// Ensure NGROK_URL entry exists or is updated
if (/^NGROK_URL=/m.test(env)){
  env = env.replace(/^NGROK_URL=.*$/m, `NGROK_URL=${url}`);
} else {
  // insert after BOT_WEBHOOK_PORT if present, else append
  if (/^BOT_WEBHOOK_PORT=/m.test(env)){
    env = env.replace(/(^BOT_WEBHOOK_PORT=.*$)/m, `$1\n# Optional: set your ngrok HTTPS tunnel root (e.g., https://abcd1234.ngrok.io)\nNGROK_URL=${url}`);
  } else {
    env += `\n# Optional: set your ngrok HTTPS tunnel root (e.g., https://abcd1234.ngrok.io)\nNGROK_URL=${url}\n`;
  }
}

// Update BOT_NOTIFY_URL and BOT_PRESENCE_URL to use ngrok
if (/^BOT_NOTIFY_URL=/m.test(env)){
  env = env.replace(/^BOT_NOTIFY_URL=.*$/m, `BOT_NOTIFY_URL=${url}/webhook`);
} else {
  env += `\nBOT_NOTIFY_URL=${url}/webhook\n`;
}
if (/^BOT_PRESENCE_URL=/m.test(env)){
  env = env.replace(/^BOT_PRESENCE_URL=.*$/m, `BOT_PRESENCE_URL=${url}/presences`);
} else {
  env += `\nBOT_PRESENCE_URL=${url}/presences\n`;
}

try{
  fs.writeFileSync(envPath, env, 'utf8');
  console.log('Updated .env with NGROK_URL and derived BOT_NOTIFY_URL / BOT_PRESENCE_URL:');
  console.log(`  NGROK_URL=${url}`);
  console.log(`  BOT_NOTIFY_URL=${url}/webhook`);
  console.log(`  BOT_PRESENCE_URL=${url}/presences`);
  console.log('\nNext steps:');
  console.log(' - Start ngrok on the machine where the bot runs: `npx ngrok http 4000`');
  console.log(' - Set the same values as Vercel environment variables for your deployed dashboard:');
  console.log('     BOT_NOTIFY_URL, BOT_PRESENCE_URL, BOT_NOTIFY_SECRET (or WEBHOOK_SECRET)');
  console.log(' - Redeploy the dashboard');
}catch(e){
  console.error('Failed to write .env:', e.message || e);
  process.exit(1);
}
