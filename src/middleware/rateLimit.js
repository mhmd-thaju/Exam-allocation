const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const audit = require('../services/auditService');

// Generous: many students may share one college WiFi IP.
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.lookupRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' }
});

const localLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }
});

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
let loginTableReady;

async function ensureLoginTable() {
  if (!loginTableReady) {
    loginTableReady = db.execute({
      sql: `CREATE TABLE IF NOT EXISTS admin_login_attempts (
        ip_hash TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      )`
    }).catch((error) => {
      loginTableReady = null;
      throw error;
    });
  }
  await loginTableReady;
}

async function distributedLoginLimiter(req, res, next) {
  try {
    await ensureLoginTable();
    const now = Date.now();
    const cutoff = now - LOGIN_WINDOW_MS;
    const ipHash = crypto.createHmac('sha256', config.sessionSecret)
      .update(req.ip || 'unknown')
      .digest('hex');
    const result = await db.execute({
      sql: `INSERT INTO admin_login_attempts (ip_hash, window_started_at, attempts)
            VALUES (?, ?, 1)
            ON CONFLICT(ip_hash) DO UPDATE SET
              attempts = CASE
                WHEN admin_login_attempts.window_started_at <= ? THEN 1
                ELSE admin_login_attempts.attempts + 1
              END,
              window_started_at = CASE
                WHEN admin_login_attempts.window_started_at <= ? THEN excluded.window_started_at
                ELSE admin_login_attempts.window_started_at
              END
            RETURNING attempts`,
      args: [ipHash, now, cutoff, cutoff]
    });
    await db.execute({
      sql: 'DELETE FROM admin_login_attempts WHERE window_started_at <= ?',
      args: [cutoff]
    });

    res.set('RateLimit-Limit', String(LOGIN_LIMIT));
    res.set('RateLimit-Remaining', String(Math.max(0, LOGIN_LIMIT - Number(result.rows[0].attempts))));
    if (Number(result.rows[0].attempts) > LOGIN_LIMIT) {
      audit.recordEvent({
        actor: 'anonymous',
        action: 'auth.login_rate_limited',
        outcome: 'blocked',
        statusCode: 429
      }).catch((error) => console.error('Could not write rate-limit audit event:', error));
      return res.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

const loginLimiter = config.isVercel ? distributedLoginLimiter : localLoginLimiter;

module.exports = { lookupLimiter, loginLimiter };
