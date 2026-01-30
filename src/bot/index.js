require('dotenv').config();
// Enable debug logs from discord.js when DEBUG_VERBOSE is set (1/true/yes). This sets
// the DEBUG env var before discord.js is required so its internal debug emitters are active.
if (process.env.DEBUG_VERBOSE && ['1', 'true', 'yes'].includes(String(process.env.DEBUG_VERBOSE).toLowerCase())) {
  process.env.DEBUG = process.env.DEBUG || 'discord.js:*';
  console.log('DEBUG_VERBOSE is set — discord.js debug logs enabled (set DEBUG_VERBOSE=0 to disable).');
}
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  // use canary domain for REST to help bypass shared IP rate limits on Render/Heroku
  rest: {
    api: 'https://canary.discord.com/api'
  }
});

client.commands = new Collection();
client.queue = new Map();

const commandsPath = path.join(__dirname, 'commands');

function getCommandFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...getCommandFiles(p));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const commandFiles = getCommandFiles(commandsPath);
for (const filePath of commandFiles) {
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

// Diagnostics: confirm presence of DISCORD_TOKEN and add extra debug/error handlers to capture connectivity/login issues
const hasToken = !!process.env.DISCORD_TOKEN;
console.log('DISCORD_TOKEN present:', hasToken);
if (!hasToken) console.error('DISCORD_TOKEN is missing. Set it in environment variables.');

// Global process handlers to catch unexpected errors/rejections that may explain login hangs
process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason); });
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err && err.stack ? err.stack : err); });

// Log discord.js client-level errors/warnings and shard/socket issues (plus verbose debug hooks)
client.on('error', (err) => console.error('Discord client error event:', err && err.stack ? err.stack : err));
client.on('warn', (info) => console.warn('Discord client warn event:', info));
client.on('shardError', (err) => console.error('Shard error event:', err && err.stack ? err.stack : err));
client.on('shardDisconnect', (event, shardId) => console.warn('Shard disconnected', shardId, event));
// discord.js emits a 'debug' event when DEBUG env var is set
client.on('debug', (msg) => console.debug('discord.js debug:', msg));

if (client.ws && typeof client.ws.on === 'function') {
  client.ws.on('error', (err) => console.error('WebSocket error:', err && err.stack ? err.stack : err));
  client.ws.on('close', (code, reason) => console.warn('WebSocket closed:', code, reason && reason.toString ? reason.toString() : reason));
  client.ws.on('disconnect', (event) => console.warn('WebSocket disconnect event:', event));
}

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