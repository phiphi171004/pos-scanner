/**
 * Script cào sản phẩm từ bachhoaxanh.com (BHX)
 * Chạy: node scrape-bhx.js
 * 
 * Cách hoạt động:
 *   1. Lấy danh sách category từ API Menu (public, không cần auth)
 *   2. Fetch HTML trang danh mục (SSR có nhúng product data)
 *   3. Parse product từ RSC payload trong HTML  
 *   4. Dùng API AjaxProduct (cần cookie) cho phân trang nếu có
 *   5. Lưu ra JSON + push vào MongoDB
 */

const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

require('events').EventEmitter.defaultMaxListeners = 50;

// Fix MaxListeners: dùng 1 agent duy nhất cho tất cả request push
const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });

// ======================= CẤU HÌNH =======================

const STORE_ID = 2546;
const PROVINCE_ID = 1027;
const DELAY_MS = 2000;
const PUSH_TO_BACKEND = true;
const BACKEND_URL = 'http://localhost:5000/api/products/import';
const SUPERMARKET_NAME = 'Bách Hóa Xanh';
const PAGE_SIZE = 40;

// Auth headers (không cần cookie!)
const DEVICE_TOKEN = 'E2270E49441F631548CAD8EC71CC6574';
const DEVICE_ID = '34aa704e-c9a1-43db-9509-1b9a49fd772d';
const X_API_KEY = 'bhx-api-core-2022'; // key cố định

// ===================== HẾT CẤU HÌNH =====================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const API_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'origin': 'https://www.bachhoaxanh.com',
    'referer': 'https://www.bachhoaxanh.com/',
    'Authorization': `Bearer ${DEVICE_TOKEN}`,
    'Xapikey': X_API_KEY,
    'Deviceid': DEVICE_ID,
    'Platform': 'webnew',
};

/**
 * Lấy danh sách tất cả category (leaf) từ Menu API (public)
 */
async function getAllCategories() {
    const url = `https://api.bachhoaxanh.com/gw/Menu/GetMenuV2?ProvinceId=${PROVINCE_ID}&WardId=0&StoreId=${STORE_ID}`;
    const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });
    
    const menus = res.data?.data?.menus || [];
    const categories = [];

    function walk(items) {
        if (!Array.isArray(items)) return;
        items.forEach(c => {
            // Chỉ lấy category có url dạng slug (không phải thuong-hieu, he-thong)
            if (c.id && c.url && !c.url.includes('thuong-hieu') && !c.url.includes('he-thong') && !c.url.startsWith('https://')) {
                categories.push({
                    id: parseInt(c.id) || c.id,
                    name: c.name,
                    url: c.url,
                    parentId: c.parentId || null,
                });
            }
            if (c.childrens) walk(c.childrens);
        });
    }

    walk(menus);
    return categories;
}

/**
 * Lấy sản phẩm từ AjaxProduct API (cần cookie)
 */
async function fetchAjaxProducts(categoryId, pageIndex = 1) {
    const payload = {
        provinceId: PROVINCE_ID,
        wardId: 0,
        districtId: 0,
        storeId: STORE_ID,
        CategoryId: categoryId,
        SelectedBrandId: '',
        PropertyIdList: '',
        PageIndex: pageIndex,
        PageSize: PAGE_SIZE,
        SortStr: '',
        PriorityProductIds: '',
        PropertySelected: [],
        LastShowProductId: 0,
    };

    try {
        const res = await axios.post(
            'https://api.bachhoaxanh.com/gw/Category/AjaxProduct',
            payload,
            {
                headers: API_HEADERS,
                timeout: 15000,
            }
        );

        if (res.data?.code === 0 && res.data?.data?.products) {
            return {
                products: res.data.data.products,
                total: res.data.data.total || 0,
            };
        }

        // Unauthorized hoặc lỗi khác
        if (typeof res.data === 'string' && res.data.includes('Unauthorized')) {
            return { products: [], total: 0, unauthorized: true };
        }

        return { products: [], total: 0 };
    } catch (err) {
        console.error(`    [!] AjaxProduct error: ${err.message}`);
        return { products: [], total: 0 };
    }
}

/**
 * Lấy sản phẩm trang 1 từ GetCate API
 */
