const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'registrations.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create registrations table
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    dob TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    gender TEXT,
    instagram_id TEXT,
    education TEXT,
    experience TEXT,
    skills TEXT,
    working_hours TEXT,
    resume_path TEXT,
    resume_original_name TEXT,
    heard_from TEXT,
    responses_json TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
try {
  db.exec(`ALTER TABLE registrations ADD COLUMN responses_json TEXT`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE registrations ADD COLUMN instagram_id TEXT`);
} catch(e) {}

// Create admin_users table
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed default admin if no admin accounts exist
const anyAdminExists = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
if (!anyAdminExists) {
  const hash = bcrypt.hashSync('Admin@123', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
}

module.exports = db;
