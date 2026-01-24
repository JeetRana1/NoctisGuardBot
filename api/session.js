const jwt = require('jsonwebtoken');

module.exports = (req, res) => {
  const secret = process.env.SESSION_SECRET || 'replace_this_in_prod';
  console.log('Session check - Cookie header:', req.headers.cookie);
  const cookies = (req.headers.cookie || '').split(';').map(s => s.trim()).reduce((acc, cur) => { const [k,v]=cur.split('='); acc[k]=v; return acc; }, {});
  const token = cookies.noctis_auth;
  if (!token) {
    console.warn('Session check - no noctis_auth cookie present');
    return res.json({ ok: false, needLogin: true, reason: 'no_cookie' });
  }
  try {
    const data = jwt.verify(token, secret);
    console.log('Session check - valid token for user:', data.user && data.user.id);
    return res.json({ ok: true, user: data.user, guilds: data.guilds });
  } catch (e) {
    console.warn('Invalid session token', e);
    return res.json({ ok: false, needLogin: true, reason: 'invalid_token' });
  }
};