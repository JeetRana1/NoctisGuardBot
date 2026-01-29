const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
client.queue = new Map();

const commandsPath = path.join(__dirname, 'commands');

function getCommandFiles(dir){
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries){
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...getCommandFiles(p));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const commandFiles = getCommandFiles(commandsPath);
for (const filePath of commandFiles){
  const rel = path.relative(commandsPath, filePath);
  const parts = rel.split(path.sep);
  const pluginName = parts.length > 1 ? parts[0] : 'core';
  try {
    const command = require(filePath);
    if (!command || !command.data) continue; // skip deprecated or non-command modules
    // annotate plugin name so runtime checks and disabling work per-folder
    if (!command.plugin) command.plugin = pluginName;
    client.commands.set(command.data.name, command);
  } catch (e) {
    console.error('Failed to load command', filePath, e);
  }
} 

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Diagnostics: confirm presence of DISCORD_TOKEN and catch login errors
const hasToken = !!process.env.DISCORD_TOKEN;
console.log('DISCORD_TOKEN present:', hasToken);
if (!hasToken) console.error('DISCORD_TOKEN is missing. Set it in environment variables.');

console.log('Attempting Discord client login...');
try {
  const webhook = require('./webhook');
  webhook.startWebhookListener();
  console.log('Early webhook health listener started (listening on PORT or BOT_WEBHOOK_PORT).');
} catch (e) {
  console.warn('Failed to start early webhook listener', e);
}
const loginStart = Date.now();
let loginTimed = false;
const loginTimer = setTimeout(() => { loginTimed = true; console.warn('Discord login still in progress after 30s — verify network connectivity and that the token is correct.'); }, 30000);

client.login(process.env.DISCORD_TOKEN).then(() => {
  clearTimeout(loginTimer);
  if (!loginTimed) console.log('Discord login completed quickly (within 30s).');
}).catch(err => {
  clearTimeout(loginTimer);
  console.error('Discord client login failed:', err && err.stack ? err.stack : String(err));
  // keep process alive so Render logs capture the error; you might want to exit in production
});