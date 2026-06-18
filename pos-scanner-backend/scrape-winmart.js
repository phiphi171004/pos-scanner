/**
 * Script cào sản phẩm từ WinMart API
 * Chạy: node scrape-winmart.js
 * 
 * API WinMart (api-crownx.winmart.vn):
 *   - GET /mt/api/web/v1/category → danh sách category
 *   - GET /it/api/web/v3/item/category?slug=...&pageNumber=1&pageSize=40 → sản phẩm theo category
 *   - Không cần auth (Bearer rỗng), chỉ cần header X-Api-Merchant: WCM
 */

const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

require('events').EventEmitter.defaultMaxListeners = 50;

const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });

// ======================= CẤU HÌNH =======================

const STORE_CODE = '1535';
const STORE_GROUP_CODE = '1998';
const PAGE_SIZE = 40;
const DELAY_MS = 100;
const PUSH_TO_BACKEND = true;
const BACKEND_URL = 'http://localhost:5000/api/products/import';
const SUPERMARKET_NAME = 'WinMart';

// ===================== HẾT CẤU HÌNH =====================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const API_BASE = 'https://api-crownx.winmart.vn';

const API_HEADERS = {
    'Accept': 'application/json',
    'X-Api-Merchant': 'WCM',
    'Authorization': 'Bearer',
    'Origin': 'https://winmart.vn',
    'Referer': 'https://winmart.vn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

/**
 * Lấy danh sách category
 */
async function getAllCategories() {
    const url = `${API_BASE}/mt/api/web/v1/category`;
    const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });

    const data = res.data?.data || [];
    const categories = [];

    data.forEach(c => {
        const p = c.parent;
        if (p && p.seoName) {
            categories.push({
                code: p.code,
                name: p.name,
                seoName: p.seoName,
            });
        }
        // Children nếu có
        if (c.children && Array.isArray(c.children)) {
            c.children.forEach(ch => {
                if (ch.seoName) {
                    categories.push({
                        code: ch.code,
                        name: ch.name,
                        seoName: ch.seoName,
                        parentCode: p.code,
                    });
                }
            });
        }
    });

    return categories;
}

/**
 * Lấy sản phẩm theo category (có phân trang)
 */
async function fetchCategoryProducts(slug, pageNumber = 1) {
    const url = `${API_BASE}/it/api/web/v3/item/category?pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&slug=${slug}&storeCode=${STORE_CODE}&storeGroupCode=${STORE_GROUP_CODE}`;

    try {
        const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });
        const d = res.data;

        if (d.data?.items) {
            return {
                items: d.data.items,
                paging: d.paging || {},
                name: d.data.name || '',
            };
        }
        return { items: [], paging: {}, name: '' };
    } catch (err) {
        console.error(`    [!] API error: ${err.message}`);
        return { items: [], paging: {}, name: '' };
    }
}

/**
 * Cào tất cả sản phẩm cho 1 category
 */
async function scrapeCategory(cat) {
    console.log(`\n  [${cat.code}] ${cat.name} (${cat.seoName})`);

    let allItems = [];

    // Trang 1
    const page1 = await fetchCategoryProducts(cat.seoName, 1);
    allItems = [...page1.items];
    const totalPages = page1.paging.totalPages || 1;
    const totalCount = page1.paging.totalCount || page1.items.length;
    console.log(`    Trang 1: ${page1.items.length} sp, total=${totalCount}, pages=${totalPages}`);

    // Trang 2+
    for (let p = 2; p <= totalPages; p++) {
        await sleep(DELAY_MS);
        const next = await fetchCategoryProducts(cat.seoName, p);
        allItems = allItems.concat(next.items);
        console.log(`    Trang ${p}/${totalPages}: ${next.items.length} sp`);
        if (next.items.length === 0) break;
    }

    return allItems;
}

/**
 * Chuẩn hóa sản phẩm WinMart
 */
function normalizeProduct(raw) {
    return {
        barcode: String(raw.barcode || ''),
        name: (raw.name || raw.description || '').trim(),
        price: raw.salePrice || raw.price || 0,
        imageUrl: raw.mediaUrl || '',
        supermarket: SUPERMARKET_NAME,
    };
}

/**
 * Push sản phẩm lên backend (có retry)
 */
async function pushToBackend(product, retries = 3) {
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

/**
 * Main
 */
async function main() {
    console.log('=== BẮT ĐẦU CÀO SẢN PHẨM TỪ WINMART ===');
    console.log(`Store: ${STORE_CODE}, Group: ${STORE_GROUP_CODE}`);
    console.log();

    // Lấy danh sách category
    console.log('Đang lấy danh sách danh mục...');
    const categories = await getAllCategories();
    console.log(`Tổng: ${categories.length} danh mục`);

    let allProducts = [];

    // Cào từng category
    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        console.log(`\n[${i + 1}/${categories.length}]`);

        try {
            const products = await scrapeCategory(cat);
            allProducts = allProducts.concat(products);
        } catch (err) {
            console.error(`  Lỗi: ${err.message}`);
        }

        await sleep(DELAY_MS);
    }

    // Chuẩn hóa + lọc
    const normalized = allProducts
        .filter(p => p.barcode)
        .map(normalizeProduct)
        .filter(p => p.barcode && p.barcode !== '');

    // Loại trùng
    const uniqueMap = new Map();
    for (const p of normalized) {
        if (!uniqueMap.has(p.barcode)) {
            uniqueMap.set(p.barcode, p);
        }
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    console.log(`\n=== TỔNG KẾT ===`);
    console.log(`Tổng raw: ${allProducts.length}`);
    console.log(`Có barcode: ${normalized.length}`);
    console.log(`Unique: ${uniqueProducts.length}`);

    // Lưu JSON
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const outFile = path.join(dataDir, 'products-winmart.json');
    fs.writeFileSync(outFile, JSON.stringify(uniqueProducts, null, 2), 'utf-8');
    console.log(`Đã lưu: ${outFile}`);

    // Push lên backend
    if (PUSH_TO_BACKEND && uniqueProducts.length > 0) {
        console.log(`\n=== PUSH LÊN BACKEND ===`);
        let created = 0, skipped = 0, failed = 0;

        for (let i = 0; i < uniqueProducts.length; i++) {
            const p = uniqueProducts[i];
            const result = await pushToBackend(p);

            if (result.success) {
                created++;
            } else if (result.error === 'exists') {
                skipped++;
            } else {
                failed++;
                if (failed <= 10) console.log(`  ✗ [${p.barcode}] ${p.name?.substring(0, 40)}: ${result.error}`);
            }

            if ((i + 1) % 100 === 0 || i === uniqueProducts.length - 1) {
                console.log(`  [${i + 1}/${uniqueProducts.length}] created=${created} skip=${skipped} fail=${failed}`);
            }

            await sleep(500);
        }

        console.log(`\nTạo mới: ${created}, Đã có: ${skipped}, Lỗi: ${failed}`);
    }

    console.log('\n=== HOÀN TẤT ===');
}

main().catch(err => {
    console.error('Lỗi:', err.message);
    process.exit(1);
});
