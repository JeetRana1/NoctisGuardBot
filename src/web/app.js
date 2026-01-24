require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fetch = global.fetch || require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('src/web/public'));
app.use(express.json());

// Session -- in-memory store for demo only
const isProd = process.env.NODE_ENV === 'production';
app.use(session({
  store: new FileStore({ path: './data/sessions', retries: 1 }),
  secret: process.env.SESSION_SECRET || 'replace_this_in_prod',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60, sameSite: isProd ? 'none' : 'lax', secure: isProd }
}));

// CORS for frontend callback (allow Vercel and localhost by default, override with ALLOWED_ORIGINS)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://noctis-guard.vercel.app,http://localhost:3000').split(',').map(s=>s.trim());
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.sendStatus(204);
  }
  return next();
});


// Simple in-memory last-request (for demo). In production, forward to the bot process.
let lastRequest = { song: null };

app.post('/api/play', (req, res) => {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Invalid query' });
  lastRequest.song = query;
  console.log('Received play request:', query);
  return res.json({ status: 'ok', message: `Requested: ${query}` });
});

app.post('/api/next', (req, res) => {
  console.log('Received next request');
  return res.json({ status: 'ok', message: 'Skipped to next (demo)' });
});

app.post('/api/previous', (req, res) => {
  console.log('Received previous request');
  return res.json({ status: 'ok', message: 'Moved to previous (demo)' });
});

app.get('/invite', (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Invite NoctisGuard</title>
      <!-- Using system fonts to avoid external requests -->
      <link rel="stylesheet" href="/style.css">
      <link rel="icon" href="/img/Sitelogo.svg" type="image/svg+xml">
    </head>
    <body>
      <main class="container" style="padding:80px 20px;text-align:center">
        <h1 class="section-title">Invite NoctisGuard</h1>
        <p class="section-lead">Bring NoctisGuard to your server to enable robust moderation and useful utilities.</p>
        <div style="margin-top:20px">
          <a href="/invite-now" class="btn primary large">Invite NoctisGuard</a>
        </div>
      </main>
    </body>
    </html>
  `);
});

// Direct invite endpoint: redirect to Discord invite (one-click)
app.get('/invite-now', (req, res) => {
  const clientId = process.env.CLIENT_ID || '1463677793761230874';
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
  return res.redirect(url);
});

// OAuth: login -> redirect to Discord authorize (intermediate page)
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  // compute redirect URI from current request so it matches the server address
  const redirectUri = process.env.OAUTH_REDIRECT || `${req.protocol}://${req.get('host')}/callback`;
  const needReauth = req.query.reauth === '1';

  // Basic checks and helpful instructions
  if (!clientId || !clientSecret) {
    return res.send(`
      <html><head><title>OAuth configuration required</title><link rel="stylesheet" href="/style.css"><link rel="icon" href="/img/Sitelogo.svg?v=2" type="image/svg+xml"><link rel="shortcut icon" href="/img/Sitelogo.svg?v=2"></head>
      <body style="padding:40px;font-family:Arial, sans-serif;color:#fff;background:#000"><div class="container">
      <h1>OAuth configuration required</h1>
      <p>Set <code>CLIENT_ID</code> and <code>CLIENT_SECRET</code> in your <code>.env</code> file. You can find these in the Discord Developer Portal under your application.</p>
      <p>After setting them, restart the server and try again.</p>
      </div></body></html>
    `);
  }

  // Render the intermediate login page (keeps existing behavior)
  const state = Math.random().toString(36).slice(2);
  req.session.oauth_state = state;
  const scope = 'identify%20guilds';
  const promptParam = needReauth ? '&prompt=consent' : '';
  const url = `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}${promptParam}&state=${state}`;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).send('Session error');
    }
    return res.send(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login</title>
        <link rel="stylesheet" href="/style.css"><link rel="icon" href="/img/Sitelogo.svg?v=2" type="image/svg+xml"><link rel="shortcut icon" href="/img/Sitelogo.svg?v=2"></head>
        <body>
          <main class="container" style="padding:60px 20px;text-align:center">
            <h2 class="section-title">Continue with Discord</h2>
            <p class="section-lead">You will be redirected to Discord to sign in and grant permissions.</p>
            <div style="margin-top:20px">
              ${needReauth ? '<p style="color:var(--muted);margin-bottom:12px">We need you to re-authorize with access to your servers. Click sign-in and accept the permissions to view and manage servers.</p>' : ''}
              <a href="${url}" class="btn primary large">Sign in with Discord</a>
            </div>
            <div style="margin-top:24px;color:var(--muted)">
              <p>If you get a 400 error from Discord, make sure the redirect URI <code>${redirectUri}</code> is listed in your application settings (Developer Portal → OAuth2 → Redirects).</p>
              <p>Also ensure <code>CLIENT_ID</code> and <code>CLIENT_SECRET</code> are set in your <code>.env</code>.</p>
            </div>
          </main>
        </body>
      </html>
    `);
  });
});

// Direct auth endpoint: create state and immediately redirect to Discord (one-click login)
app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT || `${req.protocol}://${req.get('host')}/callback`;
  const needReauth = req.query.reauth === '1';

  if (!clientId || !clientSecret) return res.redirect('/login');

  const state = Math.random().toString(36).slice(2);
  req.session.oauth_state = state;
  const scope = 'identify%20guilds';
  const promptParam = needReauth ? '&prompt=consent' : '';
  const url = `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}${promptParam}&state=${state}`;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).send('Session error');
    }
    return res.redirect(url);
  });
});

