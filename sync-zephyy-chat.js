const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'public', 'zephyy.html');
const STAMP_PATTERN = /^[ \t]*<!-- zp-chat:start -->[\s\S]*?^[ \t]*<!-- zp-chat:end -->/m;
const SCRIPT_KEYS = [
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-database-compat.js',
    'js/zephyy-realtime.js',
    'js/zephyy-chat.js'
];
const SUBPAGES = ['crew', 'qa', 'changelog', 'status'];
// Keys the stamp OWNS on subpages (always re-stamped at the profile's current
// version). SDK keys are insert-if-missing only — the status page loads its
// own copies mid-page and they must not move.
const OWNED_KEYS = ['js/zephyy-realtime.js', 'js/zephyy-chat.js'];

function scriptKey(src) {
    return src.replace(/^\//, '').split('?')[0];
}

function scriptTags(source) {
    return Array.from(source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g), function (match) {
        return { tag: match[0], key: scriptKey(match[1]) };
    });
}

function canonicalMarkup(source) {
    const match = source.match(STAMP_PATTERN);
    if (!match) throw new Error('Could not find canonical Zephyy chat markers');
    return match[0].replace('class="zp-orb-demo"', 'class="zp-orb-demo zp-orb-floating"');
}

function canonicalScripts(source) {
    const tags = scriptTags(source);
    return SCRIPT_KEYS.map(function (key) {
        const found = tags.find(function (item) { return item.key === key; });
        if (!found) throw new Error(`Could not find required script ${key} in public/zephyy.html`);
        return {
            key: key,
            tag: found.tag.replace(/src="js\//, 'src="/js/')
        };
    });
}

function stampPage(filePath, markup, requiredScripts) {
    const source = fs.readFileSync(filePath, 'utf8');
    let withoutStamp = source.replace(/\n?[ \t]*<!-- zp-chat:start -->[\s\S]*?^[ \t]*<!-- zp-chat:end -->\n?/m, '\n');
    // Strip owned script tags wherever they are so their version always
    // tracks the profile (earlier stamps left them outside the markers).
    scriptTags(withoutStamp).forEach(function (item) {
        if (OWNED_KEYS.includes(item.key)) {
            withoutStamp = withoutStamp.replace(new RegExp('[ \\t]*' + item.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'), '');
        }
    });
    const loadedKeys = new Set(scriptTags(withoutStamp).map(function (item) { return item.key; }));
    const scriptLines = requiredScripts
        .filter(function (item) { return OWNED_KEYS.includes(item.key) || !loadedKeys.has(item.key); })
        .map(function (item) { return `    ${item.tag}`; });
    const stamp = markup.replace(/^([ \t]*)<!-- zp-chat:end -->/m, scriptLines.join('\n') + '\n$1<!-- zp-chat:end -->');

    withoutStamp = withoutStamp.replace(/\n+<\/body>/, '\n</body>');
    if (!/<\/body>/.test(withoutStamp)) {
        throw new Error(`Could not find </body> in ${path.relative(ROOT, filePath)}`);
    }
    const updated = withoutStamp.replace(/\n?<\/body>/, `\n\n${stamp}\n</body>`);
    if (updated === source) {
        console.log(`Already synced: ${path.relative(ROOT, filePath)}`);
        return;
    }
    fs.writeFileSync(filePath, updated);
    console.log(`Synced: ${path.relative(ROOT, filePath)}`);
}

const profile = fs.readFileSync(PROFILE_PATH, 'utf8');
const markup = canonicalMarkup(profile);
const requiredScripts = canonicalScripts(profile);

SUBPAGES.forEach(function (subpage) {
    stampPage(path.join(ROOT, 'public', 'zephyy', subpage, 'index.html'), markup, requiredScripts);
});
