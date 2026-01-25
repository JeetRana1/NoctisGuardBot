const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const moderation = require('../../moderationManager');

module.exports = {
  plugin: 'welcome',
  data: new SlashCommandBuilder()
    .setName('setwelcomemessage')
    .setDescription('Set the welcome message template (placeholders: {mention}, {user}, {server})')
    .addStringOption(o => o.setName('message').setDescription('Message template').setRequired(false))
    .addBooleanOption(o => o.setName('reset').setDescription('Reset to default (clear custom message)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction){
    if (interaction.user.id !== interaction.guild.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)){
      return interaction.reply({ content: 'Only the server owner or administrators can use this command.', ephemeral: true });
    }
    const reset = interaction.options.getBoolean('reset');
    if (reset){
      moderation.setGuildConfig(interaction.guild.id, { welcomeMessage: null });
      const embed = new EmbedBuilder().setTitle('Welcome message reset').setDescription('Welcome message reset to default.').setColor(0x2ECC71);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const msg = interaction.options.getString('message');
    if (!msg) return interaction.reply({ content: 'Provide a message to set, or use the `reset` option to clear the custom message.', ephemeral: true });
    moderation.setGuildConfig(interaction.guild.id, { welcomeMessage: msg });
    const embed = new EmbedBuilder().setTitle('Welcome message set').setDescription('Set the welcome template. Use {mention} to mention the user.').setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};