const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderation = require('../moderationManager');

function parseDurationToMs(str){
  if (!str) return null;
  const m = (''+str).match(/(\d+)([smhd])/i);
  if (!m) return null;
  const num = parseInt(m[1],10); const unit = m[2].toLowerCase();
  switch (unit){ case 's': return num*1000; case 'm': return num*60*1000; case 'h': return num*60*60*1000; case 'd': return num*24*60*60*1000; }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Advanced moderation commands')
    .addSubcommand(sc => sc.setName('warn').setDescription('Warn a user')
      .addUserOption(o=>o.setName('user').setDescription('User to warn').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason')))
    .addSubcommand(sc => sc.setName('warnings').setDescription('List warnings for a user')
      .addUserOption(o=>o.setName('user').setDescription('User (defaults to target)')))
    .addSubcommand(sc => sc.setName('clear-warns').setDescription('Clear warnings for a user')
      .addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(sc => sc.setName('mute').setDescription('Mute (timeout) a user')
      .addUserOption(o=>o.setName('user').setDescription('User to mute').setRequired(true))
      .addStringOption(o=>o.setName('duration').setDescription('Duration like 30m, 1h (default 60m)')))
    .addSubcommand(sc => sc.setName('unmute').setDescription('Remove timeout from user')
      .addUserOption(o=>o.setName('user').setDescription('User to unmute').setRequired(true)))
    .addSubcommand(sc => sc.setName('ban').setDescription('Ban a user')
      .addUserOption(o=>o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason')))
    .addSubcommand(sc => sc.setName('tempban').setDescription('Temporarily ban a user')
      .addUserOption(o=>o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o=>o.setName('duration').setDescription('Duration like 1h').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason')))
    .addSubcommand(sc => sc.setName('kick').setDescription('Kick a user')
      .addUserOption(o=>o.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason')))
    .addSubcommand(sc => sc.setName('purge').setDescription('Bulk delete messages')
      .addIntegerOption(o=>o.setName('amount').setDescription('Number of messages to delete (2-100)').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder().setTitle('Permission denied').setDescription('You do not have permission to use moderation commands.').setColor(0xE74C3C);
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Defer so we can perform longer operations without timing out
    try { await interaction.deferReply(); } catch (e) { /* ignore if already deferred */ }

    try {
      if (sub === 'warn'){
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const rec = moderation.addWarning(interaction.guild.id, target.id, interaction.user.id, reason);
        const count = moderation.getWarningCount(interaction.guild.id, target.id);
        moderation.logAction(interaction.client, interaction.guild.id, 'Warning', target.id, interaction.user.id, reason, { caseId: rec.id, warnings: count });

        // try DM (avoid duplicates)
        try {
          await moderation.sendUserDM(interaction.client, interaction.guild.id, target.id, { embeds: [{ title: `You were warned in ${interaction.guild.name}`, description: `Reason:\n${reason}`, color: 0xF1C40F, fields: [{name:'Case', value: `#${rec.id}`}, { name: 'Warnings', value: `${count}/3`, inline: true }] }] });
        } catch(e){}

        // if warnings reached threshold, kick
        if (count >= 3){
          try {
            const member = await interaction.guild.members.fetch(target.id);
            await member.kick(`Reached ${count} warnings`);
            moderation.logAction(interaction.client, interaction.guild.id, 'AutoKick', target.id, interaction.client.user.id, `Auto-kick after ${count} warnings`, { caseId: rec.id });
            // clear warnings after action
            moderation.clearWarnings(interaction.guild.id, target.id);
            await interaction.editReply({ embeds: [{ title: 'User warned and kicked', description: `${target.tag} has been warned (case #${rec.id}) and kicked after reaching ${count}/3 warnings.`, color: 0xE74C3C, fields:[{name:'Warnings', value:`${count}/3`, inline:true}] }] });
            return;
          } catch (e) {
            console.error('Auto-kick failed', e);
            await interaction.editReply({ embeds: [{ title: 'User warned', description: `${target.tag} — ${reason}`, color: 0xF1C40F, fields:[{name:'Case', value:`#${rec.id}`, inline:true},{name:'Warnings', value:`${count}/3`, inline:true}] }] });
            return;
          }
        }

        await interaction.editReply({ embeds: [{ title: 'User warned', description: `${target.tag}`, color: 0xF1C40F, fields:[{name:'Case', value:`#${rec.id}`, inline:true},{name:'Warnings', value:`${count}/3`, inline:true},{name:'Reason', value: reason}] }] });
      } else if (sub === 'warnings'){
        const target = interaction.options.getUser('user') || interaction.user;
        const list = moderation.listWarnings(interaction.guild.id, target.id);
        if (!list || list.length === 0) return interaction.followUp({ content:`No warnings for ${target.tag}`, flags: 64 });
        const out = list.map(w => `**${new Date(w.timestamp).toLocaleString()}** by <@${w.moderatorId}>: ${w.reason} (id: ${w.id})`).join('\n');
        await interaction.followUp({ embeds: [{ title: `Warnings for ${target.tag}`, description: out, color: 0xF1C40F }] , flags: 64});
      } else if (sub === 'clear-warns'){
        const target = interaction.options.getUser('user');
        moderation.clearWarnings(interaction.guild.id, target.id);
        const { EmbedBuilder } = require('discord.js');
        await interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Warnings cleared').setDescription(`Cleared warnings for ${target.tag}`).setColor(0x2ECC71) ] });
      } else if (sub === 'mute'){
        const target = interaction.options.getUser('user');
        const dur = interaction.options.getString('duration') || '60m';
        const ms = parseDurationToMs(dur) || (60*60*1000);
        const member = await interaction.guild.members.fetch(target.id);
        if (!member.moderatable) return interaction.reply({ content: 'I cannot time out this user.', ephemeral: true });
        await member.timeout(ms, `Muted by ${interaction.user.tag}`);
        const c = moderation.logAction(interaction.client, interaction.guild.id, 'Mute', target.id, interaction.user.id, `Muted for ${dur}`, { durationMs: ms });
        try { await moderation.sendUserDM(interaction.client, interaction.guild.id, target.id, { embeds: [{ title: `You were muted in ${interaction.guild.name}`, description: `Duration: **${dur}**\nModerator: <@${interaction.user.id}>`, color: 0xF39C12, fields: [{ name: 'Case', value: `#${c.id}` }], footer: { text: interaction.guild.name } }] }); } catch(e){}
        await interaction.editReply({ embeds: [{ title: `${target.tag} muted`, description: `Duration: ${dur}`, color: 0xF39C12, fields:[{name:'Case', value:`#${c.id}`, inline:true}] }] });
      } else if (sub === 'unmute'){
        const target = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(target.id);
        await member.timeout(null);
        const c = moderation.logAction(interaction.client, interaction.guild.id, 'Unmute', target.id, interaction.user.id, 'Unmuted');
        try { await moderation.sendUserDM(interaction.client, interaction.guild.id, target.id, { embeds: [{ title: `You were unmuted in ${interaction.guild.name}`, color: 0x2ECC71, fields: [{ name: 'Case', value: `#${c.id}` }], footer: { text: interaction.guild.name } }] }); } catch(e){}
        await interaction.editReply({ embeds: [{ title: `${target.tag} unmuted`, description: `Unmuted by <@${interaction.user.id}>`, color: 0x2ECC71, fields:[{name:'Case', value:`#${c.id}`, inline:true}] }] });
      } else if (sub === 'ban'){
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try { await moderation.sendUserDM(interaction.client, interaction.guild.id, target.id, { embeds: [{ title: `You have been banned from ${interaction.guild.name}`, description: `Reason: ${reason}`, color: 0xE74C3C, footer: { text: interaction.guild.name } }] }); } catch(e){}
        await interaction.guild.members.ban(target.id, { reason });
        const c = moderation.logAction(interaction.client, interaction.guild.id, 'Ban', target.id, interaction.user.id, reason);
        await interaction.editReply({ embeds: [{ title: `${target.tag} banned`, description: `Reason: ${reason}`, color: 0xE74C3C, fields:[{name:'Case', value:`#${c.id}`, inline:true}] }] });
      } else if (sub === 'tempban'){
        const target = interaction.options.getUser('user');
        const dur = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const ms = parseDurationToMs(dur);
        if (!ms) return interaction.followUp({content:'Invalid duration format. Use 30m or 1h etc.', flags: 64});
        try { await moderation.sendUserDM(interaction.client, interaction.guild.id, target.id, { embeds: [{ title: `You have been temporarily banned from ${interaction.guild.name}`, description: `Unban: <t:${Math.floor((Date.now()+ms)/1000)}:F>\nReason: ${reason}`, color: 0xE74C3C, footer: { text: interaction.guild.name } }] }); } catch(e){}
        const res = await moderation.createTempban(interaction.client, interaction.guild.id, target.id, ms, interaction.user.id, reason);
        const c = moderation.logAction(interaction.client, interaction.guild.id, 'Tempban', target.id, interaction.user.id, reason, { endTimestamp: res.endTimestamp });
        await interaction.editReply({ embeds: [{ title: `${target.tag} temp-banned`, description: `Unban: ${new Date(res.endTimestamp).toLocaleString()}`, color: 0xE74C3C, fields:[{name:'Case', value:`#${c.id}`, inline:true}] }] });
      } else if (sub === 'kick'){
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try { await moderation.sendUserDM(interaction.client, interaction.guild.id, target.id, { embeds: [{ title: `You have been kicked from ${interaction.guild.name}`, description: `Reason: ${reason}`, color: 0xE74C3C, footer: { text: interaction.guild.name } }] }); } catch(e){}
        await interaction.guild.members.kick(target.id, reason);
        const c = moderation.logAction(interaction.client, interaction.guild.id, 'Kick', target.id, interaction.user.id, reason);
        await interaction.editReply({ embeds: [{ title: `${target.tag} kicked`, description: `Reason: ${reason}`, color: 0xE74C3C, fields:[{name:'Case', value:`#${c.id}`, inline:true}] }] });
      } else if (sub === 'purge'){
        const amount = interaction.options.getInteger('amount');
        if (amount < 2 || amount > 100) return interaction.followUp({content:'Amount must be between 2 and 100', flags: 64});
        const deleted = await interaction.channel.bulkDelete(amount, true);
        moderation.logAction(interaction.client, interaction.guild.id, 'Purge', interaction.user.id, interaction.user.id, `Deleted ${deleted.size} messages`);
        await interaction.editReply({ embeds: [{ title: 'Messages deleted', description: `Deleted ${deleted.size} messages`, color: 0x95A5A6 }] });
      } else {
        const { EmbedBuilder } = require('discord.js');
        return interaction.followUp({ embeds: [ new EmbedBuilder().setTitle('Unknown command').setDescription('Unknown moderation subcommand').setColor(0xE74C3C) ], flags: 64 });
      }
    } catch (err){
      console.error('Moderation command error', err);
      const { EmbedBuilder } = require('discord.js');
      await interaction.followUp({ embeds: [ new EmbedBuilder().setTitle('Action failed').setDescription(err.message).setColor(0xE74C3C) ], flags: 64 });
    }
  }
};