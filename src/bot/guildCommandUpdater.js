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
    const skipped = [];
    for (const filePath of files) {
      try {
        const rel = path.relative(commandsPath, filePath);
        const parts = rel.split(path.sep);
        const pluginName = parts.length > 1 ? parts[0] : 'core';
        const command = require(filePath);
        if (!command || !command.data) continue;
        const effectivePlugin = command.plugin || pluginName;
        const commandName = command.data.name;

        // Check if disabled
        if (Array.isArray(disabledCommands) && (disabledCommands.includes(effectivePlugin) || disabledCommands.includes(commandName))) {
          skipped.push(commandName);
          continue;
        }
        cmds.push(command.data.toJSON());
      } catch (e) {
        console.warn('Failed to load command file', filePath, e);
      }
    }

    if (!cmds.length) {
      console.log(`[bot-cmd] No commands to register for guild ${guildId} (all disabled or none found)`);
    } else {
      console.log(`[bot-cmd] Registering ${cmds.length} commands for guild ${guildId}. Skipped: ${skipped.length} (${skipped.join(', ') || 'none'})`);
    }

    if (!client.application || !client.application.commands) throw new Error('Client application commands not available');

    // Retry loop to handle rate limits
    let ok = false; let attempt = 0; let backoff = 1000; const maxAttempts = 3; let lastErr = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        // setting empty array deletes all guild commands
        await client.application.commands.set(cmds, guildId);
        ok = true; break;
      } catch (e) {
        lastErr = e;
        if (e && e.code === 429) {
          const wait = e.raw?.retry_after ? (e.raw.retry_after * 1000) : backoff;
          console.warn(`[bot-cmd] Rate limited for ${guildId}, retrying after ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        console.warn(`[bot-cmd] Failed to update ${guildId} (attempt ${attempt}):`, e.message);
        await new Promise(r => setTimeout(r, backoff));
        backoff *= 2;
      }
    }

    if (!ok) return { ok: false, error: String(lastErr) };
    return { ok: true };
  } catch (e) { console.warn('[bot-cmd] Unexpected error', e); return { ok: false, error: String(e) }; }
}

function queueUpdate(guildId, disabledCommands) {
  const all = readPending();
  all[guildId] = { disabledCommands: disabledCommands || [], attempts: (all[guildId] && all[guildId].attempts) || 0, ts: Date.now() };
  writePending(all);
}

function removeQueued(guildId) { const all = readPending(); if (all[guildId]) { delete all[guildId]; writePending(all); } }

async function runPending(client) {
  const pending = readPending();
  const guildIds = Object.keys(pending);
  if (guildIds.length === 0) return;

  console.log(`[bot-cmd] Processing ${guildIds.length} pending guild updates...`);
  for (let i = 0; i < guildIds.length; i++) {
    const guildId = guildIds[i];
    const entry = pending[guildId];
    if (entry.nextAttemptAt && Date.now() < entry.nextAttemptAt) continue;
    if (entry.attempts >= 5) continue;

    const res = await updateGuildCommandsUsingClient(client, guildId, entry.disabledCommands);
    if (res && res.ok) {
      removeQueued(guildId);
    } else {
      entry.attempts = (entry.attempts || 0) + 1;
      entry.nextAttemptAt = Date.now() + (30000 * entry.attempts); // Exponential-ish backoff
      const all = readPending(); all[guildId] = entry; writePending(all);
    }

    // Add a 2s delay between different guild updates to prevent event loop blocking and Discord rate limits
    if (i < guildIds.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
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
