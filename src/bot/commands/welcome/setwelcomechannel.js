const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const moderation = require('../../moderationManager');

module.exports = {
  plugin: 'welcome',
  data: new SlashCommandBuilder()
    .setName('setwelcomechannel')
    .setDescription('Set the channel where welcome messages are posted')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to use for welcome messages').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction){
    // restrict to guild owner or administrators
    if (interaction.user.id !== interaction.guild.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)){
      return interaction.reply({ content: 'Only the server owner or administrators can use this command.', ephemeral: true });
    }
    const ch = interaction.options.getChannel('channel');
    moderation.setGuildConfig(interaction.guild.id, { welcomeChannelId: ch.id });
    const embed = new EmbedBuilder().setTitle('Welcome channel set').setDescription(`Set welcome channel to ${ch}`).setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};