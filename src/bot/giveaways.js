const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const DATA_FILE = path.join(__dirname, '../../data/giveaways.json');
const DEFAULTS_FILE = path.join(__dirname, '../../data/giveaway-defaults.json');

let clientRef;
let giveaways = [];
let defaults = {};
const scheduled = new Map();
// Track giveaways currently being posted to avoid duplicate posts between create and file watcher
const postingInProgress = new Set();

function loadDefaults() {
  try {
    if (fs.existsSync(DEFAULTS_FILE)) {
      const raw = fs.readFileSync(DEFAULTS_FILE, 'utf8');
      defaults = JSON.parse(raw || '{}');
    } else defaults = {};
  } catch (e) {
    console.warn('Failed to load giveaway defaults', e);
    defaults = {};
  }
}

function saveDefaults() {
  try {
    fs.writeFileSync(DEFAULTS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save giveaway defaults', e);
  }
}

function setGuildDefaults(guildId, cfg) {
  defaults[guildId] = cfg || {};
  saveDefaults();
}

function getGuildDefaults(guildId) {
  return defaults[guildId] || null;
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    giveaways = [];
    save();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    giveaways = JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to load giveaways:', e);
    giveaways = [];
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(giveaways, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save giveaways:', e);
  }
}

function scheduleGiveaway(gw) {
  if (gw.ended) return;
  const ms = gw.endTimestamp - Date.now();
  if (ms <= 0) {
    // end immediately
    endGiveaway(gw.id);
    return;
  }
  if (scheduled.has(gw.id)) return;
  const t = setTimeout(() => endGiveaway(gw.id).catch(console.error), ms);
  scheduled.set(gw.id, t);
}

async function endGiveaway(id) {
  const gw = giveaways.find(g => g.id === id);
  if (!gw || gw.ended) return;
  gw.ended = true;
  // clear scheduled
  if (scheduled.has(id)) {
    clearTimeout(scheduled.get(id));
    scheduled.delete(id);
  }

  try {
    const guild = await clientRef.guilds.fetch(gw.guildId).catch(() => null);
    if (!guild) throw new Error('Guild not found');
    const channel = await guild.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) throw new Error('Channel not found');
    const msg = gw.messageId ? await channel.messages.fetch(gw.messageId).catch(() => null) : null;

    // collect users from reaction or from message collected user ids
    let users = [];
    if (msg) {
      const reaction = msg.reactions.cache.get('🎉');
      if (reaction) {
        const fetched = await reaction.users.fetch();
        users = fetched.filter(u => !u.bot).map(u => u.id);
      }
    }

    // apply requirements
    let eligible = [];
    for (const uid of users) {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (!member) continue;
      if (gw.requireRole) {
        if (!member.roles.cache.has(gw.requireRole)) continue;
      }
      eligible.push(uid);
    }

    // pick winners
    const winners = [];
    const count = Math.max(1, gw.winnerCount || 1);
    if (eligible.length === 0) {
      gw.winners = [];
    } else {
      const pool = [...eligible];
      for (let i = 0; i < count && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
      }
      gw.winners = winners;
    }

    save();

    // announce
    const embed = new EmbedBuilder()
      .setTitle('Ended')
      .setDescription(`**${gw.prize}**`)
      .addFields({ name: 'Winners', value: gw.winners && gw.winners.length ? gw.winners.map(id => `<@${id}>`).join(', ') : 'No winners' })
      .setFooter({ text: `Hosted by ${gw.hostId || 'unknown'}` })
      .setTimestamp()
      .setColor(gw.winners && gw.winners.length ? 0x2ECC71 : 0xE74C3C);

    if (msg) {
      await channel.send({ content: gw.winners && gw.winners.length ? `Congratulations ${gw.winners.map(id => `<@${id}>`).join(', ')}` : 'No winners could be selected.', embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }

    // DM winners
    for (const id of gw.winners || []) {
      const user = await clientRef.users.fetch(id).catch(() => null);
      if (user) {
        try {
          const { EmbedBuilder } = require('discord.js');
          const { baseEmbed } = require('./utils/embed');
          const dm = baseEmbed({ title: 'You won!', description: `You won **${gw.prize}** in **${guild.name}**!`, color: 0x2ECC71, timestamp: true });
          await user.send({ embeds: [dm] });
        } catch (e) { /* ignore */ }
      }
    }
  } catch (err) {
    console.error('Failed to end giveaway', id, err);
  }
}

async function createGiveaway({ guildId, channelId, prize, durationMs, winnerCount = 1, hostId, requireRole = null }) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const endTimestamp = Date.now() + durationMs;
  const gw = { id, guildId, channelId, prize, endTimestamp, winnerCount, hostId, requireRole, ended: false, messageId: null, winners: [] };
  // mark posting in progress before saving so file watcher doesn't post the same giveaway
  postingInProgress.add(id);
  giveaways.push(gw);
  save();

  // send message
  try {
    const guild = await clientRef.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error('Guild not found');
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Channel not found');
    const embed = new EmbedBuilder()
      .setTitle('Giveaway!')
      .setDescription(`Prize: **${prize}**\nHosted by <@${hostId}>\nEnds <t:${Math.floor(endTimestamp/1000)}:R>`) 
      .setFooter({ text: `React with 🎉 to enter • Winners: ${winnerCount}` })
      .setColor(0xF39C12);
    const msg = await channel.send({ content: requireRole ? `Only users with <@&${requireRole}> may win.` : null, embeds: [embed] });
    await msg.react('🎉');
    gw.messageId = msg.id;
    save();
    scheduleGiveaway(gw);
  } catch (err) {
    console.error('Failed to post giveaway message', err);
  } finally {
    postingInProgress.delete(id);
  }
  return gw;
}

async function rerollGiveaway(id) {
  const gw = giveaways.find(g => g.id === id);
  if (!gw) throw new Error('Not found');
  if (!gw.messageId) throw new Error('No message');
  // refetch reaction users
  try {
    const guild = await clientRef.guilds.fetch(gw.guildId).catch(() => null);
    if (!guild) throw new Error('Guild not found');
    const channel = await guild.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) throw new Error('Channel not found');
    const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
    if (!msg) throw new Error('Message not found');
    const reaction = msg.reactions.cache.get('🎉');
    const fetched = await reaction.users.fetch();
    let users = fetched.filter(u => !u.bot).map(u => u.id);
    let eligible = [];
    for (const uid of users) {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (!member) continue;
      if (gw.requireRole) {
        if (!member.roles.cache.has(gw.requireRole)) continue;
      }
      eligible.push(uid);
    }
    const winners = [];
    const pool = [...eligible];
    const count = Math.max(1, gw.winnerCount || 1);
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(idx, 1)[0]);
    }
    gw.winners = winners;
    save();
    const rEmbed = new EmbedBuilder().setTitle('Reroll complete').setDescription(winners.length ? `Winners: ${winners.map(id => `<@${id}>`).join(', ')}` : 'No winners').setColor(winners.length ? 0x2ECC71 : 0xE74C3C);
    await channel.send({ embeds: [rEmbed] });
    return winners;
  } catch (err) {
    console.error('Reroll failed', err);
    throw err;
  }
}

