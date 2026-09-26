// Shared write step for the generators (csp:hashes, sync:zephyy).
// With --check (what `npm run check` passes) a file that would change is
// reported as drift and fails the run instead of being written.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CHECK = process.argv.includes('--check');

module.exports = function writeIfChanged(filePath, source, updated) {
    const label = path.relative(ROOT, filePath);
    if (updated === source) {
        console.log(`Already synced: ${label}`);
    } else if (CHECK) {
        process.exitCode = 1;
        console.log(`Drift: ${label}`);
    } else {
        fs.writeFileSync(filePath, updated);
        console.log(`Synced: ${label}`);
    }
};
