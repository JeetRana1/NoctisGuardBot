const crypto = require('crypto');

module.exports = (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<html><body style="color:#fff;background:#000;padding:40px;font-family:Arial, sans-serif"><h1>OAuth configuration required</h1><p>Set CLIENT_ID and CLIENT_SECRET as environment variables.</p></body></html>`);
  }

  const state = crypto.randomBytes(12).toString('hex');
  // Set state cookie for CSRF protection
  // Set state cookie so it is sent back on redirect from Discord. Use SameSite=None so cross-site redirects carry it.
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Path=/; Max-Age=300; SameSite=None; Secure`);
  const redirect = encodeURIComponent(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/callback`);
  const scope = 'identify%20guilds';
  const url = `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${redirect}&state=${state}`;
  res.writeHead(302, { Location: url });
  res.end();
};