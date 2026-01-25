const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('../../levelingManager');

module.exports = {
  plugin: 'leveling',
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('View your or another user\'s level')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const res = await leveling.getLevel(interaction.client, interaction.guild.id, target.id);
    if (!res) {
      const embed = new EmbedBuilder().setTitle('No XP').setDescription(`${target.tag} has no recorded XP.`).setColor(0x95A5A6);
      return interaction.reply({ embeds: [embed] });
    }

    // get rank and required XP
    const rank = await leveling.getRank(interaction.guild.id, target.id) || 1;
    const required = await leveling._requiredXpFor(res.level);
    const progressRatio = required > 0 ? Math.max(0, Math.min(1, res.xp / required)) : 0;
    const barLen = 24;
    const filled = Math.round(progressRatio * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

    const avatar = target.displayAvatarURL ? target.displayAvatarURL({ extension: 'png', size: 128 }) : null;
    const { baseEmbed, BANNER_URL } = require('../../utils/embed');

    // try to generate a level card image and send as a file-only reply (ensures only the image shows)
    try{
      const { generateLevelCard } = require('../../utils/image');
      // request buffer instead of saving to disk to avoid filling the data folder
      const buf = await generateLevelCard({ username: target.username, discriminator: target.discriminator, avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }), level: res.level, xp: res.xp, required, rank, color: '#8b5cf6', bannerUrl: BANNER_URL, save: false });
      // send file-only with buffer attachment (no disk write)
      return interaction.reply({ files: [{ attachment: buf, name: 'levelcard.png' }] });
    } catch (e) {
      // log the error for debugging and fallback to simpler embed if image generation fails
      console.error('Level card generation failed for', target.id, e && e.stack ? e.stack : e);
      const embed = baseEmbed({
        title: `${target.tag} — Level ${res.level}`,
        color: 0x8B5CF6,
        thumbnail: avatar
      });
      embed.addFields({ name: 'Rank', value: `#${rank}`, inline: true },{ name: 'XP', value: `${res.xp}/${required}`, inline: true });
      embed.addFields({ name: 'Progress', value: `${bar} \n${Math.round(progressRatio*100)}%`, inline: false });
      return interaction.reply({ embeds: [embed] });
    }
  }
};