// OAuth callback - exchange code for tokens and fetch guilds
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  // Debug info
  console.log('OAuth callback state:', state, 'session state:', req.session && req.session.oauth_state);
  if (!state || state !== req.session.oauth_state) return res.status(400).send('Invalid state');

  try {
    // dynamically compute redirect URI so it matches what was used when starting the flow
    const redirectUri = process.env.OAUTH_REDIRECT || `${req.protocol}://${req.get('host')}/callback`;
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });
    const tokenJson = await tokenRes.json();
    if (tokenJson.error) {
      console.error('Token error', tokenJson);
      return res.status(400).send('Token error');
    }
    const accessToken = tokenJson.access_token;

    // fetch user guilds
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } });
    const guilds = await guildsRes.json();

    // fetch user info so we can persist user id in the session
    let userInfo = {};
    try {
      const ures = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (ures.ok) userInfo = await ures.json();
    } catch (e) { console.warn('Failed to fetch user info', e); }

    req.session.guilds = guilds;
    req.session.user = { accessToken, id: userInfo.id, username: userInfo.username };

    // Ensure session is persisted before redirecting so the dashboard can read guilds immediately
    req.session.save((err) => {
      if (err) { console.error('Session save failed after OAuth callback', err); }
      return res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('OAuth callback error', err);
    return res.status(500).send('OAuth callback failed');
  }
});

