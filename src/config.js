const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Minimal .env loader (no extra dependency)
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
} catch (_) { /* ignore */ }

const isVercel = Boolean(process.env.VERCEL);
const sessionSecret = process.env.SESSION_SECRET;
let adminUsers = [];

if (process.env.ADMIN_USERS) {
  try {
    adminUsers = JSON.parse(process.env.ADMIN_USERS);
  } catch (err) {
    throw new Error('ADMIN_USERS must be a valid JSON array of credential records.');
  }

  if (!Array.isArray(adminUsers)) {
    throw new Error('ADMIN_USERS must be a JSON array of credential records.');
  }

  const usernames = new Set();
  for (const user of adminUsers) {
    if (
      !user ||
      typeof user.username !== 'string' ||
      !user.username.trim() ||
      typeof user.salt !== 'string' ||
      !/^[a-f0-9]{32}$/i.test(user.salt) ||
      typeof user.passwordHash !== 'string' ||
      !/^[a-f0-9]{128}$/i.test(user.passwordHash)
    ) {
      throw new Error('Each ADMIN_USERS record must contain username, a 32-character salt, and a 128-character passwordHash.');
    }

    const username = user.username.trim().toLowerCase();
    if (usernames.has(username)) {
      throw new Error('ADMIN_USERS usernames must be unique.');
    }
    usernames.add(username);
  }
}

if (isVercel) {
  if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
    throw new Error('Set SESSION_SECRET to a unique random value of at least 32 bytes in Vercel.');
  }
  if (adminUsers.length === 0) {
    throw new Error('Configure at least one individually hashed admin account in ADMIN_USERS.');
  }
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'allocations.db'),
  adminUsers,
  isVercel,
  sessionSecret: sessionSecret || crypto.randomBytes(32).toString('hex'),
  sessionTtlMs: 4 * 60 * 60 * 1000, // 4 hours
  lookupRateLimit: Number(process.env.LOOKUP_RATE_LIMIT) || 600,
  maxUploadBytes: 5 * 1024 * 1024
};
