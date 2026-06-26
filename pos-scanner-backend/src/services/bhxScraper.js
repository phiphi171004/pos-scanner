const axios = require('axios');
const Product = require('../models/Product');
const ScraperConfig = require('../models/ScraperConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 1500;
const PAGE_SIZE = 10; // Optimized size
const SUPERMARKET_NAME = 'Bách Hóa Xanh';

async function getConfig() {
    let config = await ScraperConfig.findOne({ name: 'sieuthi-bhx' });
    if (!config) {
        config = await ScraperConfig.create({
            name: 'sieuthi-bhx',
            supermarketName: SUPERMARKET_NAME,
            storeId: '2546',
            provinceId: 1027,
            headers: {
                authorization: 'E2270E49441F631548CAD8EC71CC6574',
                deviceid: '34aa704e-c9a1-43db-9509-1b9a49fd772d',
                xapikey: 'bhx-api-core-2022'
            }
        });
    }
    return config;
}

function buildHeaders(config) {
    const token = config.headers?.authorization || 'E2270E49441F631548CAD8EC71CC6574';
    const deviceId = config.headers?.deviceid || '34aa704e-c9a1-43db-9509-1b9a49fd772d';
    const apiKey = config.headers?.xapikey || 'bhx-api-core-2022';

    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'origin': 'https://www.bachhoaxanh.com',
        'referer': 'https://www.bachhoaxanh.com/',
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        'Xapikey': apiKey,
        'Deviceid': deviceId,
        'Platform': 'webnew',
    };

    if (config.cookie) {
        headers['Cookie'] = config.cookie;
    }

    return headers;
}

async function getAllCategories(config, headers) {
    const provinceId = config.provinceId || 1027;
    const storeId = config.storeId || 2546;
    const url = `https://api.bachhoaxanh.com/gw/Menu/GetMenuV2?ProvinceId=${provinceId}&WardId=0&StoreId=${storeId}`;
    const res = await axios.get(url, { headers, timeout: 15000 });

    const menus = res.data?.data?.menus || [];
    const categories = [];

    const skipUrls = [
        'thit-heo-bo-ga-vit',
        'ca-tom-muc-ngao',
        'rau-cu-trai-cay',
        'so-che-nau-san',
        'trai-cay-viet-nam',
        'trai-cay-nhap-khau',
        'rau-la',
        'rau-cu-qua',
        'hoa-tuoi-trang-tri'
    ];

    const skipKeywords = ['thịt', 'cá, tôm', 'rau củ', 'trái cây', 'sơ chế', 'hoa tươi'];

    function shouldSkip(c) {
        const name = (c.name || '').toLowerCase();
        const url = (c.url || '').toLowerCase();
        if (skipUrls.some(s => url.includes(s))) return true;
        if (skipKeywords.some(kw => name.includes(kw))) return true;
        return false;
    }

    function walk(items) {
        if (!Array.isArray(items)) return;
        items.forEach(c => {
            if (c.id && c.url && !c.url.includes('thuong-hieu') && !c.url.includes('he-thong') && !c.url.startsWith('https://')) {
                if (!shouldSkip(c)) {
                    categories.push({ id: parseInt(c.id) || c.id, name: c.name, url: c.url, parentId: c.parentId || null });
                }
            }
            if (c.childrens) walk(c.childrens);
        });
    }
    walk(menus);

    const parentIds = new Set(categories.filter(c => !c.parentId).map(c => String(c.id)));
    return categories.filter(c => c.parentId || !parentIds.has(String(c.id)));
}

async function fetchAjaxProducts(config, headers, categoryId, pageIndex) {
    try {
        const provinceId = config.provinceId || 1027;
        const storeId = config.storeId || 2546;
        const res = await axios.post('https://api.bachhoaxanh.com/gw/Category/AjaxProduct', {
            provinceId: provinceId, wardId: 0, districtId: 0, storeId: storeId,
            CategoryId: categoryId, PageIndex: pageIndex, PageSize: PAGE_SIZE,
            SelectedBrandId: '', PropertyIdList: '', SortStr: '',
            PriorityProductIds: '', PropertySelected: [], LastShowProductId: 0,
        }, { headers, timeout: 15000 });

        if (res.data?.code === 0 && res.data?.data?.products) {
            return { products: res.data.data.products, total: res.data.data.total || 0 };
        }
        return { products: [], total: 0 };
    } catch (err) {
        return { products: [], total: 0 };
    }
}

function normalizeProduct(raw) {
    return {
        barcode: String(raw.productCode || ''),
        name: (raw.name || raw.fullName || '').trim(),
        price: raw.productPrices?.[0]?.price || raw.price || 0,
        imageUrl: raw.avatar || '',
        supermarket: SUPERMARKET_NAME,
    };
}

async function syncProducts(progressCallback) {
    const log = progressCallback || (() => {});
    
    log('Đang lấy cấu hình BHX từ DB...');
    const config = await getConfig();
    const headers = buildHeaders(config);

    log('Đang lấy danh mục BHX...');
    const categories = await getAllCategories(config, headers);
    log(`BHX: ${categories.length} danh mục`);

    let allProducts = [];

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        log(`[${i + 1}/${categories.length}] ${cat.name}`);

        // PageIndex starts from 1 using AjaxProduct API
        const page1 = await fetchAjaxProducts(config, headers, cat.id, 1);
        let catProducts = [...page1.products];
        const totalPages = Math.ceil(page1.total / PAGE_SIZE);

        log(` - Trang 1/${totalPages} thu được ${page1.products.length} sp (Tổng: ${page1.total})`);

        for (let p = 2; p <= totalPages; p++) {
            await sleep(DELAY_MS);
            const next = await fetchAjaxProducts(config, headers, cat.id, p);
            catProducts = catProducts.concat(next.products);
            log(` - Trang ${p}/${totalPages} thu được ${next.products.length} sp`);
            if (next.products.length === 0) break;
        }

        allProducts = allProducts.concat(catProducts);
        await sleep(DELAY_MS);
    }

    // Lọc có barcode + không phải thực phẩm tươi sống + loại trùng
    let freshFilteredCount = 0;
    const withBarcode = allProducts.filter(p => {
        if (!p.productCode) return false;
        const barcodeStr = String(p.productCode).trim();
        // 1. Chỉ lọc nếu mã vạch bắt đầu bằng số 2 (mã cân ký nội bộ)
        if (barcodeStr.startsWith('2')) {
            freshFilteredCount++;
            return false;
        }
        return true;
    });

    const uniqueMap = new Map();
    for (const p of withBarcode) {
        if (!uniqueMap.has(p.productCode)) uniqueMap.set(p.productCode, p);
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    log(`BHX tổng: ${allProducts.length}, lọc bỏ ${freshFilteredCount} sp tươi sống, unique: ${uniqueProducts.length}`);

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

    log(`BHX hoàn tất: ${created} mới, ${skipped} đã có, ${failed} lỗi`);

    return { source: 'BHX', total: uniqueProducts.length, created, skipped, failed, errors: errors.slice(0, 10) };
}

module.exports = { syncProducts, getConfig };

