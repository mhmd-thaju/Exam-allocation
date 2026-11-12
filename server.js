const path = require('path');
const os = require('os');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./src/config');
require('./src/db'); // initialise DB/schema

const app = express();
app.set('trust proxy', 1); // correct client IPs behind nginx/cloudflare

// Configure security headers without forcing HTTPS upgrades on local Wi-Fi / HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
      upgradeInsecureRequests: null // Disable auto-upgrading to HTTPS on local LAN HTTP
    }
  },
  hsts: false // Disable HSTS so mobile browsers don't force HTTPS over local IP
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use('/api', require('./src/routes/studentRoutes'));
app.use('/api/admin', require('./src/routes/adminRoutes'));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

if (require.main === module) {
  const localIp = getLocalIp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Exam allocation running on:`);
    console.log(`- Local:   http://localhost:${config.port}`);
    console.log(`- Network: http://${localIp}:${config.port}`);
  });
}

module.exports = app;
