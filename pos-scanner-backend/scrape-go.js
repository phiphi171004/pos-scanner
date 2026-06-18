/**
 * Script cào sản phẩm từ sieuthi-go.vn (Big C / GO!)
 * Chạy: node scrape-go.js
 *
 * Chức năng:
 *   1. Đọc headers/cookie trực tiếp từ file api-go.txt
 *   2. Dùng 2 kiểu API: category + best_seller (phân trang)
 *   3. Lưu ra file JSON (data/products-go.json)
 *   4. Tự động push lên backend MongoDB qua POST /api/products
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ======================= CẤU HÌNH =======================

const API_URL = 'https://sieuthi-go.vn/api/order2_listProduct?platform=2&lang=vi';
const STORE_ID = 123;
const DELAY_MS = 1500;
const PUSH_TO_BACKEND = true;
const BACKEND_URL = 'http://localhost:5000/api/products/import';
const SUPERMARKET_NAME = 'Big C';

// File chứa thông tin API (headers, cookie, payload)
const API_FILE = path.join(__dirname, '..', 'api-go.txt');

// ===================== HẾT CẤU HÌNH =====================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse headers/cookie từ api-go.txt
 */
function parseApiFile() {
    const raw = fs.readFileSync(API_FILE, 'utf-8');
    const lines = raw.split('\n').map(l => l.replace('\r', ''));

    // Tìm cookie từ dòng sau "cookie" label (API 1)
    let cookie = '';
    let token = '';
    let sign = '';
    let csrfToken = '';
    let apiclientid = '';
    let xSignatureApi1 = '';
    let xSignatureApi2 = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Lấy từ API 1 section (trước dòng "---api2---")
        if (line === 'cookie' && !cookie) {
            cookie = lines[i + 1] || '';
        }
        if (line === 'token' && !token) {
            token = lines[i + 1]?.trim() || '';
        }
        if (line === 'sign' && !sign) {
            sign = lines[i + 1]?.trim() || '';
        }
        if (line === 'x-csrf-token' && !csrfToken) {
            csrfToken = lines[i + 1]?.trim() || '';
        }
        if (line === 'apiclientid' && !apiclientid) {
            apiclientid = lines[i + 1]?.trim() || '';
        }
        if (line === 'x-signature' && !xSignatureApi1) {
            xSignatureApi1 = lines[i + 1]?.trim() || '';
        }
    }

    // Tìm x-signature của API 2 (sau dòng "---api2---")
    let inApi2 = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('api2')) {
            inApi2 = true;
        }
        if (inApi2 && lines[i].trim() === 'x-signature') {
            xSignatureApi2 = lines[i + 1]?.trim() || '';
            break;
        }
    }

    console.log('[Parse] cookie length:', cookie.length);
    console.log('[Parse] token:', token ? `${token.slice(0, 8)}...` : 'MISSING');
    console.log('[Parse] sign:', sign ? `${sign.slice(0, 8)}...` : 'MISSING');
    console.log('[Parse] x-csrf-token:', csrfToken ? `${csrfToken.slice(0, 8)}...` : 'MISSING');
    console.log('[Parse] x-signature API1:', xSignatureApi1 ? `${xSignatureApi1.slice(0, 8)}...` : 'MISSING');
    console.log('[Parse] x-signature API2:', xSignatureApi2 ? `${xSignatureApi2.slice(0, 8)}...` : 'MISSING');

    return {
        cookie,
        headers: {
            'Content-Type': 'application/json',
            'accept': 'application/json, text/plain, */*',
            'origin': 'https://sieuthi-go.vn',
            'referer': 'https://sieuthi-go.vn/',
            'language': 'vi',
            'apiclientid': apiclientid,
            'storeid': String(STORE_ID),
            'token': token,
            'sign': sign,
            'x-csrf-token': csrfToken,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        },
        xSignatureApi1,
        xSignatureApi2,
    };
}

/**
 * Gọi API best_seller (có phân trang) - dùng x-signature của API 2
 */
