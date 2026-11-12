const router = require('express').Router();
const multer = require('multer');
const config = require('../config');
const service = require('../services/allocationService');
const { requireSameOrigin, login, logout } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { auditAdminAction, listEvents } = require('../services/auditService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

router.use(requireSameOrigin);
router.post('/login', loginLimiter, asyncRoute(login));
router.post('/logout', auditAdminAction('auth.logout'), asyncRoute(logout));

router.get('/stats', auditAdminAction('dashboard.stats.read'), asyncRoute(async (req, res) => res.json(await service.stats())));

router.get('/allocations', auditAdminAction('allocations.list.read'), async (req, res) => {
  try {
    const list = await service.listAllocations(req.query);
    res.json({ allocations: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/records', auditAdminAction(
  'allocations.record.save',
  (req) => Array.isArray(req.body?.records) ? null : req.body?.register_no || null,
  (req) => ({ recordCount: Array.isArray(req.body?.records) ? req.body.records.length : 1 })
), async (req, res) => {
  try {
    if (Array.isArray(req.body.records)) {
      const result = await service.saveManualRecords(req.body.records);
      return res.json(result);
    }
    const saved = await service.saveManualRecord(req.body);
    res.json({ ok: true, record: saved });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/record', auditAdminAction(
  'allocations.record.delete',
  (req) => req.body?.register_no || null
), async (req, res) => {
  try {
    const { register_no, exam_date, session } = req.body || {};
    if (!register_no) return res.status(400).json({ error: 'Register number is required.' });
    await service.deleteRecord(register_no, exam_date, session);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/rooms', auditAdminAction('allocations.filters.read'), async (req, res) => {
  try {
    const filters = await service.getDistinctFilters();
    res.json(filters);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/seating', auditAdminAction(
  'allocations.seating.read',
  (req) => req.query.room || null
), async (req, res) => {
  try {
    const { room, date, session } = req.query;
    if (!room) return res.status(400).json({ error: 'Please specify a room or class.' });
    const students = await service.getSeatingArrangement({ room, date, session });
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

router.get('/export', auditAdminAction('allocations.export'), async (req, res) => {
  try {
    const csvData = await service.exportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="allocations.csv"');
    res.send(csvData);
  } catch (e) {
    res.status(500).send('Could not export allocations.');
  }
});

router.post('/upload', auditAdminAction(
  'allocations.import',
  () => 'allocations'
), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a CSV file.' });
  try {
    const { status, body } = await service.importCsv(req.file.buffer, req.body.mode);
    res.status(status).json(body);
  } catch (e) {
    res.status(400).json({ error: 'Could not read the CSV file: ' + e.message });
  }
});

router.delete('/allocations', auditAdminAction('allocations.clear', () => 'allocations'), asyncRoute(async (req, res) => {
  await service.clearAll();
  res.json({ ok: true });
}));

router.get('/audit', auditAdminAction('audit.log.read'), asyncRoute(async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const requestedOffset = Number(req.query.offset);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 200)
    : 100;
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0
    ? Math.floor(requestedOffset)
    : 0;
  res.json({ events: await listEvents({ limit, offset, excludeId: req.auditEventId }) });
}));

module.exports = router;
