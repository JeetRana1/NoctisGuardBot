// Minimal webhook receiver for plugin updates from the dashboard.
// Adapted to NoctisGuard project structure.

require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const PORT = process.env.BOT_WEBHOOK_PORT || 4000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-me-to-a-secret';
const DASHBOARD_BASE = process.env.DASHBOARD_BASE || 'http://localhost:3000';
const PLUGINS_FILE = path.join(__dirname, '..', '..', 'data', 'bot-guild-config.json');

// Simple in-memory config (persisted to disk)
let guildConfig = {};
let _client = null;
let _server = null;

async function loadGuildConfig(){
  try{
    const raw = await fs.readFile(PLUGINS_FILE, 'utf8');
    guildConfig = JSON.parse(raw || '{}');
  }catch(e){ guildConfig = {}; }
}
async function saveGuildConfig(){
  try{
    await fs.mkdir(path.dirname(PLUGINS_FILE), { recursive: true });
    await fs.writeFile(PLUGINS_FILE, JSON.stringify(guildConfig, null, 2));
  }catch(e){ console.warn('Failed to save guild config', e); }
}

// Middleware to verify secret header
function verifySecret(req, res, next){
  const h = req.header('x-dashboard-secret') || '';
  if (!WEBHOOK_SECRET || h !== WEBHOOK_SECRET){ return res.status(403).json({ error: 'Forbidden' }); }
  next();
}

// Webhook handler
async function getPresencesForGuild(guildId){
  const presences = [];
  try{
    if (_client && _client.guilds && _client.guilds.cache.has(guildId)){
      const guild = _client.guilds.cache.get(guildId);
      // best-effort: fetch some members into cache
      try{ await guild.members.fetch({ limit: 100 }); }catch(e){ /* ignore fetch errors */ }
      guild.members.cache.forEach(m => {
        presences.push({ id: m.id, status: (m.presence && m.presence.status) ? m.presence.status : 'offline' });
      });
      return presences;
    }
  }catch(e){ console.warn('Failed to gather presences for', guildId, e); }
  return null;
}

