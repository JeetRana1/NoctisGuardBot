const fs = require('fs');
const path = require('path');
const moderation = require('./moderationManager');

const levelsPath = path.join(process.cwd(), 'data', 'levels.json');

let data = {};
const lastXp = new Map(); // cooldown per guild-user: key -> timestamp (in-memory)
const lastXpPath = require('path').join(process.cwd(), 'data', 'lastXp.json');

function _load() {
  try {
    if (!fs.existsSync(levelsPath)) fs.writeFileSync(levelsPath, JSON.stringify({} , null, 2));
    data = JSON.parse(fs.readFileSync(levelsPath));
  } catch (e) {
    console.error('Failed to load levels file', e);
    data = {};
  }
  // load persisted lastXp timestamps
  try {
    if (!fs.existsSync(lastXpPath)) fs.writeFileSync(lastXpPath, JSON.stringify({} , null, 2));
    const raw = JSON.parse(fs.readFileSync(lastXpPath));
    Object.entries(raw || {}).forEach(([k, v]) => lastXp.set(k, v));
  } catch (e) { console.warn('Failed to load lastXp persistence', e); }
}

function _save() {
  try { fs.writeFileSync(levelsPath, JSON.stringify(data, null, 2)); } catch (e) { console.error('Failed to save levels file', e); }
  // persist lastXp map
  try {
    const obj = {};
    for (const [k, v] of lastXp.entries()) obj[k] = v;
    fs.writeFileSync(lastXpPath, JSON.stringify(obj, null, 2));
  } catch (e) { console.warn('Failed to save lastXp persistence', e); }
}

function _ensureGuild(guildId) {
  if (!data[guildId]) data[guildId] = { users: {} };
  return data[guildId];
}

function _requiredXpFor(level) {
  // Quadratic progression
  return Math.floor(5 * level * level + 50 * level + 100);
}

// Base XP per message is controlled here. To change the base XP amounts for all servers, edit the min/max below.
// For temporary double XP events use the /xprate command to set xpRate per-server.
function _randomXp(min = 8, max = 14) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function addXp(client, guildId, userId) {
  const key = `${guildId}-${userId}`;
  const now = Date.now();
  const cooldown = 60 * 1000; // 60 seconds per xp grant
  const last = lastXp.get(key) || 0;
  if (now - last < cooldown) return null; // too soon

  lastXp.set(key, now);

  _ensureGuild(guildId);
  const g = data[guildId];
  if (!g.users[userId]) g.users[userId] = { xp: 0, level: 0, totalXp: 0 };
  const u = g.users[userId];

  // apply per-guild XP rate multiplier (e.g., 2x during events)
  const cfg = moderation.getGuildConfig(guildId) || {};
  const rate = Number(cfg.xpRate) || 1;
  let earn = _randomXp();
  earn = Math.max(1, Math.round(earn * rate));
  u.xp += earn;
  u.totalXp = (u.totalXp || 0) + earn;

  let leveled = false;
  let newLevel = u.level;

  while (u.xp >= _requiredXpFor(u.level)) {
    u.xp -= _requiredXpFor(u.level);
    u.level += 1;
    newLevel = u.level;
    leveled = true;
  }

  _save();

  if (leveled) {
    try {
      const cfg = moderation.getGuildConfig(guildId) || {};
      const chId = cfg.levelChannel;
      if (chId) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const channel = guild.channels.cache.get(chId);
          if (channel && channel.isTextBased()) {
            const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
            const username = member ? `${member.user.username}#${member.user.discriminator}` : `<@${userId}>`;
            const avatar = member ? member.user.displayAvatarURL({ extension: 'png', size: 128 }) : null;
            const required = _requiredXpFor(newLevel);
            const progress = Math.round((u.xp / required) * 20);
            const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);
            const embed = {
              title: `Level Up!`,
              description: `**${username}** reached **Level ${newLevel}** 🎉`,
              fields: [
                { name: 'Progress', value: `${bar} \n${u.xp}/${required} XP`, inline: false }
              ],
              color: 0x00FF99,
              thumbnail: avatar ? { url: avatar } : undefined
            };
            // Mention the user so they're notified when they level up
            channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(()=>{});
          }
        }
      }
    } catch(e) { console.error('Failed to send level up message', e); }
  }

  return { earned: earn, leveled, level: newLevel, xp: u.xp, totalXp: u.totalXp };
}

function getUser(guildId, userId) {
  _ensureGuild(guildId);
  const u = data[guildId].users[userId] || { xp: 0, level: 0, totalXp: 0 };
  return { ...u };
}

function getLeaderboard(guildId, limit = 10) {
  _ensureGuild(guildId);
  const users = Object.entries(data[guildId].users).map(([id, u]) => ({ id, xp: u.xp, level: u.level, totalXp: u.totalXp }));
  users.sort((a,b) => {
    if (b.level !== a.level) return b.level - a.level;
    return (b.totalXp || 0) - (a.totalXp || 0);
  });
  return users.slice(0, limit);
}

