module.exports = (req, res) => {
  // Clear cookie
  res.setHeader('Set-Cookie', 'noctis_auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
  res.writeHead(302, { Location: '/' });
  res.end();
};