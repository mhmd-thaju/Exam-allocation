const crypto = require('crypto');
const db = require('../db');

let tableReady;
let integerPrimaryKey;

async function ensureTable() {
  if (!tableReady) {
    tableReady = migrateTable().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function migrateTable() {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT,
      occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      completed_at TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      outcome TEXT NOT NULL,
      status_code INTEGER,
      details TEXT
    )`
  });

  const schema = await db.execute({ sql: "PRAGMA table_info('admin_audit_log')" });
  const columns = new Set(schema.rows.map((column) => column.name));
  const migrations = [
    ['event_key', 'TEXT'],
    ['completed_at', 'TEXT'],
    ['status_code', 'INTEGER']
  ];

  for (const [name, type] of migrations) {
    if (!columns.has(name)) {
      try {
        await db.execute({ sql: `ALTER TABLE admin_audit_log ADD COLUMN ${name} ${type}` });
      } catch (error) {
        const updatedSchema = await db.execute({ sql: "PRAGMA table_info('admin_audit_log')" });
        if (!updatedSchema.rows.some((column) => column.name === name)) throw error;
      }
    }
  }

  const updatedSchema = await db.execute({ sql: "PRAGMA table_info('admin_audit_log')" });
  const idColumn = updatedSchema.rows.find((column) => column.name === 'id');
  integerPrimaryKey = Boolean(idColumn && idColumn.type.toUpperCase() === 'INTEGER' && idColumn.pk);

  await db.batch([
    {
      sql: 'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_time ON admin_audit_log(occurred_at)'
    },
    {
      sql: 'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_time ON admin_audit_log(actor, occurred_at)'
    },
    {
      sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_audit_log_event_key ON admin_audit_log(event_key)'
    }
  ]);
}

function serializeDetails(details) {
  if (details === undefined || details === null) return null;
  return JSON.stringify(details);
}

function normalizeTarget(target) {
  if (typeof target !== 'string' && typeof target !== 'number') return null;
  return String(target).slice(0, 256);
}

async function insertEvent({ eventKey, actor, action, target, outcome, statusCode, details, pending = false }) {
  const normalizedActor = actor || 'anonymous';
  const normalizedTarget = normalizeTarget(target);
  const serializedDetails = serializeDetails(details);

  if (integerPrimaryKey) {
    return db.execute({
      sql: pending
        ? `INSERT INTO admin_audit_log (event_key, actor, action, target, outcome, details)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        : `INSERT INTO admin_audit_log
             (event_key, actor, action, target, outcome, status_code, details, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      args: pending
        ? [eventKey, normalizedActor, action, normalizedTarget, serializedDetails]
        : [eventKey, normalizedActor, action, normalizedTarget, outcome, statusCode, serializedDetails]
    });
  }

  return db.execute({
    sql: pending
      ? `INSERT INTO admin_audit_log (id, event_key, actor, action, target, outcome, details)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      : `INSERT INTO admin_audit_log
           (id, event_key, actor, action, target, outcome, status_code, details, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    args: pending
      ? [eventKey, eventKey, normalizedActor, action, normalizedTarget, serializedDetails]
      : [eventKey, eventKey, normalizedActor, action, normalizedTarget, outcome, statusCode, serializedDetails]
  });
}

async function startAction({ actor, action, target = null, details = null }) {
  await ensureTable();
  const eventKey = crypto.randomUUID();
  await insertEvent({ eventKey, actor, action, target, details, pending: true });
  return eventKey;
}

async function completeAction(eventKey, statusCode) {
  const outcome = statusCode >= 400 ? 'failure' : 'success';
  await db.execute({
    sql: `UPDATE admin_audit_log
             SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 outcome = ?, status_code = ?
           WHERE event_key = ?`,
    args: [outcome, statusCode, eventKey]
  });
}

async function recordEvent({ actor, action, target = null, outcome, statusCode = null, details = null }) {
  await ensureTable();
  await insertEvent({
    eventKey: crypto.randomUUID(),
    actor,
    action,
    target,
    outcome,
    statusCode,
    details
  });
}

async function listEvents({ limit = 100, offset = 0, excludeId = null } = {}) {
  await ensureTable();
  const result = await db.execute({
    sql: `SELECT id, occurred_at, completed_at, actor, action, target,
                 outcome, status_code, details
            FROM admin_audit_log
           WHERE (? IS NULL OR event_key != ?)
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
      const eventKey = await startAction({
        actor,
        action,
        target: getTarget(req),
        details: getDetails(req)
      });
      req.auditEventKey = eventKey;
      let ending = false;
      const originalEnd = res.end.bind(res);
      res.end = (...args) => {
        if (ending) return res;
        ending = true;
        const statusCode = res.statusCode;
        completeAction(eventKey, statusCode)
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
