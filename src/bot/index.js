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
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
client.queue = new Map();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  // Skip modules that don't export a `data` property (deprecated/removed commands)
  if (!command || !command.data) continue;
  client.commands.set(command.data.name, command);
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

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Discord client login failed:', err && err.stack ? err.stack : String(err));
  // keep process alive so Render logs capture the error; you might want to exit in production
});