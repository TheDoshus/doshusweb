const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'public', 'zephyy.html');
const STAMP_PATTERN = /^[ \t]*<!-- zp-chat:start -->[\s\S]*?^[ \t]*<!-- zp-chat:end -->/m;

const SCRIPT_KEYS = [
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-database-compat.js',
    'js/zephyy-realtime.js',
    'js/zephyy-chat.js',
    'js/zephyy-orb-embed.js' // Added the new embed JS
];

const SITEWIDE_PAGES = [
    'index.html',
    'nexus.html',
    'thelounge.html',
    'financehub.html',
    '404.html'
];

const OWNED_KEYS = ['js/zephyy-realtime.js', 'js/zephyy-chat.js', 'js/zephyy-orb-embed.js'];

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
    
    let html = match[0];
    
    // Replace the #zp-orb-demo profile orb with the sitewide orb component
    html = html.replace(/<!-- Chat Orb -->[\s\S]*?<div class="zp-orb-demo"[^>]*>[\s\S]*?<\/div>/, `<!-- Sitewide Chat Orb Embed -->
        <link rel="stylesheet" href="css/zephyy-orb-embed.css">
        <div class="zephyy-orb-sitewide-wrapper" id="sitewide-orb-wrapper">
            <div class="zephyy-orb-sitewide" id="zp-orb-demo" tabindex="0" role="button" aria-label="Chat with Zephyy">
                <div class="sitewide-orb-ping-container"><div class="sitewide-orb-ping"></div></div>
                <div class="sitewide-orb-core"></div>
                <div class="sitewide-orb-preview">Zephyy ⚡</div>
            </div>
        </div>`);
        
    return html;
}

function canonicalScripts(source) {
    const tags = scriptTags(source);
    // Note: zephyy-orb-embed.js isn't in zephyy.html, so we manually construct its tag
    return SCRIPT_KEYS.map(function (key) {
        if (key === 'js/zephyy-orb-embed.js') {
            return { key, tag: '<script src="js/zephyy-orb-embed.js"></script>' };
        }
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
    
    scriptTags(withoutStamp).forEach(function (item) {
        if (OWNED_KEYS.includes(item.key)) {
            withoutStamp = withoutStamp.replace(new RegExp('[ \\t]*' + item.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'), '');
        }
    });
    
    const loadedKeys = new Set(scriptTags(withoutStamp).map(function (item) { return item.key; }));
    const scriptLines = requiredScripts
        .filter(function (item) { return OWNED_KEYS.includes(item.key) || !loadedKeys.has(item.key); })
        .map(function (item) {
            // Fix absolute paths for these top-level pages
            return `    ${item.tag.replace(/src="\/js\//, 'src="js/')}`; 
        });
        
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

SITEWIDE_PAGES.forEach(function (page) {
    stampPage(path.join(ROOT, 'public', page), markup, requiredScripts);
});
