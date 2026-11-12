const db = require('../db');

const selectFields = 'register_no, name, room, seat_no, exam_name, exam_date, session';
const upsertSql =
  `INSERT INTO allocations (${selectFields})
   VALUES (@register_no, @name, @room, @seat_no, @exam_name, @exam_date, @session)
   ON CONFLICT(register_no, exam_date, session) DO UPDATE SET
     name = excluded.name, room = excluded.room, seat_no = excluded.seat_no,
     exam_name = excluded.exam_name`;

async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows;
}

async function findByRegisterNo(regNo) {
  return all(
    `SELECT ${selectFields} FROM allocations
      WHERE register_no = ? ORDER BY exam_date, session`,
    [regNo]
  );
}

async function findTodayByRegisterNo(regNo, date) {
  return all(
    `SELECT ${selectFields} FROM allocations
      WHERE register_no = ? AND (exam_date = ? OR exam_date = '')
      ORDER BY session`,
    [regNo, date]
  );
}

async function upsertRecord(record) {
  return db.execute({ sql: upsertSql, args: record });
}

async function deleteRecord(regNo, date, session) {
  return db.execute({
    sql: 'DELETE FROM allocations WHERE register_no = ? AND exam_date = ? AND session = ?',
    args: [regNo, date, session]
  });
}

async function saveAll(rows, { replace }) {
  const statements = [];
  if (replace) statements.push({ sql: 'DELETE FROM allocations' });
  for (const row of rows) statements.push({ sql: upsertSql, args: row });
  await db.batch(statements);
}

async function clear() {
  return db.execute({ sql: 'DELETE FROM allocations' });
}

async function stats() {
  const [students, rooms] = await Promise.all([
    all('SELECT COUNT(*) AS n FROM allocations'),
    all('SELECT COUNT(DISTINCT room) AS n FROM allocations')
  ]);
  return { students: Number(students[0].n), rooms: Number(rooms[0].n) };
}

async function listAllocations({ search = '', room = '', date = '', limit = 1000, offset = 0 } = {}) {
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
  return all(sql, params);
}

async function getSeating({ room, exam_date, session } = {}) {
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
  return all(sql, params);
}

async function getAll() {
  return all(
    `SELECT ${selectFields} FROM allocations
      ORDER BY exam_date, session, room, seat_no, register_no`
  );
}

async function getDistinctFilters() {
  const [rooms, dates, sessions] = await Promise.all([
    all("SELECT DISTINCT room FROM allocations WHERE room != '' ORDER BY room"),
    all("SELECT DISTINCT exam_date FROM allocations WHERE exam_date != '' ORDER BY exam_date"),
    all("SELECT DISTINCT session FROM allocations WHERE session != '' ORDER BY session")
  ]);
  return {
    rooms: rooms.map((row) => row.room),
    dates: dates.map((row) => row.exam_date),
    sessions: sessions.map((row) => row.session)
  };
}

module.exports = {
  findByRegisterNo,
  findTodayByRegisterNo,
  upsertRecord,
  deleteRecord,
  saveAll,
  clear,
  stats,
  listAllocations,
  getAll,
  getDistinctFilters,
  getSeating
};