async function fetchBestSellerPage(config, page = 1) {
    const payload = {
        filter_by: 'best_seller',
        page,
        store: STORE_ID,
        sitecode: STORE_ID,
        platform: 2,
        hourDelivery: 0,
        pmh_id: null,
        lang: 'vi',
    };

    try {
        const res = await axios.post(API_URL, payload, {
            headers: {
                ...config.headers,
                'x-signature': config.xSignatureApi2,
                'cookie': config.cookie,
            },
            timeout: 15000,
        });

        if (res.data && res.data.status === 'success') {
            return {
                products: res.data.products || [],
                pagination: res.data.pagination || {},
            };
        } else {
            console.error(`[!] API trả lỗi page=${page}:`, res.data?.message || res.data?.status);
            return { products: [], pagination: {} };
        }
    } catch (err) {
        console.error(`[!] Lỗi request page=${page}:`, err.response?.status, err.message);
        return { products: [], pagination: {} };
    }
}

/**
 * Gọi API category (dùng x-signature của API 1)
 */
async function fetchCategoryPage(config, category, page = 1) {
    const payload = {
        category,
        store: STORE_ID,
        sitecode: STORE_ID,
        platform: 2,
        lang: 'vi',
        ...(page > 1 ? { page } : {}),
    };

    try {
        const res = await axios.post(API_URL, payload, {
            headers: {
                ...config.headers,
                'x-signature': config.xSignatureApi1,
                'cookie': config.cookie,
            },
            timeout: 15000,
        });

        if (res.data && res.data.status === 'success') {
            return {
                products: res.data.products || [],
                pagination: res.data.pagination || {},
            };
        } else {
            console.error(`[!] API trả lỗi cat=${category} page=${page}:`, res.data?.message);
            return { products: [], pagination: {} };
        }
    } catch (err) {
        console.error(`[!] Lỗi request cat=${category} page=${page}:`, err.response?.status, err.message);
        return { products: [], pagination: {} };
    }
}

/**
 * Cào tất cả sản phẩm qua API best_seller (phân trang)
 */
async function scrapeBestSeller(config) {
    console.log('\n========== Cào best_seller (tất cả sản phẩm) ==========');

    const firstPage = await fetchBestSellerPage(config, 1);
    const totalPages = firstPage.pagination.total_pages || 1;
    const pageSize = firstPage.pagination.page_size || 15;

    console.log(`Tổng: ${totalPages} trang, ~${pageSize} sp/trang`);

    let allProducts = [...firstPage.products];
    console.log(`  Trang 1/${totalPages}: ${firstPage.products.length} sản phẩm`);

    if (firstPage.products.length === 0) {
        console.log('[!] Trang 1 trả 0 sản phẩm - có thể session hết hạn hoặc signature sai.');
        console.log('[!] Thử chuyển sang cào bằng category...');
        return [];
    }

    for (let page = 2; page <= totalPages; page++) {
        await sleep(DELAY_MS);
        const result = await fetchBestSellerPage(config, page);
        allProducts = allProducts.concat(result.products);
        console.log(`  Trang ${page}/${totalPages}: ${result.products.length} sản phẩm`);

        if (result.products.length === 0) break;
    }

    console.log(`=> best_seller: tổng cộng ${allProducts.length} sản phẩm`);
    return allProducts;
}

/**
 * Cào sản phẩm theo category (fallback)
 */
async function scrapeCategory(config, category) {
    console.log(`\n========== Đang cào category ${category} ==========`);

    const firstPage = await fetchCategoryPage(config, category, 1);
    const totalPages = firstPage.pagination.total_pages || 1;

    console.log(`Tổng: ${totalPages} trang`);

    let allProducts = [...firstPage.products];
    console.log(`  Trang 1/${totalPages}: ${firstPage.products.length} sản phẩm`);

    for (let page = 2; page <= totalPages; page++) {
        await sleep(DELAY_MS);
        const result = await fetchCategoryPage(config, category, page);
        allProducts = allProducts.concat(result.products);
        console.log(`  Trang ${page}/${totalPages}: ${result.products.length} sản phẩm`);

        if (result.products.length === 0) break;
    }

    console.log(`=> Category ${category}: tổng cộng ${allProducts.length} sản phẩm`);
    return allProducts;
}

/**
 * Chuẩn hóa sản phẩm từ API GO! sang format backend
 */
