const db = require('../db');

let tableReady;

async function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute({
        sql: `CREATE TABLE IF NOT EXISTS student_lookup_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          register_no TEXT NOT NULL,
          student_name TEXT,
          outcome TEXT NOT NULL,
          status_code INTEGER NOT NULL
        )`
      });
      await db.execute({
        sql: 'CREATE INDEX IF NOT EXISTS idx_student_lookup_log_time ON student_lookup_log(occurred_at)'
      });
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function recordLookup({ registerNo, studentName, status }) {
  await ensureTable();
  await db.execute({
    sql: `INSERT INTO student_lookup_log (register_no, student_name, outcome, status_code)
          VALUES (?, ?, ?, ?)`,
    args: [
      registerNo,
      studentName || null,
      status === 200 ? 'arrangement_found' : 'arrangement_not_found',
      status
    ]
  });
}

async function getStats() {
  await ensureTable();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS totalLookups,
                 COUNT(DISTINCT register_no) AS uniqueRegisterNumbers
            FROM student_lookup_log`
  });
  return result.rows[0];
}

async function listLookups({ limit = 100, offset = 0 } = {}) {
  await ensureTable();
  const result = await db.execute({
    sql: `SELECT id, occurred_at, register_no, student_name, outcome, status_code
            FROM student_lookup_log
           ORDER BY occurred_at DESC, id DESC
           LIMIT ? OFFSET ?`,
    args: [limit, offset]
  });
  return result.rows;
}

module.exports = { recordLookup, getStats, listLookups };