// OAuth callback via POST (for static hosting or cross-origin flows)
// Accepts { code, state, redirectUri } in JSON body. Tries to exchange code and create session, then returns JSON
app.post('/callback', async (req, res) => {
  const { code, state, redirectUri } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    // Validate redirectUri if provided
    const allowedRedirects = (process.env.ALLOWED_REDIRECTS || 'https://noctis-guard.vercel.app,http://localhost:3000').split(',').map(s=>s.trim());
    const computedRedirect = redirectUri || process.env.OAUTH_REDIRECT || `${req.protocol}://${req.get('host')}/callback`;
    if (redirectUri && !allowedRedirects.includes(redirectUri)) {
      console.warn('Rejected unallowed redirectUri', redirectUri);
      return res.status(400).json({ error: 'Redirect URI not allowed' });
    }

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: computedRedirect
      })
    });
    const tokenJson = await tokenRes.json();
    if (tokenJson.error) {
      console.error('Token error', tokenJson);
      return res.status(400).json({ error: 'Token error', detail: tokenJson });
    }
    const accessToken = tokenJson.access_token;

    // fetch user guilds
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } });
    const guilds = await guildsRes.json();

    let userInfo = {};
    try { const ures = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } }); if (ures.ok) userInfo = await ures.json(); } catch (e) { console.warn('Failed to fetch user info', e); }

    req.session.guilds = guilds;
    req.session.user = { accessToken, id: userInfo.id, username: userInfo.username };

    req.session.save((err) => {
      if (err) console.error('Session save failed after OAuth callback (POST)', err);
      if (req.get('accept') && req.get('accept').includes('application/json')) {
        return res.json({ ok: true, redirect: '/dashboard' });
      } else {
        return res.redirect('/dashboard');
      }
    });

  } catch (err) {
    console.error('OAuth callback error (POST)', err);
    return res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// dashboard route - requires login
app.get('/dashboard', async (req, res) => {
  let guilds = req.session.guilds || [];

  // If there are no guilds in session but we have an access token, try to refetch
  if ((!guilds || guilds.length === 0) && req.session.user && req.session.user.accessToken) {
    try {
      const refetch = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${req.session.user.accessToken}` } });
      if (refetch.ok) {
        const json = await refetch.json();
        guilds = json || [];
        req.session.guilds = guilds;
        // persist session file
        req.session.save(()=>{});
      } else {
        const body = await refetch.text().catch(()=>'<no body>');
        console.warn('Refetch guilds failed:', refetch.status, body);
      }
    } catch (err) {
      console.error('Refetch guilds error:', err);
    }
  }

  // If still no guilds after refetch, do NOT force immediate re-auth. Instead show a refresh CTA so the user only re-auths if they explicitly choose to.
  if ((!guilds || guilds.length === 0)) {
    console.log('No guilds found after refetch; rendering refresh prompt to user (no forced redirect)');
    return res.send(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Dashboard — No servers found</title>
        <link rel="stylesheet" href="/style.css">
        <link rel="icon" href="/img/Sitelogo.svg?v=2" type="image/svg+xml">
        <link rel="shortcut icon" href="/img/Sitelogo.svg?v=2">
        <style>.center{max-width:720px;margin:80px auto;text-align:center}</style>
      </head>
      <body>
        <main class="container">
          <div class="center">
            <h2 class="section-title">No servers found</h2>
            <p class="section-lead">We could not find any servers where you are the owner or have Manage Server / Administrator permissions.</p>
            <p style="margin-top:18px">
              <button id="btn-refresh" class="btn primary">Refresh guild list</button>
              <a href="/login?reauth=1" class="btn ghost">Sign in again (re-consent)</a>
              <a href="/logout" class="btn ghost">Sign out</a>
            </p>
            <p style="margin-top:12px;color:var(--muted);font-size:0.95rem">Tip: If you recently joined a server, give it a moment. Use <code>Refresh guild list</code> to try again without re-signing.</p>
          </div>
        </main>
        <script>
          document.getElementById('btn-refresh').addEventListener('click', async () => {
            const btn = document.getElementById('btn-refresh'); btn.disabled = true; btn.textContent = 'Refreshing...';
            try {
              const r = await fetch('/api/refresh-guilds');
              if (!r.ok) { alert('Refresh failed'); return; }
              const j = await r.json();
              if (j.needLogin) { alert('Please sign in first.'); location.href='/login'; return; }
              if (j.needReauth) { if (confirm('We still could not read your guilds. Re-signing in may be required. Re-auth now?')) { location.href='/login?reauth=1'; } else { btn.disabled=false; btn.textContent='Refresh guild list'; } return; }
              // success — reload to show guilds
              location.reload();
            } catch (err) { console.error(err); alert('Refresh failed'); }
            finally{ try{btn.disabled=false;btn.textContent='Refresh guild list';}catch(e){} }
          });
        </script>
      </body>
      </html>
    `);
  }

  // show only guilds where the user is owner or has Administrator or Manage Server permission
  const allowed = guilds.filter(g => {
    try {
      if (g.owner) return true;
      const perms = BigInt(g.permissions || '0');
      const ADMIN = 0x8n; // Administrator bit
      const MANAGE_GUILD = 0x20n; // Manage Server
      return ((perms & (ADMIN | MANAGE_GUILD)) !== 0n);
    } catch (e) {
      return false;
    }
  });

  const rows = guilds.map(g => {
    const isAllowed = allowed.some(a => a.id === g.id);
    return `\n        <div class="guild-card${isAllowed ? '' : ' disabled'}">\n          <img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon || 'a_none'}.png" alt="${g.name}" onerror="this.src='/img/placeholder.svg'">\n          <h4>${g.name}</h4>\n          <p>${g.id}</p>\n          ${isAllowed ? `<a class="btn ghost btn-setup" href="/setup/${g.id}">Setup</a>` : `<span style="color:var(--muted);font-size:0.9rem">No access</span>`}\n        </div>`
  }).join('\n');

  console.log('Dashboard - total guilds:', guilds.length, 'allowed:', allowed.length);

  res.send(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Dashboard</title>
      <link rel="stylesheet" href="/style.css">
      <link rel="icon" href="/img/Sitelogo.svg?v=2" type="image/svg+xml">
      <link rel="shortcut icon" href="/img/Sitelogo.svg?v=2">
      <style>.logout{position:fixed;right:20px;top:18px}</style>
    </head>
    <body>
      <header style="padding:18px 20px;display:flex;align-items:center;gap:12px">
        <a class="brand" href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit">
          <img src="/img/Sitelogo.svg?v=2" alt="NoctisGuard" width="36" height="36" style="display:inline-block">
          <span style="font-weight:700">NoctisGuard</span>
        </a>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center"><a href="/" class="btn ghost">Home</a><a href="/logout" class="btn ghost logout">Logout</a></div>
      </header>
      <main class="container dashboard-main">
        <h3>Servers you can manage</h3>
        <p class="section-lead">Total: ${guilds.length} — Visible: ${allowed.length}</p>
        <div class="guild-grid">
          ${rows || '<p>No servers found where you are owner or have Administrator permission.</p>'}
        </div>

      <script>
        // Update 'Setup' buttons to 'Continue' when bot is present in the guild
        (async function(){
          const els = document.querySelectorAll('.guild-card');
          for (const el of els){
            const a = el.querySelector('.btn-setup');
            if (!a) continue;
            // derive guild id from href like /setup/<guildId>
            const href = a.getAttribute('href') || '';
            const parts = href.split('/'); const gid = parts[parts.length - 1];
            if (!gid) continue;
            try {
              const r = await fetch('/api/guilds/' + gid + '/botjoined');
              if (!r.ok) continue;
              const j = await r.json();
              if (j.botJoined){ a.textContent = 'Continue'; a.classList.remove('ghost'); a.classList.add('primary'); }
            } catch (e){ /* ignore */ }
          }
        })();
      </script>

      </main>
    </body>
    </html>
  `);
});

app.get('/logout', (req, res) => { req.session.destroy(()=>res.redirect('/')); });

// Debug route to inspect session guilds (local only)
app.get('/debug/guilds', (req, res) => {
  const guilds = req.session.guilds || [];
  const allowed = guilds.filter(g => {
    try {
      if (g.owner) return true;
      const perms = BigInt(g.permissions || '0');
      const ADMIN = 0x8n; // Administrator bit
      return (perms & ADMIN) === ADMIN;
    } catch (e) {
      return false;
    }
  });
  return res.json({ total: guilds.length, allowed: allowed.length, guilds: guilds.map(g => ({ id: g.id, name: g.name, owner: g.owner, permissions: g.permissions })) });
});

// API: attempt to refresh guilds using stored access token without forcing re-consent
app.get('/api/refresh-guilds', async (req, res) => {
  if (!req.session.user || !req.session.user.accessToken) return res.json({ needLogin: true });
  try {
    const r = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${req.session.user.accessToken}` } });
    if (!r.ok) {
      const body = await r.text().catch(()=>'<no body>');
      console.warn('Refresh guilds fetch failed:', r.status, body);
      return res.status(500).json({ error: 'Fetch failed', status: r.status });
    }
    const json = await r.json();
    req.session.guilds = json || [];
    await new Promise(s=>req.session.save(s));
    const total = req.session.guilds.length;
    const allowedCount = (req.session.guilds || []).filter(g => {
      try { if (g.owner) return true; const perms = BigInt(g.permissions || '0'); const ADMIN = 0x8n; const MANAGE_GUILD = 0x20n; return ((perms & (ADMIN | MANAGE_GUILD)) !== 0n); } catch (e) { return false; }
    }).length;
    return res.json({ ok: true, total, allowedCount, needReauth: total === 0 });
  } catch (err) {
    console.error('Refresh guilds error', err);
    return res.status(500).json({ error: 'error' });
  }
});

