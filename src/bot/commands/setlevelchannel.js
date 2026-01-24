const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderation = require('../moderationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlevelchannel')
    .setDescription('Set the channel where level up messages are posted')
    .addChannelOption(o => o.setName('channel').setDescription('Channel for level messages').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Manage Server or Administrator permissions to use this.', ephemeral: true });
    }
    const cfg = moderation.setGuildConfig(interaction.guild.id, { levelChannel: channel.id });
    await interaction.reply({ content: `Level-up messages will be posted in ${channel}.`, ephemeral: false });
  }
};