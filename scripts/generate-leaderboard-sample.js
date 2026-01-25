#!/usr/bin/env node
(async()=>{
  try{
    const sample = [
      {id:'1', username:'Alice', discriminator:'0001', avatarUrl:'https://i.imgur.com/AfFp7pu.png', level:7, xp:51, required:695, rank:1},
      {id:'2', username:'Bob', discriminator:'0002', avatarUrl:'https://i.imgur.com/AfFp7pu.png', level:5, xp:220, required:55100, rank:2},
      {id:'3', username:'Carol', discriminator:'0003', avatarUrl:'https://i.imgur.com/AfFp7pu.png', level:3, xp:30, required:300, rank:3}
    ];
    const { generateLeaderboardImage } = require('../src/bot/utils/image');
    console.log('Generating leaderboard sample...');
    const buf = await generateLeaderboardImage(sample, { color: '#8b5cf6' });
    const out = require('path').join(process.cwd(), 'data', 'generated', 'leaderboard-sample.png');
    require('fs').writeFileSync(out, buf);
    console.log('Wrote sample to', out);
  }catch(e){ console.error('Generation failed', e && e.stack ? e.stack : e); process.exit(1); }
})();