// In-memory guild settings (demo). Use a database in production.
const guildSettings = {};

// Giveaways APIs
app.get('/api/guilds/:guildId/giveaways', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const giveaways = require('../bot/giveaways');
  return res.json({ giveaways: giveaways.listForGuild(guildId) });
});

app.post('/api/guilds/:guildId/giveaways', async (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const { prize, duration, winners, channelId, requireRole } = req.body || {};
  if (!prize || !duration || !winners) return res.status(400).json({ error: 'Invalid payload' });
  // parse duration like 1h, 30m
  const m = (''+duration).match(/(\d+)([smhd])/);
  if (!m) return res.status(400).json({ error: 'Invalid duration' });
  const num = parseInt(m[1]);
  let ms = 0;
  switch (m[2]) { case 's': ms = num*1000; break; case 'm': ms = num*60*1000; break; case 'h': ms = num*60*60*1000; break; case 'd': ms = num*24*60*60*1000; break; }
  try {
    const giveaways = require('../bot/giveaways');
    let targetChannelId = channelId;
    if (!targetChannelId) {
      // try to find a default text channel using bot token
      const token = process.env.DISCORD_TOKEN;
      if (token) {
        try {
          const chRes = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${token}` } });
          if (chRes.ok) {
            const chs = await chRes.json();
            const textCh = chs.find(c => c.type === 0 || c.type === 5); // 0 text, 5 announcement
            if (textCh) targetChannelId = textCh.id;
          }
        } catch (e) { /* ignore */ }
      }
    }
    if (!targetChannelId) return res.status(400).json({ error: 'No channel specified and no default channel found' });

    try {
      const gw = await giveaways.createGiveaway({ guildId, channelId: targetChannelId, prize, durationMs: ms, winnerCount: winners, hostId: req.session.user?.id || 'web' , requireRole });
      return res.json({ status: 'ok', giveaway: gw });
    } catch (err) {
      console.error('Create giveaway failed (primary), will try to persist for watcher', err);
      // Fallback: persist giveaway directly so the watcher or next startup posts it
      try {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const endTimestamp = Date.now() + ms;
        const gw = { id, guildId, channelId: targetChannelId, prize, endTimestamp, winnerCount: winners, hostId: req.session.user?.id || 'web', requireRole, ended: false, messageId: null, winners: [] };
        // append to file
        const dataPath = path.join(process.cwd(), 'data', 'giveaways.json');
        let arr = [];
        try { if (fs.existsSync(dataPath)) arr = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]'); } catch (e) { arr = []; }
        arr.push(gw);
        fs.writeFileSync(dataPath, JSON.stringify(arr, null, 2), 'utf8');
        return res.json({ status: 'ok', giveaway: gw, note: 'queued' });
      } catch (e) {
        console.error('Fallback persist failed', e);
        return res.status(500).json({ error: 'Create failed' });
      }
    }

  } catch (err) {
    console.error('Create giveaway failed', err);
    return res.status(500).json({ error: 'Create failed' });
  }
});

app.post('/api/guilds/:guildId/giveaways/:id/end', async (req, res) => {
  const guildId = req.params.guildId; const id = req.params.id;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  try { const giveaways = require('../bot/giveaways'); await giveaways.endGiveaway(id); return res.json({ status: 'ok' }); } catch (err){ console.error(err); return res.status(500).json({ error: 'End failed' }); }
});

app.post('/api/guilds/:guildId/giveaways/:id/reroll', async (req, res) => {
  const guildId = req.params.guildId; const id = req.params.id;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  try { const giveaways = require('../bot/giveaways'); const winners = await giveaways.rerollGiveaway(id); return res.json({ status: 'ok', winners }); } catch (err){ console.error(err); return res.status(500).json({ error: 'Reroll failed' }); }
});

// API: get or set guild settings (persisted)
const fs = require('fs'); const path = require('path'); const guildSettingsFile = path.join(process.cwd(), 'data', 'guildSettings.json');
function ensureSettings(){ try{ fs.mkdirSync(path.dirname(guildSettingsFile), { recursive: true }); }catch(e){} if(!fs.existsSync(guildSettingsFile)) fs.writeFileSync(guildSettingsFile, JSON.stringify({})); }
function readSettings(){ ensureSettings(); try{return JSON.parse(fs.readFileSync(guildSettingsFile,'utf8')||'{}');}catch(e){return {};}}
function writeSettings(obj){ ensureSettings(); fs.writeFileSync(guildSettingsFile, JSON.stringify(obj,null,2)); }

// Update the guild-specific registered slash commands to hide disabled ones
async function updateGuildCommands(guildId, disabledCommands) {
  try {
    const commandsPath = path.join(process.cwd(), 'src', 'bot', 'commands');
    if (!fs.existsSync(commandsPath)) return { ok: false, error: 'Commands directory not found' };
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    const cmds = [];
    for (const file of files) {
      const filePath = path.join(commandsPath, file);
      // clear require cache so changes are picked up
      try { delete require.cache[require.resolve(filePath)]; } catch (e) {}
      const command = require(filePath);
      if (!command || !command.data) continue;
      const name = command.data.name;
      if (Array.isArray(disabledCommands) && disabledCommands.includes(name)) continue;
      cmds.push(command.data.toJSON());
    }

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    if (!token || !clientId) return { ok: false, error: 'Missing DISCORD_TOKEN or CLIENT_ID in web server environment' };
    console.log(`Updating guild ${guildId} commands: registering ${cmds.length} commands (disabled: ${JSON.stringify(disabledCommands||[])})`);

    // Retry loop for registering commands to handle 429 rate limits gracefully
    let registerOk = false; let registerAttempt = 0; let registerBackoff = 500; let registerLastError = null; let registerLastRetryAfter = null; const registerMaxRetries = 5;
    while (registerAttempt < registerMaxRetries) {
      registerAttempt++;
      try {
        const r = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
          method: 'PUT',
          headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(cmds),
        });
        if (r.ok) { registerOk = true; console.log(`Successfully updated commands for guild ${guildId} (attempt ${registerAttempt})`); break; }
        // Handle rate limit (429)
        if (r.status === 429) {
          let body = {};
          try { body = await r.json(); } catch(e) { /* ignore */ }
          const retryAfter = body && body.retry_after ? (body.retry_after * 1000) : (r.headers.get('retry-after') ? parseFloat(r.headers.get('retry-after')) * 1000 : registerBackoff);
          registerLastRetryAfter = retryAfter;
          console.warn(`Rate limited registering commands for guild ${guildId}, retry_after=${retryAfter}ms (attempt ${registerAttempt})`);
          await new Promise(res => setTimeout(res, retryAfter));
          registerBackoff *= 2;
          continue;
        }
        registerLastError = await r.text().catch(()=>'<no-body>');
        console.warn('Failed to update guild commands', r.status, registerLastError);
        break;
      } catch (e) {
        registerLastError = String(e);
        console.warn('Error registering guild commands', e);
        await new Promise(res => setTimeout(res, registerBackoff));
        registerBackoff *= 2;
      }
    }

    if (!registerOk) {
      const errMsg = registerLastError || 'Unknown error while registering commands';
      console.warn(`Giving up registering commands for guild ${guildId}: ${errMsg}`);
      return { ok: false, error: `Failed registering commands: ${errMsg}`, rateLimited: !!registerLastRetryAfter, retryAfter: registerLastRetryAfter };
    }

    // Fetch the current commands for the guild
    const listRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, { headers: { Authorization: `Bot ${token}` } });
    if (!listRes.ok) { const txt = await listRes.text().catch(()=>'<no-body>'); console.warn('Failed to list guild commands', listRes.status, txt); return { ok: false, error: `Failed to list guild commands: ${listRes.status} ${txt}` }; }
    const guildCmds = await listRes.json();

    // Build a bulk permissions payload so we update all command permissions in a single request
    const permsPayload = { permissions: guildCmds.map(cmd => ({ id: cmd.id, permissions: [ { id: guildId, type: 1, permission: !(Array.isArray(disabledCommands) && disabledCommands.includes(cmd.name)) } ] })) };

    // Try sending bulk permissions with retry/backoff for 429 responses
    let permOk = false;
    const maxRetries = 4; let attempt = 0; let backoff = 500; let lastError = null;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const pRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands/permissions`, {
          method: 'PUT', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(permsPayload)
        });
        if (pRes.ok) { permOk = true; break; }
        if (pRes.status === 429) {
          // Rate limited: honor retry_after if provided
          let body = {};
          try { body = await pRes.json(); } catch(e){}
          const retryAfter = body.retry_after ? (body.retry_after * 1000) : backoff;
          console.warn(`Rate limited updating command permissions, retry_after=${retryAfter}ms`);
          await new Promise(res => setTimeout(res, retryAfter));
          backoff *= 2;
          continue;
        }
        lastError = await pRes.text().catch(()=>'<no-body>');
        console.warn('Failed to bulk update command permissions', pRes.status, lastError);
        break;
      } catch (e) {
        lastError = String(e);
        console.warn('Error performing bulk permission update', e);
        await new Promise(res => setTimeout(res, backoff));
        backoff *= 2;
      }
    }

    if (!permOk) console.warn('One or more command permission updates failed for', guildId, lastError);
    return { ok: r.ok && permOk, error: (r.ok && !permOk) ? (`Permission update failed: ${lastError||'unknown'}`) : null };
  } catch (e) { console.error('updateGuildCommands error', e); return { ok: false, error: String(e) }; }
}

app.get('/api/guilds/:guildId/settings', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const all = readSettings();
  const defaultSettings = { commands: { moderation: true, utility: true }, autoroleId: null, logChannelId: null, automod:{profanity:true,invites:true,spam:true} };
  return res.json({ settings: all[guildId] || defaultSettings });
});

