#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { generateLevelCard } = require('../src/bot/utils/image');

// Usage: node scripts/generate-level-sample.js [username] [level] [xp] [required] [rank] [color]
// Example: node scripts/generate-level-sample.js "TinTz" 7 51 695 1 "#38bdf8"

const argv = process.argv.slice(2);
const username = argv[0] || 'SampleUser';
const level = parseInt(argv[1], 10) || 7;
const xp = parseInt(argv[2], 10) || 51;
const required = parseInt(argv[3], 10) || 695;
const rank = parseInt(argv[4], 10) || 1;
const color = argv[5] || process.env.LEVEL_ACCENT || '#38bdf8';
const bannerUrl = process.env.LEVEL_BANNER_URL || null;

(async () => {
  try {
    console.log('Generating sample level card...');
    const out = await generateLevelCard({ username, discriminator: '0000', avatarUrl: 'https://i.imgur.com/AfFp7pu.png', level, xp, required, rank, color, bannerUrl });
    console.log('Sample generated:', out);
    console.log('\nOpen the file to preview the level card.');
  } catch (e) {
    console.error('Failed to generate sample:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
