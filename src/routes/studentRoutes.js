const router = require('express').Router();
const service = require('../services/allocationService');
const { lookupLimiter } = require('../middleware/rateLimit');

router.get('/allocation/:registerNo', lookupLimiter, async (req, res, next) => {
  try {
    const { status, body } = await service.lookup(req.params.registerNo, req.query.date);
    res.set('Cache-Control', 'no-store');
    res.status(status).json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
