const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Bạn không có quyền truy cập vào chức năng này' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

        if (global.dbFallback) {
            req.user = { id: 'mock-user-id', name: 'Nguyễn Văn A', email: 'example@retail.com', role: 'admin' };
            return next();
        }

        req.user = await User.findById(decoded.id);
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (global.dbFallback) {
            return next();
        }
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Quyền của bạn (${req.user ? req.user.role : 'khách'}) không được phép thực hiện chức năng này`
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
