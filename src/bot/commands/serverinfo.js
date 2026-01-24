const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Displays server information'),
  async execute(interaction) {
    const guild = interaction.guild;
    const embed = {
      title: guild.name,
      fields: [
        { name: 'Members', value: guild.memberCount.toString(), inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Created', value: guild.createdAt.toLocaleDateString(), inline: true },
      ],
    };
    await interaction.reply({ embeds: [embed] });
  },
};