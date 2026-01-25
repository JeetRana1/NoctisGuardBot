const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  plugin: 'admin',
  data: new SlashCommandBuilder()
    .setName('plugins')
    .setDescription('View or manage server plugin/command states')
    .addSubcommand(sc => sc.setName('view').setDescription('View plugin state for this server'))
    .addSubcommand(sc => sc.setName('set').setDescription('Enable or disable a plugin/command')
      .addStringOption(o => o.setName('plugin').setDescription('Plugin/command name').setRequired(true))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable = true, disable = false').setRequired(true)))
    .addSubcommand(sc => sc.setName('sync').setDescription('Fetch latest plugin state from the dashboard and apply'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    const webhook = require('../../webhook');

    // Defer reply for operations that may take time
    try { await interaction.deferReply({ ephemeral: true }); } catch (e) {}

    try {
      if (sub === 'view'){
        // Try to load current plugins
        let plugins = await webhook.getGuildPlugins(interaction.guild.id);
        if (!plugins){
          // Attempt to fetch from dashboard
          const ok = await webhook.fetchPluginStateFromDashboard(interaction.guild.id);
          plugins = await webhook.getGuildPlugins(interaction.guild.id);
          if (!plugins && !ok) {
            return interaction.editReply({ content: 'No plugin state found for this server.' });
          }
        }

        // Format result
        const keys = Object.keys(plugins || {});
        if (!keys || keys.length === 0) return interaction.editReply({ content: 'No plugins configured for this server.' });
        const lines = keys.map(k => `${plugins[k] ? '✅' : '❌'} **${k}**`).join('\n');
        const embed = new EmbedBuilder().setTitle(`Plugin state for ${interaction.guild.name}`).setDescription(lines).setColor(0x3498DB);
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'set'){
        const plugin = interaction.options.getString('plugin');
        const enabled = interaction.options.getBoolean('enabled');
        // persist change and queue command update
        const res = await webhook.setPluginState(interaction.guild.id, plugin, enabled);
        const status = (res.plugins && res.plugins[plugin]) ? 'enabled' : 'disabled';
        const embed = new EmbedBuilder().setTitle('Plugin updated').setDescription(`Plugin **${plugin}** is now **${status}** on this server.`).setColor(0x2ECC71);
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'sync'){
        const ok = await webhook.fetchPluginStateFromDashboard(interaction.guild.id);
        if (!ok) {
          const embed = new EmbedBuilder().setTitle('Sync failed').setDescription('Failed to fetch plugin state from the dashboard.').setColor(0xE74C3C);
          return interaction.editReply({ embeds: [embed] });
        }
        // queue update
        const res = await webhook.getGuildPlugins(interaction.guild.id);
        const gcu = require('../../guildCommandUpdater');
        const disabled = (res && Object.keys(res).filter(k => !res[k])) || [];
        gcu.queueUpdate(interaction.guild.id, disabled);
        gcu.runPending(interaction.client).catch(e=>console.warn('runPending failed', e));
        const embed = new EmbedBuilder().setTitle('Plugin sync').setDescription('Plugin state synced from dashboard and queued for application to commands.').setColor(0x3498DB);
        return interaction.editReply({ embeds: [embed] });
      }

      const unknown = new EmbedBuilder().setTitle('Unknown subcommand').setDescription('Unknown plugins subcommand').setColor(0xE74C3C);
      return interaction.editReply({ embeds: [unknown] });
    } catch (err){
      console.error('Plugins command error', err);
      const embed = new EmbedBuilder().setTitle('Error').setDescription(`Failed to perform action: ${String(err)}`).setColor(0xE74C3C);
      return interaction.editReply({ embeds: [embed] });
    }
  }
};