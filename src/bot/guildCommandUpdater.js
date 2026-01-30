const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const pendingFile = path.join(__dirname, '..', '..', 'data', 'pending-guild-commands.json');
function ensureFile() { try { fs.mkdirSync(path.dirname(pendingFile), { recursive: true }); } catch (e) { } if (!fs.existsSync(pendingFile)) fs.writeFileSync(pendingFile, JSON.stringify({})); }

function readPending() { ensureFile(); try { return JSON.parse(fs.readFileSync(pendingFile, 'utf8') || '{}'); } catch (e) { return {}; } }
function writePending(obj) { ensureFile(); fs.writeFileSync(pendingFile, JSON.stringify(obj, null, 2)); }

async function updateGuildCommandsUsingClient(client, guildId, disabledCommands) {
  try {
    const commandsPath = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsPath)) throw new Error('Commands directory not found');
    // recursively collect command files
    function collectFiles(dir) {
      const out = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...collectFiles(p));
        else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
      }
      return out;
    }
    const files = collectFiles(commandsPath);
    const cmds = [];
    for (const filePath of files) {
      try {
        const rel = path.relative(commandsPath, filePath);
        const parts = rel.split(path.sep);
        // derive plugin name from folder if present
        const pluginName = parts.length > 1 ? parts[0] : 'core';
        const command = require(filePath);
        if (!command || !command.data) continue;
        // determine effective plugin name
        const effectivePlugin = command.plugin || pluginName;
        const commandName = command.data && command.data.name;
        // If the dashboard disabled the plugin (by folder name) or specific command, skip it
        if (Array.isArray(disabledCommands) && (disabledCommands.includes(effectivePlugin) || disabledCommands.includes(commandName))) continue;
        cmds.push(command.data.toJSON());
      } catch (e) {
        console.warn('Failed to load command file', filePath, e);
      }
    }

    if (!client.application || !client.application.commands) throw new Error('Client application commands not available');

    // Retry loop to handle rate limits (429) when using the discord.js client
    let ok = false; let attempt = 0; let backoff = 500; const maxAttempts = 5; let lastErr = null;
    let lastDetectedRetryAfter = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        await client.application.commands.set(cmds, guildId);
        console.log(`Bot updated guild ${guildId} commands via client with ${cmds.length} commands (attempt ${attempt}).`);
        ok = true; break;
      } catch (e) {
        lastErr = e;
        // Inspect for rate limit info
        const raw = e && e.raw ? e.raw : (e && e.response ? e.response : null);
        let retryAfter = null;
        try {
          if (raw && raw.retry_after) retryAfter = raw.retry_after * 1000;
          else if (raw && raw.headers && raw.headers['retry-after']) retryAfter = parseFloat(raw.headers['retry-after']) * 1000;
        } catch (ee) {/* ignore parsing */ }

        if (e && e.code === 429) {
          lastDetectedRetryAfter = retryAfter || backoff;
          if (retryAfter) console.warn(`guildCommandUpdater: rate limited updating ${guildId}, retrying after ${retryAfter}ms`);
          else console.warn(`guildCommandUpdater: rate limited updating ${guildId}, retrying after ${backoff}ms`);
          await new Promise(r => setTimeout(r, retryAfter || backoff));
          backoff *= 2;
          continue;
        }

        console.warn('guildCommandUpdater: failed to update via client (attempt ' + attempt + ')', e);
        // On non-rate-limit errors, do a short backoff and retry a few times
        await new Promise(r => setTimeout(r, backoff));
        backoff *= 2;
      }
    }

    if (!ok) {
      console.warn('guildCommandUpdater: giving up after attempts for', guildId, lastErr);
      return { ok: false, error: String(lastErr), rateLimited: !!lastDetectedRetryAfter, retryAfter: lastDetectedRetryAfter };
    }

    return { ok: true };
  } catch (e) { console.warn('guildCommandUpdater: unexpected error', e); return { ok: false, error: String(e) }; }
}

function queueUpdate(guildId, disabledCommands) {
  const all = readPending();
  all[guildId] = { disabledCommands: disabledCommands || [], attempts: (all[guildId] && all[guildId].attempts) || 0, ts: Date.now() };
  writePending(all);
}

function removeQueued(guildId) { const all = readPending(); if (all[guildId]) { delete all[guildId]; writePending(all); } }

async function runPending(client) {
  const pending = readPending();
  for (const guildId of Object.keys(pending)) {
    const entry = pending[guildId];
    // skip if a nextAttemptAt is set in the future
    if (entry.nextAttemptAt && Date.now() < entry.nextAttemptAt) { console.log('Skipping queued update for', guildId, 'until', new Date(entry.nextAttemptAt).toISOString()); continue; }
    if (entry.attempts >= 8) { console.warn('Skipping guild command update for', guildId, 'after', entry.attempts, 'attempts'); continue; }
    console.log('Attempting queued command update for', guildId, 'attempt', (entry.attempts || 0) + 1);
    const res = await updateGuildCommandsUsingClient(client, guildId, entry.disabledCommands);
    if (res && res.ok) {
      removeQueued(guildId);
    } else {
      entry.attempts = (entry.attempts || 0) + 1;
      // if rate limited, schedule next attempt after retryAfter
      if (res && res.rateLimited && res.retryAfter) {
        entry.nextAttemptAt = Date.now() + Number(res.retryAfter);
        console.log('Queued update for', guildId, 'will retry after', new Date(entry.nextAttemptAt).toISOString());
      }
      const all = readPending(); all[guildId] = entry; writePending(all);
    }
  }
}

function init(client) {
  ensureFile();
  // attempt on startup
  runPending(client).catch(e => console.warn('runPending error', e));
  // watch for file changes
  const watcher = chokidar.watch(pendingFile, { ignoreInitial: true });
  watcher.on('change', () => { runPending(client).catch(e => console.warn('runPending error', e)); });
}

module.exports = { init, queueUpdate, runPending };