app.post('/api/guilds/:guildId/settings', async (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const { settings } = req.body || {};
  if (!settings) return res.status(400).json({ error: 'Invalid payload' });
  const all = readSettings(); all[guildId] = settings; writeSettings(all);
  console.log('Saved settings for', guildId, settings);

  // also update bot-side guild config for log channel and xpRate to keep in sync
  try {
    const mod = require('../bot/moderationManager');
    if (settings.logChannelId !== undefined) mod.setGuildConfig(guildId, { logChannelId: settings.logChannelId });
    if (settings.xpRate !== undefined) mod.setGuildConfig(guildId, { xpRate: settings.xpRate, xpRateExpires: settings.xpRateExpires || null });
  } catch (e) { console.warn('Failed to sync settings to bot config', e); }

  // Update per-guild slash commands to hide disabled ones and return status
  let commandsUpdated = { ok: null, error: null };
  try {
    const result = await updateGuildCommands(guildId, settings.disabledCommands || []);
    if (!result || result.ok === false) {
      console.warn('Per-guild command update failed for', guildId, result && result.error);
      commandsUpdated = { ok: false, error: result ? result.error : 'Unknown error' };
    } else {
      commandsUpdated = { ok: true };
    }
  } catch (e) { console.warn('Failed to update per-guild commands', e); commandsUpdated = { ok: false, error: String(e) }; }

  // If updating commands failed, queue it for the bot process to retry later
  try {
    if (commandsUpdated && commandsUpdated.ok === false) {
      const gcuFile = path.join(process.cwd(), 'data', 'pending-guild-commands.json');
      try {
        // read existing
        let all = {};
        try { all = JSON.parse(fs.readFileSync(gcuFile,'utf8')||'{}'); } catch(e) {}
        const entry = { disabledCommands: settings.disabledCommands || [], attempts: (all[guildId] && all[guildId].attempts) || 0, ts: Date.now() };
        // if the failure included a rate limit hint, schedule next attempt accordingly
        if (result && result.rateLimited && result.retryAfter) entry.nextAttemptAt = Date.now() + Number(result.retryAfter);
        all[guildId] = entry;
        fs.mkdirSync(path.dirname(gcuFile), { recursive: true });
        fs.writeFileSync(gcuFile, JSON.stringify(all,null,2));
        console.log('Queued guild command update for', guildId, entry.nextAttemptAt ? ('nextAttemptAt='+new Date(entry.nextAttemptAt).toISOString()) : 'immediate retry');
        // signal to caller that this update was queued for retry
        commandsUpdated.queued = true;
      } catch(e) { console.warn('Failed to queue guild command update', e); }
    }
  } catch(e){}
  return res.json({ status: 'ok', commandsUpdated });
});