async function handleWebhook(req, res){
  const { type, guildId, state } = req.body || {};
  if (type === 'plugin_update' && guildId){
    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].plugins = state || {};
    guildConfig[guildId].disabled = Object.keys(state || {}).filter(k => !state[k]);
    await saveGuildConfig();

    // If bot is running and knows about the guild, reconcile runtime state here
    if (_client && _client.guilds && _client.guilds.cache.has(guildId)){
      const g = _client.guilds.cache.get(guildId);
      // Queue an update for the guild commands so disabled commands are removed
      try {
        const gcu = require('./guildCommandUpdater');
        gcu.queueUpdate(guildId, guildConfig[guildId].disabled);
        // try to run pending updates immediately (best-effort)
        gcu.runPending(_client).catch(e => console.warn('Failed to run pending command updates', e));
      } catch (e) {
        console.warn('Failed to queue command update for guild', guildId, e);
      }
    }

    const presences = await getPresencesForGuild(guildId);

    console.log('Received plugin update for', guildId, guildConfig[guildId]);
    return res.json({ ok: true, presences });
  }

  // Support dashboard-driven plugin configuration updates (e.g., welcome/bye settings)
  if (type === 'plugin_config' && guildId){
    const pluginId = req.body.pluginId || 'welcome';
    const cfg = req.body.config || {};
    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].config = guildConfig[guildId].config || {};
    guildConfig[guildId].config[pluginId] = cfg;
    await saveGuildConfig();

    // Apply configuration to runtime managers if available
    try{
      const moderation = require('./moderationManager');
      if (pluginId === 'welcome' && moderation && typeof moderation.setGuildConfig === 'function'){
        const changes = {};
        if (cfg.welcome && typeof cfg.welcome.channel !== 'undefined') changes.welcomeChannelId = cfg.welcome.channel || null;
        if (cfg.welcome && typeof cfg.welcome.message !== 'undefined') changes.welcomeMessage = cfg.welcome.message || null;
        if (cfg.bye && typeof cfg.bye.channel !== 'undefined') changes.byeChannelId = cfg.bye.channel || null;
        if (cfg.bye && typeof cfg.bye.message !== 'undefined') changes.byeMessage = cfg.bye.message || null;
        if (Object.keys(changes).length) moderation.setGuildConfig(guildId, changes);
        console.log('Applied welcome plugin config for', guildId, changes);
      }
    }catch(e){ console.warn('Failed to apply plugin_config for', guildId, e); }

    // return presences for dashboard convenience
    const presences = await getPresencesForGuild(guildId);
    return res.json({ ok: true, presences });
  }

  // Support test requests from the dashboard to send sample welcome/bye messages
  if (type === 'plugin_test' && guildId){
    const pluginId = req.body.pluginId || 'welcome';
    const payload = req.body.payload || {};
    const testType = payload.testType || 'welcome';
    const userId = payload.userId || null;

    let didSend = false;
    try{
      const welcome = require('./welcomeManager');
      if (_client && _client.guilds && _client.guilds.cache.has(guildId)){
        const guild = _client.guilds.cache.get(guildId);
        let member = null;
        if (userId){ try{ member = await guild.members.fetch(userId).catch(()=>null); }catch(e){}
        }
        if (!member){ try{ member = await guild.members.fetch(guild.ownerId).catch(()=>null); }catch(e){} }

        if (testType === 'welcome' && member && welcome && typeof welcome.sendWelcome === 'function'){
          didSend = await welcome.sendWelcome(member, { channelId: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.welcome && guildConfig[guildId].config.welcome.channel) ? guildConfig[guildId].config.welcome.channel : undefined, message: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.welcome && guildConfig[guildId].config.welcome.message) ? guildConfig[guildId].config.welcome.message : undefined });
        } else if (testType === 'bye'){
          const fake = member || { user: { id: '0', username: 'Test', tag: 'Test#0000' }, guild };
          if (welcome && typeof welcome.sendBye === 'function'){
            didSend = await welcome.sendBye(fake, { channelId: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.bye && guildConfig[guildId].config.bye.channel) ? guildConfig[guildId].config.bye.channel : undefined, message: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.bye && guildConfig[guildId].config.bye.message) ? guildConfig[guildId].config.bye.message : undefined });
          }
        }
      }
    }catch(e){ console.warn('Failed to execute plugin_test for', guildId, e); }

    const presences = await getPresencesForGuild(guildId);
    return res.json({ ok: true, didSend: !!didSend, presences });
  }

  return res.status(400).json({ error: 'Bad request' });
}

// Optional: fetch plugin state from the dashboard
async function fetchPluginStateFromDashboard(guildId){
  try{
    // Try the internal authenticated endpoint first (safer for server-to-server)
    const headers = {};
    if (process.env.WEBHOOK_SECRET) headers['x-dashboard-secret'] = process.env.WEBHOOK_SECRET;
    const internalUrl = `${DASHBOARD_BASE.replace(/\/$/, '')}/internal/server-plugins/${encodeURIComponent(guildId)}`;
    try{
      const res = await axios.get(internalUrl, { timeout: 5000, headers, validateStatus: () => true });
      if (res.status >= 200 && res.status < 300 && res.data?.state){
        guildConfig[guildId] = guildConfig[guildId] || {};
        guildConfig[guildId].plugins = res.data.state || {};
        guildConfig[guildId].disabled = Object.keys(res.data.state || {}).filter(k => !res.data.state[k]);
        await saveGuildConfig();
        return true;
      }
    }catch(e){ /* fall back to public endpoint */ console.warn('Internal plugin fetch failed, falling back:', e?.message || e); }

    // Fall back to the public endpoint (requires dashboard auth; may 401)
    const publicRes = await axios.get(`${DASHBOARD_BASE}/api/server-plugins/${encodeURIComponent(guildId)}`, { timeout: 5000, withCredentials: true });
    if (publicRes?.data?.state){
      guildConfig[guildId] = guildConfig[guildId] || {};
      guildConfig[guildId].plugins = publicRes.data.state || {};
      guildConfig[guildId].disabled = Object.keys(publicRes.data.state || {}).filter(k => !publicRes.data.state[k]);
      await saveGuildConfig();
      return true;
    }
  }catch(e){ console.warn('Failed to fetch plugin state for', guildId, e?.message || e); }
  return false;
}

