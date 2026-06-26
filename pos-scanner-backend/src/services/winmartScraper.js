const axios = require('axios');
const Product = require('../models/Product');
const ScraperConfig = require('../models/ScraperConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 1500;
const PAGE_SIZE = 40;
const SUPERMARKET_NAME = 'WinMart';
const API_BASE = 'https://api-crownx.winmart.vn';

async function getConfig() {
    let config = await ScraperConfig.findOne({ name: 'sieuthi-winmart' });
    if (!config) {
        config = await ScraperConfig.create({
            name: 'sieuthi-winmart',
            supermarketName: SUPERMARKET_NAME,
            storeCode: '1535',
            storeGroupCode: '1998',
        });
    }
    return config;
}

function buildHeaders(config) {
    const headers = {
        'Accept': 'application/json',
        'X-Api-Merchant': 'WCM',
        'Authorization': 'Bearer',
        'Origin': 'https://winmart.vn',
        'Referer': 'https://winmart.vn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (config.cookie) {
        headers['Cookie'] = config.cookie;
    }
    return headers;
}

async function getAllCategories(headers) {
    const url = `${API_BASE}/mt/api/web/v1/category`;
    const res = await axios.get(url, { headers, timeout: 15000 });

    const data = res.data?.data || [];
    const categories = [];

    // Bỏ qua danh mục thực phẩm tươi sống từ gốc
    const skipSeoNames = [
        'rau-cu-trai-cay',
        'thit-hai-san-tuoi',
        'trung-dau-hu',
        'hoa-tuoi'
    ];

    data.forEach(c => {
        const p = c.parent;
        if (p && p.seoName) {
            const pSeo = p.seoName.toLowerCase().trim();
            if (!skipSeoNames.includes(pSeo)) {
                categories.push({ code: p.code, name: p.name, seoName: p.seoName });
            }
        }
        if (c.children && Array.isArray(c.children)) {
            c.children.forEach(ch => {
                if (ch.seoName) {
                    const chSeo = ch.seoName.toLowerCase().trim();
                    if (!skipSeoNames.includes(chSeo)) {
                        categories.push({ code: ch.code, name: ch.name, seoName: ch.seoName });
                    }
                }
            });
        }
    });

    return categories;
}

async function fetchCategoryProducts(config, headers, slug, pageNumber) {
    try {
        const storeCode = config.storeCode || '1535';
        const storeGroupCode = config.storeGroupCode || '1998';
        const url = `${API_BASE}/it/api/web/v3/item/category?pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&slug=${slug}&storeCode=${storeCode}&storeGroupCode=${storeGroupCode}`;
        const res = await axios.get(url, { headers, timeout: 15000 });

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

function isFreshProduct(raw) {
    const barcode = String(raw.barcode || '').trim();
    if (!barcode) return true;
    if (barcode.startsWith('2')) return true; // Quy ước GS1 nội bộ
    return false;
}

async function syncProducts(progressCallback) {
    const log = progressCallback || (() => {});

    log('Đang lấy cấu hình WinMart từ DB...');
    const config = await getConfig();
    const headers = buildHeaders(config);

    log('Đang lấy danh mục WinMart...');
    const categories = await getAllCategories(headers);
    log(`WinMart: ${categories.length} danh mục`);

    let allProducts = [];

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        log(`[${i + 1}/${categories.length}] ${cat.name}`);

        const page1 = await fetchCategoryProducts(config, headers, cat.seoName, 1);
        let catProducts = [...page1.items];
        const totalPages = page1.paging.totalPages || 1;

        for (let p = 2; p <= totalPages; p++) {
            await sleep(DELAY_MS);
            const next = await fetchCategoryProducts(config, headers, cat.seoName, p);
            catProducts = catProducts.concat(next.items);
            if (next.items.length === 0) break;
        }

        allProducts = allProducts.concat(catProducts);
        await sleep(DELAY_MS);
    }

    // Lọc có barcode + không phải thực phẩm tươi sống + loại trùng
    let freshFilteredCount = 0;
    const withBarcode = allProducts.filter(p => {
        if (!p.barcode) return false;
        if (isFreshProduct(p)) {
            freshFilteredCount++;
            return false;
        }
        return true;
    });

    const uniqueMap = new Map();
    for (const p of withBarcode) {
        if (!uniqueMap.has(p.barcode)) uniqueMap.set(p.barcode, p);
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    log(`WinMart tổng: ${allProducts.length}, lọc bỏ ${freshFilteredCount} sp tươi sống, unique: ${uniqueProducts.length}`);

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

    // Save sync results
    config.lastSyncAt = new Date();
    config.lastSyncResult = { total: uniqueProducts.length, created, skipped, failed };
    await config.save();

    log(`WinMart hoàn tất: ${created} mới, ${skipped} đã có, ${failed} lỗi`);

    return { source: 'WinMart', total: uniqueProducts.length, created, skipped, failed, errors: errors.slice(0, 10) };
}

module.exports = { syncProducts, getConfig };

