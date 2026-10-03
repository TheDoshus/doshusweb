// fs.readdirSync in a stable order. Node returns entries sorted; Bun returns them in
// the filesystem's order, so a generator that walks a directory would reorder its
// output (and fail `bun run check` on drift) depending on which runtime ran it.
const fs = require('fs');

module.exports = (dir, opts) => fs.readdirSync(dir, opts)
    .sort((a, b) => {
        const x = typeof a === 'string' ? a : a.name;
        const y = typeof b === 'string' ? b : b.name;
        return x < y ? -1 : x > y ? 1 : 0;
    });
