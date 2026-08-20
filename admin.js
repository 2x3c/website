const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const auth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'registrationform_super_secret_key_2026';

// In-memory rate limiter for login attempts
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

// POST /api/admin/login
router.post('/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const attempts = loginAttempts.get(ip);
  if (attempts && attempts.count >= MAX_ATTEMPTS) {
    if (now - attempts.firstAttempt < LOCK_TIME) {
      const remainingMin = Math.ceil((LOCK_TIME - (now - attempts.firstAttempt)) / 60000);
      return res.status(429).json({ error: `Too many failed attempts. Account locked for ${remainingMin} more minutes.` });
    } else {
      loginAttempts.delete(ip);
    }
  }

  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required.' });

  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin) {
    recordFailedAttempt(ip, now);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    recordFailedAttempt(ip, now);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Clear attempts on successful login
  loginAttempts.delete(ip);

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, username: admin.username });
});

function recordFailedAttempt(ip, now) {
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  record.count += 1;
  loginAttempts.set(ip, record);
}

// POST /api/admin/change-password
router.post('/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current password and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);
  if (!admin) {
    return res.status(404).json({ error: 'Admin user not found.' });
  }

  const valid = bcrypt.compareSync(currentPassword, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

  res.json({ success: true, message: 'Password changed successfully! Please use your new password next time.' });
});

// GET /api/admin/responses
router.get('/responses', auth, (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = 'SELECT * FROM registrations';
  let countQuery = 'SELECT COUNT(*) as total FROM registrations';
  const params = [];

  if (search) {
    const like = `%${search}%`;
    query += ' WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?';
    countQuery += ' WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?';
    params.push(like, like, like, like);
  }

  query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';

  const rows = db.prepare(query).all(...params, parseInt(limit), offset);
  const { total } = db.prepare(countQuery).get(...params);

  res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/admin/stats
router.get('/stats', auth, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as count FROM registrations").get().count;
  const today = db.prepare("SELECT COUNT(*) as count FROM registrations WHERE date(submitted_at) = date('now', 'localtime')").get().count;
  const week = db.prepare("SELECT COUNT(*) as count FROM registrations WHERE submitted_at >= datetime('now', '-7 days', 'localtime')").get().count;
  const month = db.prepare("SELECT COUNT(*) as count FROM registrations WHERE submitted_at >= datetime('now', '-30 days', 'localtime')").get().count;
  res.json({ success: true, total, today, week, month });
});

// GET /api/admin/responses/:id
router.get('/responses/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Response not found.' });
  res.json({ success: true, data: row });
});

// DELETE /api/admin/responses/:id
router.delete('/responses/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Response not found.' });

  // Helper to find file path on disk
  function getFilePath(filename) {
    const p1 = path.join('/tmp', 'uploads', filename);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(__dirname, '../uploads', filename);
    if (fs.existsSync(p2)) return p2;
    return p1;
  }

  // Delete resume file if exists
  if (row.resume_path) {
    const filePath = getFilePath(row.resume_path);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch(e) {}
    }
  }

  db.prepare('DELETE FROM registrations WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Response deleted.' });
});

// GET /api/admin/download/:id
router.get('/download/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!row || !row.resume_path) return res.status(404).json({ error: 'File not found.' });

  const p1 = path.join('/tmp', 'uploads', row.resume_path);
  const p2 = path.join(__dirname, '../uploads', row.resume_path);
  const filePath = fs.existsSync(p1) ? p1 : p2;

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk.' });

  res.download(filePath, row.resume_original_name || row.resume_path);
});

// GET /api/admin/export — Export all as CSV
router.get('/export', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM registrations ORDER BY submitted_at DESC').all();
  const headers = ['ID','Full Name','Email','Phone','Instagram ID','DOB','City','State','Country','Gender','Education','Experience','Skills','Working Hours','Resume','Heard From','Submitted At'];
  const csvRows = rows.map(r => [
    r.id, r.full_name, r.email, r.phone, r.instagram_id || '', r.dob,
    r.city, r.state, r.country, r.gender,
    r.education, r.experience, r.skills, r.working_hours,
    r.resume_original_name || '', r.heard_from, r.submitted_at
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...csvRows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(csv);
});

module.exports = router;
