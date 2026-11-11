const rateLimit = require('express-rate-limit');
const config = require('../config');

// Generous: many students may share one college WiFi IP.
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.lookupRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  skipSuccessfulRequests: true, // Successful logins never count against the limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts. Please wait a moment and try again.' }
});

module.exports = { lookupLimiter, loginLimiter };
