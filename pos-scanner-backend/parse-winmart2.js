const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'winmart.csv');
const data = fs.readFileSync(file, 'utf-8');
const lines = data.split('\n');

// Parse line 6198 - product data
const line = lines[6197]; // 0-indexed
const jsonStart = line.indexOf('{"data"');
if (jsonStart < 0) {
    // Tìm escaped JSON 
    const jsonStart2 = line.indexOf('{""data""');
    if (jsonStart2 >= 0) {
        let jsonStr = line.substring(jsonStart2);
        const lastBrace = jsonStr.lastIndexOf('}');
        jsonStr = jsonStr.substring(0, lastBrace + 1);
        jsonStr = jsonStr.replace(/""/g, '"');
        try {
            const obj = JSON.parse(jsonStr);
            console.log('=== PRODUCT STRUCTURE ===');
            console.log('Top keys:', Object.keys(obj));
            console.log('data keys:', Object.keys(obj.data || {}));
            
            const items = obj.data?.items || [];
            console.log('Items count:', items.length);
            console.log('Total:', obj.data?.total);
            console.log('Page:', obj.data?.page);
            console.log('pageSize:', obj.data?.pageSize);
            console.log('Category:', obj.data?.name);
            
            if (items[0]) {
                console.log('\n=== SAMPLE PRODUCT ===');
                const p = items[0];
                console.log(JSON.stringify({
                    id: p.id,
                    itemNo: p.itemNo,
                    name: p.name,
                    seoName: p.seoName,
                    brand: p.brand,
                    brandName: p.brandName,
                    barcode: p.barcode,
                    sku: p.sku,
                    price: p.price,
                    salePrice: p.salePrice,
                    image: p.image || p.imageUrl || p.thumbnail,
                    category: p.category,
                    unit: p.unit,
                }, null, 2));
                
                console.log('\nAll keys:', Object.keys(p));
            }
        } catch (e) {
            console.log('Parse error:', e.message.substring(0, 200));
        }
    }
}

// Tìm category API response
console.log('\n=== CATEGORY API ===');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('category') && lines[i].includes('api-crownx') && lines[i].includes('{""')) {
        const jStart = lines[i].indexOf('{""');
        if (jStart >= 0) {
            let jsonStr = lines[i].substring(jStart);
            const lastBrace = jsonStr.lastIndexOf('}');
            jsonStr = jsonStr.substring(0, lastBrace + 1).replace(/""/g, '"');
            try {
                const obj = JSON.parse(jsonStr);
                if (obj.data && Array.isArray(obj.data)) {
                    console.log(`Line ${i+1}: ${obj.data.length} categories`);
                    obj.data.slice(0, 5).forEach(c => {
                        console.log(`  [${c.code || c.id}] ${c.name} (${c.seoName || c.slug})`);
                    });
                }
            } catch(e) {}
        }
        break;
    }
}

// Tìm buildzone API
console.log('\n=== BUILDZONE / PRICES API ===');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('buildzone') || lines[i].includes('g1-prices')) {
        console.log(`Line ${i+1}: len=${lines[i].length}`);
        // Check URL
        const urlMatch = lines[i].match(/https:\/\/api-crownx\.winmart\.vn[^\s,"]+/);
        if (urlMatch) console.log('  URL:', urlMatch[0]);
    }
}
