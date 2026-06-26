const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    syncProducts,
    getSyncStatus,
    getScraperConfig,
    updateScraperConfig,
    autoRefreshGoConfig,
    autoRefreshWinmartConfig,
    autoRefreshBhxConfig,
} = require('../controllers/syncController');

// Tất cả route admin cần đăng nhập và có quyền admin
router.use(protect);
router.use(authorize('admin'));

/**
 * @route   POST /api/admin/sync-products
 * @desc    Admin bấm nút đồng bộ sản phẩm từ GO! API
 */
router.post('/sync-products', syncProducts);

/**
 * @route   GET /api/admin/sync-status
 * @desc    Lấy trạng thái & log cào sản phẩm thực tế theo thời gian thực
 */
router.get('/sync-status', getSyncStatus);

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

/**
 * @route   POST /api/admin/scraper-config/auto-refresh-go
 * @desc    Tự động mở browser lấy cookie/tokens cho GO!
 */
router.post('/scraper-config/auto-refresh-go', autoRefreshGoConfig);

/**
 * @route   POST /api/admin/scraper-config/auto-refresh-winmart
 * @desc    Tự động mở browser lấy cookie/tokens cho WinMart
 */
router.post('/scraper-config/auto-refresh-winmart', autoRefreshWinmartConfig);

/**
 * @route   POST /api/admin/scraper-config/auto-refresh-bhx
 * @desc    Tự động mở browser lấy cookie/tokens cho Bách Hóa Xanh
 */
router.post('/scraper-config/auto-refresh-bhx', autoRefreshBhxConfig);

module.exports = router;
