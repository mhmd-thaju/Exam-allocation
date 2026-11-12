const repo = require('../repositories/allocationRepository');
const { normalizeRegisterNo } = require('../utils/registerNo');
const { normalizeDate, getTodayIso } = require('../utils/dateUtils');
const { parseAllocationCsv } = require('./csvService');

async function lookup(rawRegNo, clientDate) {
  const regNo = normalizeRegisterNo(rawRegNo);
  if (!regNo) return { status: 400, body: { error: 'Please enter a valid register / admission number.' } };

  const today = getTodayIso(clientDate);
  const todayAllocations = await repo.findTodayByRegisterNo(regNo, today);

  if (todayAllocations.length > 0) {
    return {
      status: 200,
      body: {
        register_no: regNo,
        name: todayAllocations[0].name,
        date: today,
        allocations: todayAllocations
      }
    };
  }

  // If not found for today, check if student exists on other dates to give helpful feedback
  const allAllocations = await repo.findByRegisterNo(regNo);
  if (allAllocations.length > 0) {
    return {
      status: 404,
      body: {
        error: `No exams scheduled for you today (${today}). Arrangements are only visible on the day of your examination.`
      }
    };
  }

  return { status: 404, body: { error: 'No allocation found. Check the number or contact the exam office.' } };
}

async function importCsv(buffer, mode) {
  const { rows, errors } = parseAllocationCsv(buffer);
  if (!rows.length) return { status: 400, body: { error: 'No valid rows found.', errors: errors.slice(0, 50) } };
  await repo.saveAll(rows, { replace: mode !== 'append' });
  return {
    status: 200,
    body: { imported: rows.length, skipped: errors.length, errors: errors.slice(0, 50), mode: mode === 'append' ? 'append' : 'replace' }
  };
}

async function saveManualRecord(data) {
  const register_no = normalizeRegisterNo(data.register_no);
  if (!register_no) throw new Error('Valid Register / Admission Number is required.');
  const room = String(data.room || '').trim();
  if (!room) throw new Error('Room / Class is required.');

  const record = {
    register_no,
    name: String(data.name || '').trim(),
    room,
    seat_no: String(data.seat_no || '').trim(),
    exam_name: String(data.exam_name || '').trim(),
    exam_date: normalizeDate(data.exam_date),
    session: String(data.session || '').trim()
  };

  await repo.upsertRecord(record);
  return record;
}

async function saveManualRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('No records provided.');
  }
  const saved = [];
  const errors = [];
  for (const [idx, rec] of records.entries()) {
    try {
      saved.push(await saveManualRecord(rec));
    } catch (err) {
      errors.push(`Row ${idx + 1}: ${err.message}`);
    }
  }
  return { savedCount: saved.length, errors };
}

async function deleteRecord(regNo, date, session) {
  const normalized = normalizeRegisterNo(regNo);
  if (!normalized) throw new Error('Invalid register number.');
  await repo.deleteRecord(normalized, normalizeDate(date), session || '');
}

async function listAllocations(query = {}) {
  return repo.listAllocations({
    search: query.search || '',
    room: query.room || '',
    date: query.date ? normalizeDate(query.date) : '',
    limit: Math.min(Number(query.limit) || 1000, 5000),
    offset: Number(query.offset) || 0
  });
}

async function getDistinctFilters() {
  return repo.getDistinctFilters();
}

async function getSeatingArrangement({ room, date, session }) {
  if (!room) throw new Error('Room / Class is required.');
  const seating = await repo.getSeating({
    room: String(room).trim(),
    exam_date: date ? normalizeDate(date) : '',
    session: session ? String(session).trim() : ''
  });
  return seating;
}

async function exportCsv() {
  const rows = await repo.getAll();
  const headers = ['register_no', 'name', 'room', 'seat_no', 'exam_name', 'exam_date', 'session'];
  const escapeCsv = (val) => {
    const s = String(val ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCsv(r[h])).join(','));
  }
  return lines.join('\r\n');
}

module.exports = {
  lookup,
  importCsv,
  stats: repo.stats,
  clearAll: repo.clear,
  saveManualRecord,
  saveManualRecords,
  deleteRecord,
  listAllocations,
  getDistinctFilters,
  getSeatingArrangement,
  exportCsv
};
