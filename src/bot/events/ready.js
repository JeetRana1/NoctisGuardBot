const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
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
      webhook.reconcileAllGuilds(client);
      try { webhook.startPoller && webhook.startPoller(client); console.log('Webhook poller started'); } catch (e) { console.warn('Failed to start webhook poller', e); }
      console.log('Webhook listener started and guilds reconciled');
    } catch (e) {
      console.error('Failed to start webhook listener:', e);
    }
  },
};
