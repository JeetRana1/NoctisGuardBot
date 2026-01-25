const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const welcome = require('../../welcomeManager');

module.exports = {
  plugin: 'welcome',
  data: new SlashCommandBuilder()
    .setName('bye')
    .setDescription('Send a goodbye message for a user (manual)')
    .addUserOption(o => o.setName('user').setDescription('User who left').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send message to').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction){
    const target = interaction.options.getUser('user') || interaction.user;
    const guildMember = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(()=>null) : null;
    // if user no longer in server, create a minimal object with necessary fields
    const fakeMember = guildMember || { user: target, guild: interaction.guild };
    const ch = interaction.options.getChannel('channel');
    const ok = await welcome.sendBye(fakeMember, { channelId: ch ? ch.id : undefined });
    return interaction.reply({ content: ok ? 'Goodbye message sent.' : 'Failed to send goodbye message (no channel configured or missing permissions).', ephemeral: true });
  }
};