const db = require('../db');

const findStmt = db.prepare(
  `SELECT register_no, name, room, seat_no, exam_name, exam_date, session
     FROM allocations WHERE register_no = ? ORDER BY exam_date, session`
);

const findTodayStmt = db.prepare(
  `SELECT register_no, name, room, seat_no, exam_name, exam_date, session
     FROM allocations
    WHERE register_no = ? AND (exam_date = ? OR exam_date = '')
    ORDER BY session`
);

const countStmt = db.prepare('SELECT COUNT(*) AS n FROM allocations');
const roomsStmt = db.prepare('SELECT COUNT(DISTINCT room) AS n FROM allocations');
const clearStmt = db.prepare('DELETE FROM allocations');

const upsertStmt = db.prepare(
  `INSERT INTO allocations (register_no, name, room, seat_no, exam_name, exam_date, session)
   VALUES (@register_no, @name, @room, @seat_no, @exam_name, @exam_date, @session)
   ON CONFLICT(register_no, exam_date, session) DO UPDATE SET
     name = excluded.name, room = excluded.room, seat_no = excluded.seat_no,
     exam_name = excluded.exam_name`
);

const deleteRecordStmt = db.prepare(
  `DELETE FROM allocations WHERE register_no = ? AND exam_date = ? AND session = ?`
);

const allStmt = db.prepare(
  `SELECT register_no, name, room, seat_no, exam_name, exam_date, session
     FROM allocations ORDER BY exam_date, session, room, seat_no, register_no`
);

const distinctRoomsStmt = db.prepare(
  `SELECT DISTINCT room FROM allocations WHERE room != '' ORDER BY room`
);

const distinctDatesStmt = db.prepare(
  `SELECT DISTINCT exam_date FROM allocations WHERE exam_date != '' ORDER BY exam_date`
);

const distinctSessionsStmt = db.prepare(
  `SELECT DISTINCT session FROM allocations WHERE session != '' ORDER BY session`
);

const insertMany = db.transaction((rows, replace) => {
  if (replace) clearStmt.run();
  for (const r of rows) upsertStmt.run(r);
});

function listAllocations({ search = '', room = '', date = '', limit = 1000, offset = 0 } = {}) {
  let sql = 'SELECT register_no, name, room, seat_no, exam_name, exam_date, session FROM allocations WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (register_no LIKE ? OR name LIKE ? OR exam_name LIKE ? OR seat_no LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }
  if (room) {
    sql += ' AND room = ?';
    params.push(room);
  }
  if (date) {
    sql += ' AND exam_date = ?';
    params.push(date);
  }
  sql += ' ORDER BY exam_date DESC, session, room, seat_no, register_no LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

function getSeating({ room, exam_date, session } = {}) {
  let sql = 'SELECT register_no, name, room, seat_no, exam_name, exam_date, session FROM allocations WHERE room = ?';
  const params = [room];
  if (exam_date) {
    sql += ' AND exam_date = ?';
    params.push(exam_date);
  }
  if (session) {
    sql += ' AND session = ?';
    params.push(session);
  }
  sql += ' ORDER BY seat_no, register_no';
  return db.prepare(sql).all(...params);
}

module.exports = {
  findByRegisterNo: (regNo) => findStmt.all(regNo),
  findTodayByRegisterNo: (regNo, date) => findTodayStmt.all(regNo, date),
  upsertRecord: (rec) => upsertStmt.run(rec),
  deleteRecord: (regNo, date, session) => deleteRecordStmt.run(regNo, date || '', session || ''),
  saveAll: (rows, { replace }) => insertMany(rows, replace),
  clear: () => clearStmt.run(),
  stats: () => ({ students: countStmt.get().n, rooms: roomsStmt.get().n }),
  listAllocations,
  getAll: () => allStmt.all(),
  getDistinctFilters: () => ({
    rooms: distinctRoomsStmt.all().map((r) => r.room),
    dates: distinctDatesStmt.all().map((d) => d.exam_date),
    sessions: distinctSessionsStmt.all().map((s) => s.session)
  }),
  getSeating
};
