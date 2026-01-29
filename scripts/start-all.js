#!/usr/bin/env node
// Cross-platform script to start both the bot and web server and stream their output with prefixes
const { spawn } = require('child_process');

function run(name, cmd, args) {
  const proc = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], shell: true, env: process.env });

  proc.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  proc.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));

  proc.on('exit', (code, sig) => {
    console.log(`[${name}] exited ${sig ? `by signal ${sig}` : `with code ${code}`}`);
  });

  return proc;
}

if (process.env.GATEWAY_TEST && ['1','true','yes'].includes(String(process.env.GATEWAY_TEST).toLowerCase())) {
  console.log('GATEWAY_TEST detected — running gateway-test.js before starting bot...');
  const cp = require('child_process');
  const path = require('path');
  const res = cp.spawnSync(process.execPath, [path.join(__dirname, 'gateway-test.js')], { stdio: 'inherit', env: process.env });
  if (res.error) {
    console.error('Gateway test spawn error', res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error('Gateway test failed (non-zero exit). Aborting startup.');
    process.exit(res.status || 1);
  }
  console.log('Gateway test succeeded — continuing to start bot.');
}

console.log('Starting bot (web removed)...');
const bot = run('bot', 'npm', ['run', 'start']);

function shutdown() {
  console.log('\nShutting down the bot...');
  if (!bot.killed) bot.kill();
  process.exit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in start-all:', err);
  shutdown();
});
