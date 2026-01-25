const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderation = require('../../moderationManager');

module.exports = {
  plugin: 'moderation',
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Owner-only: view recent moderation/admin logs')
    .addUserOption(o => o.setName('user').setDescription('Filter by user').setRequired(false))
    .addIntegerOption(o => o.setName('limit').setDescription('Number of entries to show').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.guild) {
      const { EmbedBuilder } = require('discord.js');
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Server-only command').setDescription('This command must be used in a server.').setColor(0xE74C3C) ], ephemeral: true });
    }
    if (interaction.guild.ownerId !== interaction.user.id) {
      const { EmbedBuilder } = require('discord.js');
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Permission denied').setDescription('Only the server owner can use this command.').setColor(0xE74C3C) ], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    let limit = interaction.options.getInteger('limit') || 10;
    limit = Math.max(1, Math.min(50, limit));

    const cases = moderation.getCases(interaction.guild.id) || [];
    const filtered = user ? cases.filter(c => c.targetId === user.id || c.moderatorId === user.id) : cases;
    const slice = filtered.slice(Math.max(0, filtered.length - limit)).reverse(); // newest first

    if (slice.length === 0) {
      const { EmbedBuilder } = require('discord.js');
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('No logs').setDescription('No logs found.').setColor(0x95A5A6) ], ephemeral: true });
    }

    const embeds = slice.map(c => ({
      title: `#${c.id} • ${c.type}`,
      description: c.reason || 'No reason',
      fields: [
        { name: 'Target', value: `<@${c.targetId}>`, inline: true },
        { name: 'Moderator', value: `<@${c.moderatorId}>`, inline: true },
        { name: 'When', value: new Date(c.timestamp).toLocaleString(), inline: true }
      ],
      color: 0x95A5A6
    }));

    // if too many embeds for one reply, paginate in messages
    for (let i = 0; i < embeds.length; i += 10) {
      const chunk = embeds.slice(i, i + 10);
      if (i === 0) {
        await interaction.reply({ embeds: chunk, ephemeral: true });
      } else {
        await interaction.followUp({ embeds: chunk, ephemeral: true });
      }
    }
  }
};