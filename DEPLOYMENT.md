Deployment & Environment (Vercel-friendly)

This project is designed to run locally (bot + web) or to host the static website on Vercel while running the Discord bot elsewhere (recommended).

Keep your real secrets out of version control. Use `.env` locally and add it to `.gitignore` (an `.env.example` with placeholders is included).

Local development
1. Copy `.env.example` to `.env` and fill in values.
2. Install: `npm install`
3. Run bot: `npm start` (requires `DISCORD_TOKEN`)
4. Run web server (full server with OAuth endpoints): `npm run web`

Deploying the static site to Vercel (recommended)
- If you only need the public website and OAuth redirect to a server you control (or you accept a static OAuth flow), you can deploy the content of `src/web/public` as a static site on Vercel.
- Project settings: set "Build Output Directory" to `src/web/public` (or use the included `vercel.json` which serves that folder).
- If you want the OAuth flow to complete on Vercel (so users are taken directly to the dashboard after authorizing), deploy the provided serverless endpoints (the `api/` folder) to Vercel — set `CLIENT_ID`, `CLIENT_SECRET`, and `SESSION_SECRET` in your Vercel Project Environment variables.

Running the full web app on Vercel (recommended for dashboard)
- This project now includes serverless handlers for OAuth and session management (`/api/auth`, `/api/callback`, `/api/session`, `/api/logout`). When deployed to Vercel these endpoints will:
  - `/api/auth` — set state cookie and redirect the user to Discord authorize.
  - `/api/callback` — exchange the code for tokens, fetch user guilds, set a secure session cookie, then redirect to `/dashboard` (no extra steps required from the user).
  - `/api/session` — return user + guilds for the dashboard to consume.
  - `/api/logout` — clears the session cookie and redirects to home.

- Required environment variables (set in Vercel Project Settings):
  - `CLIENT_ID` — Discord application client id
  - `CLIENT_SECRET` — Discord application client secret
  - `SESSION_SECRET` — a long random value used to sign session tokens

- Important: In the Discord Developer Portal → OAuth2 → Redirects, add the following redirect URI (exact match):
  - `https://<your-domain>/api/callback`  (e.g., `https://noctis-guard.vercel.app/api/callback`)

- Note: Hosting the bot itself on Vercel is not recommended — keep the bot running on a persistent host (VPS, Docker host, or a worker service).

If you want, I can:
- Add exact env var names and example values to the `README`.
- Help convert the current `/auth` and `/callback` endpoints into Vercel serverless functions (requires more changes).

If you'd like automation, I can also scaffold a GitHub Action or Vercel configuration for deploys — tell me whether you want "static-only" or "serverless web" and I will scaffold it.
