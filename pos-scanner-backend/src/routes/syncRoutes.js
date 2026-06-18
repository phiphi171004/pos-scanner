const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    syncProducts,
    getScraperConfig,
    updateScraperConfig,
} = require('../controllers/syncController');

// Tất cả route admin cần đăng nhập
router.use(protect);

/**
 * @route   POST /api/admin/sync-products
 * @desc    Admin bấm nút đồng bộ sản phẩm từ GO! API
 */
router.post('/sync-products', syncProducts);

/**
 * @route   GET /api/admin/scraper-config
 * @desc    Xem config scraper hiện tại
 */
router.get('/scraper-config', getScraperConfig);

/**
 * @route   PUT /api/admin/scraper-config
 * @desc    Cập nhật cookie/headers khi hết hạn
 */
router.put('/scraper-config', updateScraperConfig);

module.exports = router;
