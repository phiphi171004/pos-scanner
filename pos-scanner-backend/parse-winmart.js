const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'winmart.csv');
const data = fs.readFileSync(file, 'utf-8');
const lines = data.split('\n');
console.log('Total lines:', lines.length);

// Tìm tất cả API URLs
const apiUrls = new Set();
const allUrls = new Set();
lines.forEach(l => {
    const matches = l.match(/https?:\/\/[^\s,"]+/g);
    if (matches) {
        matches.forEach(u => {
            try {
                const p = new URL(u);
                if (p.hostname.includes('winmart') || p.hostname.includes('wm')) {
                    allUrls.add(p.origin + p.pathname);
                    if (p.pathname.includes('api') || p.pathname.includes('product') || p.pathname.includes('categ')) {
                        apiUrls.add(p.origin + p.pathname);
                    }
                }
            } catch (e) {}
        });
    }
});

console.log('\n=== TẤT CẢ WINMART URLs (unique paths) ===');
[...allUrls].sort().forEach(u => console.log(' ', u));

console.log('\n=== API/PRODUCT URLs ===');
[...apiUrls].sort().forEach(u => console.log(' ', u));

// Tìm dòng có product/barcode data
console.log('\n=== DÒNG CÓ PRODUCT DATA ===');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"sku"') || lines[i].includes('"barcode"') || lines[i].includes('"productCode"') || lines[i].includes('"products"')) {
        console.log(`Line ${i + 1}: len=${lines[i].length}, preview: ${lines[i].substring(0, 200)}`);
    }
}

// Tìm request methods
console.log('\n=== REQUEST METHODS ===');
const methods = {};
lines.forEach(l => {
    const m = l.match(/,(GET|POST|PUT|DELETE|PATCH|OPTIONS),/);
    if (m) methods[m[1]] = (methods[m[1]] || 0) + 1;
});
Object.entries(methods).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// Tìm API hostnames khác
const hosts = new Set();
lines.forEach(l => {
    const matches = l.match(/https?:\/\/([^\/\s,"]+)/g);
    if (matches) matches.forEach(u => {
        try { hosts.add(new URL(u).hostname); } catch(e){}
    });
});
console.log('\n=== HOSTNAMES ===');
[...hosts].sort().forEach(h => console.log(' ', h));
