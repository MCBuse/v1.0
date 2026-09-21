const fs = require('node:fs');
const path = require('node:path');
const { entries } = JSON.parse(fs.readFileSync(path.join(__dirname, '../drizzle/meta/_journal.json'), 'utf8'));
for (let i = 1; i < entries.length; i++) {
  if (entries[i].idx !== entries[i - 1].idx + 1 || entries[i].when <= entries[i - 1].when) {
    throw new Error(`Non-monotonic migration journal at ${entries[i].tag}; do not rewrite applied history.`);
  }
}
console.log(`Migration journal is monotonic (${entries.length} entries).`);
