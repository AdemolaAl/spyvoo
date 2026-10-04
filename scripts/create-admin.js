'use strict';
// Create an admin, or turn an existing account into an admin and set a new password.
// Usage: npm run create-admin -- you@example.com "a-long-password" ["Your name"]
// On Railway: install the CLI (npm i -g @railway/cli), then `railway login`, `railway link`, `railway ssh` and run the same line.
const db = require('../src/db');
const { hashPassword } = require('../src/lib/security');

const [email, password, name] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- you@example.com "password of 10+ characters" ["Name"]');
  process.exit(1);
}
db.open();
const e = email.trim().toLowerCase();
const u = db.one('SELECT * FROM users WHERE email = ?', e);
if (u) {
  db.update('users', u.id, { role: 'admin', password_hash: hashPassword(password), email_verified: 1, suspended: 0, ...(name ? { name } : {}) });
  console.log('Updated ' + e + ': now an admin with the new password.');
} else {
  db.insert('users', { email: e, name: name || 'Admin', password_hash: hashPassword(password), email_verified: 1, role: 'admin', plan_id: 'agency', plan_renews_at: '2099-12-31T00:00:00.000Z', onboarding: JSON.stringify({ tour_seen: false }), created_at: db.now() });
  console.log('Admin created: ' + e + '. Log in at /login, then open /admin.');
}
