// Minimal webhook receiver for plugin updates from the dashboard.
// Adapted to NoctisGuard project structure.

require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Use process.env.PORT as the primary source (standard for Koyeb/Render/Cloud hosts)
const PORT = process.env.PORT || process.env.BOT_WEBHOOK_PORT || 8000;
console.log(`[bot] Webhook server listening for health checks and dashboard on port ${PORT}`);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-me-to-a-secret';
const DASHBOARD_BASE = process.env.DASHBOARD_BASE || 'https://noctis-guard.vercel.app';
const PLUGINS_FILE = path.join(__dirname, '..', '..', 'data', 'bot-guild-config.json');
const ACTIVITY_FILE = path.join(__dirname, '..', '..', 'data', 'bot-activity.json');

async function loadActivityFile() {
  try { const raw = await fs.readFile(ACTIVITY_FILE, 'utf8'); return JSON.parse(raw || '[]'); } catch (e) { return []; }
}
async function saveActivityFile(arr) {
  try { await fs.mkdir(path.dirname(ACTIVITY_FILE), { recursive: true }); await fs.writeFile(ACTIVITY_FILE, JSON.stringify(arr, null, 2)); } catch (e) { console.warn('Failed to save activity file', e); }
}
async function appendActivity(entry) {
  try {
    const arr = await loadActivityFile();
    arr.unshift(entry);
    if (arr.length > 200) arr.splice(200);
    await saveActivityFile(arr);
  } catch (e) { console.warn('appendActivity failed', e); }
}

// Simple in-memory config (persisted to disk)
let guildConfig = {};
let _client = null;
let _server = null;

async function loadGuildConfig() {
  try {
    const raw = await fs.readFile(PLUGINS_FILE, 'utf8');
    guildConfig = JSON.parse(raw || '{}');
  } catch (e) { guildConfig = {}; }
}
async function saveGuildConfig() {
  try {
    await fs.mkdir(path.dirname(PLUGINS_FILE), { recursive: true });
    await fs.writeFile(PLUGINS_FILE, JSON.stringify(guildConfig, null, 2));
  } catch (e) { console.warn('Failed to save guild config', e); }
}

// Simple bot stats (kept in-memory and persisted to disk so dashboard can poll)
const BOT_STATS_FILE = path.join(__dirname, '..', '..', 'data', 'bot-stats.json');
let botStats = { guildCount: 0, totalMembers: 0, commandsToday: 0, uptimeStart: Date.now(), lastUpdated: Date.now(), history: [] };
async function loadBotStatsFile() {
  try {
    const raw = await fs.readFile(BOT_STATS_FILE, 'utf8');
    const obj = JSON.parse(raw || '{}');
    if (obj && typeof obj === 'object') {
      botStats = Object.assign(botStats, obj);
      // Ensure we always have an uptimeStart
      if (!botStats.uptimeStart) botStats.uptimeStart = Date.now();
      botStats.history = Array.isArray(obj.history) ? obj.history.slice(-48) : [];
    }
  } catch (e) { /* ignore when file missing */ }
}
async function saveBotStatsFile() {
  try {
    await fs.mkdir(path.dirname(BOT_STATS_FILE), { recursive: true });
    await fs.writeFile(BOT_STATS_FILE, JSON.stringify(botStats, null, 2), 'utf8');
  } catch (e) { console.warn('Failed to save bot stats file', e); }
}

// Helper: notify the dashboard server of events or stats updates so UI can be near-real-time
async function notifyDashboardEvent(payload) {
  try {
    if (!DASHBOARD_BASE) return;
    const base = DASHBOARD_BASE.replace(/\/$/, '');
    const url = base + '/bot-event';
    const headers = {};
    // Try to use any matching secret env var the user may have set
    headers['x-dashboard-secret'] = process.env.DASHBOARD_SECRET || process.env.BOT_NOTIFY_SECRET || process.env.WEBHOOK_SECRET || '';
    // best-effort post (don't throw on failure)
    const r = await axios.post(url, payload, { headers, timeout: 5000, validateStatus: () => true });
    if (r && r.status >= 200 && r.status < 300) {
      console.log('notifyDashboardEvent success', url, r.status);
    } else {
      // not fatal, but log for debugging
      console.warn('notifyDashboardEvent non-2xx', url, r && r.status, r && r.data);
    }
  } catch (e) { /* ignore errors, but log to help debugging */ console.warn('notifyDashboardEvent failed', e && e.message ? e.message : e); }
}