// API: moderation cases for a guild
app.get('/api/guilds/:guildId/cases', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  try{ const logs = JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','modlogs.json'),'utf8')||'{}'); return res.json({ cases: logs[guildId] || [] }); } catch(e){ return res.json({ cases: [] }); }
});

// API: get/set XP rate for a guild (used by dashboard)
app.get('/api/guilds/:guildId/xprate', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  try{
    const all = readSettings();
    const cfg = all[guildId] || {};
    return res.json({ xpRate: cfg.xpRate || 1, xpRateExpires: cfg.xpRateExpires || null });
  }catch(e){ return res.status(500).json({ error: 'Failed to read settings' }); }
});

// API: check queued command update status for a guild (debug)
app.get('/api/guilds/:guildId/command-update-status', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  try{
    const file = path.join(process.cwd(), 'data', 'pending-guild-commands.json');
    let all = {};
    try { all = JSON.parse(fs.readFileSync(file,'utf8')||'{}'); } catch(e){}
    return res.json({ queued: all[guildId] || null });
  }catch(e){ return res.status(500).json({ error: 'Failed to read queue' }); }
});

// logchannel endpoints
app.get('/api/guilds/:guildId/logchannel', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  try{ const all = readSettings(); const cfg = all[guildId] || {}; return res.json({ channelId: cfg.logChannelId || null }); } catch(e) { return res.status(500).json({ error: 'Failed to read settings' }); }
});

app.post('/api/guilds/:guildId/logchannel', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const { channelId, clear } = req.body || {};
  const all = readSettings(); all[guildId] = all[guildId] || {};
  if (clear) { all[guildId].logChannelId = null; writeSettings(all); try { const mod = require('../bot/moderationManager'); mod.setGuildConfig(guildId, { logChannelId: null }); } catch(e){}; return res.json({ status: 'ok' }); }
  if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
  all[guildId].logChannelId = channelId; writeSettings(all);
  try { const mod = require('../bot/moderationManager'); mod.setGuildConfig(guildId, { logChannelId: channelId }); } catch(e){}
  return res.json({ status: 'ok' });
});

