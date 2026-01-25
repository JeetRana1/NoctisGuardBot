const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { generateInfoCard } = require('../../utils/image');

module.exports = {
  plugin: 'info',
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show advanced info about a user')
    .addUserOption(o => o.setName('user').setDescription('User to view').setRequired(false)),
  async execute(interaction){
    const target = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(()=>null) : null;

    const created = target.createdAt ? target.createdAt.toUTCString() : 'N/A';
    const joined = member && member.joinedAt ? member.joinedAt.toUTCString() : 'N/A';
    const roles = member ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.name).slice(0, 10).join(', ') : 'N/A';
    const status = member && member.presence && member.presence.status ? member.presence.status : 'offline';

    const rows = [
      { label: 'ID', value: target.id },
      { label: 'Tag', value: `${target.tag}` },
      { label: 'Bot', value: target.bot ? 'Yes' : 'No' },
      { label: 'Created', value: created },
      { label: 'Joined', value: joined },
      { label: 'Status', value: status },
      { label: 'Roles', value: roles || 'None' },
    ];

    const avatar = target.displayAvatarURL ? target.displayAvatarURL({ extension: 'png', size: 256 }) : null;
    const imgBuf = await generateInfoCard({ title: target.username, subtitle: `${target.discriminator}`, avatarUrl: avatar, rows, color: '#60a5fa', status });

    return interaction.reply({ files: [{ attachment: imgBuf, name: 'userinfo.png' }] });
  }
};