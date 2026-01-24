const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  try {
    const { code, state } = req.query || {};
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const secret = process.env.SESSION_SECRET || 'replace_this_in_prod';

    if (!clientId || !clientSecret) {
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<html><body style="color:#fff;background:#000;padding:40px;font-family:Arial, sans-serif"><h1>OAuth configuration required</h1><p>Set CLIENT_ID and CLIENT_SECRET as environment variables.</p></body></html>`);
    }

    if (!code) {
      res.status(400).send('Missing code');
      return;
    }

    // validate state against cookie
    const cookies = (req.headers.cookie || '').split(';').map(s => s.trim()).reduce((acc, cur) => { const [k,v]=cur.split('='); acc[k]=v; return acc; }, {});
    if (state && cookies.oauth_state && cookies.oauth_state !== state) {
      res.status(400).send('Invalid state');
      return;
    }

    const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/callback`;

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
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

    // fetch user's guilds and user info
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } });
    const guilds = await guildsRes.json();

    let userInfo = {};
    try { const ures = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } }); if (ures.ok) userInfo = await ures.json(); } catch (e) { console.warn('Failed to fetch user info', e); }

    const payload = { user: { id: userInfo.id, username: userInfo.username }, guilds };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });

    // set secure, httpOnly cookie
    const cookie = `noctis_auth=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`;
    res.setHeader('Set-Cookie', cookie);

    // redirect to dashboard
    res.writeHead(302, { Location: '/' + 'dashboard' });
    res.end();

  } catch (err) {
    console.error('Callback error', err);
    res.status(500).end('OAuth callback failed');
  }
};