// increment helper: call from your command handler
function incrementCommands(by = 1) {
  try {
    botStats.commandsToday = (Number(botStats.commandsToday) || 0) + Number(by);
    botStats.lastUpdated = Date.now();
    botStats.history = botStats.history || [];
    botStats.history.push({ t: Date.now(), v: Number(botStats.commandsToday) || 0 });
    if (botStats.history.length > 48) botStats.history.shift();
    saveBotStatsFile().catch(() => { });
    // best-effort notify dashboard so UI can show near-real-time stats
    notifyDashboardEvent({ type: 'stats_update', stats: { commandsToday: botStats.commandsToday, guildCount: botStats.guildCount, totalMembers: botStats.totalMembers } });
  } catch (e) { console.warn('incrementCommands error', e); }
}

// Middleware to verify secret header
function verifySecret(req, res, next) {
  const h = req.header('x-dashboard-secret') || '';
  if (!WEBHOOK_SECRET || h !== WEBHOOK_SECRET) { return res.status(403).json({ error: 'Forbidden' }); }
  next();
}

// Webhook handler
// Webhook handler for gathering member presences
async function getPresencesForGuild(guildId) {
  const presences = [];
  try {
    if (_client && _client.guilds && _client.guilds.cache.has(guildId)) {
      const guild = _client.guilds.cache.get(guildId);

      // Verify intents (informational logging)
      const hasPresenceIntent = _client.options.intents & 256; // 1 << 8 is GuildPresences
      if (!hasPresenceIntent) {
        console.warn(`[bot] Bot is missing GuildPresences intent; member status will always be offline.`);
      }

      // 1. Check existing presence cache (fast)
      if (guild.presences && guild.presences.cache.size > 0) {
        guild.presences.cache.forEach((p, userId) => {
          presences.push({ id: userId, status: p.status || 'offline' });
        });
      }

      // 2. If cache is low, aggressively fetch members with presences
      // For dashboard use, we target a reasonable set of members to avoid huge 1000+ member fetches
      // We check < 10 to ensure we have at least a few statuses to show
      if (presences.length < 10) {
        try {
          // silenced log to reduce console noise unless there's a real issue
          // console.log(`[bot] Cache size low (${presences.length}); performing aggressive fetch for ${guildId}`);
          const members = await guild.members.fetch({ limit: 100, withPresences: true }).catch(() => null);
          if (members) {
            members.forEach(m => {
              const s = (m.presence && m.presence.status) ? m.presence.status : 'offline';
              if (!presences.find(p => p.id === m.id)) {
                presences.push({ id: m.id, status: s });
              }
            });
          }
        } catch (e) {
          console.warn(`[bot] Aggressive presence fetch failed for guild ${guildId}:`, e.message);
        }
      }

      if (presences.length === 0) {
        // Only log if we found absolutely nothing, which might indicate an intent issue
        console.warn(`[bot] No presences found for ${guildId} (Manager size: ${guild.presences ? guild.presences.cache.size : 'N/A'})`);
      }
      return presences;
    } else {
      console.log(`[bot] Guild ${guildId} not found in client cache for presence request.`);
    }
  } catch (e) { console.warn('Failed to gather presences for', guildId, e); }
  return null;
}

