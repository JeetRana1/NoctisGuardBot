const { Events } = require('discord.js');
const webhook = require('../webhook');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild) {
        console.log(`Left guild: ${guild.name} (${guild.id})`);
        try {
            // Recompute stats immediately when leaving a guild
            if (webhook.reconcileAllGuilds) {
                await webhook.reconcileAllGuilds();
            }
        } catch (e) {
            console.warn('Failed to update stats on guild leave', e);
        }
    },
};
