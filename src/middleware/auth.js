const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'admin_session';
const sign = (payload) => crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function issueToken() {
  const payload = String(Date.now() + config.sessionTtlMs);
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  return Number(payload) > Date.now();
}

function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function extractToken(req) {
  const cookieVal = readCookie(req, COOKIE);
  if (cookieVal) return cookieVal;

  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

const requireAdmin = (req, res, next) => {
  const token = extractToken(req);
  if (validToken(token)) return next();
  res.status(401).json({ error: 'Not logged in.' });
};

function login(req, res) {
  const provided = req.body?.password ?? '';
  if (!safeEqual(provided, config.adminPassword)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  const token = issueToken();
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlMs
  });
  res.json({ ok: true, token });
}

const logout = (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
};

module.exports = { requireAdmin, login, logout, issueToken, validToken };
