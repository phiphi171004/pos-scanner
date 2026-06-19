const express = require('express');
const router = express.Router();
const multer = require('multer');
const productController = require('../controllers/productController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Cấu hình multer để lưu trữ file tạm thời trong bộ nhớ (memoryStorage)
// Sau đó chúng ta sẽ dùng Sharp để xử lý buffer này trước khi đẩy lên R2
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // Giới hạn kích thước file là 5MB
    },
});

/**
 * @route   GET /api/products
 * @desc    Lấy danh sách tất cả sản phẩm trong hệ thống
 */
router.get('/', productController.getAllProducts);

/**
 * @route   GET /api/products/:barcode
 * @desc    Tra cứu thông tin một sản phẩm dựa trên mã vạch (Barcode)
 */
router.get('/:barcode', productController.getProductByBarcode);

/**
 * @route   POST /api/products
 * @desc    Thêm sản phẩm mới kèm theo ảnh (Ảnh sẽ được tự động nén & chuyển sang WebP)
 */
router.post('/', upload.single('image'), productController.createProduct);

/**
 * @route   POST /api/products/import
 * @desc    Import sản phẩm từ JSON (không cần upload ảnh, dùng cho scraper)
 */
router.post('/import', protect, authorize('admin'), productController.importProduct);

/**
 * @route   PUT /api/products/:id
 * @desc    Cập nhật thông tin sản phẩm hoặc thay đổi ảnh mới theo ID
 */
router.put('/:id', protect, authorize('admin'), upload.single('image'), productController.updateProduct);

/**
 * @route   DELETE /api/products/:id
 * @desc    Xóa vĩnh viễn một sản phẩm khỏi hệ thống dựa trên ID
 */
router.delete('/:id', protect, authorize('admin'), productController.deleteProduct);

module.exports = router;
