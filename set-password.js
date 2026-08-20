/**
 * Admin Password Setup / Reset Script
 * Usage:
 *   node set-password.js <newPassword>
 *   node set-password.js <username> <newPassword>
 */

const bcrypt = require('bcryptjs');
const db = require('./database');

const args = process.argv.slice(2);

let username = 'admin';
let newPassword = '';

if (args.length === 1) {
  newPassword = args[0];
} else if (args.length >= 2) {
  username = args[0];
  newPassword = args[1];
} else {
  console.log('\n❌ Usage:');
  console.log('   node set-password.js <newPassword>');
  console.log('   node set-password.js <username> <newPassword>\n');
  process.exit(1);
}

if (!newPassword || newPassword.length < 6) {
  console.log('\n❌ Password must be at least 6 characters long.\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 10);
const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

if (user) {
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(hash, username);
  console.log(`\n✅ Password for admin user "${username}" updated successfully!`);
} else {
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`\n✅ Created new admin user "${username}" with custom password!`);
}

console.log(`🔐 Username: ${username}`);
console.log(`🔑 Password: ${newPassword}\n`);
process.exit(0);
