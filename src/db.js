const { createClient } = require('@libsql/client');
const config = require('./config');

let db;

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  console.log('Connected to Turso Cloud Database');
} else {
  if (process.env.VERCEL) {
    throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel project settings.');
  }

  const Database = require('better-sqlite3');
  const localDb = new Database(config.dbPath);
  localDb.pragma('journal_mode = WAL');
  localDb.pragma('synchronous = NORMAL');

  db = {
    execute: async ({ sql, args }) => {
      const stmt = localDb.prepare(sql);
      const bindings = Array.isArray(args) ? args : [args || {}];
      if (stmt.reader) {
        return { rows: stmt.all(...bindings) };
      }
      const info = stmt.run(...bindings);
      return { rowsAffected: info.changes };
    },
    batch: async (statements) => {
      const tx = localDb.transaction((stmts) => {
        for (const s of stmts) {
          const stmt = localDb.prepare(s.sql);
          const bindings = Array.isArray(s.args) ? s.args : [s.args || {}];
          stmt.run(...bindings);
        }
      });
      tx(statements);
    }
  };
  console.log('Connected to Local SQLite Database');
}

module.exports = db;