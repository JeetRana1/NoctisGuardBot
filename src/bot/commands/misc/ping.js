const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  plugin: 'misc',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ping the bot'),
  async execute(interaction){
    const latency = Math.round(interaction.client.ws.ping || 0);
    const embed = new EmbedBuilder()
      .setTitle('Pong!')
      .setDescription(`WebSocket ping: **${latency} ms**`)
      .setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};