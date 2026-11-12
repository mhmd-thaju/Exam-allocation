const crypto = require('crypto');
const db = require('../db');

let tableReady;

async function ensureTable() {
  if (!tableReady) {
    tableReady = db.batch([
      {
        sql: `CREATE TABLE IF NOT EXISTS admin_audit_log (
          id TEXT PRIMARY KEY,
          occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          completed_at TEXT,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT,
          outcome TEXT NOT NULL,
          status_code INTEGER,
          details TEXT
        )`
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_time ON admin_audit_log(occurred_at)'
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_time ON admin_audit_log(actor, occurred_at)'
      }
    ]).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

function serializeDetails(details) {
  if (details === undefined || details === null) return null;
  return JSON.stringify(details);
}

function normalizeTarget(target) {
  if (typeof target !== 'string' && typeof target !== 'number') return null;
  return String(target).slice(0, 256);
}

async function startAction({ actor, action, target = null, details = null }) {
  await ensureTable();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO admin_audit_log (id, actor, action, target, outcome, details)
          VALUES (?, ?, ?, ?, 'pending', ?)`,
    args: [id, actor || 'anonymous', action, normalizeTarget(target), serializeDetails(details)]
  });
  return id;
}

async function completeAction(id, statusCode) {
  const outcome = statusCode >= 400 ? 'failure' : 'success';
  await db.execute({
    sql: `UPDATE admin_audit_log
             SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 outcome = ?, status_code = ?
           WHERE id = ?`,
    args: [outcome, statusCode, id]
  });
}

async function recordEvent({ actor, action, target = null, outcome, statusCode = null, details = null }) {
  await ensureTable();
  await db.execute({
    sql: `INSERT INTO admin_audit_log
            (id, actor, action, target, outcome, status_code, details, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    args: [
      crypto.randomUUID(),
      actor || 'anonymous',
      action,
      normalizeTarget(target),
      outcome,
      statusCode,
      serializeDetails(details)
    ]
  });
}

async function listEvents({ limit = 100, offset = 0, excludeId = null } = {}) {
  await ensureTable();
  const result = await db.execute({
    sql: `SELECT id, occurred_at, completed_at, actor, action, target,
                 outcome, status_code, details
            FROM admin_audit_log
           WHERE (? IS NULL OR id != ?)
           ORDER BY occurred_at DESC, id DESC
           LIMIT ? OFFSET ?`,
    args: [excludeId, excludeId, limit, offset]
  });
  return result.rows.map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null
  }));
}

function auditAdminAction(action, getTarget = () => null, getDetails = () => null) {
  return async (req, res, next) => {
    const { getAuthenticatedUsername } = require('../middleware/auth');
    const actor = getAuthenticatedUsername(req);
    if (!actor) {
      try {
        await recordEvent({
          actor: 'anonymous',
          action,
          outcome: 'unauthorized',
          statusCode: 401
        });
      } catch (error) {
        console.error('Could not write unauthorized admin audit event:', error);
      }
      return res.status(401).json({ error: 'Not logged in.' });
    }

    try {
      const id = await startAction({
        actor,
        action,
        target: getTarget(req),
        details: getDetails(req)
      });
      req.auditEventId = id;
      let ending = false;
      const originalEnd = res.end.bind(res);
      res.end = (...args) => {
        if (ending) return res;
        ending = true;
        const statusCode = res.statusCode;
        completeAction(id, statusCode)
          .catch((error) => console.error('Could not complete admin audit event:', error))
          .finally(() => originalEnd(...args));
        return res;
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { auditAdminAction, listEvents, recordEvent };
