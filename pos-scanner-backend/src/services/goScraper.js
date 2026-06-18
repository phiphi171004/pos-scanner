const axios = require('axios');
const Product = require('../models/Product');
const ScraperConfig = require('../models/ScraperConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 1500;

/**
 * Lấy hoặc tạo config mặc định
 */
async function getConfig() {
    let config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
    if (!config) {
        config = await ScraperConfig.create({ name: 'sieuthi-go' });
    }
    return config;
}

/**
 * Build request headers từ config
 */
function buildHeaders(config, includeSignature = true) {
    const headers = {
        'Content-Type': 'application/json',
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://sieuthi-go.vn',
        'referer': 'https://sieuthi-go.vn/',
        'language': 'vi',
        'apiclientid': config.headers.apiclientid,
        'storeid': String(config.storeId),
        'token': config.headers.token,
        'sign': config.headers.sign,
        'x-csrf-token': config.headers.xCsrfToken,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    };

    if (includeSignature && config.headers.xSignature) {
        headers['x-signature'] = config.headers.xSignature;
    }

    if (config.cookie) {
        headers['cookie'] = config.cookie;
    }

    return headers;
}

/**
 * Gọi API lấy sản phẩm 1 trang
 */
async function fetchPage(config, page = 1) {
    const payload = {
        filter_by: 'best_seller',
        page,
        store: config.storeId,
        sitecode: config.storeId,
        platform: 2,
        hourDelivery: 0,
        pmh_id: null,
        lang: 'vi',
    };

    const headers = buildHeaders(config);

    const res = await axios.post(config.apiUrl, payload, {
        headers,
        timeout: 15000,
    });

    if (res.data && res.data.status === 'success') {
        return {
            products: res.data.products || [],
            pagination: res.data.pagination || {},
        };
    }

    throw new Error(res.data?.message || 'API trả về lỗi không xác định');
}

/**
 * Chuẩn hóa sản phẩm từ API GO! sang format backend
 */
function normalizeProduct(raw, supermarket) {
    return {
        barcode: String(raw.barcode || ''),
        name: (raw.name || '').trim(),
        price: raw.price || 0,
        imageUrl: (raw.thumbnail && raw.thumbnail[0]) || '',
        supermarket,
    };
}

/**
 * Đồng bộ sản phẩm từ GO! API vào MongoDB
 * Trả về kết quả { total, created, skipped, failed, errors }
 */
async function syncProducts(progressCallback) {
    const config = await getConfig();

    if (!config.cookie || !config.headers.token) {
        throw new Error('Chưa cấu hình cookie/token cho GO! API. Vui lòng cập nhật config trước.');
    }

    const log = progressCallback || (() => {});
    let allProducts = [];

    // Lấy trang đầu
    log('Đang lấy trang 1...');
    const firstPage = await fetchPage(config, 1);
    const totalPages = firstPage.pagination.total_pages || 1;

    allProducts = [...firstPage.products];
    log(`Trang 1/${totalPages}: ${firstPage.products.length} sp. Tổng trang: ${totalPages}`);

    if (firstPage.products.length === 0) {
        throw new Error('Trang 1 trả 0 sản phẩm. Cookie/token có thể đã hết hạn.');
    }

    // Lấy các trang còn lại
    for (let page = 2; page <= totalPages; page++) {
        await sleep(DELAY_MS);
        try {
            const result = await fetchPage(config, page);
            allProducts = allProducts.concat(result.products);
            log(`Trang ${page}/${totalPages}: ${result.products.length} sp`);
        } catch (err) {
            log(`Lỗi trang ${page}: ${err.message}`);
        }
    }

    // Lọc có barcode + loại trùng
    const withBarcode = allProducts.filter(p => p.barcode);
    const uniqueMap = new Map();
    for (const p of withBarcode) {
        const key = String(p.barcode);
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, p);
        }
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    log(`Tổng: ${allProducts.length} sp, có barcode: ${withBarcode.length}, unique: ${uniqueProducts.length}`);

    // Import vào MongoDB
    let created = 0, skipped = 0, failed = 0;
    const errors = [];

    for (const raw of uniqueProducts) {
        const product = normalizeProduct(raw, config.supermarketName);
        try {
            const existing = await Product.findOne({ barcode: product.barcode, supermarket: product.supermarket });
            if (existing) {
                skipped++;
                continue;
            }

            await Product.create(product);
            created++;
        } catch (err) {
            failed++;
            errors.push({ barcode: product.barcode, error: err.message });
        }
    }

    // Cập nhật kết quả sync
    config.lastSyncAt = new Date();
    config.lastSyncResult = { total: uniqueProducts.length, created, skipped, failed };
    await config.save();

    const result = {
        total: uniqueProducts.length,
        created,
        skipped,
        failed,
        errors: errors.slice(0, 10),
        syncAt: config.lastSyncAt,
    };

    log(`Hoàn tất: ${created} mới, ${skipped} đã tồn tại, ${failed} lỗi`);
    return result;
}

module.exports = { syncProducts, getConfig };
