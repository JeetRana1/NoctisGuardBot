const { SlashCommandBuilder } = require('discord.js');
const { generateInfoCard } = require('../../utils/image');

function formatDuration(ms){
  const secs = Math.floor(ms / 1000);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

module.exports = {
  plugin: 'info',
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show advanced bot uptime'),
  async execute(interaction){
    const client = interaction.client;
    const uptimeMs = client.uptime || (process.uptime() * 1000);
    const startedAtMs = Date.now() - uptimeMs;
    const startedAt = new Date(startedAtMs).toUTCString();

    const rows = [
      { label: 'Uptime', value: formatDuration(uptimeMs) },
      { label: 'Started', value: startedAt },
      { label: 'Node', value: process.version },
      { label: 'Memory (RSS)', value: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB` },
      { label: 'Guilds', value: `${client.guilds.cache.size}` },
      { label: 'Users (cached)', value: `${client.users.cache.size}` },
    ];

    const avatar = client.user.displayAvatarURL ? client.user.displayAvatarURL({ extension: 'png', size: 256 }) : null;
    const img = await generateInfoCard({ title: 'Bot Uptime', subtitle: `Running as ${client.user.tag}`, avatarUrl: avatar, rows, color: '#f97316' });
    return interaction.reply({ files: [{ attachment: img, name: 'uptime.png' }] });
  }
};