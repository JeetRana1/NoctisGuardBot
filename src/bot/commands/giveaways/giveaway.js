const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const giveaways = require('../../giveaways');

module.exports = {
  plugin: 'giveaways',
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('create').setDescription('Create a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration (e.g., 1h, 30m)').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Role required to win').setRequired(false)))
    .addSubcommand(sub => sub.setName('end').setDescription('End a giveaway now').addStringOption(o => o.setName('id').setDescription('Giveaway id').setRequired(true)))
    .addSubcommand(sub => sub.setName('reroll').setDescription('Reroll a giveaway').addStringOption(o => o.setName('id').setDescription('Giveaway id').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('List giveaways in this server')),
  async execute(interaction) {
    // restrict to admin or owner at runtime as well
    if (!(interaction.guild.ownerId === interaction.user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator))) {
      return interaction.reply({ embeds: [{ title: 'Permission denied', description: 'You must be a server administrator to use giveaway commands.', color: 0xE74C3C }], flags: 64 });
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'create') {
        const prize = interaction.options.getString('prize');
        const duration = interaction.options.getString('duration');
        const winners = interaction.options.getInteger('winners');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const role = interaction.options.getRole('role');
        // parse duration
        const m = duration.match(/(\d+)([smhd])/);
        if (!m) return interaction.reply({ embeds: [{ title: 'Invalid duration', description: 'Use formats like 1h or 30m', color: 0xE74C3C }], flags: 64 });
        const num = parseInt(m[1]);
        let ms = 0;
        switch (m[2]) { case 's': ms = num*1000; break; case 'm': ms = num*60*1000; break; case 'h': ms = num*60*60*1000; break; case 'd': ms = num*24*60*60*1000; break; }
        await interaction.reply({ embeds: [{ title: 'Creating giveaway', description: `Prize: **${prize}**\nEnds: <t:${Math.floor((Date.now()+ms)/1000)}:R>`, color: 0x0099ff }], flags: 64 });
        const gw = await giveaways.createGiveaway({ guildId: interaction.guild.id, channelId: channel.id, prize, durationMs: ms, winnerCount: winners, hostId: interaction.user.id, requireRole: role?.id });
        return interaction.followUp({ embeds: [{ title: 'Giveaway created', description: `ID: ${gw.id}`, color: 0x2ECC71 }], flags: 64 });
      } else if (sub === 'end') {
        const id = interaction.options.getString('id');
        await interaction.reply({ embeds: [{ title: 'Ending giveaway', description: `Ending giveaway ${id}...`, color: 0xF1C40F }], flags: 64 });
        await giveaways.endGiveaway(id);
        return interaction.followUp({ embeds: [{ title: 'Ended', description: `Giveaway ${id} ended (or scheduled to end).`, color: 0x2ECC71 }], flags: 64 });
      } else if (sub === 'reroll') {
        const id = interaction.options.getString('id');
        await interaction.reply({ embeds: [{ title: 'Rerolling', description: `Rerolling giveaway ${id}...`, color: 0xF1C40F }], flags: 64 });
        const winners = await giveaways.rerollGiveaway(id);
        return interaction.followUp({ embeds: [{ title: 'Reroll complete', description: `Winners: ${winners.map(id=>`<@${id}>`).join(', ')}`, color: 0x2ECC71 }], flags: 64 });
      } else if (sub === 'list') {
        const list = giveaways.listForGuild(interaction.guild.id);
        if (!list || list.length === 0) return interaction.reply({ embeds: [{ title: 'Giveaways', description: 'No giveaways', color: 0x95A5A6 }], flags: 64 });
        const out = list.map(g => `${g.id} • ${g.prize} • ${g.ended ? 'Ended' : `Ends <t:${Math.floor(g.endTimestamp/1000)}:R>`}`).join('\n');
        return interaction.reply({ embeds: [{ title: 'Giveaways', description: out, color: 0x0099ff }], flags: 64 });
      }
    } catch (err) {
      console.error(err);
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder().setTitle('Error').setDescription(err.message).setColor(0xE74C3C);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: 64 });
      } else {
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    }
  }
};