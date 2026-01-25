#!/usr/bin/env node
(async()=>{
  try{
    const { generateLevelUpCard } = require('../src/bot/utils/image');
    console.log('Generating level-up sample...');
    const buf = await generateLevelUpCard({ username: 'SampleUser', discriminator: '0001', avatarUrl: 'https://i.imgur.com/AfFp7pu.png', level: 10, color: '#8b5cf6', message: 'Reached 10 — keep going!' });
    const out = require('path').join(process.cwd(), 'data', 'generated', 'levelup-sample.png');
    require('fs').writeFileSync(out, buf);
    console.log('Wrote sample to', out);
  }catch(e){ console.error('Generation failed', e && e.stack ? e.stack : e); process.exit(1); }
})();