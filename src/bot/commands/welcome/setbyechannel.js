const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const moderation = require('../../moderationManager');

module.exports = {
  plugin: 'welcome',
  data: new SlashCommandBuilder()
    .setName('setbyechannel')
    .setDescription('Set the channel where goodbye messages are posted')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to use for goodbye messages').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction){
    // restrict to guild owner or administrators
    if (interaction.user.id !== interaction.guild.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)){
      return interaction.reply({ content: 'Only the server owner or administrators can use this command.', ephemeral: true });
    }
    const ch = interaction.options.getChannel('channel');
    moderation.setGuildConfig(interaction.guild.id, { byeChannelId: ch.id });
    const embed = new EmbedBuilder().setTitle('Goodbye channel set').setDescription(`Set goodbye channel to ${ch}`).setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};