function init(client) {
  clientRef = client;
  load();
  loadDefaults();
  // schedule active giveaways
  for (const gw of giveaways) scheduleGiveaway(gw);

  // watch the data file so giveaways created from the web process are picked up and posted
  try {
    const chokidar = require('chokidar');
    const watcher = chokidar.watch(DATA_FILE, { ignoreInitial: true });
    watcher.on('change', async () => {
      // short debounce to let quick successive writes settle
      await new Promise(r => setTimeout(r, 150));
      try {
        const raw = require('fs').readFileSync(DATA_FILE, 'utf8');
        const arr = JSON.parse(raw || '[]');
        // merge any new giveaways
        for (const gw of arr) {
          const existing = giveaways.find(g => g.id === gw.id);
          if (!existing) {
            giveaways.push(gw);
            save();
            scheduleGiveaway(gw);
          } else {
            // if exists but not posted (no messageId) and not ended, try to post
            // but skip if another poster is already handling this id
            if (!existing.messageId && !existing.ended && !postingInProgress.has(existing.id)) {
              try {
                postingInProgress.add(existing.id);
                const guild = await clientRef.guilds.fetch(existing.guildId).catch(()=>null);
                if (!guild) { postingInProgress.delete(existing.id); continue; }
                const channel = await guild.channels.fetch(existing.channelId).catch(()=>null);
                if (!channel) { postingInProgress.delete(existing.id); continue; }
                const embed = new EmbedBuilder()
                  .setTitle('Giveaway!')
                  .setDescription(`Prize: **${existing.prize}**\nHosted by <@${existing.hostId}>\nEnds <t:${Math.floor(existing.endTimestamp/1000)}:R>`)
                  .setFooter({ text: `React with 🎉 to enter • Winners: ${existing.winnerCount}` })
                  .setColor(0xF39C12);
                const msg = await channel.send({ content: existing.requireRole ? `Only users with <@&${existing.requireRole}> may win.` : null, embeds: [embed] });
                await msg.react('🎉');
                existing.messageId = msg.id;
                save();
                scheduleGiveaway(existing);
                postingInProgress.delete(existing.id);
              } catch (e) {
                postingInProgress.delete(existing.id);
                console.warn('Posting missed giveaway failed', e);
              }
            }
          }
        }
      } catch (e) { console.error('Giveaways watch handler error', e); }
    });
  } catch (e) { console.warn('Giveaways watcher not initialized', e); }
}

function listForGuild(guildId) {
  return giveaways.filter(g => g.guildId === guildId);
}

module.exports = { init, createGiveaway, endGiveaway, rerollGiveaway, listForGuild, setGuildDefaults, getGuildDefaults };
