const goScraper = require('../services/goScraper');
const bhxScraper = require('../services/bhxScraper');
const winmartScraper = require('../services/winmartScraper');
const ScraperConfig = require('../models/ScraperConfig');

const SCRAPERS = {
    go: { name: 'GO!', scraper: goScraper },
    bhx: { name: 'Bách Hóa Xanh', scraper: bhxScraper },
    winmart: { name: 'WinMart', scraper: winmartScraper },
};

/**
 * POST /api/admin/sync-products
 * Body: { source: 'go' | 'bhx' | 'winmart' | 'all' }
 * Admin bấm nút → cào sản phẩm từ 1 hoặc tất cả nguồn
 */
exports.syncProducts = async (req, res) => {
    try {
        const { source = 'all' } = req.body;
        const logs = [];
        const log = (msg) => logs.push(msg);
        const results = [];

        if (source === 'all') {
            for (const [key, { name, scraper }] of Object.entries(SCRAPERS)) {
                log(`\n=== Bắt đầu sync ${name} ===`);
                try {
                    const result = await scraper.syncProducts(log);
                    results.push(result);
                } catch (err) {
                    log(`[${name}] Lỗi: ${err.message}`);
                    results.push({ source: name, error: err.message });
                }
            }
        } else if (SCRAPERS[source]) {
            const { name, scraper } = SCRAPERS[source];
            log(`=== Bắt đầu sync ${name} ===`);
            const result = await scraper.syncProducts(log);
            results.push(result);
        } else {
            return res.status(400).json({
                success: false,
                message: `Nguồn không hợp lệ: ${source}. Chọn: go, bhx, winmart, all`,
            });
        }

        const totalCreated = results.reduce((s, r) => s + (r.created || 0), 0);
        const totalSkipped = results.reduce((s, r) => s + (r.skipped || 0), 0);

        res.json({
            success: true,
            message: `Đồng bộ hoàn tất: ${totalCreated} mới, ${totalSkipped} đã có`,
            results,
            logs,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * GET /api/admin/scraper-config
 * Xem config hiện tại (ẩn cookie cho ngắn)
 */
exports.getScraperConfig = async (req, res) => {
    try {
        const config = await goScraper.getConfig();
        res.json({
            success: true,
            config: {
                name: config.name,
                apiUrl: config.apiUrl,
                storeId: config.storeId,
                supermarketName: config.supermarketName,
                cookieLength: config.cookie?.length || 0,
                hasCookie: !!config.cookie,
                headers: {
                    token: config.headers.token ? '***' + config.headers.token.slice(-6) : '',
                    sign: config.headers.sign ? '***' + config.headers.sign.slice(-6) : '',
                    xCsrfToken: config.headers.xCsrfToken ? '***' + config.headers.xCsrfToken.slice(-6) : '',
                    xSignature: config.headers.xSignature ? '***' + config.headers.xSignature.slice(-6) : '',
                    apiclientid: config.headers.apiclientid,
                },
                lastSyncAt: config.lastSyncAt,
                lastSyncResult: config.lastSyncResult,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /api/admin/scraper-config
 * Admin cập nhật cookie/headers khi hết hạn
 * Body: { cookie, token, sign, xCsrfToken, xSignature, apiclientid, storeId, supermarketName }
 */
exports.updateScraperConfig = async (req, res) => {
    try {
        const config = await goScraper.getConfig();
        const { cookie, token, sign, xCsrfToken, xSignature, apiclientid, storeId, supermarketName } = req.body;

        if (cookie !== undefined) config.cookie = cookie;
        if (storeId !== undefined) config.storeId = storeId;
        if (supermarketName !== undefined) config.supermarketName = supermarketName;
        if (token !== undefined) config.headers.token = token;
        if (sign !== undefined) config.headers.sign = sign;
        if (xCsrfToken !== undefined) config.headers.xCsrfToken = xCsrfToken;
        if (xSignature !== undefined) config.headers.xSignature = xSignature;
        if (apiclientid !== undefined) config.headers.apiclientid = apiclientid;

        await config.save();

        res.json({
            success: true,
            message: 'Cập nhật config thành công',
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
