const { Events } = require('discord.js');
const moderation = require('../moderationManager');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      const cfg = moderation.getGuildConfig(member.guild.id) || {};
      if (cfg.autoroleId) {
        try {
          await member.roles.add(cfg.autoroleId, 'Autorole assignment');
          moderation.logAction(member.client, member.guild.id, 'Autorole', member.id, member.client.user.id, 'Assigned autorole', { roleId: cfg.autoroleId });
        } catch (e) { console.warn('Autorole assignment failed', e); }
      }
      // welcome message
      try {
        const welcome = require('../welcomeManager');
        // always attempt to send a welcome message (fall back to any available channel)
        welcome.sendWelcome(member).catch((e)=>{ console.warn('Failed to send welcome message', e); });
      } catch (e) { console.warn('Failed to send welcome message', e); }
    } catch (err) { console.error('Autorole on join failed', err); }
  }
};