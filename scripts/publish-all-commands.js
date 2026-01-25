// One-shot script to publish current commands to all guilds using guildCommandUpdater
// Usage: node scripts/publish-all-commands.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const gcu = require('../src/bot/guildCommandUpdater');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function dedupeGuildCommands(appId, guildId){
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const cmds = await rest.get(Routes.applicationGuildCommands(appId, guildId));
  const groups = {};
  for (const c of cmds){ groups[c.name] = groups[c.name] || []; groups[c.name].push(c); }
  let deleted = 0;
  for (const [name, group] of Object.entries(groups)){
    if (group.length <= 1) continue;
    // Keep newest (highest id)
    group.sort((a,b)=> (BigInt(b.id) - BigInt(a.id)));
    const keep = group[0];
    const remove = group.slice(1);
    for (const r of remove){
      await rest.delete(Routes.applicationGuildCommand(appId, guildId, r.id));
      console.log('  Deleted duplicate', r.id, r.name);
      deleted++;
    }
    console.log('  Kept', keep.id, 'for', name);
  }
  return deleted;
}

client.once('ready', async () => {
  console.log('Logged in as', client.user.tag);
  const appId = process.env.CLIENT_ID;
  if (!appId) {
    console.error('CLIENT_ID is not set; cannot publish commands');
    client.destroy();
    process.exit(1);
    return;
  }

  try {
    // Dedupe first to avoid re-creating duplicates
    for (const [guildId] of client.guilds.cache) {
      try{
        const d = await dedupeGuildCommands(appId, guildId);
        if (d) console.log(`Removed ${d} duplicate command(s) in guild ${guildId}`);
      }catch(e){ console.warn('Failed to dedupe for guild', guildId, e && e.message); }
    }

    for (const [guildId] of client.guilds.cache) {
      console.log('Queuing command publish for guild', guildId);
      gcu.queueUpdate(guildId, []);
    }

    await gcu.runPending(client);

    // Dedupe again after publish just in case
    for (const [guildId] of client.guilds.cache) {
      try{
        const d2 = await dedupeGuildCommands(appId, guildId);
        if (d2) console.log(`Post-publish removed ${d2} duplicate command(s) in guild ${guildId}`);
      }catch(e){ console.warn('Failed to post-publish dedupe for guild', guildId, e && e.message); }
    }

    console.log('Publish complete.');
  } catch (e) {
    console.error('Publish failed', e);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN).catch(e => { console.error('Login failed', e); process.exit(1); });