function normalizeProduct(raw) {
    return {
        barcode: String(raw.barcode || ''),
        name: (raw.name || '').trim(),
        price: raw.price || 0,
        imageUrl: (raw.thumbnail && raw.thumbnail[0]) || '',
        supermarket: SUPERMARKET_NAME,
        // Dữ liệu gốc bổ sung (lưu JSON để tham khảo)
        _raw: {
            id: raw.id,
            promotionPrice: raw.promotion_price,
            brand: raw.detail?.find(d => d.name === 'Thương hiệu')?.value?.trim() || '',
            origin: raw.detail?.find(d => d.name === 'Xuất xứ' || d.name === 'Sản xuất tại')?.value?.trim() || '',
            weight: raw.detail?.find(d => d.name === 'Trọng lượng/Dung tích')?.value?.trim() || '',
        }
    };
}

/**
 * Push sản phẩm lên backend
 */
async function pushToBackend(product, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.post(BACKEND_URL, {
                barcode: product.barcode,
                name: product.name,
                price: product.price,
                supermarket: product.supermarket,
                imageUrl: product.imageUrl,
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            });
            return { success: true, data: res.data };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (attempt < retries && !err.response) {
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
    console.log('=== BẮT ĐẦU CÀO SẢN PHẨM TỪ SIEUTHI-GO.VN ===');
    console.log(`Store: ${STORE_ID}`);
    console.log(`Push to backend: ${PUSH_TO_BACKEND}`);
    console.log();

    // Parse headers/cookie từ api-go.txt
    const config = parseApiFile();

    if (!config.cookie || config.cookie.length < 50) {
        console.error('[!] Cookie quá ngắn hoặc không tìm thấy. Kiểm tra lại file api-go.txt');
        process.exit(1);
    }

    let allProducts = [];

    // Thử cào best_seller trước (có phân trang sẵn)
    allProducts = await scrapeBestSeller(config);

    // Nếu best_seller không trả kết quả → fallback sang category
    if (allProducts.length === 0) {
        console.log('\n[Fallback] Cào theo category 31...');
        allProducts = await scrapeCategory(config, 31);
    }

    // Chuẩn hóa
    const normalized = allProducts
        .filter(p => p.barcode) // Bỏ sản phẩm không có barcode
        .map(normalizeProduct);

    // Loại trùng barcode (giữ cái đầu tiên)
    const uniqueMap = new Map();
    for (const p of normalized) {
        if (!uniqueMap.has(p.barcode)) {
            uniqueMap.set(p.barcode, p);
        }
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    console.log(`\n=== TỔNG KẾT ===`);
    console.log(`Tổng sản phẩm cào được: ${allProducts.length}`);
    console.log(`Có barcode: ${normalized.length}`);
    console.log(`Sau loại trùng: ${uniqueProducts.length}`);

    // Lưu ra file JSON
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputFile = path.join(dataDir, 'products-go.json');
    fs.writeFileSync(outputFile, JSON.stringify(uniqueProducts, null, 2), 'utf-8');
    console.log(`\nĐã lưu file: ${outputFile}`);

    // Push lên backend
    if (PUSH_TO_BACKEND) {
        console.log(`\n=== ĐANG PUSH LÊN BACKEND (${BACKEND_URL}) ===`);
        let created = 0, skipped = 0, failed = 0;

        for (let i = 0; i < uniqueProducts.length; i++) {
            const p = uniqueProducts[i];
            const result = await pushToBackend(p);

            if (result.success) {
                created++;
                console.log(`  [${i + 1}/${uniqueProducts.length}] ✓ ${p.name} (${p.barcode})`);
            } else if (result.error?.includes('already exists')) {
                skipped++;
                console.log(`  [${i + 1}/${uniqueProducts.length}] ~ Đã tồn tại: ${p.barcode}`);
            } else {
                failed++;
                console.log(`  [${i + 1}/${uniqueProducts.length}] ✗ Lỗi: ${p.barcode} - ${result.error}`);
            }

            // Delay giữa mỗi request backend tránh quá tải
            await sleep(200);
        }

        console.log(`\n=== KẾT QUẢ PUSH ===`);
        console.log(`Tạo mới: ${created}`);
        console.log(`Đã tồn tại (bỏ qua): ${skipped}`);
        console.log(`Lỗi: ${failed}`);
    }

    console.log('\n=== HOÀN TẤT ===');
}

main().catch(err => {
    console.error('Lỗi không mong đợi:', err);
    process.exit(1);
});