async function handleWebhook(req, res) {
  const { type, guildId, state, user, pluginId, config, action } = req.body || {};
  if (type === 'plugin_update' && guildId) {
    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].plugins = state || {};
    guildConfig[guildId].disabled = Object.keys(state || {}).filter(k => !state[k]);
    await saveGuildConfig();

    // Record activity by comparing against previous state
    const prevPlugins = (guildConfig[guildId] && guildConfig[guildId].plugins) || {};
    const newPlugins = state || {};

    // Find what changed
    const allKeys = new Set([...Object.keys(prevPlugins), ...Object.keys(newPlugins)]);
    for (const pid of allKeys) {
      const before = pid in prevPlugins ? !!prevPlugins[pid] : true;
      const after = pid in newPlugins ? !!newPlugins[pid] : true;
      if (before !== after) {
        await appendActivity({
          guildId,
          type: 'plugin_update',
          pluginId: pid,
          enabled: after,
          description: `${pid} ${after ? 'enabled' : 'disabled'}`,
          user,
          ts: Date.now()
        });
      }
    }

    // If bot is running and knows about the guild, reconcile runtime state here
    if (_client && _client.guilds && _client.guilds.cache.has(guildId)) {
      const g = _client.guilds.cache.get(guildId);
      try {
        const gcu = require('./guildCommandUpdater');
        gcu.queueUpdate(guildId, guildConfig[guildId].disabled);
        gcu.runPending(_client).catch(e => console.warn('[webhook] runPending error', e));
      } catch (e) {
        console.warn('[webhook] Failed to trigger command update', guildId, e);
      }
    }

    const presences = await getPresencesForGuild(guildId);

    console.log('Received plugin update for', guildId, guildConfig[guildId]);
    return res.json({ ok: true, presences });
  }

  // Support dashboard-driven plugin configuration updates (e.g., welcome/bye settings)
  if (type === 'plugin_config' && guildId) {
    const pluginId = req.body.pluginId || 'welcome';
    const cfg = req.body.config || {};
    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].config = guildConfig[guildId].config || {};
    guildConfig[guildId].config[pId] = cfg;
    await saveGuildConfig();

    await appendActivity({ guildId, type: 'plugin_config', pluginId: pId, description: `Configuration updated`, user, ts: Date.now() });

    // Apply configuration to runtime managers if available
    try {
      const moderation = require('./moderationManager');
      if (pluginId === 'welcome' && moderation && typeof moderation.setGuildConfig === 'function') {
        const changes = {};
        if (cfg.welcome && typeof cfg.welcome.channel !== 'undefined') changes.welcomeChannelId = cfg.welcome.channel || null;
        if (cfg.welcome && typeof cfg.welcome.message !== 'undefined') changes.welcomeMessage = cfg.welcome.message || null;
        if (cfg.bye && typeof cfg.bye.channel !== 'undefined') changes.byeChannelId = cfg.bye.channel || null;
        if (cfg.bye && typeof cfg.bye.message !== 'undefined') changes.byeMessage = cfg.bye.message || null;
        if (Object.keys(changes).length) moderation.setGuildConfig(guildId, changes);
        console.log('Applied welcome plugin config for', guildId, changes);
      }
    } catch (e) { console.warn('Failed to apply plugin_config for', guildId, e); }

    // Apply giveaway plugin config to giveaway manager if present
    try {
      const giveaway = require('./giveaways');
      if (pluginId === 'giveaway' || pluginId === 'giveaways') {
        const gconf = cfg.giveaway || cfg;
        if (typeof giveaway.setGuildDefaults === 'function') {
          giveaway.setGuildDefaults(guildId, gconf);
          console.log('Applied giveaway defaults to giveaway manager for', guildId);
        } else {
          if (!giveaway.configs) giveaway.configs = {};
          giveaway.configs[guildId] = gconf;
          console.log('Stored giveaway config in giveaway manager (fallback) for', guildId);
        }
      }
    } catch (e) { /* non-fatal */ console.warn('Failed to apply giveaway config to giveaways manager', e); }


    // return presences for dashboard convenience
    const presences = await getPresencesForGuild(guildId);
    return res.json({ ok: true, presences });
  }

  // Handle giveaway_action requests (list / reroll)
  if (type === 'giveaway_action' && guildId) {
    const action = req.body.action || null;
    const payload = req.body.payload || {};
    console.log('Received giveaway_action', { guildId, action, payload });
    try {
      const giveaways = require('./giveaways');
      if (action === 'list') {
        const list = giveaways.listForGuild(guildId) || [];
        // Normalize fields for dashboard (end time in seconds is easier for many frontends)
        const normalized = list.map(gw => ({
          id: gw.id,
          prize: gw.prize || null,
          channelId: gw.channelId || null,
          hostId: gw.hostId || null,
          winnerCount: gw.winnerCount || 1,
          ended: Boolean(gw.ended),
          endTimestampMs: gw.endTimestamp || null,
          endAt: gw.endTimestamp ? Math.floor(gw.endTimestamp / 1000) : null,
          messageId: gw.messageId || null,
          winners: gw.winners || [],
          requireRole: gw.requireRole || null,
        }));
        return res.json({ ok: true, giveaways: normalized });
      }
      if (action === 'reroll') {
        const gid = payload && payload.giveawayId;
        if (!gid) return res.status(400).json({ error: 'Missing giveawayId' });
        try {
          const winners = await giveaways.rerollGiveaway(gid);
          await appendActivity({ guildId, type: 'giveaway_reroll', pluginId: 'giveaway', description: `Giveaway rerolled (ID: ${gid})`, user, ts: Date.now() });
          return res.json({ ok: true, winners });
        } catch (e) { console.warn('Reroll failed', e); return res.status(500).json({ error: 'Reroll failed' }); }
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) { console.warn('Failed to process giveaway_action', e); return res.status(500).json({ error: 'Internal error' }); }
  }

  // Support test requests from the dashboard to send sample welcome/bye messages
  if (type === 'plugin_test' && guildId) {
    const pluginId = req.body.pluginId || 'welcome';
    const payload = req.body.payload || {};
    const testType = payload.testType || 'welcome';
    const userId = payload.userId || null;
    console.log(`[bot] Webhook plugin_test received for guild ${guildId} plugin ${pluginId} testType ${testType} user ${user ? user.username : 'unknown'}`);
    let didSend = false;

    await appendActivity({ guildId, type: 'plugin_test', pluginId, description: `Test executed: ${testType}`, user, ts: Date.now() });

    try {
      // welcome / bye tests
      const welcome = require('./welcomeManager');
      if (_client && _client.guilds && _client.guilds.cache.has(guildId)) {
        const guild = _client.guilds.cache.get(guildId);
        let member = null;
        if (userId) {
          try { member = await guild.members.fetch(userId).catch(() => null); } catch (e) { }
        }
        if (!member) { try { member = await guild.members.fetch(guild.ownerId).catch(() => null); } catch (e) { } }

        if (testType === 'welcome' && member && welcome && typeof welcome.sendWelcome === 'function') {
          didSend = await welcome.sendWelcome(member, { channelId: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.welcome && guildConfig[guildId].config.welcome.channel) ? guildConfig[guildId].config.welcome.channel : undefined, message: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.welcome && guildConfig[guildId].config.welcome.message) ? guildConfig[guildId].config.welcome.message : undefined });
        } else if (testType === 'bye') {
          const fake = member || { user: { id: '0', username: 'Test', tag: 'Test#0000' }, guild };
          if (welcome && typeof welcome.sendBye === 'function') {
            didSend = await welcome.sendBye(fake, { channelId: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.bye && guildConfig[guildId].config.bye.channel) ? guildConfig[guildId].config.bye.channel : undefined, message: (guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.bye && guildConfig[guildId].config.bye.message) ? guildConfig[guildId].config.bye.message : undefined });
          }
        }

        // giveaway test: create a short test giveaway using provided config or configured defaults
        if (pluginId === 'giveaway' || pluginId === 'giveaways' || testType === 'giveaway') {
          try {
            const giveaways = require('./giveaways');
            // initialize manager if needed
            if (giveaways.init && _client) try { giveaways.init(_client); } catch (e) { }
            // prefer explicit config in payload when provided (allows test-with-config without persisting first)
            const gconf = payload && payload.config ? (payload.config.giveaway || payload.config) : ((guildConfig[guildId] && guildConfig[guildId].config && guildConfig[guildId].config.giveaway) ? guildConfig[guildId].config.giveaway : (giveaways.getGuildDefaults ? giveaways.getGuildDefaults(guildId) : null));
            // pick a channel: config.channel -> systemChannel -> first available text channel
            let channelId = gconf && gconf.channel ? gconf.channel : null;
            if (!channelId && guild && guild.systemChannelId) channelId = guild.systemChannelId;
            if (!channelId && guild) { const ch = guild.channels.cache.find(c => c.isTextBased && c.permissionsFor && _client.user && c.permissionsFor(_client.user) && c.permissionsFor(_client.user).has && c.permissionsFor(_client.user).has('SendMessages')); if (ch) channelId = ch.id; }
            const prize = (gconf && gconf.prize) ? gconf.prize : 'Test prize';
            // convert duration (assumed minutes) to ms; accept seconds if value > 1000
            let durationMs = 30_000;
            if (gconf && typeof gconf.duration !== 'undefined') {
              const n = Number(gconf.duration);
              if (!isNaN(n)) {
                durationMs = (n > 1000) ? n : (n * 60_000); // if user provided large number assume milliseconds
              }
            }
            const winnerCount = (gconf && gconf.winnerCount) ? gconf.winnerCount : 1;
            const hostId = (guild && guild.ownerId) ? guild.ownerId : (guild && guild.members && guild.members.cache && guild.members.cache.first() && guild.members.cache.first().id) || null;
            // normalize channel id to bare digits
            if (channelId) { const m = String(channelId).match(/(\d{17,19})/); if (m) channelId = m[1]; }
            console.log('Creating giveaway with', { guildId, channelId, prize, durationMs, winnerCount, hostId, gconf });
            if (channelId) {
              const created = await giveaways.createGiveaway({ guildId, channelId, prize, durationMs, winnerCount, hostId }); didSend = true; // return created giveaway in response so dashboard can show it immediately
              if (created) {
                // try to resolve creator's display name synchronously when possible
                try {
                  if (hostId && _client) { const u = await _client.users.fetch(hostId).catch(() => null); if (u) created.creatorName = u.username + (u.discriminator ? ('#' + u.discriminator) : ''); }
                } catch (e) { /* ignore */ }
                // attach to response body if we will return it below
                req._createdGiveaway = created;
              }
            }
          } catch (e) { console.warn('Failed to create giveaway test', e); }
        }
      }
    } catch (e) { console.warn('Failed to execute plugin_test for', guildId, e); }

    const presences = await getPresencesForGuild(guildId);
    // include created giveaway from a plugin_test if one was produced so callers (dashboard) can act on it immediately
    const created = req._createdGiveaway || null;
    const out = { ok: true, didSend: !!didSend, presences };
    if (created) out.giveaway = created;
    return res.json(out);
  }

  // Unknown request type - return a 400 instead of hanging the socket
  console.warn('Webhook received unknown or unhandled request type', req.body);
  return res.status(400).json({ error: 'Bad request' });
}

