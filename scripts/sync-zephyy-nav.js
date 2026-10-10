const fs = require('fs');
const path = require('path');
const writeIfChanged = require('./lib/write-if-changed');

const ROOT = path.join(__dirname, '..');
const STAMP_START = '<!-- zp-nav:start -->';
const STAMP_END = '<!-- zp-nav:end -->';

const NAV_CONFIG = {
    subpages: [
        {
            id: 'crew',
            label: 'Crew',
            title: 'The Crew',
            href: '/zephyy/crew'
        },
        {
            id: 'qa',
            label: 'Pipeline',
            title: 'Pipeline',
            href: '/zephyy/qa'
        },
        {
            id: 'changelog',
            label: 'Changelog',
            title: 'Changelog',
            href: '/zephyy/changelog'
        },
        {
            id: 'status',
            label: 'Status',
            title: 'Live Status',
            href: '/zephyy/status'
        }
    ],
    doshus: {
        label: 'Doshus',
        href: '/',
        subpageIcon: '<img src="/doshusfavi.ico" width="18" height="18" alt="Doshus">'
    }
};

function stampedBlock(content, indent) {
    return `${indent}${STAMP_START}\n${content}\n${indent}${STAMP_END}`;
}

function replaceStampedBlock(source, content, indent, fallbackPattern, fileLabel) {
    const stampedPattern = /^[ \t]*<!-- zp-nav:start -->[\s\S]*?^[ \t]*<!-- zp-nav:end -->/m;
    const replacement = stampedBlock(content, indent);

    if (stampedPattern.test(source)) {
        return source.replace(stampedPattern, replacement);
    }
    if (!fallbackPattern.test(source)) {
        throw new Error(`Could not find navigation block in ${fileLabel}`);
    }
    return source.replace(fallbackPattern, replacement);
}

function renderSubpageNav(page) {
    const links = NAV_CONFIG.subpages.map((item) => {
        const current = item.id === page.id ? ' class="active" aria-current="page"' : '';
        return `            <a href="${item.href}"${current}>${item.label}</a>`;
    }).join('\n');

    return [
        '    <nav class="zp-sub-nav">',
        '        <a href="/zephyy" class="zp-sub-back">← Profile</a>',
        `        <span class="zp-sub-title">${page.title}</span>`,
        '        <div class="zp-sub-links">',
        links,
        `            <a href="${NAV_CONFIG.doshus.href}" class="zp-sub-doshus">${NAV_CONFIG.doshus.subpageIcon}</a>`,
        '        </div>',
        '    </nav>'
    ].join('\n');
}

for (const page of NAV_CONFIG.subpages) {
    const filePath = path.join(ROOT, 'public', 'zephyy', page.id, 'index.html');
    const source = fs.readFileSync(filePath, 'utf8');
    let updated = replaceStampedBlock(
        source,
        renderSubpageNav(page),
        '    ',
        /^[ \t]*<nav class="zp-sub-nav">[\s\S]*?<\/nav>/m,
        path.relative(ROOT, filePath)
    );

    updated = updated.replace(/\n[ \t]*<footer class="sticky-footer"[\s\S]*?<\/footer>\n/, '\n');

    const stylesheetPattern = /href="\/css\/zephyy-subpage\.css(?:\?v=[^"]*)?"/;
    if (!stylesheetPattern.test(updated)) {
        throw new Error(`Could not find Zephyy subpage stylesheet in ${path.relative(ROOT, filePath)}`);
    }
    updated = updated.replace(stylesheetPattern, 'href="/css/zephyy-subpage.css"');  // no ?v= busters (AGENTS.md)

    writeIfChanged(filePath, source, updated);
}
