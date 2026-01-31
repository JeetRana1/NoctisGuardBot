const { Events } = require('discord.js');
const webhook = require('../webhook');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        console.log(`Joined new guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
        try {
            // Recompute stats immediately when joining a new guild
            // This ensures the dashboard reflects the new server count and member count instantly
            if (webhook.reconcileAllGuilds) {
                // Trigger a full reconciliation which counts all guilds and members and notifies dashboard
                await webhook.reconcileAllGuilds();
            }
        } catch (e) {
            console.warn('Failed to update stats on guild join', e);
        }
    },
};
