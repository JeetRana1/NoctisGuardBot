const moderation = require('./moderationManager');
const { generateWelcomeCard, generateByeCard } = require('./utils/image');
let _client = null;

function init(client){
  _client = client || _client;
  // ensure guild settings file exists by reading it (triggers file creation in moderation manager)
  try { moderation.getAllGuildSettings(); } catch (e) { /* ignore */ }
  console.log('Welcome manager initialized');
}


async function sendWelcome(member, opts = {}){
  try{
    const cfg = moderation.getGuildConfig(member.guild.id) || {};
    // determine channel: configured, provided, or fallback to system channel / first writable text channel
    let channelId = opts.channelId || cfg.welcomeChannelId || null;
    if (!channelId) channelId = member.guild.systemChannelId || null;

    // if still no channel, find first text channel we can send messages to
    if (!channelId){
      const ch = member.guild.channels.cache.find(c => {
        try{
          const perms = (typeof c.permissionsFor === 'function') ? c.permissionsFor(member.guild.members.me || member.client.user) : null;
          return c.isTextBased?.() && perms && typeof perms.has === 'function' && perms.has('ViewChannel') && perms.has('SendMessages');
        }catch(e){ return false; }
      });
      if (ch) channelId = ch.id;
    }

    if (!channelId){
      console.warn('No available channel for welcome message in guild', member.guild.id);
      return false;
    }

    const ch = await member.client.channels.fetch(channelId).catch(()=>null);
    if (!ch || !ch.isTextBased?.()){
      console.warn('Configured welcome channel not accessible:', channelId, 'for guild', member.guild.id);
      return false;
    }

    // ensure we have permission to send messages in this channel
    const botMember = member.guild?.members?.me || member.guild?.members?.cache?.get(member.client.user?.id) || null;
    const perms = (typeof ch.permissionsFor === 'function' && botMember) ? ch.permissionsFor(botMember) : null;
    if (!perms || typeof perms.has !== 'function' || !perms.has('SendMessages')){
      console.warn('sendWelcome: missing SendMessages permission in channel', channelId, 'for guild', member.guild.id);
      return false;
    }

    // build message (allow override via opts.message)
    const mention = `<@${member.user.id}>`;
    const template = (typeof opts.message === 'string') ? opts.message : (cfg.welcomeMessage || 'Welcome {mention} to {server}!');
    const message = template.replace(/\{mention\}/gi, mention).replace(/\{user\}/gi, member.user.username).replace(/\{server\}/gi, member.guild.name);

    // card should show a mention-like placeholder as requested (use mention text)
    const cardMessage = template.replace(/\{mention\}/gi, mention).replace(/\{user\}/gi, member.user.username).replace(/\{server\}/gi, member.guild.name);

    let img = null;
    try{
      img = await generateWelcomeCard({ username: member.user.username, discriminator: member.user.discriminator, avatarUrl: member.user.displayAvatarURL?.({ extension: 'png', size: 256 }), serverName: member.guild.name, message: cardMessage });
    } catch (e){
      console.warn('Failed to generate welcome card', e);
    }

    try{
      const allowed = (member && member.user && member.user.id) ? { users: [member.user.id] } : {};
      if (img) await ch.send({ content: message, files: [{ attachment: img, name: 'welcome.png' }], allowedMentions: allowed });
      else await ch.send({ content: message, allowedMentions: allowed });
    } catch (e){
      // Improve error logging and handle Missing Access gracefully
      if (e && e.code === 50001) {
        console.warn('Failed to send welcome message - Missing Access (403). Bot lacks permissions or cannot access channel', { guildId: member.guild.id, channelId, err: e.message });
      } else {
        console.warn('Failed to send welcome message', e);
      }
      return false;
    }

    console.log('Sent welcome message to', channelId, 'for', member.id);
    return true;
  }catch(e){ console.warn('sendWelcome failed', e); return false; }
}

async function sendBye(member, opts = {}){
  try{
    const cfg = moderation.getGuildConfig(member.guild.id) || {};
    let channelId = opts.channelId || cfg.byeChannelId || null;
    if (!channelId) channelId = member.guild.systemChannelId || null;

    if (!channelId){
      const chFound = member.guild.channels.cache.find(c => c.isTextBased?.() && c.permissionsFor(member.guild.members.me || member.client.user).has(['ViewChannel','SendMessages']));
      if (chFound) channelId = chFound.id;
    }

    if (!channelId){
      console.warn('No available channel for bye message in guild', member.guild.id);
      return false;
    }

    const ch = await member.client.channels.fetch(channelId).catch(()=>null);
    if (!ch || !ch.isTextBased?.()){
      console.warn('Configured bye channel not accessible:', channelId, 'for guild', member.guild.id);
      return false;
    }

    // Ensure we have permission to send
    const botMember = member.guild?.members?.me || member.guild?.members?.cache?.get(member.client.user?.id) || null;
    const perms = (typeof ch.permissionsFor === 'function' && botMember) ? ch.permissionsFor(botMember) : null;
    if (!perms || typeof perms.has !== 'function' || !perms.has('SendMessages')){
      console.warn('sendBye: missing SendMessages permission in channel', channelId, 'for guild', member.guild.id);
      return false;
    }

    const mention = `<@${member.user.id}>`;
    const msg = `${mention} has left ${member.guild.name}.`;
    const cardMessage = (cfg.byeMessage || 'Goodbye and good luck!').replace(/\{mention\}/gi, mention).replace(/\{user\}/gi, member.user.username).replace(/\{server\}/gi, member.guild.name);
    let img = null;
    try{ img = await generateByeCard({ username: member.user.username, discriminator: member.user.discriminator, avatarUrl: member.user.displayAvatarURL?.({ extension: 'png', size: 256 }), serverName: member.guild.name, message: cardMessage }); }catch(e){ console.warn('Failed to generate bye card', e);}    
    const allowed = (member && member.user && member.user.id) ? { users: [member.user.id] } : {};
    try{
      if (img) await ch.send({ content: msg, files: [{ attachment: img, name: 'bye.png' }], allowedMentions: allowed });
      else await ch.send({ content: msg, allowedMentions: allowed });
      console.log('Sent bye message to', channelId, 'for', member.user.id);
      return true;
    }catch(e){
      if (e && e.code === 50001){ console.warn('Failed to send bye message - Missing Access (403)', { guildId: member.guild.id, channelId, err: e.message }); }
      else { console.warn('sendBye failed', e); }
      return false;
    }
  }catch(e){ console.warn('sendBye failed', e); return false; }
}

module.exports = { init, sendWelcome, sendBye };
