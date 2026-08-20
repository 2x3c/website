const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const dbPath = isVercel
  ? path.join('/tmp', 'registrations.json')
  : path.join(__dirname, 'registrations.json');

// Low-overhead Pure JS JSON Database for Serverless & Local compatibility
class JSONDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      registrations: [],
      admin_users: []
    };
    this.load();
    this.seedAdmin();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
        if (!this.data.registrations) this.data.registrations = [];
        if (!this.data.admin_users) this.data.admin_users = [];
      }
    } catch (e) {
      console.error('DB Load Error:', e);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('DB Save Error:', e);
    }
  }

  seedAdmin() {
    if (this.data.admin_users.length === 0) {
      const hash = bcrypt.hashSync('U5bpUGHz01E7u2', 10);
      this.data.admin_users.push({
        id: 1,
        username: 'trishan',
        password_hash: hash,
        created_at: new Date().toISOString()
      });
      this.save();
    }
  }

  exec(sql) {
    // No-op for CREATE TABLE / ALTER TABLE in JSON mode
  }

  pragma(p) {}

  prepare(sql) {
    const db = this;
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    return {
      get(...params) {
        db.load();
        if (/SELECT \* FROM admin_users WHERE username = \?/i.test(cleanSql)) {
          return db.data.admin_users.find(u => u.username === params[0]) || undefined;
        }
        if (/SELECT \* FROM admin_users WHERE id = \?/i.test(cleanSql)) {
          return db.data.admin_users.find(u => u.id == params[0]) || undefined;
        }
        if (/SELECT id FROM admin_users/i.test(cleanSql)) {
          return db.data.admin_users[0] || undefined;
        }
        if (/SELECT COUNT\(\*\) as count FROM registrations WHERE date\(submitted_at\) = date\('now'/i.test(cleanSql)) {
          const today = new Date().toISOString().split('T')[0];
          const count = db.data.registrations.filter(r => (r.submitted_at || '').startsWith(today)).length;
          return { count };
        }
        if (/SELECT COUNT\(\*\) as count FROM registrations WHERE submitted_at >= datetime\('now', '-7 days'/i.test(cleanSql)) {
          const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
          const count = db.data.registrations.filter(r => (r.submitted_at || '') >= weekAgo).length;
          return { count };
        }
        if (/SELECT COUNT\(\*\) as count FROM registrations WHERE submitted_at >= datetime\('now', '-30 days'/i.test(cleanSql)) {
          const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
          const count = db.data.registrations.filter(r => (r.submitted_at || '') >= monthAgo).length;
          return { count };
        }
        if (/SELECT COUNT\(\*\) as count FROM registrations/i.test(cleanSql) || /SELECT COUNT\(\*\) as total FROM registrations/i.test(cleanSql)) {
          let list = db.data.registrations;
          if (params.length >= 4) {
            const term = (params[0] || '').replace(/%/g, '').toLowerCase();
            if (term) {
              list = list.filter(r =>
                (r.full_name || '').toLowerCase().includes(term) ||
                (r.email || '').toLowerCase().includes(term) ||
                (r.phone || '').toLowerCase().includes(term) ||
                (r.city || '').toLowerCase().includes(term)
              );
            }
          }
          return { total: list.length, count: list.length };
        }
        if (/SELECT \* FROM registrations WHERE id = \?/i.test(cleanSql)) {
          return db.data.registrations.find(r => r.id === params[0]) || undefined;
        }
        return undefined;
      },

      all(...params) {
        db.load();
        if (/SELECT \* FROM admin_users/i.test(cleanSql)) {
          return db.data.admin_users;
        }
        if (/SELECT \* FROM registrations/i.test(cleanSql)) {
          let list = [...db.data.registrations];
          list.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));

          if (cleanSql.includes('WHERE full_name LIKE ?')) {
            const term = (params[0] || '').replace(/%/g, '').toLowerCase();
            if (term) {
              list = list.filter(r =>
                (r.full_name || '').toLowerCase().includes(term) ||
                (r.email || '').toLowerCase().includes(term) ||
                (r.phone || '').toLowerCase().includes(term) ||
                (r.city || '').toLowerCase().includes(term)
              );
            }
            const limit = params[params.length - 2];
            const offset = params[params.length - 1];
            if (typeof limit === 'number' && typeof offset === 'number') {
              return list.slice(offset, offset + limit);
            }
          } else if (cleanSql.includes('LIMIT ? OFFSET ?')) {
            const limit = params[0];
            const offset = params[1];
            if (typeof limit === 'number' && typeof offset === 'number') {
              return list.slice(offset, offset + limit);
            }
          }
          return list;
        }
        return [];
      },

      run(...params) {
        db.load();
        if (/DELETE FROM admin_users/i.test(cleanSql)) {
          db.data.admin_users = [];
          db.save();
          return { changes: 1 };
        }
        if (/INSERT INTO admin_users/i.test(cleanSql)) {
          db.data.admin_users.push({
            id: db.data.admin_users.length + 1,
            username: params[0],
            password_hash: params[1],
            created_at: new Date().toISOString()
          });
          db.save();
          return { changes: 1 };
        }
        if (/UPDATE admin_users SET password_hash = \? WHERE id = \?/i.test(cleanSql)) {
          const u = db.data.admin_users.find(x => x.id == params[1]);
          if (u) u.password_hash = params[0];
          db.save();
          return { changes: 1 };
        }
        if (/INSERT INTO registrations/i.test(cleanSql)) {
          const reg = {
            id: params[0],
            full_name: params[1],
            email: params[2],
            phone: params[3],
            dob: params[4],
            city: params[5],
            state: params[6],
            country: params[7],
            gender: params[8],
            instagram_id: params[9],
            education: params[10],
            experience: params[11],
            skills: params[12],
            working_hours: params[13],
            resume_path: params[14],
            resume_original_name: params[15],
            heard_from: params[16],
            responses_json: params[17],
            submitted_at: new Date().toISOString()
          };
          db.data.registrations.unshift(reg);
          db.save();
          return { changes: 1 };
        }
        if (/DELETE FROM registrations WHERE id = \?/i.test(cleanSql)) {
          db.data.registrations = db.data.registrations.filter(r => r.id !== params[0]);
          db.save();
          return { changes: 1 };
        }
        return { changes: 0 };
      }
    };
  }
}

const db = new JSONDb(dbPath);

module.exports = db;
