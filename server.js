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

// Serve static frontend files safely
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api', formRouter);
app.use('/api/admin', adminRouter);

// Catch-all: serve index.html for any unmatched non-API route
app.use((req, res) => {
  const indexPath = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).json({ error: 'Page not found' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📋 Form:      http://localhost:${PORT}`);
    console.log(`🔐 Admin:     http://localhost:${PORT}/admin/login.html\n`);
  });
}

module.exports = app;
