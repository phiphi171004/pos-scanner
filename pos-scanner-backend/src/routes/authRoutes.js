const express = require('express');
const router = express.Router();
const {
    register,
    login,
    forgotPassword,
    resetPassword,
    getMe,
    refreshToken
} = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

// Refresh token: KHÔNG dùng protect vì access token có thể đã hết hạn
router.post('/refreshtoken', refreshToken);

// Các route cần phải đăng nhập mới dùng được
router.get('/me', protect, getMe);

module.exports = router;