// Reconcile all guilds (e.g., on startup)
async function reconcileAllGuilds(client){
  _client = client || _client;
  await loadGuildConfig();
  for (const [id, g] of client.guilds.cache){
    if (!guildConfig[id] || !guildConfig[id].plugins){
      await fetchPluginStateFromDashboard(id);
    }
    // Queue an update for the guild commands so disabled commands are removed
    try {
      const gcu = require('./guildCommandUpdater');
      const disabled = (guildConfig[id] && guildConfig[id].disabled) || [];
      gcu.queueUpdate(id, disabled);
      gcu.runPending(client).catch(e => console.warn('Failed to run pending command updates', e));
    } catch (e) {
      console.warn('Failed to queue command update for guild during reconcile', id, e);
    }
  }
}

// Start webhook listener
function startWebhookListener(client){
  _client = client || _client;
  const app = express();
  app.use(express.json());
  app.post('/webhook', verifySecret, handleWebhook);

  // Health endpoint: accessible from localhost or with valid secret header
  app.get('/webhook/health', (req, res) => {
    // Normalize IPv4-mapped IPv6 addresses
    const ipRaw = (req.ip || (req.connection && req.connection.remoteAddress) || '').replace('::ffff:', '');
    const x = req.header('x-dashboard-secret') || '';
    const allowedLocal = ipRaw === '127.0.0.1' || ipRaw === '::1' || x === WEBHOOK_SECRET;
    if (!allowedLocal) return res.status(403).json({ ok: false, error: 'Forbidden' });
    return res.json({ ok: true, port: PORT, secretSet: !!process.env.WEBHOOK_SECRET });
  });

  // Presence endpoint: returns cached presences for a guild (requires bot to have GUILD_MEMBERS and GUILD_PRESENCES intents)
  app.get('/presences/:guildId', verifySecret, async (req, res) => {
    const guildId = req.params.guildId;
    try{
      const presences = await getPresencesForGuild(guildId);
      if (!presences) return res.status(404).json({ error: 'Guild not found or bot not in guild' });
      return res.json({ guildId, presences });
    }catch(e){ console.warn('Presence endpoint error', e); return res.status(500).json({ error: 'Failed to get presences' }); }
  });

  _server = app.listen(PORT, () => console.log(`Bot webhook listening on ${PORT}`));
  return _server;
}

// Returns true if the given command/plugin is enabled for the guild (defaults to enabled)
function isCommandEnabled(guildId, commandName){
  const g = guildConfig[guildId];
  if (!g) return true;
  if (g.plugins && Object.prototype.hasOwnProperty.call(g.plugins, commandName)){
    return Boolean(g.plugins[commandName]);
  }
  if (Array.isArray(g.disabled)){
    return !g.disabled.includes(commandName);
  }
  return true;
}

// Set a single plugin state for a guild and persist
async function setPluginState(guildId, pluginName, enabled){
  await loadGuildConfig();
  guildConfig[guildId] = guildConfig[guildId] || {};
  guildConfig[guildId].plugins = guildConfig[guildId].plugins || {};
  guildConfig[guildId].plugins[pluginName] = Boolean(enabled);
  // derive disabled list
  guildConfig[guildId].disabled = Object.keys(guildConfig[guildId].plugins || {}).filter(k => !guildConfig[guildId].plugins[k]);
  await saveGuildConfig();

  // Queue and attempt a guild command update
  try {
    const gcu = require('./guildCommandUpdater');
    gcu.queueUpdate(guildId, guildConfig[guildId].disabled);
    gcu.runPending(_client).catch(e => console.warn('Failed to run pending command updates', e));
  } catch (e) {
    console.warn('Failed to queue command update for guild', guildId, e);
  }
  return guildConfig[guildId];
}

async function getGuildPlugins(guildId){
  await loadGuildConfig();
  if (guildConfig[guildId] && guildConfig[guildId].plugins) return guildConfig[guildId].plugins;
  return null;
}

module.exports = { startWebhookListener, fetchPluginStateFromDashboard, reconcileAllGuilds, guildConfig, isCommandEnabled, setPluginState, getGuildPlugins };
