const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  async execute(interaction) {
    const embed = new EmbedBuilder().setTitle('Pong!').setDescription(`Response from ${interaction.client.user.tag}`).setColor(0x0099ff);
    await interaction.reply({ embeds: [embed] });
  },
};