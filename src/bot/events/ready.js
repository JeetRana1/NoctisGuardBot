const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    // Set bot presence to show the Vercel URL
    try {
      client.user.setActivity('noctis-guard.vercel.app', { type: ActivityType.Watching });
      console.log('[bot] Presence set to Watching noctis-guard.vercel.app');
    } catch (e) {
      console.warn('[bot] Failed to set presence:', e);
    }
    try {
      const giveaways = require('../giveaways');
      giveaways.init(client);
      console.log('Giveaways initialized');
    } catch (e) {
      console.error('Failed to init giveaways:', e);
    }

    try {
      const mod = require('../moderationManager');
      mod.init(client);
    } catch (e) {
      console.error('Failed to init moderation manager:', e);
    }

    try {
      const welcome = require('../welcomeManager');
      welcome.init(client);
    } catch (e) {
      console.error('Failed to init welcome manager:', e);
    }

    try {
      const leveling = require('../levelingManager');
      leveling.init(client);
      console.log('Leveling manager initialized');
    } catch (e) {
      console.error('Failed to init leveling manager:', e);
    }

    try {
      const gcu = require('../guildCommandUpdater');
      gcu.init(client);
      console.log('Guild command updater initialized');
    } catch (e) {
      console.error('Failed to init guild command updater:', e);
    }

    try {
      const webhook = require('../webhook');
      webhook.startWebhookListener(client);
      console.log('Webhook health-check server started on port 8000');

      // Clear global commands (only use guild commands to allow per-server toggling)
      // Leftover global commands often cause "ghost" commands that stay visible even when disabled.
      (async () => {
        try {
          const globalCmds = await client.application.commands.fetch();
          if (globalCmds.size > 0) {
            console.log(`[bot] Found ${globalCmds.size} global commands. Clearing them to favor guild-specific commands...`);
            await client.application.commands.set([]);
            console.log('[bot] Global commands cleared.');
          }
        } catch (e) { console.warn('[bot] Failed to clear global commands:', e.message); }

        // Now start the heavier reconciliation
        await webhook.reconcileAllGuilds(client);
        console.log('Webhook listener guilds reconciled');
      })();
    } catch (e) {
      console.error('Failed to start webhook listener:', e);
    }
  },
};