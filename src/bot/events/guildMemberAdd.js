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
    } catch (err) { console.error('Autorole on join failed', err); }
  }
};