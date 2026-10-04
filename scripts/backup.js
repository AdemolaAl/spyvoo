'use strict';
// Copy the database to a timestamped file next to it (safe while the app runs: uses SQLite VACUUM INTO).
// Usage: npm run backup            → data/backups/spyvoo-2026-10-04T08-00-00.db
//        npm run backup -- /path/to/file.db
// Keeps the newest 14 backups in data/backups. Media files are not included (copy the media folder or use R2).
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const db = require('../src/db');

db.open();
const dir = path.join(path.dirname(config.dbPath), 'backups');
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dir, 'spyvoo-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.db');
fs.mkdirSync(path.dirname(target), { recursive: true });
if (fs.existsSync(target)) fs.unlinkSync(target);
db.raw.exec("VACUUM INTO '" + target.replace(/'/g, "''") + "'");
console.log('Backup saved: ' + target + ' (' + (fs.statSync(target).size / 1048576).toFixed(1) + ' MB)');

if (!process.argv[2]) {
  const old = fs.readdirSync(dir).filter(f => /^spyvoo-.*\.db$/.test(f)).sort().reverse().slice(14);
  old.forEach(f => fs.unlinkSync(path.join(dir, f)));
  if (old.length) console.log('Removed ' + old.length + ' old backup(s).');
}
