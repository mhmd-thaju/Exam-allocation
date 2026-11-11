const router = require('express').Router();
const multer = require('multer');
const config = require('../config');
const service = require('../services/allocationService');
const { requireAdmin, login, logout } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });

router.post('/login', loginLimiter, login);
router.post('/logout', logout);

router.get('/stats', requireAdmin, (req, res) => res.json(service.stats()));

router.get('/allocations', requireAdmin, (req, res) => {
  try {
    const list = service.listAllocations(req.query);
    res.json({ allocations: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/records', requireAdmin, (req, res) => {
  try {
    if (Array.isArray(req.body.records)) {
      const result = service.saveManualRecords(req.body.records);
      return res.json(result);
    }
    const saved = service.saveManualRecord(req.body);
    res.json({ ok: true, record: saved });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/record', requireAdmin, (req, res) => {
  try {
    const { register_no, exam_date, session } = req.body || {};
    if (!register_no) return res.status(400).json({ error: 'Register number is required.' });
    service.deleteRecord(register_no, exam_date, session);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/rooms', requireAdmin, (req, res) => {
  try {
    const filters = service.getDistinctFilters();
    res.json(filters);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/seating', requireAdmin, (req, res) => {
  try {
    const { room, date, session } = req.query;
    if (!room) return res.status(400).json({ error: 'Please specify a room or class.' });
    const students = service.getSeatingArrangement({ room, date, session });
    res.json({
      room,
      date: date || '',
      session: session || '',
      totalStudents: students.length,
      students
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/export', requireAdmin, (req, res) => {
  try {
    const csvData = service.exportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="allocations.csv"');
    res.send(csvData);
  } catch (e) {
    res.status(500).send('Could not export allocations.');
  }
});

router.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a CSV file.' });
  try {
    const { status, body } = service.importCsv(req.file.buffer, req.body.mode);
    res.status(status).json(body);
  } catch (e) {
    res.status(400).json({ error: 'Could not read the CSV file: ' + e.message });
  }
});

router.delete('/allocations', requireAdmin, (req, res) => {
  service.clearAll();
  res.json({ ok: true });
});

module.exports = router;
