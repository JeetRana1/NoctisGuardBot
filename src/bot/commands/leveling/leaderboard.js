const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('../../levelingManager');

module.exports = {
  plugin: 'leveling',
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show server XP leaderboard')
    .addIntegerOption(o => o.setName('limit').setDescription('Number of entries').setRequired(false)),
  async execute(interaction){
    const limit = Math.max(1, Math.min(50, interaction.options.getInteger('limit') || 10));
    // get leaderboard correctly
    const lb = await leveling.getLeaderboard(interaction.guild.id, limit);
    if (!lb || lb.length === 0) {
      const embed = new EmbedBuilder().setTitle('Leaderboard').setDescription('No leaderboard data.').setColor(0x95A5A6);
      return interaction.reply({ embeds: [embed] });
    }

    // Build rich entries (include usernames/avatars from guild when possible)
    const guild = interaction.guild;
    const enriched = await Promise.all(lb.map(async (e, i) => {
      let username = `<@${e.id}>`;
      let discriminator = '0000';
      let avatarUrl = null;
      try {
        const member = guild.members.cache.get(e.id) || await guild.members.fetch(e.id).catch(()=>null);
        if (member) { username = member.user.username; discriminator = member.user.discriminator; avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 }); }
      } catch(e){}
      return Object.assign({ rank: i+1, username, discriminator, avatarUrl, required: leveling._requiredXpFor(e.level) }, e);
    }));

    // generate an image-style leaderboard
    try {
      const { generateLeaderboardImage } = require('../../utils/image');
      const { BANNER_URL } = require('../../utils/embed');
      const imgBuf = await generateLeaderboardImage(enriched, { color: '#8b5cf6', bannerUrl: BANNER_URL });
      return interaction.reply({ files: [{ attachment: imgBuf, name: 'leaderboard.png' }] });
    } catch (err) {
      console.error('Failed to generate leaderboard image', err);
      // fallback to text embed
      const out = lb.map((e,i) => `${i+1}. <@${e.id}> — Level ${e.level} (${e.xp} XP)`).join('\n');
      const embed = new EmbedBuilder().setTitle('Leaderboard').setDescription(out).setColor(0x0099FF);
      return interaction.reply({ embeds: [embed] });
    }
  }
};