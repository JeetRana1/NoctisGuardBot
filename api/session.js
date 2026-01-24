const jwt = require('jsonwebtoken');

module.exports = (req, res) => {
  const secret = process.env.SESSION_SECRET || 'replace_this_in_prod';
  const cookies = (req.headers.cookie || '').split(';').map(s => s.trim()).reduce((acc, cur) => { const [k,v]=cur.split('='); acc[k]=v; return acc; }, {});
  const token = cookies.noctis_auth;
  if (!token) return res.json({ ok: false, needLogin: true });
  try {
    const data = jwt.verify(token, secret);
    return res.json({ ok: true, user: data.user, guilds: data.guilds });
  } catch (e) {
    console.warn('Invalid session token', e);
    return res.json({ ok: false, needLogin: true });
  }
};