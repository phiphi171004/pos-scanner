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
        config = await ScraperConfig.create({ 
            name: 'sieuthi-go',
            apiUrl: 'https://sieuthi-go.vn/api/order2_listProduct?platform=2&lang=vi'
        });
    } else if (!config.apiUrl) {
        config.apiUrl = 'https://sieuthi-go.vn/api/order2_listProduct?platform=2&lang=vi';
        await config.save();
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
    console.log(`fetchPage - Page: ${page}, config.headers.token: "${config.headers?.token}"`);
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

    let currentCookie = config.cookie || '';
    let url = config.apiUrl;
    let redirectCount = 0;
    let response = null;
    let cookieChanged = false;

    while (redirectCount < 5) {
        const headers = buildHeaders(config);
        if (currentCookie) {
            headers['cookie'] = currentCookie;
        }
        console.log(`fetchPage - Page ${page} (Attempt ${redirectCount + 1}) headers:`, JSON.stringify(headers, null, 2));

        const res = await axios.post(url, payload, {
            headers,
            timeout: 15000,
            maxRedirects: 0,
            validateStatus: () => true
        });

        if (res.status === 307 || res.status === 302 || res.status === 301) {
            const setCookies = res.headers['set-cookie'];
            if (setCookies) {
                setCookies.forEach(sc => {
                    const cookiePart = sc.split(';')[0];
                    const eqIdx = cookiePart.indexOf('=');
                    if (eqIdx !== -1) {
                        const cookieName = cookiePart.substring(0, eqIdx);
                        const cleanName = cookieName.trim();
                        // Tránh ký tự regex đặc biệt
                        const escapedCleanName = cleanName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const cookieRegex = new RegExp(`${escapedCleanName}\\s*=\\s*[^;]*;?\\s*`, 'g');
                        currentCookie = currentCookie.replace(cookieRegex, '').trim();
                        if (currentCookie && !currentCookie.endsWith(';')) {
                            currentCookie += ';';
                        }
                        currentCookie = `${cookiePart}; ${currentCookie}`.trim();
                        cookieChanged = true;
                    }
                });
            }
            url = res.headers['location'] || url;
            redirectCount++;
        } else {
            response = res;
            break;
        }
    }

    if (!response) {
        throw new Error('Lỗi chuyển hướng quá giới hạn (Max redirects exceeded)');
    }

    if (cookieChanged) {
        config.cookie = currentCookie;
        await config.save();
    }

    if (response.data && response.data.status === 'success') {
        return {
            products: response.data.products || [],
            pagination: response.data.pagination || {},
        };
    }

    throw new Error(response.data?.message || `API trả về status code ${response.status}`);
}

/**
 * Nhận dạng xem có phải thực phẩm tươi sống biến động (thịt, cá, rau củ...) hay không
 */
function isFreshFood(raw) {
    // 1. Kiểm tra mã vạch nội bộ GS1 (mã cân ký tại quầy)
    const barcode = String(raw.barcode || '').trim();
    if (!barcode) return true;
    if (barcode.startsWith('2')) return true; // Đầu số 2 dành cho mã cân nội bộ


    // 2. Kiểm tra hạn sử dụng ngắn ngày trong chi tiết (detail)
    if (Array.isArray(raw.detail)) {
        const hsdObj = raw.detail.find(d => d && (d.name === 'Hạn sử dụng' || d.name === 'HSD'));
        if (hsdObj && hsdObj.value) {
            const hsdValue = String(hsdObj.value).toLowerCase();
            // Nếu có chữ "ngày" hoặc "ngay"
            if (hsdValue.includes('ngày') || hsdValue.includes('ngay')) {
                const daysMatch = hsdValue.match(/(\d+)\s*ngày/);
                if (daysMatch) {
                    const days = parseInt(daysMatch[1], 10);
                    // Dưới 15 ngày thì coi là thực phẩm tươi sống biến động cần loại trừ
                    if (days <= 15) return true;
                } else {
                    // Nếu chỉ ghi chung dạng "trong ngày" hoặc "kể từ ngày sản xuất" mà không có tháng/năm
                    if ((hsdValue.includes('kể từ ngày sản xuất') || hsdValue.includes('ke tu ngay san xuat') || hsdValue.includes('trong ngày') || hsdValue.includes('trong ngay')) &&
                        !hsdValue.includes('tháng') && !hsdValue.includes('thang') && !hsdValue.includes('năm') && !hsdValue.includes('nam')) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
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

    // Lọc có barcode + không phải tươi sống + loại trùng
    let freshFilteredCount = 0;
    const withBarcode = allProducts.filter(p => {
        if (!p.barcode) return false;
        if (isFreshFood(p)) {
            freshFilteredCount++;
            return false;
        }
        return true;
    });

    const uniqueMap = new Map();
    for (const p of withBarcode) {
        const key = String(p.barcode);
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, p);
        }
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    log(`Tổng: ${allProducts.length} sp, lọc bỏ ${freshFilteredCount} sp tươi sống, unique: ${uniqueProducts.length}`);

    // Import vào MongoDB
    let created = 0, skipped = 0, failed = 0;
    const errors = [];

    for (const raw of uniqueProducts) {
        const product = normalizeProduct(raw, config.supermarketName);
        try {
            const existing = await Product.findOne({ 
                barcode: product.barcode, 
                supermarket: { $in: ['GO!', 'Big C'] } 
            });
            if (existing) {
                if (existing.supermarket !== product.supermarket) {
                    existing.supermarket = product.supermarket;
                    await existing.save();
                }
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
