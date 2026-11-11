const path = require('path');
const fs = require('fs');

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

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'allocations.db'),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  sessionTtlMs: 4 * 60 * 60 * 1000, // 4 hours
  lookupRateLimit: Number(process.env.LOOKUP_RATE_LIMIT) || 600,
  maxUploadBytes: 5 * 1024 * 1024
};
