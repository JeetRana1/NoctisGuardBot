Fly deployment notes (bot + dashboard)

Overview
--------
This repo contains a Discord bot (root `src/bot`) and a dashboard site (`NoctisGuardWebTest`). The recommended approach on Fly is to create two apps (bot and dashboard) and deploy each with its own `fly.toml` (templates included: `fly-bot.toml` and `fly-dashboard.toml`).

Files added
-----------
- `fly-bot.toml` (bot app, region set to `ewr`)
- `fly-dashboard.toml` (dashboard app, region set to `ewr`)
- `Dockerfile.bot` (Dockerfile for the bot service)
- `NoctisGuardWebTest/Dockerfile` (Dockerfile for the dashboard service)

Quick deploy steps (CLI)
------------------------
1. Install flyctl and login:
   - https://fly.io/docs/hands-on/install-flyctl/
   - `flyctl auth login`
2. Create the bot app (or reuse existing):
   - `flyctl apps create botandwebcombined-bot --region ewr`
   - `flyctl deploy --app botandwebcombined-bot --config fly-bot.toml --remote-only`
   - Set secrets: `flyctl secrets set DISCORD_TOKEN="<token>" WEBHOOK_SECRET="<secret>" BOT_NOTIFY_SECRET="<secret>"`
3. Create the dashboard app:
   - `flyctl apps create botandwebcombined-dashboard --region ewr`
   - `flyctl deploy --app botandwebcombined-dashboard --config fly-dashboard.toml --remote-only`
   - Set secrets: `flyctl secrets set BOT_NOTIFY_URL="https://botandwebcombined-bot.fly.dev/webhook" BOT_PRESENCE_URL="https://botandwebcombined-bot.fly.dev" WEBHOOK_SECRET="<secret>" DISCORD_CLIENT_ID="<id>" DISCORD_CLIENT_SECRET="<secret>" SESSION_SECRET="<secret>"`

Notes
-----
- The `Dockerfile.*` files use `npm install --production` to keep images small. If you need build-time only dependencies, modify the Dockerfile accordingly.
- If you prefer Fly's GitHub integration, push to `main` then use the Fly dashboard to connect the repo and use the `fly-*.toml` files to configure apps.
- Verify after deploy: `curl -i https://<bot-app>.fly.dev/webhook/health` should return a healthy response and `https://<dashboard-app>.fly.dev/api/stats` should return JSON.

Security
--------
- Use `flyctl secrets set` to store tokens/secrets — do NOT commit real tokens in `.env` or repository.

Need help? I can run the `flyctl` commands for you (if you provide access) or give exact commands for your terminal.
