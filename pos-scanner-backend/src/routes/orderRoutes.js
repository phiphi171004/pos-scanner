const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

/**
 * @route   POST /api/orders
 * @desc    Lưu một phiên mua sắm mới (Giỏ hàng, tổng tiền, siêu thị) vào lịch sử
 */
router.post('/', orderController.createOrder);

/**
 * @route   GET /api/orders
 * @desc    Lấy toàn bộ danh sách lịch sử các lần mua sắm (Sắp xếp mới nhất lên đầu)
 */
router.get('/', orderController.getOrders);

/**
 * @route   GET /api/orders/:id
 * @desc    Xem chi tiết các mặt hàng và thông tin cụ thể của một đơn hàng theo ID
 */
router.get('/:id', orderController.getOrderById);

module.exports = router;
