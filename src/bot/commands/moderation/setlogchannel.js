const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const moderation = require('../../moderationManager');

module.exports = {
  plugin: 'moderation',
  data: new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set the channel where moderation logs are posted')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to use for logs').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction){
    const ch = interaction.options.getChannel('channel');
    moderation.setGuildConfig(interaction.guild.id, { logChannel: ch.id });
    const embed = new EmbedBuilder().setTitle('Log channel set').setDescription(`Set log channel to ${ch}`).setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};