async function fetchGetCate(categoryUrl) {
    try {
        const url = `https://api.bachhoaxanh.com/gw/Category/V2/GetCate?provinceId=${PROVINCE_ID}&wardId=0&districtId=0&storeId=${STORE_ID}&categoryUrl=${categoryUrl}&isMobile=true&isV2=true&pageSize=${PAGE_SIZE}`;
        const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });

        if (res.data?.code === 0 && res.data?.data?.products) {
            return {
                products: res.data.data.products,
                total: res.data.data.total || 0,
            };
        }
        return { products: [], total: 0 };
    } catch (err) {
        console.error(`    [!] GetCate error: ${err.message}`);
        return { products: [], total: 0 };
    }
}

/**
 * Cào sản phẩm cho 1 category
 */
async function scrapeCategory(cat) {
    console.log(`\n  [${cat.id}] ${cat.name} (/${cat.url})`);

    let allProducts = [];

    // Trang 1: dùng GetCate
    const page1 = await fetchGetCate(cat.url);
    allProducts = [...page1.products];
    const total = page1.total;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    console.log(`    Trang 1: ${page1.products.length} sp, total=${total}, pages=${totalPages}`);

    // Trang 2+: dùng AjaxProduct
    for (let p = 2; p <= totalPages; p++) {
        await sleep(DELAY_MS);
        const next = await fetchAjaxProducts(cat.id, p);
        allProducts = allProducts.concat(next.products);
        console.log(`    Trang ${p}/${totalPages}: ${next.products.length} sp`);
        if (next.products.length === 0) break;
    }

    return allProducts;
}

/**
 * Chuẩn hóa sản phẩm BHX
 */
function normalizeProduct(raw) {
    return {
        barcode: String(raw.productCode || ''),
        name: (raw.name || raw.fullName || '').trim(),
        price: raw.productPrices?.[0]?.price || raw.price || 0,
        imageUrl: raw.avatar || '',
        supermarket: SUPERMARKET_NAME,
    };
}

/**
 * Push sản phẩm lên backend (có retry)
 */
async function pushToBackend(product, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.post(BACKEND_URL, product, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
                httpAgent: keepAliveAgent,
            });
            return { success: true };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            // Nếu lỗi trùng barcode → skip, không cần retry
            if (msg.includes('already exists') || msg.includes('đã tồn tại')) {
                return { success: false, error: msg };
            }
            // Retry nếu lỗi connection
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
    console.log('=== BẮT ĐẦU CÀO SẢN PHẨM TỪ BÁCH HÓA XANH ===');
    console.log(`Store: ${STORE_ID}, Province: ${PROVINCE_ID}`);
    console.log();

    // Lấy danh sách category
    console.log('Đang lấy danh sách danh mục...');
    const categories = await getAllCategories();
    
    // Lọc chỉ leaf categories (có parentId = không phải cha)
    const parentIds = new Set(categories.filter(c => !c.parentId).map(c => String(c.id)));
    const leafCats = categories.filter(c => c.parentId || !parentIds.has(String(c.id)));
    
    console.log(`Tổng: ${categories.length} danh mục, ${leafCats.length} leaf categories`);

    let allProducts = [];

    // Cào từng category
    for (let i = 0; i < leafCats.length; i++) {
        const cat = leafCats[i];
        console.log(`\n[${i + 1}/${leafCats.length}]`);

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
        .filter(p => p.productCode || p.barcode)
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

    const outFile = path.join(dataDir, 'products-bhx.json');
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
            } else if (result.error?.includes('already exists')) {
                skipped++;
            } else {
                failed++;
                if (failed <= 5) console.log(`  ✗ ${p.barcode}: ${result.error}`);
            }

            if (i % 50 === 0) {
                console.log(`  [${i + 1}/${uniqueProducts.length}] created=${created} skip=${skipped} fail=${failed}`);
            }
            await sleep(500);
        }

        console.log(`\nTạo mới: ${created}, Đã có: ${skipped}, Lỗi: ${failed}`);
    }

    console.log('\n=== HOÀN TẤT ===');
}

main().catch(err => {
    console.error('Lỗi:', err);
    process.exit(1);
});
