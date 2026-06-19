const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// Tạo access token (ngắn hạn)
const signAccessToken = (user) => {
    return jwt.sign({ id: user._id || user.id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: process.env.JWT_EXPIRE || '15m',
    });
};

// Tạo refresh token (dài hạn) - ký bằng secret RIÊNG để không nhầm với access token
const signRefreshToken = (user) => {
    return jwt.sign(
        { id: user._id || user.id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
    );
};

// Helper trả response kèm cả access + refresh token
const sendTokenResponse = (user, statusCode, res) => {
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(statusCode).json({
        success: true,
        accessToken,
        refreshToken,
        user: {
            id: user._id || user.id,
            name: user.name,
            email: user.email,
            role: user.role || 'user'
        }
    });
};

// @desc    Đăng ký người dùng
// @route   POST /api/auth/register
exports.register = async (req, res, next) => {
    if (global.dbFallback) {
        const { name, email, role } = req.body;
        const mockRole = role || (email === 'example@retail.com' ? 'admin' : 'user');
        return sendTokenResponse({ id: 'mock-user-id', name: name || 'User', email: email || 'user@example.com', role: mockRole }, 201, res);
    }
    try {
        const { name, email, password, role } = req.body;
        const userRole = role || (email === 'example@retail.com' ? 'admin' : 'user');
 
        const user = await User.create({
            name,
            email,
            password,
            role: userRole
        });

        sendTokenResponse(user, 201, res);
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Đăng nhập người dùng
// @route   POST /api/auth/login
exports.login = async (req, res, next) => {
    if (global.dbFallback) {
        const { email } = req.body;
        const mockRole = email === 'example@retail.com' ? 'admin' : 'user';
        return sendTokenResponse({ id: 'mock-user-id', name: 'Nguyễn Văn A', email: email || 'example@retail.com', role: mockRole }, 200, res);
    }
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu' });
        }

        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({ success: false, message: 'Thông tin đăng nhập không chính xác' });
        }

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Thông tin đăng nhập không chính xác' });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Quên mật khẩu (Gửi mail)
// @route   POST /api/auth/forgotpassword
exports.forgotPassword = async (req, res, next) => {
    if (global.dbFallback) {
        return res.status(200).json({ success: true, message: 'Email đặt lại mật khẩu đã được gửi (Mock)' });
    }
    try {
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng với email này' });
        }

        // Tạo reset token
        const resetToken = user.getResetPasswordToken();

        await user.save({ validateBeforeSave: false });

        // Tạo URL reset mật khẩu (Frontend sẽ xử lý trang này)
        // Ví dụ: posscanner://resetpassword/token_xxxx
        const frontendResetUrl = process.env.FRONTEND_RESET_URL || `${req.protocol}://${req.get('host')}/resetpassword`;
        const resetUrl = `${frontendResetUrl}/${resetToken}`;

        const message = `Bạn nhận được email này vì bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Vui lòng nhấp vào link sau: \n\n ${resetUrl}`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'POS Scanner - Đặt lại mật khẩu',
                message,
            });

            res.status(200).json({ success: true, message: 'Email đã được gửi' });
        } catch (err) {
            console.log(err);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;

            await user.save({ validateBeforeSave: false });

            return res.status(500).json({ success: false, message: 'Không thể gửi email' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Đặt lại mật khẩu mới
// @route   PUT /api/auth/resetpassword/:resettoken
exports.resetPassword = async (req, res, next) => {
    if (global.dbFallback) {
        return sendTokenResponse({ id: 'mock-user-id', name: 'Nguyễn Văn A', email: 'example@retail.com' }, 200, res);
    }
    try {
        // Hash token từ URL để so sánh với bản lưu trong DB
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
        }

        // Set mật khẩu mới
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Lấy thông tin người dùng hiện tại
// @route   GET /api/auth/me
exports.getMe = async (req, res, next) => {
    if (global.dbFallback) {
        return res.status(200).json({
            success: true,
            data: { id: 'mock-user-id', name: 'Nguyễn Văn A', email: 'example@retail.com', role: 'admin' }
        });
    }
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Làm mới Access Token bằng Refresh Token
// @route   POST /api/auth/refreshtoken
// @body    { refreshToken: "..." }
exports.refreshToken = async (req, res, next) => {
    if (global.dbFallback) {
        return res.status(200).json({
            success: true,
            accessToken: 'mock-new-access-token'
        });
    }
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ success: false, message: 'Thiếu refreshToken' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ success: false, message: 'Token không phải refresh token' });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        // Cập nhật access token mới (giữ nguyên refresh token cũ)
        const accessToken = signAccessToken(user);

        res.status(200).json({
            success: true,
            accessToken,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
