const fs = require('fs');
const path = require('path');

const printmonDir = path.join(__dirname, 'public', 'amazon', 'printmon');

function replaceInFiles() {
    const files = fs.readdirSync(printmonDir).filter(f => f.endsWith('.html'));
    
    files.forEach(file => {
        const filePath = path.join(printmonDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Add the CSS link if it doesn't exist
        if (!content.includes('zephyy-orb-embed.css')) {
            content = content.replace('</title>', '</title>\n\t<link rel="stylesheet" href="../../css/zephyy-orb-embed.css">');
        }
        
        // Replace the orb HTML
        const oldOrbRegex = /<a class="zephyy-orb"[^>]*>[\s\S]*?<span class="zephyy-orb-tip"[^>]*>[\s\S]*?<\/span>[\s\S]*?<\/a>/;
        
        if (oldOrbRegex.test(content)) {
            const newOrb = `<a class="zephyy-orb-sitewide-wrapper printmon-dock" href="gallery.html" aria-label="Zephyy's Theme Gallery">
\t\t\t\t\t\t\t<div class="zephyy-orb-sitewide">
\t\t\t\t\t\t\t\t<div class="sitewide-orb-core"></div>
\t\t\t\t\t\t\t\t<div class="sitewide-orb-preview zephyy-orb-tip" role="tooltip">skins I cooked up — come see ✨</div>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</a>`;
            content = content.replace(oldOrbRegex, newOrb);
            fs.writeFileSync(filePath, content);
            console.log(`Updated ${file}`);
        }
    });
}

replaceInFiles();
