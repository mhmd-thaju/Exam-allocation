const { createClient } = require('@libsql/client');
const config = require('./config');

let db;

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  // Production on Vercel with Turso Cloud Database
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  console.log('Connected to Turso Cloud Database');
} else {
  // Local development fallback using better-sqlite3
  const Database = require('better-sqlite3');
  const localDb = new Database(config.dbPath);
  localDb.pragma('journal_mode = WAL');
  localDb.pragma('synchronous = NORMAL');
  
  // Wrap local SQLite with an async interface matching @libsql/client
  db = {
    execute: async ({ sql, args }) => {
      const stmt = localDb.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const rows = Array.isArray(args) ? stmt.all(...args) : stmt.all(args || {});
        return { rows };
      }
      const info = Array.isArray(args) ? stmt.run(...args) : stmt.run(args || {});
      return { rowsAffected: info.changes };
    },
    batch: async (statements) => {
      const tx = localDb.transaction((stmts) => {
        for (const s of stmts) {
          const stmt = localDb.prepare(s.sql);
          if (Array.isArray(s.args)) stmt.run(...s.args);
          else stmt.run(s.args || {});
        }
      });
      tx(statements);
    }
  };
  console.log('Connected to Local SQLite Database');
}

module.exports = db;