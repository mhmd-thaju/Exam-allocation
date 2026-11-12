const crypto = require('crypto');
const config = require('../config');
const audit = require('../services/auditService');

const COOKIE = 'admin_session';
const DUMMY_SALT = Buffer.alloc(16);
const DUMMY_HASH = crypto.scryptSync('invalid-admin-password', DUMMY_SALT, 64);
const sign = (payload) => crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');

function safeEqual(a, b) {
  const left = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const right = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function issueToken(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + config.sessionTtlMs
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  if (!token) return false;
  const [payload, signature, extra] = token.split('.');
  if (extra !== undefined || !payload || !signature || !safeEqual(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number(session.expiresAt) > Date.now() &&
      config.adminUsers.some((user) => user.username.trim().toLowerCase() === session.username);
  } catch (err) {
    return false;
  }
}

function readCookie(req, name) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function isAuthenticated(req) {
  return validToken(readCookie(req, COOKIE));
}

function getAuthenticatedUsername(req) {
  const token = readCookie(req, COOKIE);
  if (!validToken(token)) return null;
  const [payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()).username;
}

async function login(req, res) {
  const rawUsername = String(req.body?.username || '').trim().toLowerCase();
  const rawPassword = String(req.body?.password || '');
  const usernameTooLong = rawUsername.length > 128;
  const passwordTooLong = rawPassword.length > 1024;
  const username = rawUsername.slice(0, 128);
  const password = passwordTooLong ? '' : rawPassword;
  const user = config.adminUsers.find((item) => item.username.trim().toLowerCase() === username);
  const salt = user ? Buffer.from(user.salt, 'hex') : DUMMY_SALT;
  const expectedHash = user ? Buffer.from(user.passwordHash, 'hex') : DUMMY_HASH;
  const providedHash = crypto.scryptSync(password, salt, 64);

  if (usernameTooLong || passwordTooLong || !user || !safeEqual(providedHash, expectedHash)) {
    await audit.recordEvent({
      actor: username || 'unknown',
      action: 'auth.login',
      outcome: 'failure',
      statusCode: 401
    });
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  await audit.recordEvent({
    actor: username,
    action: 'auth.login',
    outcome: 'success',
    statusCode: 200
  });
  res.cookie(COOKIE, issueToken(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isVercel,
    path: '/',
    maxAge: config.sessionTtlMs
  });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
}

async function logout(req, res) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isVercel,
    path: '/'
  });
  res.json({ ok: true });
}

function requireSameOrigin(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    audit.recordEvent({
      actor: getAuthenticatedUsername(req) || 'anonymous',
      action: 'security.cross_origin_blocked',
      outcome: 'blocked',
      statusCode: 403,
      details: { method: req.method }
    }).catch((error) => console.error('Could not write cross-origin audit event:', error));
    return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  }

  const origin = req.get('origin');
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== expectedOrigin) {
    audit.recordEvent({
      actor: getAuthenticatedUsername(req) || 'anonymous',
      action: 'security.cross_origin_blocked',
      outcome: 'blocked',
      statusCode: 403,
      details: { method: req.method }
    }).catch((error) => console.error('Could not write cross-origin audit event:', error));
    return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  }

  next();
}

module.exports = {
  requireSameOrigin,
  isAuthenticated,
  getAuthenticatedUsername,
  login,
  logout,
  issueToken,
  validToken
};
