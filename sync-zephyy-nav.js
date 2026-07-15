const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const STAMP_START = '<!-- zp-nav:start -->';
const STAMP_END = '<!-- zp-nav:end -->';

const NAV_CONFIG = {
    subpages: [
        {
            id: 'crew',
            label: 'Crew',
            title: 'The Crew',
            href: '/zephyy/crew',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="25px" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>'
        },
        {
            id: 'qa',
            label: 'Pipeline',
            title: 'Pipeline',
            href: '/zephyy/qa',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="25px" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
        },
        {
            id: 'changelog',
            label: 'Changelog',
            title: 'Changelog',
            href: '/zephyy/changelog',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="25px" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-3.06 16L7.4 14.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L10.94 18zM13 9V3.5L18.5 9H13z"/></svg>'
        },
        {
            id: 'status',
            label: 'Status',
            title: 'Live Status',
            href: '/zephyy/status',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="25px" viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>'
        }
    ],
    doshus: {
        label: 'Doshus',
        href: '/',
        subpageIcon: '<img src="https://doshus.net/doshusfavi.ico" width="18" height="18" alt="Doshus">',
        profileIcon: '<img src="https://doshus.net/doshusfavi.ico" width="25px" alt="Doshus logo" class="zp-logo-icon">'
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

function renderProfileNav() {
    const links = NAV_CONFIG.subpages.map((item) => [
        `            <a href="${item.href}">`,
        `                ${item.icon}`,
        `                <span>${item.label}</span>`,
        '            </a>'
    ].join('\n'));

    links.push([
        `            <a href="${NAV_CONFIG.doshus.href}">`,
        `                ${NAV_CONFIG.doshus.profileIcon}`,
        `                <span>${NAV_CONFIG.doshus.label}</span>`,
        '            </a>'
    ].join('\n'));

    return [
        '        <nav class="footer-nav">',
        links.join('\n'),
        '        </nav>'
    ].join('\n');
}

function writeIfChanged(filePath, source, updated) {
    if (updated === source) {
        console.log(`Already synced: ${path.relative(ROOT, filePath)}`);
        return;
    }
    fs.writeFileSync(filePath, updated);
    console.log(`Synced: ${path.relative(ROOT, filePath)}`);
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
    updated = updated.replace(stylesheetPattern, 'href="/css/zephyy-subpage.css?v=1"');

    writeIfChanged(filePath, source, updated);
}

const profilePath = path.join(ROOT, 'public', 'zephyy.html');
const profileSource = fs.readFileSync(profilePath, 'utf8');
const profileUpdated = replaceStampedBlock(
    profileSource,
    renderProfileNav(),
    '        ',
    /^[ \t]*<nav class="footer-nav">[\s\S]*?<\/nav>/m,
    path.relative(ROOT, profilePath)
);
writeIfChanged(profilePath, profileSource, profileUpdated);
