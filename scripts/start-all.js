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

console.log('Starting bot and web server...');
const bot = run('bot', 'npm', ['run', 'start']);
const web = run('web', 'npm', ['run', 'web']);

function shutdown() {
  console.log('\nShutting down both processes...');
  if (!bot.killed) bot.kill();
  if (!web.killed) web.kill();
  process.exit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in start-all:', err);
  shutdown();
});
