const { Events } = require('discord.js');

const processedInteractions = new Set();

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    // dedupe interactions in-memory to avoid accidental double-handles
    if (processedInteractions.has(interaction.id)) return;
    processedInteractions.add(interaction.id);
    setTimeout(()=>processedInteractions.delete(interaction.id), 30_000);

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    // Check plugin/command enabled state
    try {
      const webhook = require('../webhook');
      const pluginName = command.plugin || (command.data && command.data.name) || interaction.commandName;
      if (interaction.guild && !webhook.isCommandEnabled(interaction.guild.id, pluginName)){
        const { EmbedBuilder } = require('discord.js');
        await interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Command disabled').setDescription('That command is disabled on this server.').setColor(0xF1C40F) ], ephemeral: true }).catch(()=>{});
        return;
      }
    } catch (e) { /* non-fatal if webhook module not available */ }


    try {
      await command.execute(interaction);

      // Log admin-restricted command usage automatically (if the command defines default_member_permissions)
      try {
        const moderation = require('../moderationManager');
        const cmdJson = command.data && command.data.toJSON ? command.data.toJSON() : null;
        if (cmdJson && cmdJson.default_member_permissions && interaction.guild) {
          // Create a log entry: type 'AdminCommand'
          moderation.logAction(interaction.client, interaction.guild.id, 'AdminCommand', interaction.user.id, interaction.user.id, `Used command: /${interaction.commandName}`, { command: interaction.commandName });
        }
      } catch (e) { console.warn('Failed to log admin command usage', e); }

    } catch (error) {
      console.error(error);
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder().setTitle('Error').setDescription('There was an error while executing this command!').setColor(0xE74C3C);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: 64 }).catch(()=>{});
      } else {
        await interaction.reply({ embeds: [embed], flags: 64 }).catch(()=>{});
      }
    }
  },
};