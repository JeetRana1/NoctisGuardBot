const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const moderation = require('../../moderationManager');

module.exports = {
  plugin: 'leveling',
  data: new SlashCommandBuilder()
    .setName('setlevelchannel')
    .setDescription('Set channel to announce level ups')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction){
    const ch = interaction.options.getChannel('channel');
    moderation.setGuildConfig(interaction.guild.id, { levelChannel: ch.id });
    const embed = new EmbedBuilder().setTitle('Level channel set').setDescription(`Level channel set to ${ch}`).setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};