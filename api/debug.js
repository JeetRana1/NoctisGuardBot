module.exports = (req, res) => {
  res.json({ headers: req.headers, cookie: req.headers.cookie || null });
};