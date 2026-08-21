const fs = require('fs');
const path = require('path');

const searchDir = path.join(__dirname, '..', 'search');
const files = fs.readdirSync(searchDir).filter(f => f.endsWith('.html') && f !== 'sitemap.xml');

let urls = '';
urls += `    <url>
        <loc>https://www.weiyingjun.top/search/</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>\n`;

for (const file of files) {
    const name = path.basename(file, '.html');
    urls += `    <url>
        <loc>https://www.weiyingjun.top/search/${name}.html</loc>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>\n`;
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>`;

fs.writeFileSync(path.join(searchDir, 'sitemap.xml'), sitemap, 'utf8');
console.log(`Generated sitemap with ${files.length + 1} URLs.`);
