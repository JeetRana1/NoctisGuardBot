const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderation = require('../../moderationManager');
const welcome = require('../../welcomeManager');

module.exports = {
  plugin: 'welcome',
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Send a welcome message for a user (manual)')
    .addUserOption(o => o.setName('user').setDescription('User to welcome').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send message to').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction){
    const target = interaction.options.getUser('user') || interaction.user;
    const guildMember = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(()=>null) : null;
    if (!guildMember) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    const ch = interaction.options.getChannel('channel');
    const ok = await welcome.sendWelcome(guildMember, { channelId: ch ? ch.id : undefined });
    return interaction.reply({ content: ok ? 'Welcome message sent.' : 'Failed to send welcome message (no channel configured or missing permissions).', ephemeral: true });
  }
};