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
- Add any necessary environment variables in Vercel (e.g. `CLIENT_ID`, `CLIENT_SECRET`) **only** if you convert server endpoints to serverless functions (see below).

Running the full web app on Vercel (advanced)
- If you want Vercel to handle the OAuth token exchange and session-based routes, you'll need to move the Express endpoints into serverless functions (for example under an `/api` folder) and set `CLIENT_ID` and `CLIENT_SECRET` in your Vercel project environment variables.
- Note: Hosting the bot itself on Vercel is not recommended — keep the bot running on a persistent host (VPS, Docker host, or a worker service).

If you want, I can:
- Add exact env var names and example values to the `README`.
- Help convert the current `/auth` and `/callback` endpoints into Vercel serverless functions (requires more changes).

If you'd like automation, I can also scaffold a GitHub Action or Vercel configuration for deploys — tell me whether you want "static-only" or "serverless web" and I will scaffold it.