// Optional: fetch plugin state from the dashboard
async function fetchPluginStateFromDashboard(guildId) {
  try {
    // Try the internal authenticated endpoint first (safer for server-to-server)
    const headers = {};
    if (process.env.WEBHOOK_SECRET) headers['x-dashboard-secret'] = process.env.WEBHOOK_SECRET;
    const internalUrl = `${DASHBOARD_BASE.replace(/\/$/, '')}/internal/server-plugins/${encodeURIComponent(guildId)}`;
    try {
      const res = await axios.get(internalUrl, { timeout: 5000, headers, validateStatus: () => true });
      if (res.status >= 200 && res.status < 300 && res.data && res.data.state) {
        const dashboardState = res.data.state || {};
        const hasExisting = guildConfig[guildId] && guildConfig[guildId].plugins && Object.keys(guildConfig[guildId].plugins).length > 0;

        // Safety: If dashboard returns empty but bot has state, it might be a cold start / data loss on dashboard side.
        // Don't overwrite bot's truth with dashboard's emptiness unless bot has nothing.
        if (Object.keys(dashboardState).length === 0 && hasExisting) {
          console.log(`[bot] Dashboard state fetch for ${guildId} returned empty, but bot has local state. Skipping overwrite to prevent data loss.`);
          return true;
        }

        guildConfig[guildId] = guildConfig[guildId] || {};
        guildConfig[guildId].plugins = dashboardState;
        guildConfig[guildId].disabled = Object.keys(dashboardState).filter(k => !dashboardState[k]);
        console.log(`[bot] Synchronized plugin state from dashboard for ${guildId}. Status: ${res.status}, Count: ${Object.keys(dashboardState).length}`);
        await saveGuildConfig();
        return true;
      }
    } catch (e) { /* fall back to public endpoint */ console.warn('[bot] Internal plugin fetch failed, falling back:', e?.message || e); }

    // Fall back to the public endpoint (requires dashboard auth; may 401)
    const publicRes = await axios.get(`${DASHBOARD_BASE}/api/server-plugins/${encodeURIComponent(guildId)}`, { timeout: 5000, withCredentials: true });
    if (publicRes?.data?.state) {
      guildConfig[guildId] = guildConfig[guildId] || {};
      guildConfig[guildId].plugins = publicRes.data.state || {};
      guildConfig[guildId].disabled = Object.keys(publicRes.data.state || {}).filter(k => !publicRes.data.state[k]);
      await saveGuildConfig();
      return true;
    }
  } catch (e) { console.warn('Failed to fetch plugin state for', guildId, e?.message || e); }
  return false;
}