// API: check whether the bot is present in the given guild (used by dashboard to toggle Setup/Continue)
app.get('/api/guilds/:guildId/botjoined', async (req, res) => {
  const guildId = req.params.guildId;
  const token = process.env.DISCORD_TOKEN;
  if (!token) return res.json({ botJoined: false });
  try {
    const r = await fetch(`https://discord.com/api/guilds/${guildId}`, { headers: { Authorization: `Bot ${token}` } });
    return res.json({ botJoined: r.ok });
  } catch (e) { return res.json({ botJoined: false }); }
});

app.post('/api/guilds/:guildId/xprate', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const { rate, durationMinutes, reset } = req.body || {};
  const all = readSettings();
  all[guildId] = all[guildId] || {};
  if (reset) {
    all[guildId].xpRate = 1;
    all[guildId].xpRateExpires = null;
    writeSettings(all);
    try { const mod = require('../bot/moderationManager'); mod.setGuildConfig(guildId, { xpRate: 1, xpRateExpires: null }); } catch(e){}
    return res.json({ status: 'ok' });
  }
  if (typeof rate !== 'number') return res.status(400).json({ error: 'Invalid rate' });
  if (rate < 0 || rate > 100) return res.status(400).json({ error: 'Rate out of range' });
  all[guildId].xpRate = rate;
  if (durationMinutes && Number.isInteger(durationMinutes) && durationMinutes > 0) {
    all[guildId].xpRateExpires = Date.now() + durationMinutes * 60 * 1000;
    try { const mod = require('../bot/moderationManager'); mod.setGuildConfig(guildId, { xpRate: rate, xpRateExpires: all[guildId].xpRateExpires }); } catch(e){}
  } else {
    all[guildId].xpRateExpires = null;
    try { const mod = require('../bot/moderationManager'); mod.setGuildConfig(guildId, { xpRate: rate, xpRateExpires: null }); } catch(e){}
  }
  writeSettings(all);
  return res.json({ status: 'ok' });
});

// Setup page for a selected guild with interactive settings
app.get('/setup/:guildId', (req, res) => {
  const guildId = req.params.guildId;
  const guilds = req.session.guilds || [];
  const allowed = guilds.find(g => g.id === guildId && (g.owner || (BigInt(g.permissions || '0') & 0x8n) === 0x8n));
  if (!allowed) {
    return res.status(403).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forbidden</title><link rel="stylesheet" href="/style.css"><link rel="icon" href="/img/Sitelogo.svg?v=2" type="image/svg+xml"><link rel="shortcut icon" href="/img/Sitelogo.svg?v=2"></head><body><main class="container" style="padding:60px 20px;text-align:center"><h2 class="section-title">Access denied</h2><p class="section-lead">You do not have permission to manage this server.</p><p><a href="/dashboard" class="btn ghost">Back</a></p></main></body></html>`);
  }

  res.send(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Manage ${allowed.name}</title>
      <link rel="stylesheet" href="/style.css">
      <style>
        .settings-wrap{max-width:1024px;margin:40px auto;display:flex;gap:22px}
        .settings-left{width:320px}
        .settings-right{flex:1}
        .section-card{background:var(--card);padding:18px;border-radius:12px;margin-bottom:16px}
        .toggle{display:inline-flex;align-items:center;gap:10px}
        .toggle input{width:44px;height:26px;appearance:none;background:#222;border-radius:999px;position:relative;cursor:pointer}
        .toggle input:checked{background:var(--accent)}
        .toggle input:before{content:'';position:absolute;width:20px;height:20px;border-radius:50%;background:#fff;left:3px;top:3px;transition:transform .18s}
        .toggle input:checked:before{transform:translateX(18px)}
      </style>
    </head>
    <body>
      <header style="padding:18px 20px;display:flex;align-items:center;gap:12px">
        <a href="/dashboard" class="btn ghost">◄ Back</a>
        <h2 style="margin-left:8px">Manage ${allowed.name}</h2>
      </header>
      <main class="container settings-main">
        <div class="settings-wrap">
          <div class="settings-left">
            <div class="section-card">
              <h4>Server</h4>
              <p>${allowed.name}</p>
              <p style="color:var(--muted);font-size:0.9rem">ID: ${allowed.id}</p>
              <div style="margin-top:12px"><a href="/invite-now" class="btn primary">Invite bot</a></div>
            </div>
            <div class="section-card">
              <h4>Quick actions</h4>
              <p><button id="btn-sync" class="btn ghost">Sync commands</button></p>
              <p><button id="btn-reset" class="btn ghost">Reset settings</button></p>
            </div>
          </div>
          <div class="settings-right">
            <div class="section-card">
              <h3>Features</h3>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px">
                <label class="toggle">Moderation <input type="checkbox" id="opt-moderation"></label>
                <label class="toggle">Utility <input type="checkbox" id="opt-utility"></label>
              </div>
            </div>



            <div class="section-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                <h3 style="margin:0">Commands</h3>
                <div style="text-align:right">
                  <button id="btn-save" class="btn primary" type="button">Save Settings</button>
                </div>
              </div>
              <div id="commands-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:12px">
                <!-- dynamic -->
              </div>
            </div>

            <div class="section-card" id="giveaways-section">
              <h3>Giveaways</h3>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;align-items:center">
                <p style="width:100%;margin:0;color:var(--muted);font-size:0.95rem">Moderation cases are visible below. You can set the moderation logs channel and autorole in this page.</p>
                <input id="gw-prize" type="text" placeholder="Prize" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <input id="gw-duration" type="text" placeholder="Duration (e.g. 1h)" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <input id="gw-winners" type="number" min="1" placeholder="Winners" style="width:80px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <input id="gw-channel" type="text" placeholder="Channel ID" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <input id="gw-role" type="text" placeholder="Role ID (optional)" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <button id="btn-create-gw" class="btn primary" type="button">Create</button>
              </div>

              <div id="gw-list" style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px"></div>
            </div>

            <div class="section-card">
              <h3>Leveling</h3>
              <p style="color:var(--muted);font-size:0.95rem;margin-top:8px">Set the XP rate (multiplier) for this server and optionally schedule a duration (minutes) for the event.</p>
              <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
                <div style="display:flex;gap:8px;align-items:center">
                  <label style="font-size:0.9rem;color:var(--muted);margin-right:6px">Current:</label>
                  <strong id="lvl-current">1x</strong>
                </div>
                <input id="lvl-rate" type="number" min="0" step="0.1" placeholder="Rate (e.g. 2)" style="width:120px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <input id="lvl-duration" type="number" min="1" placeholder="Duration (minutes)" style="width:160px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <button id="btn-set-lvl" class="btn primary" type="button">Set Rate</button>
                <button id="btn-reset-lvl" class="btn ghost" type="button">Reset</button>
              </div>
            </div>

            <div class="section-card">
              <h3>Logging</h3>
              <p style="color:var(--muted);font-size:0.95rem;margin-top:8px">Set a channel where moderation and admin actions will be posted as embeds.</p>
              <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
                <input id="log-channel-input" type="text" placeholder="Channel ID (eg. 123456789012345678)" style="width:240px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:white">
                <button id="btn-set-log" class="btn primary" type="button">Set Log Channel</button>
                <button id="btn-clear-log" class="btn ghost" type="button">Clear</button>
              </div>
              <p style="color:var(--muted);font-size:0.85rem;margin-top:8px">Note: This will configure the server log channel used by moderation and admin logs.</p>
            </div>


            <div class="section-card">
              <h3>Moderation Cases</h3>
              <div id="cases-list" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px"></div>
            </div>
            </div>
          </div>
        </div>
      </main>

      <script>window.GUILD_ID = '${allowed.id}';</script>
      <script src="/socket.io/socket.io.js"></script>
      <script src="/setup.js"></script>
    </body>
    </html>
  `);
});



