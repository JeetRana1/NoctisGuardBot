const { Events } = require('discord.js');
const moderation = require('../moderationManager');

// Basic bad-words list for demonstration. Replace with a better library/dataset in production.
const BAD_WORDS = ['badword','anotherbad'];
const inviteRegex = /(discord(?:app)?\.com\/invite|discord\.gg)\/[A-Za-z0-9-]+/i;

// Simple in-memory recent messages cache per guild+user for spam detection
const recent = new Map(); // key: `${guildId}-${userId}` -> [{ content, ts }]

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message.guild || message.author.bot) return;
      const cfg = moderation.getGuildConfig(message.guild.id) || {};
      const automod = cfg.automod || { profanity: true, invites: true, spam: true };

      // profanity
      if (automod.profanity) {
        const text = (message.content || '').toLowerCase();
        for (const w of BAD_WORDS) if (text.includes(w)) {
          try { await message.delete(); } catch(e){}
          const rec = moderation.addWarning(message.guild.id, message.author.id, message.client.user.id, 'Profanity detected');
          moderation.logAction(message.client, message.guild.id, 'Profanity', message.author.id, message.client.user.id, 'Profanity detected', { messageId: message.id, caseId: rec.id });
          try { await moderation.sendUserDM(message.client, message.guild.id, message.author.id, { embeds: [{ title: `You were warned in ${message.guild.name}`, description: 'Profanity detected', color: 0xF1C40F, fields:[{name:'Case', value:`#${rec.id}`}] }] }); } catch(e){}
          return;
        }
      }

      // invites
      if (automod.invites) {
        if (inviteRegex.test(message.content || '')){
          try { await message.delete(); } catch(e){}
          const rec = moderation.addWarning(message.guild.id, message.author.id, message.client.user.id, 'Invite link posted');
          moderation.logAction(message.client, message.guild.id, 'Invite', message.author.id, message.client.user.id, 'Invite link posted', { messageId: message.id, caseId: rec.id });
          try { await moderation.sendUserDM(message.client, message.guild.id, message.author.id, { embeds: [{ title: `You were warned in ${message.guild.name}`, description: 'Posting invite links is not allowed.', color: 0xF1C40F, fields:[{ name: 'Case', value: `#${rec.id}` }] }] }); } catch(e){}
          return;
        }
      }

      // spam: simple detection - same content 3 times within 20s
      if (automod.spam) {
        const key = `${message.guild.id}-${message.author.id}`;
        const arr = recent.get(key) || [];
        const now = Date.now();
        arr.push({ content: message.content || '', ts: now });
        // keep last 5
        while (arr.length > 5) arr.shift();
        recent.set(key, arr.filter(a => now - a.ts < 20000));
        const sameCount = arr.filter(a => a.content === message.content).length;
        if (sameCount >= 3) {
          try { await message.delete(); } catch(e){}
          const rec = moderation.addWarning(message.guild.id, message.author.id, message.client.user.id, 'Spam detected');
          moderation.logAction(message.client, message.guild.id, 'Spam', message.author.id, message.client.user.id, 'Spam detected', { messageId: message.id, caseId: rec.id });
          try { await moderation.sendUserDM(message.client, message.guild.id, message.author.id, { embeds: [{ title: `You were warned in ${message.guild.name}`, description: 'Spamming is not allowed.', color: 0xF1C40F, fields:[{ name: 'Case', value: `#${rec.id}` }] }] }); } catch(e){}
          recent.set(key, []);
          return;
        }
      }

      // Leveling: award XP for messages (rate-limited per user)
      try {
        const leveling = require('../levelingManager');
        const res = await leveling.addXp(message.client, message.guild.id, message.author.id);
        if (res && res.leveled) {
          // optionally do something on level up, already sends message to configured channel
          console.log(`Level up: ${message.author.tag} -> ${res.level}`);
        }
      } catch (e) { console.warn('Leveling error', e); }

    } catch (err) { console.error('Automod error', err); }
  }
};