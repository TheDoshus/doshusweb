const fs = require('fs');
const path = require('path');

// Configuration
const ROOT = path.join(__dirname, '..');
const memesDir = path.join(ROOT, 'public', 'assets', 'memes');
const outputFile = path.join(memesDir, 'meme-list.json');
const catalogFile = path.join(memesDir, 'meme-catalog.json');
const descriptionsFile = path.join(ROOT, 'data', 'meme-descriptions.json');

/**
 * Pure deterministic derivation of meme list and catalog from on-disk media files
 * and authored descriptions.
 */
function deriveMemeData({ dir = memesDir, descFile = descriptionsFile } = {}) {
    // Authored data must exist and parse cleanly, or fail closed
    if (!fs.existsSync(descFile)) {
        throw new Error(`Authored descriptions file not found: ${descFile}`);
    }

    let authoredRaw;
    try {
        authoredRaw = JSON.parse(fs.readFileSync(descFile, 'utf8'));
    } catch (e) {
        throw new Error(`Failed parsing ${descFile}: ${e.message}`);
    }

    if (typeof authoredRaw !== 'object' || authoredRaw === null) {
        throw new Error(`${descFile}: root must be an object`);
    }

    const authoredItems = Array.isArray(authoredRaw.items)
        ? authoredRaw.items
        : (Array.isArray(authoredRaw) ? authoredRaw : null);

    if (!authoredItems) {
        throw new Error(`${descFile}: items must be an array`);
    }

    const authoredMap = new Map();
    for (const item of authoredItems) {
        if (!item || typeof item !== 'object') {
            throw new Error(`${descFile}: invalid item entry`);
        }
        const key = item.id || (item.path ? path.basename(item.path) : null);
        if (!key || typeof key !== 'string') {
            throw new Error(`${descFile}: item missing valid id`);
        }
        if (typeof item.reviewed !== 'boolean') {
            throw new Error(`${descFile}: item ${key} missing boolean reviewed property`);
        }
        if (item.captionReview !== undefined && item.captionReview !== 'unreviewed' && item.captionReview !== 'human') {
            throw new Error(`${descFile}: item ${key} captionReview must be 'unreviewed' or 'human'`);
        }
        if (item.description !== undefined && typeof item.description !== 'string') {
            throw new Error(`${descFile}: item ${key} description must be string`);
        }
        if (item.tags !== undefined && !Array.isArray(item.tags)) {
            throw new Error(`${descFile}: item ${key} tags must be array`);
        }
        authoredMap.set(key, item);
        if (item.path) authoredMap.set(item.path, item);
    }

    if (!fs.existsSync(dir)) {
        throw new Error(`Memes directory not found: ${dir}`);
    }

    const files = fs.readdirSync(dir);
    files.sort(); // Deterministic sort across OS/filesystems

    const mediaFiles = files.filter(f =>
        /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i.test(f)
    );

    if (mediaFiles.length === 0) {
        throw new Error(`No media files found in ${dir}`);
    }

    const memePaths = mediaFiles.map(file => `/assets/memes/${file}`);

    const catalogItems = mediaFiles.map(file => {
        const relPath = `/assets/memes/${file}`;
        const isVideo = /\.(mp4|webm|mov)$/i.test(file);
        const authored = authoredMap.get(file) || authoredMap.get(relPath);

        const description = (authored && typeof authored.description === 'string')
            ? authored.description.trim()
            : '';
        const tags = (authored && Array.isArray(authored.tags))
            ? authored.tags.map(t => String(t).trim()).filter(Boolean)
            : [];
        // Reviewed is true only when explicitly reviewed AND non-empty description
        const reviewed = Boolean(authored && authored.reviewed === true && description.length > 0);
        const captionReview = (authored && authored.captionReview === 'human') ? 'human' : 'unreviewed';

        return {
            id: file,
            path: relPath,
            type: isVideo ? 'video' : 'image',
            description: description,
            tags: tags,
            reviewed: reviewed,
            captionReview: captionReview
        };
    });

    return {
        mediaFiles,
        memePaths,
        catalog: {
            version: 1,
            items: catalogItems
        }
    };
}

function generate({ dir = memesDir, descFile = descriptionsFile, outList = outputFile, outCat = catalogFile } = {}) {
    const derived = deriveMemeData({ dir, descFile });

    fs.writeFileSync(outList, JSON.stringify(derived.memePaths, null, 2) + '\n');
    console.log(`✅ Successfully generated ${outList} (${derived.memePaths.length} items)`);

    fs.writeFileSync(outCat, JSON.stringify(derived.catalog, null, 2) + '\n');
    const reviewedCount = derived.catalog.items.filter(item => item.reviewed).length;
    console.log(`✅ Successfully generated ${outCat} (${derived.catalog.items.length} items, ${reviewedCount} reviewed)`);

    return derived;
}

if (require.main === module) {
    try {
        generate();
    } catch (err) {
        console.error('❌ Error generating meme list/catalog:', err.message);
        process.exit(1);
    }
}

module.exports = {
    ROOT,
    memesDir,
    outputFile,
    catalogFile,
    descriptionsFile,
    deriveMemeData,
    generate
};
