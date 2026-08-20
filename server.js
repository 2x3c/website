const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize DB (creates tables + seeds admin)
require('./database');

const formRouter = require('./routes/form');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', formRouter);
app.use('/api/admin', adminRouter);

// Catch-all: serve index.html for any unmatched non-API route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📋 Form:      http://localhost:${PORT}`);
    console.log(`🔐 Admin:     http://localhost:${PORT}/admin/login.html\n`);
  });
}

module.exports = app;
