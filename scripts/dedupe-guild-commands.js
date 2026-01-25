require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

(async function(){
  try{
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const appId = process.env.CLIENT_ID;
    if (!appId) throw new Error('CLIENT_ID not set in env');

    // List of guilds to dedupe; you can add more guild IDs here or fetch from your bot client
    const guilds = ['934267446980935690','1336111006644047964'];

    for (const guildId of guilds){
      console.log('\nChecking guild', guildId);
      const cmds = await rest.get(Routes.applicationGuildCommands(appId, guildId));
      const groups = {};
      for (const c of cmds){
        groups[c.name] = groups[c.name] || [];
        groups[c.name].push(c);
      }

      let deleted = 0;
      for (const [name, group] of Object.entries(groups)){
        if (group.length <= 1) continue;
        console.log('Found duplicate command', name, 'count', group.length);
        // Keep the most recently created command if possible (ids are snowflakes, higher = newer)
        group.sort((a,b)=> (BigInt(b.id) - BigInt(a.id))); // descending, highest first
        const keep = group[0];
        const remove = group.slice(1);
        for (const r of remove){
          await rest.delete(Routes.applicationGuildCommand(appId, guildId, r.id));
          console.log('  Deleted duplicate', r.id, r.name);
          deleted++;
        }
        console.log('  Kept', keep.id);
      }
      if (deleted === 0) console.log('  No duplicates found');
      else console.log('  Deleted', deleted, 'duplicates');
    }

    console.log('\nDedupe complete');
    process.exit(0);
  }catch(e){
    console.error('Dedupe failed', e && (e.message || e));
    process.exit(1);
  }
})();