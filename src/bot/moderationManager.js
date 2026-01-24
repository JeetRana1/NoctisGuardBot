const fs = require('fs');
const path = require('path');

const infractionsPath = path.join(process.cwd(), 'data', 'infractions.json');
const tempbansPath = path.join(process.cwd(), 'data', 'tempbans.json');
const modLogsPath = path.join(process.cwd(), 'data', 'modlogs.json');
const guildSettingsPath = path.join(process.cwd(), 'data', 'guildSettings.json');

function ensureFile(p, init = {}) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (e) {}
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(init, null, 2));
}

function readJson(p) {
  ensureFile(p, {});
  try { return JSON.parse(fs.readFileSync(p, 'utf8') || '{}'); } catch (e) { return {}; }
}

function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

// track recent warn DMs to avoid duplicates
const _recentWarns = {}; // { [guildId]: { [userId]: timestamp } }

module.exports = {
  addWarning(guildId, userId, moderatorId, reason){
    const data = readJson(infractionsPath);
    data[guildId] = data[guildId] || {};
    data[guildId][userId] = data[guildId][userId] || [];
    const record = { id: makeId(), moderatorId, reason: reason||'No reason provided', timestamp: Date.now() };
    data[guildId][userId].push(record);
    writeJson(infractionsPath, data);
    return record;
  },
  // helper to get warning count
  getWarningCount(guildId, userId){
    const data = readJson(infractionsPath);
    return (data[guildId] && data[guildId][userId]) ? data[guildId][userId].length : 0;
  },
  // avoiding duplicate DM on warns and other moderation DMs: only allow one DM per user per guild within intervalMs
  canSendDM(guildId, userId, intervalMs = 5000){
    _recentWarns[guildId] = _recentWarns[guildId] || {};
    const last = _recentWarns[guildId][userId] || 0;
    const now = Date.now();
    if (now - last < intervalMs) return false;
    _recentWarns[guildId][userId] = now;
    return true;
  },
  // send a DM safely (deduped); message can be a string or an embed/object for channel.send
  async sendUserDM(client, guildId, userId, message){
    if (!this.canSendDM(guildId, userId)) return false;
    try {
      const user = await client.users.fetch(userId).catch(()=>null);
      if (!user) return false;
      if (typeof message === 'string') { await user.send(message); return true; }
      await user.send(message);
      return true;
    } catch (e) { return false; }
  },
  listWarnings(guildId, userId){
    const data = readJson(infractionsPath);
    return (data[guildId] && data[guildId][userId]) ? data[guildId][userId] : [];
  },
  clearWarnings(guildId, userId){
    const data = readJson(infractionsPath);
    if (data[guildId]) delete data[guildId][userId];
    writeJson(infractionsPath, data);
    return true;
  },

  // Moderation logs and cases
  _saveCase(guildId, caseObj){
    ensureFile(modLogsPath, {});
    const logs = readJson(modLogsPath);
    logs[guildId] = logs[guildId] || [];
    logs[guildId].push(caseObj);
    writeJson(modLogsPath, logs);
  },
  logAction(client, guildId, type, targetId, moderatorId, reason, extra = {}){
    const id = makeId();
    const timestamp = Date.now();
    const caseObj = { id, guildId, type, targetId, moderatorId, reason, timestamp, ...extra };
    this._saveCase(guildId, caseObj);

    // attempt to send embed to configured log channel
    try {
      const cfg = this.getGuildConfig(guildId);
      const channelId = cfg && cfg.logChannelId;
      if (channelId && client) {
        client.channels.fetch(channelId).then(ch => {
          if (!ch || !ch.isTextBased?.()) return;
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setTitle('Moderation Action')
            .setColor(0xE74C3C)
            .addFields(
              { name: 'Case', value: `#${id}`, inline: true },
              { name: 'Type', value: type, inline: true },
              { name: 'Target', value: `<@${targetId}>`, inline: true },
              { name: 'Moderator', value: `<@${moderatorId}>`, inline: true },
              { name: 'Reason', value: reason || 'No reason provided' }
            )
            .setTimestamp(timestamp);
          ch.send({ embeds: [embed] }).catch(()=>{});
        }).catch(()=>{});
      }
    } catch (e) { console.warn('Failed to send moderation log embed', e); }
    return caseObj;
  },
  getCases(guildId){
    ensureFile(modLogsPath, {});
    const logs = readJson(modLogsPath);
    return logs[guildId] || [];
  },

  // Guild settings persistence
  getGuildConfig(guildId){
    ensureFile(guildSettingsPath, {});
    const s = readJson(guildSettingsPath);
    // xpRate: per-guild multiplier for XP earned (1 = normal, 2 = double XP, etc.)
    return s[guildId] || { autoroleId: null, logChannelId: null, levelChannel: null, xpRate: 1, xpRateExpires: null, automod: { profanity: true, invites: true, spam: true } };
  },
  // Return entire settings object (useful for managers that need to scan all guild settings)
  getAllGuildSettings(){
    ensureFile(guildSettingsPath, {});
    return readJson(guildSettingsPath);
  },
  setGuildConfig(guildId, cfg){
    ensureFile(guildSettingsPath, {});
    const s = readJson(guildSettingsPath);
    s[guildId] = Object.assign(this.getGuildConfig(guildId), cfg);
    writeJson(guildSettingsPath, s);
    return s[guildId];
  },

  // TEMPBANS
  async createTempban(client, guildId, userId, durationMs, moderatorId, reason){
    // Ban immediately
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.members.ban(userId, { reason: reason || 'Tempban' });
    } catch (e) {
      throw new Error('Ban failed: ' + e.message);
    }
    // Persist tempban
    const temp = readJson(tempbansPath);
    const id = makeId();
    const endTimestamp = Date.now() + durationMs;
    temp[id] = { id, guildId, userId, endTimestamp, moderatorId, reason };
    writeJson(tempbansPath, temp);
    // Schedule unban
    this._scheduleUnban(client, { id, guildId, userId, endTimestamp });
    return { id, guildId, userId, endTimestamp };
  },
  _scheduleUnban(client, t){
    const now = Date.now();
    const delay = Math.max(0, t.endTimestamp - now);
    setTimeout(async ()=>{
      try {
        const g = await client.guilds.fetch(t.guildId);
        await g.members.unban(t.userId, 'Temporary ban expired');
      } catch (e) { console.warn('Unban failed', e); }
      // remove from file
      const temp = readJson(tempbansPath);
      delete temp[t.id];
      writeJson(tempbansPath, temp);
    }, delay);
  },
  init(client){
    // schedule existing tempbans
    ensureFile(tempbansPath, {});
    const temp = readJson(tempbansPath) || {};
    Object.values(temp).forEach(t => {
      if (!t || !t.id) return;
      // if expired, unban immediately
      if (t.endTimestamp <= Date.now()) {
        client.guilds.fetch(t.guildId).then(g=>g.members.unban(t.userId, 'Tempban expired on startup')).catch(()=>{});
        const all = readJson(tempbansPath); delete all[t.id]; writeJson(tempbansPath, all);
      } else {
        this._scheduleUnban(client, t);
      }
    });
    console.log('Moderation manager initialized');
  }
};