const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const server = http.createServer(app);

// Attach socket.io for live reload and live moderation cases
const io = new Server(server);
io.on('connection', (socket) => {
  console.log('Client connected for live reload or moderation events');
});

// Watch public files and emit reload on changes
const watcher = chokidar.watch('src/web/public', { ignored: /(^|[\/\\])\../, ignoreInitial: true });
watcher.on('change', (path) => {
  console.log('File changed:', path, '— notifying clients');
  io.emit('reload');
});

// Watch moderation logs file and emit new cases to clients
try {
  let seenCases = new Set();
  const modPath = 'data/modlogs.json';
  const modWatcher = chokidar.watch(modPath, { ignoreInitial: true });
  modWatcher.on('change', () => {
    try {
      const raw = require('fs').readFileSync(modPath, 'utf8');
      const all = JSON.parse(raw || '{}');
      Object.entries(all).forEach(([guildId, list]) => {
        (list || []).forEach(c => {
          if (!seenCases.has(c.id)) {
            seenCases.add(c.id);
            console.log('New moderation case detected', c.id);
            io.emit('moderation-case', c);
          }
        });
      });
    } catch (e) { console.error('Failed to read modlogs', e); }
  });
} catch (e) { console.warn('Modlogs watcher not running', e); }

// lightweight favicon route (small SVG) to avoid 404s
app.get('/favicon.ico', (req, res) => {
  // serve the compact Sitelogo SVG as the favicon
  res.type('image/svg+xml');
  try {
    const svg = require('fs').readFileSync(require('path').join(__dirname, 'public', 'img', 'Sitelogo.svg'), 'utf8');
    res.send(svg);
  } catch (e) {
    // fallback: try the full logo, or inline fallback
    try{
      const svg = require('fs').readFileSync(require('path').join(__dirname, 'public', 'img', 'logo.svg'), 'utf8');
      return res.send(svg);
    }catch(err){
      res.send(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#7c5cff"/><text x="50%" y="54%" font-size="32" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" fill="#fff">N</text></svg>`);
    }
  }
});

server.listen(port).on('listening', () => {
  console.log(`Website running on port ${port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const alt = parseInt(port, 10) + 1;
    console.warn(`Port ${port} in use, trying ${alt}`);
    server.listen(alt).on('listening', () => console.log(`Website running on port ${alt}`));
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});