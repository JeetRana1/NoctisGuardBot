const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderation = require('../moderationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set the channel where moderation/admin actions are logged')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post logs into').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Manage Server or Administrator permissions to use this.', ephemeral: true });
    }
    const cfg = moderation.setGuildConfig(interaction.guild.id, { logChannelId: channel.id });
    await interaction.reply({ content: `Log channel set to ${channel}.`, ephemeral: true });
  }
};