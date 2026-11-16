const router = require('express').Router();
const service = require('../services/allocationService');
const studentLookupLog = require('../services/studentLookupLogService');
const { lookupLimiter } = require('../middleware/rateLimit');
const { normalizeRegisterNo } = require('../utils/registerNo');

router.get('/allocation/:registerNo', lookupLimiter, async (req, res, next) => {
  try {
    const { status, body } = await service.lookup(req.params.registerNo, req.query.date);
    res.set('Cache-Control', 'no-store');
    const registerNo = normalizeRegisterNo(req.params.registerNo);
    if (registerNo) {
      await studentLookupLog.recordLookup({
        registerNo,
        studentName: body.name,
        status
      }).catch((error) => {
        console.error('Could not write student lookup log:', error);
      });
    }
    res.status(status).json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
