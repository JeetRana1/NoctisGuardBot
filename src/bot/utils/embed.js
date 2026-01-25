require('dotenv').config();
const { EmbedBuilder } = require('discord.js');

const APP_NAME = process.env.APP_NAME || 'NoctisGuard';
const APP_ICON = process.env.APP_ICON_URL || null;
const BANNER_URL = process.env.LEVEL_BANNER_URL || null; // optional banner image for level embeds

function baseEmbed({ title, description, color = 0x3498DB, fields = [], thumbnail = null, image = null, timestamp = true } = {}){
  const e = new EmbedBuilder();
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  e.setColor(color);
  if (fields && fields.length) e.addFields(...fields);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (image) e.setImage(image);
  if (timestamp) e.setTimestamp();
  e.setFooter({ text: APP_NAME, iconURL: APP_ICON || undefined });
  return e;
}

// Create a bare image-only embed without a color (avoids the left color bar)
function imageEmbed({ image = null, timestamp = false } = {}){
  const e = new EmbedBuilder();
  if (image) e.setImage(image);
  if (timestamp) e.setTimestamp();
  e.setFooter({ text: APP_NAME, iconURL: APP_ICON || undefined });
  return e;
}

function successEmbed(title, description){ return baseEmbed({ title, description, color: 0x2ECC71 }); }
function errorEmbed(title, description){ return baseEmbed({ title, description, color: 0xE74C3C }); }

module.exports = { baseEmbed, successEmbed, errorEmbed, APP_NAME, APP_ICON, BANNER_URL };