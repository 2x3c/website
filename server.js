const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize DB (creates tables + seeds admin)
require('./database');

const formRouter = require('./routes/form');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Locate public directory across local and Vercel environments
function getPublicDir() {
  const p1 = path.join(__dirname, 'public');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(process.cwd(), 'public');
  if (fs.existsSync(p2)) return p2;
  return __dirname;
}

const publicDir = getPublicDir();
app.use(express.static(publicDir));

// API Routes
app.use('/api', formRouter);
app.use('/api/admin', adminRouter);

// Catch-all: serve index.html
app.use((req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send('Not Found');
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📋 Form:      http://localhost:${PORT}`);
    console.log(`🔐 Admin:     http://localhost:${PORT}/admin/login.html\n`);
  });
}

module.exports = app;
