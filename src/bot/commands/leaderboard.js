const { SlashCommandBuilder } = require('discord.js');
const leveling = require('../levelingManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Shows the server leaderboard')
    .addIntegerOption(o => o.setName('limit').setDescription('Number of top users to show').setRequired(false)),
  async execute(interaction) {
    const limit = Math.max(1, Math.min(25, interaction.options.getInteger('limit') || 10));
    const guildId = interaction.guild.id;
    const top = leveling.getLeaderboard(guildId, limit);
    if (!top || top.length === 0) return interaction.reply('No data yet on this server.');
    let desc = '';
    for (let i = 0; i < top.length; i++) {
      const t = top[i];
      desc += `**${i+1}.** <@${t.id}> — Level ${t.level} • ${t.totalXp || 0} XP\n`;
    }
    const embed = { title: `Leaderboard — Top ${top.length}`, description: desc, color: 0xFFD700 };
    await interaction.reply({ embeds: [embed] });
  }
};