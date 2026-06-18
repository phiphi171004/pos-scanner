const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'bhx2.csv');
const data = fs.readFileSync(file, 'utf-8');
const lines = data.split('\n');

// Tìm tất cả API endpoints
const allUrls = new Set();
data.match(/api\.bachhoaxanh\.com\/\S+/g)?.forEach(m => {
    allUrls.add(m.split(',')[0].split('?')[0]);
});
console.log('=== TẤT CẢ API ENDPOINTS ===');
[...allUrls].sort().forEach(u => console.log(' ', u));

// Tìm dòng có product data
console.log('\n=== TÌM PRODUCT DATA ===');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('productCode') || lines[i].includes('productPrices')) {
        console.log(`Line ${i + 1}: length=${lines[i].length}`);

        // Tìm JSON trong dòng  
        const line = lines[i];
        // CSV dùng "" để escape dấu "
        const jsonStart = line.indexOf('{"code"');
        if (jsonStart < 0) {
            const jsonStart2 = line.indexOf('{""code""');
            if (jsonStart2 >= 0) {
                // Cần unescape CSV double quotes
                let jsonStr = line.substring(jsonStart2);
                // Tìm cuối JSON
                const lastBrace = jsonStr.lastIndexOf('}');
                jsonStr = jsonStr.substring(0, lastBrace + 1);
                // Unescape "" -> "
                jsonStr = jsonStr.replace(/""/g, '"');
                try {
                    const obj = JSON.parse(jsonStr);
                    const ps = obj.data?.products || [];
                    console.log(`  Products: ${ps.length}`);
                    console.log(`  Total: ${obj.data?.total || '?'}`);
                    
                    let withCode = 0;
                    ps.forEach(p => { if (p.productCode) withCode++; });
                    console.log(`  With barcode: ${withCode}/${ps.length}`);

                    // Sample
                    ps.slice(0, 5).forEach(p => {
                        console.log(`  - [${p.productCode || 'NO-CODE'}] ${(p.name || '').substring(0, 50)} | ${p.productPrices?.[0]?.price || 0}đ | ${p.brandName || ''}`);
                    });
                } catch (e) {
                    console.log('  Parse error:', e.message.substring(0, 100));
                }
            }
        }
    }
}

// Tìm tất cả unique URL patterns
console.log('\n=== TẤT CẢ REQUEST URLS (unique) ===');
const reqUrls = new Set();
lines.forEach(l => {
    const m = l.match(/https:\/\/api\.bachhoaxanh\.com\/[^\s,]+/g);
    if (m) m.forEach(u => reqUrls.add(u));
});
[...reqUrls].sort().forEach(u => console.log(' ', u));