// Reconcile all guilds (e.g., on startup)
async function reconcileAllGuilds(client) {
  _client = client || _client;
  await loadGuildConfig();
  for (const [id, g] of client.guilds.cache) {
    if (!guildConfig[id] || !guildConfig[id].plugins) {
      await fetchPluginStateFromDashboard(id);
    }
    try {
      const gcu = require('./guildCommandUpdater');
      const disabled = (guildConfig[id] && guildConfig[id].disabled) || [];
      gcu.queueUpdate(id, disabled);
    } catch (e) {
      console.warn('Failed to queue command update for guild during reconcile', id, e);
    }
  }

  // Trigger a single batch run after all guilds are queued
  try {
    const gcu = require('./guildCommandUpdater');
    gcu.runPending(client).catch(e => console.warn('[bot] Reconcile runPending error', e));
  } catch (e) { }
  // Push initial stats to dashboard after reconciliation
  try {
    const liveStats = {
      guildCount: client.guilds.cache.size,
      totalMembers: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0),
      commandsToday: botStats.commandsToday || 0
    };
    console.log('Pushing initial stats to dashboard during reconcile:', liveStats);
    notifyDashboardEvent({ type: 'stats_update', stats: liveStats });
  } catch (e) {
    console.warn('Failed to push initial stats during reconcile', e);
  }
}

