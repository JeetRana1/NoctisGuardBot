const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { generateInfoCard } = require('../../utils/image');

module.exports = {
  plugin: 'info',
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show advanced info about this server'),
  async execute(interaction){
    const g = interaction.guild;
    if (!g) return interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });

    // Gather details
    const owner = await g.fetchOwner().catch(()=>null);
    // try to fetch some members for presence counts (best-effort)
    try{ await g.members.fetch({ limit: 100 }); }catch(e){}
    const online = g.members.cache.filter(m => (m.presence && m.presence.status) ? m.presence.status !== 'offline' : false).size;
    const created = g.createdAt ? g.createdAt.toUTCString() : 'N/A';

    const rows = [
      { label: 'ID', value: g.id },
      { label: 'Owner', value: owner ? `${owner.user.tag}` : 'Unknown' },
      { label: 'Members', value: `${g.memberCount} (online: ${online})` },
      { label: 'Created', value: created },
      { label: 'Roles', value: `${g.roles.cache.size}` },
      { label: 'Channels', value: `${g.channels.cache.size}` },
      { label: 'Boosts', value: `${g.premiumSubscriptionCount || 0}` },
    ];

    const imgBuf = await generateInfoCard({ title: g.name, subtitle: `${g.id}`, avatarUrl: g.iconURL ? g.iconURL({ extension: 'png', size: 256 }) : null, bannerUrl: g.bannerURL ? g.bannerURL({ extension: 'png' }) : null, rows, color: '#2dd4bf' });

    return interaction.reply({ files: [{ attachment: imgBuf, name: 'serverinfo.png' }] });
  }
};