const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderation = require('../moderationManager');
const leveling = require('../levelingManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xprate')
    .setDescription('View or set the XP rate multiplier for this server')
    .addNumberOption(o => o.setName('rate').setDescription('Multiplier value, e.g., 2 for 2x XP').setRequired(false))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes for this rate (optional)').setRequired(false))
    .addBooleanOption(o => o.setName('reset').setDescription('Reset XP rate to 1x').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const cfg = moderation.getGuildConfig(guildId) || {};

    // view
    if (interaction.options.getNumber('rate') === null && interaction.options.getBoolean('reset') === null) {
      const current = cfg.xpRate || 1;
      const expires = cfg.xpRateExpires ? new Date(cfg.xpRateExpires).toISOString() : null;
      return interaction.reply({ content: `Current XP rate: **${current}x**${expires ? ` (expires: ${expires})` : ''}. Use /xprate <rate> [duration_minutes] to change (Admin only).`, ephemeral: true });
    }

    // permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Manage Server or Administrator permissions to change XP rate.', ephemeral: true });
    }

    // reset
    if (interaction.options.getBoolean('reset')){
      moderation.setGuildConfig(guildId, { xpRate: 1, xpRateExpires: null });
      leveling.clearXpTimer(guildId); // clear any timers
      return interaction.reply({ content: 'XP rate reset to **1x**.', ephemeral: false });
    }

    // set
    const rateOpt = interaction.options.getNumber('rate');
    const dur = interaction.options.getInteger('duration');
    const rate = Number(rateOpt);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) return interaction.reply({ content: 'Please provide a valid rate between 0 and 100.', ephemeral: true });

    if (!dur) {
      moderation.setGuildConfig(guildId, { xpRate: rate, xpRateExpires: null });
      leveling.clearXpTimer(guildId);
      return interaction.reply({ content: `XP rate set to **${rate}x** (no expiry).`, ephemeral: false });
    }

    const mins = Number(dur);
    if (!Number.isInteger(mins) || mins <= 0 || mins > 525600) return interaction.reply({ content: 'Duration must be a positive integer number of minutes (<= 525600).', ephemeral: true });
    const expire = Date.now() + mins * 60 * 1000;
    moderation.setGuildConfig(guildId, { xpRate: rate, xpRateExpires: expire });
    leveling.scheduleXpRevert(interaction.client, guildId, expire);
    return interaction.reply({ content: `XP rate set to **${rate}x** for **${mins} minutes** (expires at ${new Date(expire).toISOString()}).`, ephemeral: false });
  }
};