// Start webhook listener
function startWebhookListener(client) {
  _client = client || _client;
  // Attach real-time event listeners on the Discord client so we can notify the dashboard immediately
  try {
    if (client && !client._dashboardHandlersAttached) {
      client.on('guildCreate', (g) => {
        try {
          botStats.guildCount = (typeof botStats.guildCount === 'number') ? (botStats.guildCount + 1) : 1;
          // try to capture member count at join time if available
          const memberCount = (typeof g.memberCount === 'number') ? Number(g.memberCount) : null;
          if (memberCount !== null && typeof botStats.totalMembers === 'number') {
            botStats.totalMembers = Number(botStats.totalMembers) + memberCount;
          }
          botStats.lastUpdated = Date.now();
          saveBotStatsFile().catch(() => { });
          // Notify dashboard of join and also send updated aggregate stats so dashboard can update totalMembers immediately
          notifyDashboardEvent({ type: 'guild_joined', guildId: String(g.id), memberCount: memberCount });
          notifyDashboardEvent({ type: 'stats_update', stats: { guildCount: botStats.guildCount, totalMembers: botStats.totalMembers } });
        } catch (e) { console.warn('guildCreate handler error', e); }
      });
      client.on('guildDelete', (g) => {
        try {
          const memberCount = (typeof g.memberCount === 'number') ? Number(g.memberCount) : null;
          botStats.guildCount = (typeof botStats.guildCount === 'number' && botStats.guildCount > 0) ? (botStats.guildCount - 1) : 0;
          if (memberCount !== null && typeof botStats.totalMembers === 'number') { botStats.totalMembers = Math.max(0, Number(botStats.totalMembers) - memberCount); }
          botStats.lastUpdated = Date.now(); saveBotStatsFile().catch(() => { });
          notifyDashboardEvent({ type: 'guild_left', guildId: String(g.id), memberCount: memberCount });
          // also push updated aggregate stats so dashboard can update totalMembers immediately
          notifyDashboardEvent({ type: 'stats_update', stats: { guildCount: botStats.guildCount, totalMembers: botStats.totalMembers } });
        } catch (e) { console.warn('guildDelete handler error', e); }
      });
      client._dashboardHandlersAttached = true;
    }
  } catch (e) { console.warn('Failed to attach dashboard client handlers', e); }

  // If the webhook HTTP server is already running, don't try to start another — just return the server.
  if (_server) { return _server; }

  const app = express();
  app.use(express.json());
  app.post('/webhook', verifySecret, handleWebhook);

  // Public health endpoint (no secret required) for Koyeb/Uptime checks
  app.get('/health', (req, res) => {
    return res.json({ status: 'online', timestamp: Date.now() });
  });

  // Plugin state endpoint: allows dashboard to fetch truth from bot if dashboard data is lost
  app.get('/webhook/plugin-state/:guildId', verifySecret, async (req, res) => {
    const guildId = req.params.guildId;
    await loadGuildConfig();
    const config = guildConfig[guildId] || {};
    return res.json({ guildId, state: config.plugins || {} });
  });

  // Activity endpoint: returns recent activities for a guild
  app.get('/webhook/activity/:guildId', verifySecret, async (req, res) => {
    const guildId = req.params.guildId;
    const all = await loadActivityFile();
    const filtered = all.filter(a => a.guildId === guildId).slice(0, 50);
    return res.json({ guildId, activity: filtered });
  });

  // Presence endpoint: returns cached presences for a guild (requires bot to have GUILD_MEMBERS and GUILD_PRESENCES intents)
  app.get('/presences/:guildId', verifySecret, async (req, res) => {
    const guildId = req.params.guildId;
    try {
      const presences = await getPresencesForGuild(guildId);
      if (!presences) return res.status(404).json({ error: 'Guild not found or bot not in guild' });
      return res.json({ guildId, presences });
    } catch (e) { console.warn('Presence endpoint error', e); return res.status(500).json({ error: 'Failed to get presences' }); }
  });

  // Stats endpoints for dashboard polling: GET /stats (public) and POST /stats (protected)
  app.get('/stats', async (req, res) => {
    try {
      // compute live if client attached
      let live = { guildCount: botStats.guildCount, totalMembers: botStats.totalMembers, commandsToday: botStats.commandsToday };
      try { if (_client && _client.guilds && _client.guilds.cache) { live.guildCount = _client.guilds.cache.size; let tm = 0; _client.guilds.cache.forEach(g => { tm += (g.memberCount || 0); }); live.totalMembers = tm; } } catch (e) { }
      // compute uptime hours from uptimeStart
      const uptimeMs = Date.now() - (botStats.uptimeStart || Date.now());
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const out = { ok: true, stats: Object.assign({}, live, { uptimeHours: uptimeHours, lastUpdated: botStats.lastUpdated }) };
      return res.json(out);
    } catch (e) { console.warn('GET /stats failed', e); return res.status(500).json({ error: 'Failed to get stats' }); }
  });

  app.post('/stats', verifySecret, async (req, res) => {
    try {
      const body = req.body || {};
      if (typeof body.commandsToday === 'number') botStats.commandsToday = body.commandsToday;
      if (typeof body.guildCount === 'number') botStats.guildCount = body.guildCount;
      if (typeof body.totalMembers === 'number') botStats.totalMembers = body.totalMembers;
      botStats.lastUpdated = Date.now();
      botStats.history = botStats.history || []; botStats.history.push({ t: Date.now(), v: Number(botStats.commandsToday) || 0 }); if (botStats.history.length > 48) botStats.history.shift();
      saveBotStatsFile().catch(() => { });
      return res.json({ ok: true, stats: botStats });
    } catch (e) { console.warn('POST /stats failed', e); return res.status(500).json({ error: 'Failed to update stats' }); }
  });

  // Provide member resolution endpoints so the dashboard can ask the bot directly (requires the dashboard to call with x-dashboard-secret)
  app.get('/guild-members/:guildId', verifySecret, async (req, res) => {
    const guildId = req.params.guildId;
    const limit = Math.min(200, parseInt(req.query.limit || '25', 10));
    try {
      if (!_client || !_client.guilds || !_client.guilds.cache.has(guildId)) return res.status(404).json({ error: 'Guild not found or bot not in guild' });
      const guild = _client.guilds.cache.get(guildId);
      try { await guild.members.fetch({ limit }).catch(() => null); } catch (e) { }
      const members = [];
      guild.members.cache.forEach(m => {
        if (m && m.user) { members.push({ id: m.user.id, username: m.user.username, discriminator: m.user.discriminator, avatar: m.user.avatar }); }
      });
      return res.json({ guildId, members: members.slice(0, limit) });
    } catch (e) { console.warn('Failed to fetch guild members via bot', e); return res.status(500).json({ error: 'Failed to fetch guild members' }); }
  });

  app.get('/guild-member/:guildId/:memberId', verifySecret, async (req, res) => {
    const { guildId, memberId } = req.params;
    try {
      if (!_client || !_client.guilds || !_client.guilds.cache.has(guildId)) return res.status(404).json({ error: 'Guild not found or bot not in guild' });
      const guild = _client.guilds.cache.get(guildId);
      try {
        const member = await guild.members.fetch(memberId).catch(() => null);
        if (!member || !member.user) return res.status(404).json({ error: 'Member not found' });
        const u = member.user;
        return res.json({ guildId, member: { id: u.id, username: u.username, discriminator: u.discriminator, avatar: u.avatar } });
      } catch (e) { console.warn('Failed to fetch guild member via bot', e); return res.status(500).json({ error: 'Failed to fetch guild member' }); }
    } catch (e) { console.warn('Unhandled error in guild-member', e); return res.status(500).json({ error: 'Internal error' }); }
  });

  // Provide plugin state for the dashboard to use as a fallback when its own file system is ephemeral (e.g. Vercel)
  app.get('/internal/server-plugins/:guildId', verifySecret, async (req, res) => {
    const guildId = req.params.guildId;
    const config = guildConfig[guildId] || {};
    return res.json({ guildId, state: config.plugins || {} });
  });

  // Recompute authoritative stats from the bot's cache and notify dashboard (protected)
  app.post('/internal/recompute-stats', verifySecret, async (req, res) => {
    try {
      let guildCount = 0;
      let totalMembers = 0;
      if (_client && _client.guilds && _client.guilds.cache) {
        guildCount = _client.guilds.cache.size;
        _client.guilds.cache.forEach(g => { totalMembers += (g.memberCount || 0); });
      }
      botStats.guildCount = Number(guildCount);
      botStats.totalMembers = Number(totalMembers);
      botStats.lastUpdated = Date.now();
      saveBotStatsFile().catch(() => { });
      // Notify dashboard so it can update immediately
      notifyDashboardEvent({ type: 'stats_update', stats: { guildCount: botStats.guildCount, totalMembers: botStats.totalMembers } });
      console.log('Recomputed stats:', { guildCount: botStats.guildCount, totalMembers: botStats.totalMembers });
      return res.json({ ok: true, stats: { guildCount: botStats.guildCount, totalMembers: botStats.totalMembers } });
    } catch (e) { console.warn('Recompute stats failed', e); return res.status(500).json({ error: 'Failed to recompute stats' }); }
  });

  _server = app.listen(PORT, () => console.log(`Bot webhook listening on ${PORT}`));
  return _server;
}

// Returns true if the given command/plugin is enabled for the guild (defaults to enabled)
function isCommandEnabled(guildId, commandName) {
  const g = guildConfig[guildId];
  if (!g) return true;
  if (g.plugins && Object.prototype.hasOwnProperty.call(g.plugins, commandName)) {
    return Boolean(g.plugins[commandName]);
  }
  if (Array.isArray(g.disabled)) {
    return !g.disabled.includes(commandName);
  }
  return true;
}

// Set a single plugin state for a guild and persist
async function setPluginState(guildId, pluginName, enabled) {
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

async function getGuildPlugins(guildId) {
  await loadGuildConfig();
  if (guildConfig[guildId] && guildConfig[guildId].plugins) return guildConfig[guildId].plugins;
  return null;
}

module.exports = { startWebhookListener, fetchPluginStateFromDashboard, reconcileAllGuilds, guildConfig, isCommandEnabled, setPluginState, getGuildPlugins, incrementCommands };
