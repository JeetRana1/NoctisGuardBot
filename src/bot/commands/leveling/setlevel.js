const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const leveling = require('../../levelingManager');

module.exports = {
  plugin: 'leveling',
  data: new SlashCommandBuilder()
    .setName('setlevel')
    .setDescription('Set a user\'s level (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('level').setDescription('New level').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction){
    const user = interaction.options.getUser('user');
    const lvl = interaction.options.getInteger('level');
    await leveling.setLevel(interaction.client, interaction.guild.id, user.id, lvl);
    const embed = new EmbedBuilder().setTitle('Level set').setDescription(`Set **${user.tag}** to level **${lvl}**`).setColor(0x2ECC71);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};