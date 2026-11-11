const { parse } = require('csv-parse/sync');
const { normalizeRegisterNo } = require('../utils/registerNo');
const { normalizeDate } = require('../utils/dateUtils');

const ALIASES = {
  register_no: ['register_no', 'register_number', 'reg_no', 'regno', 'admission_id', 'admission_no', 'admission_number'],
  name: ['name', 'student_name'],
  room: ['room', 'class', 'classroom', 'class_room', 'hall'],
  seat_no: ['seat_no', 'seat', 'seat_number'],
  exam_name: ['exam_name', 'exam', 'subject', 'paper'],
  exam_date: ['exam_date', 'date'],
  session: ['session', 'time', 'shift']
};

function canon(header) {
  const h = String(header).trim().toLowerCase().replace(/[\s-]+/g, '_');
  for (const [key, list] of Object.entries(ALIASES)) if (list.includes(h)) return key;
  return h;
}

/** Returns { rows, errors } — bad rows are reported, not fatal. */
function parseAllocationCsv(buffer) {
  const records = parse(buffer, {
    columns: (hdr) => hdr.map(canon),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true
  });

  const rows = [];
  const errors = [];
  records.forEach((rec, i) => {
    const line = i + 2; // header is line 1
    const register_no = normalizeRegisterNo(rec.register_no);
    if (!register_no) return errors.push(`Line ${line}: missing/invalid register number`);
    if (!rec.room) return errors.push(`Line ${line}: missing room for ${register_no}`);
    rows.push({
      register_no,
      name: rec.name || '',
      room: rec.room,
      seat_no: rec.seat_no || '',
      exam_name: rec.exam_name || '',
      exam_date: normalizeDate(rec.exam_date),
      session: rec.session || ''
    });
  });
  return { rows, errors };
}

module.exports = { parseAllocationCsv };
