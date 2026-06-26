const goScraper = require('../services/goScraper');
const bhxScraper = require('../services/bhxScraper');
const winmartScraper = require('../services/winmartScraper');
const ScraperConfig = require('../models/ScraperConfig');
const { autoParseAndSaveConfigs } = require('../utils/logParser');

const SCRAPERS = {
    go: { name: 'GO!', scraper: goScraper },
    bhx: { name: 'Bách Hóa Xanh', scraper: bhxScraper },
    winmart: { name: 'WinMart', scraper: winmartScraper },
};

let currentSyncSession = {
    status: 'idle', // 'idle' | 'running' | 'success' | 'failed'
    source: null,
    logs: [],
    stats: { created: 0, skipped: 0, failed: 0, total: 0 }
};

/**
 * GET /api/admin/sync-status
 * Lấy trạng thái đồng bộ thực tế thời gian thực của backend
 */
exports.getSyncStatus = async (req, res) => {
    res.json({
        success: true,
        data: currentSyncSession
    });
};

/**
 * POST /api/admin/sync-products
 * Body: { source: 'go' | 'bhx' | 'winmart' | 'all' }
 * Admin bấm nút → chạy cào dữ liệu trong nền và phản hồi ngay lập tức
 */
exports.syncProducts = async (req, res) => {
    try {
        const { source = 'all' } = req.body;

        if (currentSyncSession.status === 'running') {
            return res.status(400).json({
                success: false,
                message: `Tiến trình đồng bộ ${currentSyncSession.source} đang chạy trong nền. Vui lòng đợi hoàn tất.`
            });
        }

        // Khởi động phiên đồng bộ mới
        currentSyncSession = {
            status: 'running',
            source,
            logs: [`Bắt đầu đồng bộ nguồn: ${source.toUpperCase()}`],
            stats: { created: 0, skipped: 0, failed: 0, total: 0 }
        };

        // Phản hồi ngay cho Client để tránh Timeout
        res.json({
            success: true,
            message: 'Đồng bộ đã được khởi chạy thành công ở nền.',
            data: currentSyncSession
        });

        // Hàm ghi log thời gian thực
        const progressLog = (msg) => {
            const timestamp = new Date().toLocaleTimeString();
            const formattedMsg = `[${timestamp}] ${msg}`;
            currentSyncSession.logs.push(formattedMsg);
            console.log(`[SyncProgress] ${formattedMsg}`);
        };

        // Thực thi tác vụ cào dữ liệu chạy nền bất đồng bộ
        (async () => {
            try {
                const results = [];
                progressLog('Bắt đầu quét và nạp cấu hình tự động từ log mạng...');
                await autoParseAndSaveConfigs();
                progressLog('Hoàn tất nạp cấu hình.');

                if (source === 'all') {
                    for (const [key, { name, scraper }] of Object.entries(SCRAPERS)) {
                        progressLog(`=== Bắt đầu sync ${name} ===`);
                        try {
                            const result = await scraper.syncProducts(progressLog);
                            results.push(result);
                        } catch (err) {
                            progressLog(`[${name}] Lỗi: ${err.message}`);
                            results.push({ source: name, error: err.message });
                        }
                    }
                } else if (SCRAPERS[source]) {
                    const { name, scraper } = SCRAPERS[source];
                    progressLog(`=== Bắt đầu sync ${name} ===`);
                    const result = await scraper.syncProducts(progressLog);
                    results.push(result);
                } else {
                    progressLog(`Lỗi: Nguồn không hợp lệ ${source}`);
                    currentSyncSession.status = 'failed';
                    return;
                }

                const totalCreated = results.reduce((s, r) => s + (r.created || 0), 0);
                const totalSkipped = results.reduce((s, r) => s + (r.skipped || 0), 0);
                const totalFailed = results.reduce((s, r) => s + (r.failed || 0), 0);

                currentSyncSession.stats = {
                    created: totalCreated,
                    skipped: totalSkipped,
                    failed: totalFailed,
                    total: totalCreated + totalSkipped + totalFailed
                };
                currentSyncSession.status = 'success';
                progressLog(`Đồng bộ hoàn tất thành công: ${totalCreated} mới, ${totalSkipped} đã có, ${totalFailed} lỗi.`);
            } catch (err) {
                currentSyncSession.status = 'failed';
                progressLog(`Lỗi đồng bộ nghiêm trọng: ${err.message}`);
            }
        })();

    } catch (error) {
        // Lỗi khi khởi động
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * GET /api/admin/scraper-config
 * Xem config hiện tại cho toàn bộ các siêu thị (ẩn token/cookie nhạy cảm)
 */
exports.getScraperConfig = async (req, res) => {
    try {
        const configs = await ScraperConfig.find({});
        res.json({
            success: true,
            configs: configs.map(config => ({
                name: config.name,
                apiUrl: config.apiUrl,
                storeId: config.storeId,
                provinceId: config.provinceId,
                storeCode: config.storeCode,
                storeGroupCode: config.storeGroupCode,
                supermarketName: config.supermarketName,
                cookieLength: config.cookie?.length || 0,
                hasCookie: !!config.cookie,
                headers: {
                    token: config.headers?.token ? '***' + config.headers.token.slice(-6) : '',
                    sign: config.headers?.sign ? '***' + config.headers.sign.slice(-6) : '',
                    xCsrfToken: config.headers?.xCsrfToken ? '***' + config.headers.xCsrfToken.slice(-6) : '',
                    xSignature: config.headers?.xSignature ? '***' + config.headers.xSignature.slice(-6) : '',
                    apiclientid: config.headers?.apiclientid,
                    authorization: config.headers?.authorization ? '***' + config.headers.authorization.slice(-6) : '',
                    deviceid: config.headers?.deviceid ? '***' + config.headers.deviceid.slice(-6) : '',
                    xapikey: config.headers?.xapikey,
                },
                lastSyncAt: config.lastSyncAt,
                lastSyncResult: config.lastSyncResult,
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /api/admin/scraper-config
 * Admin cập nhật cookie/headers khi hết hạn
 * Body: { name, cookie, token, sign, xCsrfToken, xSignature, apiclientid, storeId, provinceId, storeCode, storeGroupCode, authorization, deviceid, xapikey, supermarketName }
 */
exports.updateScraperConfig = async (req, res) => {
    try {
        const { name, rawLogText } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Thiếu name cấu hình cần cập nhật' });
        }

        let config = await ScraperConfig.findOne({ name });
        if (!config) {
            config = new ScraperConfig({ name });
        }

        let parsed = null;
        if (rawLogText) {
            const { parseRawText } = require('../utils/logParser');
            parsed = parseRawText(rawLogText);
        }

        const {
            cookie, storeId, provinceId, storeCode, storeGroupCode, supermarketName,
            token, sign, xCsrfToken, xSignature, apiclientid,
            authorization, deviceid, xapikey
        } = req.body;

        const finalCookie = parsed?.cookie || cookie;
        const finalStoreId = parsed?.storeId || storeId;
        const finalProvinceId = parsed?.provinceId || provinceId;
        const finalStoreCode = parsed?.storeCode || storeCode;
        const finalStoreGroupCode = parsed?.storeGroupCode || storeGroupCode;
        const finalSupermarketName = parsed?.supermarketName || supermarketName;

        const finalToken = parsed?.token || token;
        const finalSign = parsed?.sign || sign;
        const finalXCsrfToken = parsed?.xCsrfToken || xCsrfToken;
        const finalXSignature = parsed?.xSignature || xSignature;
        const finalApiclientid = parsed?.apiclientid || apiclientid;

        const finalAuthorization = parsed?.authorization || authorization;
        const finalDeviceid = parsed?.deviceid || deviceid;
        const finalXapikey = parsed?.xapikey || xapikey;

        if (finalCookie !== undefined) config.cookie = finalCookie;
        if (finalStoreId !== undefined) config.storeId = finalStoreId;
        if (finalProvinceId !== undefined) config.provinceId = finalProvinceId;
        if (finalStoreCode !== undefined) config.storeCode = finalStoreCode;
        if (finalStoreGroupCode !== undefined) config.storeGroupCode = finalStoreGroupCode;
        if (finalSupermarketName !== undefined) config.supermarketName = finalSupermarketName;

        if (!config.headers) config.headers = {};
        if (finalToken !== undefined) config.headers.token = finalToken;
        if (finalSign !== undefined) config.headers.sign = finalSign;
        if (finalXCsrfToken !== undefined) config.headers.xCsrfToken = finalXCsrfToken;
        if (finalXSignature !== undefined) config.headers.xSignature = finalXSignature;
        if (finalApiclientid !== undefined) config.headers.apiclientid = finalApiclientid;
        
        if (finalAuthorization !== undefined) config.headers.authorization = finalAuthorization;
        if (finalDeviceid !== undefined) config.headers.deviceid = finalDeviceid;
        if (finalXapikey !== undefined) config.headers.xapikey = finalXapikey;

        await config.save();

        res.json({
            success: true,
            message: `Cập nhật cấu hình ${name} thành công`,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/admin/scraper-config/auto-refresh-go
 * Tự động mở Puppeteer truy cập sieuthi-go.vn, bắt lấy headers/cookie của api listProduct và lưu vào DB.
 */
exports.autoRefreshGoConfig = async (req, res) => {
    let browser = null;
    try {
        const puppeteer = require('puppeteer');
        console.log('[AutoRefreshGo] Khởi chạy trình duyệt...');
        
        const isProd = process.env.NODE_ENV === 'production';
        browser = await puppeteer.launch({
            headless: isProd ? 'new' : false, // Để hiện cửa sổ ở local, ẩn danh ở production (Render)
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Khai báo stealth bypass webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        let capturedHeaders = null;
        let capturePromiseResolver;
        const capturePromise = new Promise((resolve) => {
            capturePromiseResolver = resolve;
        });

        console.log('[AutoRefreshGo] Đang lắng nghe request...');
        page.on('request', request => {
            const url = request.url();
            if (url.includes('order2_listProduct')) {
                capturedHeaders = request.headers();
                console.log('[AutoRefreshGo] Đã bắt được request order2_listProduct!');
                capturePromiseResolver(true);
            }
        });

        console.log('[AutoRefreshGo] Điều hướng tới sieuthi-go.vn...');
        try {
            await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (gotoErr) {
            console.warn('[AutoRefreshGo] Cảnh báo khi tải trang chủ:', gotoErr.message);
        }

        // Chờ tối đa 8 giây sau khi load để bắt request từ trang chủ
        await Promise.race([
            capturePromise,
            new Promise(r => setTimeout(() => r(false), 8000))
        ]);

        if (!capturedHeaders) {
            console.log('[AutoRefreshGo] Chưa bắt được request ở trang chủ, đang điều hướng sang trang danh mục...');
            try {
                await page.goto('https://sieuthi-go.vn/category/san-pham-tuoi-song-1', { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (gotoErr) {
                console.warn('[AutoRefreshGo] Cảnh báo khi tải trang danh mục:', gotoErr.message);
            }
            
            // Chờ tiếp tối đa 8 giây
            await Promise.race([
                capturePromise,
                new Promise(r => setTimeout(() => r(false), 8000))
            ]);
        }

        if (capturedHeaders) {
            const cookies = await page.cookies('https://sieuthi-go.vn');
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            let config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
            if (!config) {
                config = new ScraperConfig({ 
                    name: 'sieuthi-go', 
                    apiUrl: 'https://sieuthi-go.vn/api/order2_listProduct?platform=2&lang=vi' 
                });
            }

            config.cookie = cookieStr;
            if (!config.headers) config.headers = {};
            
            if (capturedHeaders['token']) config.headers.token = capturedHeaders['token'];
            if (capturedHeaders['sign']) config.headers.sign = capturedHeaders['sign'];
            if (capturedHeaders['x-csrf-token']) config.headers.xCsrfToken = capturedHeaders['x-csrf-token'];
            if (capturedHeaders['x-signature']) config.headers.xSignature = capturedHeaders['x-signature'];
            if (capturedHeaders['apiclientid']) config.headers.apiclientid = capturedHeaders['apiclientid'];
            if (capturedHeaders['storeid'] && capturedHeaders['storeid'] !== 'null') {
                config.storeId = Number(capturedHeaders['storeid']);
            }

            await config.save();
            console.log('[AutoRefreshGo] Cập nhật database thành công!');

            await browser.close();
            return res.json({
                success: true,
                message: 'Tự động làm mới Cookie & Token của GO! thành công.',
                data: {
                    cookie: 'COOKIE_ALREADY_SAVED',
                    token: config.headers.token,
                    sign: config.headers.sign,
                }
            });
        } else {
            await browser.close();
            return res.status(400).json({
                success: false,
                message: 'Không bắt được request API của GO! trong thời gian chờ. Vui lòng thử lại.'
            });
        }

    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch(e) {}
        }
        console.error('[AutoRefreshGo] Lỗi tự động refresh:', error.message);
        res.status(500).json({ success: false, message: 'Lỗi tự động lấy cấu hình: ' + error.message });
    }
};

/**
 * POST /api/admin/scraper-config/auto-refresh-winmart
 * Tự động mở Puppeteer truy cập winmart.vn, bắt lấy storeCode/storeGroupCode/cookie và lưu vào DB.
 */
exports.autoRefreshWinmartConfig = async (req, res) => {
    let browser = null;
    try {
        const puppeteer = require('puppeteer');
        console.log('[AutoRefreshWinmart] Khởi chạy trình duyệt...');
        
        const isProd = process.env.NODE_ENV === 'production';
        browser = await puppeteer.launch({
            headless: isProd ? 'new' : false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        let capturedData = null;
        let capturePromiseResolver;
        const capturePromise = new Promise((resolve) => {
            capturePromiseResolver = resolve;
        });

        console.log('[AutoRefreshWinmart] Đang lắng nghe request...');
        page.on('request', request => {
            const url = request.url();
            if (url.includes('api-crownx.winmart.vn')) {
                try {
                    const urlObj = new URL(url);
                    const storeCode = urlObj.searchParams.get('storeCode');
                    const storeGroupCode = urlObj.searchParams.get('storeGroupCode');
                    if (storeCode && storeGroupCode) {
                        capturedData = { storeCode, storeGroupCode };
                        console.log('[AutoRefreshWinmart] Đã bắt được storeCode:', storeCode, 'storeGroupCode:', storeGroupCode);
                        capturePromiseResolver(true);
                    }
                } catch (e) {}
            }
        });

        console.log('[AutoRefreshWinmart] Điều hướng tới winmart.vn...');
        try {
            await page.goto('https://winmart.vn/', { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (gotoErr) {
            console.warn('[AutoRefreshWinmart] Cảnh báo khi tải trang chủ:', gotoErr.message);
        }

        // Chờ tối đa 8 giây
        await Promise.race([
            capturePromise,
            new Promise(r => setTimeout(() => r(false), 8000))
        ]);

        if (!capturedData) {
            console.log('[AutoRefreshWinmart] Chưa bắt được, điều hướng sang trang danh mục...');
            try {
                await page.goto('https://winmart.vn/gia-sieu-re--c114', { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (gotoErr) {
                console.warn('[AutoRefreshWinmart] Cảnh báo khi tải trang danh mục:', gotoErr.message);
            }
            await Promise.race([
                capturePromise,
                new Promise(r => setTimeout(() => r(false), 8000))
            ]);
        }

        if (capturedData) {
            const cookies = await page.cookies('https://winmart.vn');
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            let config = await ScraperConfig.findOne({ name: 'sieuthi-winmart' });
            if (!config) {
                config = new ScraperConfig({ 
                    name: 'sieuthi-winmart', 
                    supermarketName: 'WinMart'
                });
            }

            config.cookie = cookieStr;
            config.storeCode = capturedData.storeCode;
            config.storeGroupCode = capturedData.storeGroupCode;

            await config.save();
            console.log('[AutoRefreshWinmart] Cập nhật database thành công!');

            await browser.close();
            return res.json({
                success: true,
                message: 'Tự động làm mới Cookie & Cấu hình WinMart thành công.',
                data: {
                    storeCode: config.storeCode,
                    storeGroupCode: config.storeGroupCode,
                }
            });
        } else {
            await browser.close();
            return res.status(400).json({
                success: false,
                message: 'Không bắt được request API của WinMart trong thời gian chờ. Vui lòng thử lại.'
            });
        }

    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch(e) {}
        }
        console.error('[AutoRefreshWinmart] Lỗi tự động refresh:', error.message);
        res.status(500).json({ success: false, message: 'Lỗi tự động lấy cấu hình WinMart: ' + error.message });
    }
};

/**
 * POST /api/admin/scraper-config/auto-refresh-bhx
 * Tự động mở Puppeteer truy cập bachhoaxanh.com, bắt lấy headers/cookie/storeId/provinceId và lưu vào DB.
 */
exports.autoRefreshBhxConfig = async (req, res) => {
    let browser = null;
    try {
        const puppeteer = require('puppeteer');
        console.log('[AutoRefreshBhx] Khởi chạy trình duyệt...');
        
        const isProd = process.env.NODE_ENV === 'production';
        browser = await puppeteer.launch({
            headless: isProd ? 'new' : false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        let capturedHeaders = null;
        let capturedStore = null;
        let capturePromiseResolver;
        const capturePromise = new Promise((resolve) => {
            capturePromiseResolver = resolve;
        });

        console.log('[AutoRefreshBhx] Đang lắng nghe request...');
        page.on('request', request => {
            const url = request.url();
            const headers = request.headers();

            if (headers['authorization'] && headers['deviceid'] && headers['xapikey']) {
                capturedHeaders = {
                    authorization: headers['authorization'],
                    deviceid: headers['deviceid'],
                    xapikey: headers['xapikey']
                };
                console.log('[AutoRefreshBhx] Đã bắt được headers!');
            }

            if (url.includes('bachhoaxanh.com/gw/')) {
                try {
                    const urlObj = new URL(url);
                    const provinceId = urlObj.searchParams.get('ProvinceId');
                    const storeId = urlObj.searchParams.get('StoreId');
                    if (provinceId && storeId) {
                        capturedStore = { provinceId, storeId };
                        console.log('[AutoRefreshBhx] Đã bắt được storeId:', storeId, 'provinceId:', provinceId);
                    }
                } catch (e) {}
            }

            if (capturedHeaders && capturedStore) {
                capturePromiseResolver(true);
            }
        });

        console.log('[AutoRefreshBhx] Điều hướng tới bachhoaxanh.com...');
        try {
            await page.goto('https://www.bachhoaxanh.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (gotoErr) {
            console.warn('[AutoRefreshBhx] Cảnh báo khi tải trang chủ:', gotoErr.message);
        }

        // Chờ tối đa 8 giây
        await Promise.race([
            capturePromise,
            new Promise(r => setTimeout(() => r(false), 8000))
        ]);

        if (!capturedHeaders || !capturedStore) {
            console.log('[AutoRefreshBhx] Chưa bắt đủ thông tin, điều hướng sang trang danh mục...');
            try {
                await page.goto('https://www.bachhoaxanh.com/thit-ca-trung', { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (gotoErr) {
                console.warn('[AutoRefreshBhx] Cảnh báo khi tải trang danh mục:', gotoErr.message);
            }
            await Promise.race([
                capturePromise,
                new Promise(r => setTimeout(() => r(false), 8000))
            ]);
        }

        if (capturedHeaders) {
            const cookies = await page.cookies('https://www.bachhoaxanh.com');
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            let config = await ScraperConfig.findOne({ name: 'sieuthi-bhx' });
            if (!config) {
                config = new ScraperConfig({ 
                    name: 'sieuthi-bhx', 
                    supermarketName: 'Bách Hóa Xanh'
                });
            }

            config.cookie = cookieStr;
            if (!config.headers) config.headers = {};
            config.headers.authorization = capturedHeaders.authorization;
            config.headers.deviceid = capturedHeaders.deviceid;
            config.headers.xapikey = capturedHeaders.xapikey;

            if (capturedStore) {
                config.provinceId = Number(capturedStore.provinceId);
                config.storeId = Number(capturedStore.storeId);
            }

            await config.save();
            console.log('[AutoRefreshBhx] Cập nhật database thành công!');

            await browser.close();
            return res.json({
                success: true,
                message: 'Tự động làm mới Cookie & Cấu hình BHX thành công.',
                data: {
                    authorization: config.headers.authorization,
                    deviceid: config.headers.deviceid,
                    provinceId: config.provinceId,
                    storeId: config.storeId,
                }
            });
        } else {
            await browser.close();
            return res.status(400).json({
                success: false,
                message: 'Không bắt được request API của BHX trong thời gian chờ. Vui lòng thử lại.'
            });
        }

    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch(e) {}
        }
        console.error('[AutoRefreshBhx] Lỗi tự động refresh:', error.message);
        res.status(500).json({ success: false, message: 'Lỗi tự động lấy cấu hình BHX: ' + error.message });
    }
};

