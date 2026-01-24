const { SlashCommandBuilder } = require('discord.js');
const leveling = require('../levelingManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Displays your level')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;
    const userId = target.id;
    const u = leveling.getUser(guildId, userId);
    const req = leveling._requiredXpFor(u.level);
    const progress = Math.round((u.xp / req) * 20);
    const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);
    const rank = leveling.getRank(guildId, userId) || 'Unranked';

    const embed = {
      title: `${target.tag} — Level ${u.level}`,
      thumbnail: { url: target.displayAvatarURL({ extension: 'png', size: 128 }) },
      fields: [
        { name: 'Rank', value: `${rank}`, inline: true },
        { name: 'XP', value: `${u.xp}/${req}`, inline: true },
        { name: 'Progress', value: `${bar}` }
      ],
      color: 0x2ECC71
    };
    await interaction.reply({ embeds: [embed] });
  }
};