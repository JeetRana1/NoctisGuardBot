const { Events } = require('discord.js');
const moderation = require('../moderationManager');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      const cfg = moderation.getGuildConfig(member.guild.id) || {};
      try {
        const welcome = require('../welcomeManager');
        welcome.sendBye(member).catch(()=>{});
      } catch (e) { console.warn('Failed to send bye message', e); }
    } catch (err) { console.error('Error in guildMemberRemove', err); }
  }
};