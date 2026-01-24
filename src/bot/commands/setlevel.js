const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const leveling = require('../levelingManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlevel')
    .setDescription('Owner-only: set a user to a specific level')
    .addUserOption(o => o.setName('user').setDescription('User to change').setRequired(true))
    .addIntegerOption(o => o.setName('level').setDescription('Level to set').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    // owner-only
    if (guild.ownerId !== interaction.user.id) return interaction.reply({ content: 'Only the server owner can use this command.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const level = interaction.options.getInteger('level');
    if (level < 0) return interaction.reply({ content: 'Level must be 0 or greater.', ephemeral: true });

    try {
      const res = await leveling.setLevel(interaction.client, guild.id, user.id, level, true);
      return interaction.reply({ content: `${user.tag} is now set to Level ${res.level}.`, ephemeral: false });
    } catch (e) {
      console.error('setlevel failed', e);
      return interaction.reply({ content: 'Failed to set level: ' + e.message, ephemeral: true });
    }
  }
};