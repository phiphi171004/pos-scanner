/**
 * Push sản phẩm BHX từ file JSON lên backend
 * Chạy: node push-bhx.js
 * (Backend phải đang chạy ở localhost:5000)
 */

const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

require('events').EventEmitter.defaultMaxListeners = 50;

const BACKEND_URL = 'http://localhost:5000/api/products/import';
const INPUT_FILE = path.join(__dirname, 'data', 'products-bhx.json');
const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function pushOne(product, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await axios.post(BACKEND_URL, product, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
                httpAgent: keepAliveAgent,
            });
            return { success: true };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (msg.includes('already exists') || msg.includes('đã tồn tại')) {
                return { success: false, error: 'exists' };
            }
            if (attempt < retries) {
                await sleep(1000 * attempt);
                continue;
            }
            return { success: false, error: msg };
        }
    }
}

async function main() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.log('File không tồn tại:', INPUT_FILE);
        console.log('Chạy node scrape-bhx.js trước!');
        return;
    }

    const products = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
    console.log(`=== PUSH ${products.length} SẢN PHẨM BHX LÊN BACKEND ===\n`);

    let created = 0, skipped = 0, failed = 0;

    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const result = await pushOne(p);

        if (result.success) {
            created++;
        } else if (result.error === 'exists') {
            skipped++;
        } else {
            failed++;
            if (failed <= 10) console.log(`  ✗ [${p.barcode}] ${p.name?.substring(0, 40)}: ${result.error}`);
        }

        if ((i + 1) % 100 === 0 || i === products.length - 1) {
            console.log(`  [${i + 1}/${products.length}] created=${created} skip=${skipped} fail=${failed}`);
        }

        await sleep(500);
    }

    console.log(`\n=== KẾT QUẢ ===`);
    console.log(`Tạo mới: ${created}`);
    console.log(`Đã có:   ${skipped}`);
    console.log(`Lỗi:     ${failed}`);
}

main().catch(err => {
    console.error('Lỗi:', err.message);
    process.exit(1);
});
