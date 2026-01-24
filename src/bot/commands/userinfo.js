const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Displays user information')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to get info for')
        .setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const embed = {
      title: user.tag,
      fields: [
        { name: 'ID', value: user.id, inline: true },
        { name: 'Joined', value: member ? member.joinedAt.toLocaleDateString() : 'N/A', inline: true },
        { name: 'Roles', value: member ? member.roles.cache.map(r => r.name).join(', ') : 'N/A', inline: true },
      ],
    };
    await interaction.reply({ embeds: [embed] });
  },
};