const axios = require('axios');
const Product = require('../models/Product');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 1500;
const PAGE_SIZE = 40;
const SUPERMARKET_NAME = 'Bách Hóa Xanh';

const STORE_ID = 2546;
const PROVINCE_ID = 1027;
const DEVICE_TOKEN = 'E2270E49441F631548CAD8EC71CC6574';
const DEVICE_ID = '34aa704e-c9a1-43db-9509-1b9a49fd772d';
const X_API_KEY = 'bhx-api-core-2022';

const API_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'origin': 'https://www.bachhoaxanh.com',
    'referer': 'https://www.bachhoaxanh.com/',
    'Authorization': `Bearer ${DEVICE_TOKEN}`,
    'Xapikey': X_API_KEY,
    'Deviceid': DEVICE_ID,
    'Platform': 'webnew',
};

async function getAllCategories() {
    const url = `https://api.bachhoaxanh.com/gw/Menu/GetMenuV2?ProvinceId=${PROVINCE_ID}&WardId=0&StoreId=${STORE_ID}`;
    const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });

    const menus = res.data?.data?.menus || [];
    const categories = [];

    function walk(items) {
        if (!Array.isArray(items)) return;
        items.forEach(c => {
            if (c.id && c.url && !c.url.includes('thuong-hieu') && !c.url.includes('he-thong') && !c.url.startsWith('https://')) {
                categories.push({ id: parseInt(c.id) || c.id, name: c.name, url: c.url, parentId: c.parentId || null });
            }
            if (c.childrens) walk(c.childrens);
        });
    }
    walk(menus);

    const parentIds = new Set(categories.filter(c => !c.parentId).map(c => String(c.id)));
    return categories.filter(c => c.parentId || !parentIds.has(String(c.id)));
}

async function fetchGetCate(categoryUrl) {
    try {
        const url = `https://api.bachhoaxanh.com/gw/Category/V2/GetCate?provinceId=${PROVINCE_ID}&wardId=0&districtId=0&storeId=${STORE_ID}&categoryUrl=${categoryUrl}&isMobile=true&isV2=true&pageSize=${PAGE_SIZE}`;
        const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });
        if (res.data?.code === 0 && res.data?.data?.products) {
            return { products: res.data.data.products, total: res.data.data.total || 0 };
        }
        return { products: [], total: 0 };
    } catch (err) {
        return { products: [], total: 0 };
    }
}

async function fetchAjaxProducts(categoryId, pageIndex) {
    try {
        const res = await axios.post('https://api.bachhoaxanh.com/gw/Category/AjaxProduct', {
            provinceId: PROVINCE_ID, wardId: 0, districtId: 0, storeId: STORE_ID,
            CategoryId: categoryId, PageIndex: pageIndex, PageSize: PAGE_SIZE,
            SelectedBrandId: '', PropertyIdList: '', SortStr: '',
            PriorityProductIds: '', PropertySelected: [], LastShowProductId: 0,
        }, { headers: API_HEADERS, timeout: 15000 });

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

    log('Đang lấy danh mục BHX...');
    const categories = await getAllCategories();
    log(`BHX: ${categories.length} danh mục`);

    let allProducts = [];

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        log(`[${i + 1}/${categories.length}] ${cat.name}`);

        const page1 = await fetchGetCate(cat.url);
        let catProducts = [...page1.products];
        const totalPages = Math.ceil(page1.total / PAGE_SIZE);

        for (let p = 2; p <= totalPages; p++) {
            await sleep(DELAY_MS);
            const next = await fetchAjaxProducts(cat.id, p);
            catProducts = catProducts.concat(next.products);
            if (next.products.length === 0) break;
        }

        allProducts = allProducts.concat(catProducts);
        await sleep(DELAY_MS);
    }

    const withBarcode = allProducts.filter(p => p.productCode);
    const uniqueMap = new Map();
    for (const p of withBarcode) {
        if (!uniqueMap.has(p.productCode)) uniqueMap.set(p.productCode, p);
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    log(`BHX tổng: ${allProducts.length}, có barcode: ${withBarcode.length}, unique: ${uniqueProducts.length}`);

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

    log(`BHX hoàn tất: ${created} mới, ${skipped} đã có, ${failed} lỗi`);

    return { source: 'BHX', total: uniqueProducts.length, created, skipped, failed, errors: errors.slice(0, 10) };
}

module.exports = { syncProducts };