function getRank(guildId, userId) {
  _ensureGuild(guildId);
  const users = Object.entries(data[guildId].users).map(([id, u]) => ({ id, totalXp: u.totalXp || 0, level: u.level }));
  users.sort((a,b) => {
    if (b.level !== a.level) return b.level - a.level;
    return b.totalXp - a.totalXp;
  });
  const idx = users.findIndex(u => u.id === userId);
  return idx === -1 ? null : idx + 1;
}

// compute cumulative total XP needed to reach `level` (sum of required xp for levels 0..level-1)
function _totalXpForLevel(level){
  let total = 0;
  for (let i=0;i<level;i++) total += _requiredXpFor(i);
  return total;
}

// set a user's level directly (owner-only command will call this). If `announce` true and server has levelChannel configured, the bot will post a message mentioning the user.
async function setLevel(client, guildId, userId, level, announce = true){
  _ensureGuild(guildId);
  if (level < 0) throw new Error('Level must be >= 0');
  const g = data[guildId];
  g.users[userId] = g.users[userId] || { xp: 0, level: 0, totalXp: 0 };
  const u = g.users[userId];
  u.level = Math.floor(level);
  u.xp = 0;
  u.totalXp = _totalXpForLevel(u.level);
  _save();

  if (announce){
    try {
      const cfg = moderation.getGuildConfig(guildId) || {};
      const chId = cfg.levelChannel;
      if (chId){
        const guild = client.guilds.cache.get(guildId);
        if (guild){
          const channel = guild.channels.cache.get(chId);
          if (channel && channel.isTextBased()){
            const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
            const username = member ? `${member.user.username}#${member.user.discriminator}` : `<@${userId}>`;
            const avatar = member ? member.user.displayAvatarURL({ extension: 'png', size: 128 }) : null;
            const embed = {
              title: `Level Changed`,
              description: `**${username}** was set to **Level ${u.level}** by an admin`,
              color: 0x3498DB,
              thumbnail: avatar ? { url: avatar } : undefined
            };
            await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(()=>{});
          }
        }
      }
    } catch (e) { console.warn('Failed to announce setlevel', e); }
  }

  return { level: u.level, xp: u.xp, totalXp: u.totalXp };
}

const chokidar = require('chokidar');

// track scheduled xp reverts per guild
const xpTimers = new Map();

function _clearXpTimer(guildId){
  const t = xpTimers.get(guildId);
  if (t) { clearTimeout(t); xpTimers.delete(guildId); }
}

function clearXpTimer(guildId){
  _clearXpTimer(guildId);
}

function scheduleXpRevert(client, guildId, expireTimestamp){
  _clearXpTimer(guildId);
  const now = Date.now();
  const delay = Math.max(0, expireTimestamp - now);
  const timeout = setTimeout(()=>{
    try {
      const mod = require('./moderationManager');
      mod.setGuildConfig(guildId, { xpRate: 1, xpRateExpires: null });
      console.log(`XP rate reverted to 1x for guild ${guildId} (scheduled)`);
    } catch(e){ console.warn('Failed to revert xp rate', e); }
    _clearXpTimer(guildId);
  }, delay);
  xpTimers.set(guildId, timeout);
}

function init(client) {
  _load();
  // schedule existing xp rate expirations from guild settings
  try {
    const mod = require('./moderationManager');
    const all = mod.getAllGuildSettings() || {};
    Object.entries(all).forEach(([guildId, cfg]) => {
      if (cfg && cfg.xpRateExpires) {
        if (cfg.xpRateExpires <= Date.now()) {
          // expired -> reset
          mod.setGuildConfig(guildId, { xpRate: 1, xpRateExpires: null });
        } else {
          scheduleXpRevert(client, guildId, cfg.xpRateExpires);
        }
      }
    });

    // watch settings file to react to live changes from web panel
    const settingsPath = require('path').join(process.cwd(), 'data', 'guildSettings.json');
    const watcher = chokidar.watch(settingsPath, { ignoreInitial: true });
    watcher.on('change', async () => {
      try {
        const all2 = mod.getAllGuildSettings();
        Object.entries(all2).forEach(([guildId, cfg]) => {
          if (cfg && cfg.xpRateExpires) {
            if (cfg.xpRateExpires <= Date.now()) {
              mod.setGuildConfig(guildId, { xpRate: 1, xpRateExpires: null });
              _clearXpTimer(guildId);
            } else {
              scheduleXpRevert(client, guildId, cfg.xpRateExpires);
            }
          } else {
            // no expiration -> clear any running timer
            _clearXpTimer(guildId);
          }
        });
      } catch (e) { console.warn('Failed to process guild settings change', e); }
    });

  } catch (e) { console.warn('Leveling manager settings watcher not initialized', e); }
}

module.exports = { init, addXp, getUser, getLeaderboard, getRank, _requiredXpFor, scheduleXpRevert, clearXpTimer, setLevel };
