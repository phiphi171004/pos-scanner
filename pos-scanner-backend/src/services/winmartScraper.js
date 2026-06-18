const axios = require('axios');
const Product = require('../models/Product');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 1500;
const PAGE_SIZE = 40;
const SUPERMARKET_NAME = 'WinMart';

const STORE_CODE = '1535';
const STORE_GROUP_CODE = '1998';
const API_BASE = 'https://api-crownx.winmart.vn';

const API_HEADERS = {
    'Accept': 'application/json',
    'X-Api-Merchant': 'WCM',
    'Authorization': 'Bearer',
    'Origin': 'https://winmart.vn',
    'Referer': 'https://winmart.vn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

async function getAllCategories() {
    const url = `${API_BASE}/mt/api/web/v1/category`;
    const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });

    const data = res.data?.data || [];
    const categories = [];

    data.forEach(c => {
        const p = c.parent;
        if (p && p.seoName) {
            categories.push({ code: p.code, name: p.name, seoName: p.seoName });
        }
        if (c.children && Array.isArray(c.children)) {
            c.children.forEach(ch => {
                if (ch.seoName) {
                    categories.push({ code: ch.code, name: ch.name, seoName: ch.seoName });
                }
            });
        }
    });

    return categories;
}

async function fetchCategoryProducts(slug, pageNumber) {
    try {
        const url = `${API_BASE}/it/api/web/v3/item/category?pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&slug=${slug}&storeCode=${STORE_CODE}&storeGroupCode=${STORE_GROUP_CODE}`;
        const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });

        if (res.data?.data?.items) {
            return { items: res.data.data.items, paging: res.data.paging || {} };
        }
        return { items: [], paging: {} };
    } catch (err) {
        return { items: [], paging: {} };
    }
}

function normalizeProduct(raw) {
    return {
        barcode: String(raw.barcode || ''),
        name: (raw.name || raw.description || '').trim(),
        price: raw.salePrice || raw.price || 0,
        imageUrl: raw.mediaUrl || '',
        supermarket: SUPERMARKET_NAME,
    };
}

async function syncProducts(progressCallback) {
    const log = progressCallback || (() => {});

    log('Đang lấy danh mục WinMart...');
    const categories = await getAllCategories();
    log(`WinMart: ${categories.length} danh mục`);

    let allProducts = [];

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        log(`[${i + 1}/${categories.length}] ${cat.name}`);

        const page1 = await fetchCategoryProducts(cat.seoName, 1);
        let catProducts = [...page1.items];
        const totalPages = page1.paging.totalPages || 1;

        for (let p = 2; p <= totalPages; p++) {
            await sleep(DELAY_MS);
            const next = await fetchCategoryProducts(cat.seoName, p);
            catProducts = catProducts.concat(next.items);
            if (next.items.length === 0) break;
        }

        allProducts = allProducts.concat(catProducts);
        await sleep(DELAY_MS);
    }

    const withBarcode = allProducts.filter(p => p.barcode);
    const uniqueMap = new Map();
    for (const p of withBarcode) {
        if (!uniqueMap.has(p.barcode)) uniqueMap.set(p.barcode, p);
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    log(`WinMart tổng: ${allProducts.length}, có barcode: ${withBarcode.length}, unique: ${uniqueProducts.length}`);

    let created = 0, skipped = 0, failed = 0;
    const errors = [];

    for (const raw of uniqueProducts) {
        const product = normalizeProduct(raw);
        try {
            const existing = await Product.findOne({ barcode: product.barcode, supermarket: SUPERMARKET_NAME });
            if (existing) { skipped++; continue; }
            await Product.create(product);
            created++;
        } catch (err) {
            failed++;
            errors.push({ barcode: product.barcode, error: err.message });
        }
    }

    log(`WinMart hoàn tất: ${created} mới, ${skipped} đã có, ${failed} lỗi`);

    return { source: 'WinMart', total: uniqueProducts.length, created, skipped, failed, errors: errors.slice(0, 10) };
}

module.exports = { syncProducts };
