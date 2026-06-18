require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Gửi email qua Brevo SMTP (smtp-relay.brevo.com)
 * Yêu cầu các biến môi trường:
 *   BREVO_SMTP_USER     - SMTP login (email Brevo cấp, dạng xxxx@smtp-brevo.com)
 *   BREVO_SMTP_KEY      - SMTP key lấy từ Brevo dashboard (KHÔNG phải password tài khoản)
 *   FROM_EMAIL          - Địa chỉ gửi (đã verify trên Brevo, vd noreply@shopsheap.online)
 *   FROM_NAME           - Tên hiển thị (vd "POS Scanner")
 *
 * @param {Object} options
 * @param {string} options.email   - Địa chỉ người nhận
 * @param {string} options.subject - Tiêu đề email
 * @param {string} options.message - Nội dung text
 * @param {string} [options.html]  - Nội dung HTML (tùy chọn)
 */
const sendEmail = async (options) => {
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_KEY;

    console.log('[sendEmail] BREVO_SMTP_USER loaded:', user ? `${user.slice(0, 4)}...` : 'EMPTY');
    console.log('[sendEmail] BREVO_SMTP_KEY loaded:', pass ? `${pass.slice(0, 8)}...(${pass.length} chars)` : 'EMPTY');

    if (!user || !pass) {
        throw new Error('Thiếu BREVO_SMTP_USER hoặc BREVO_SMTP_KEY trong .env. Hãy restart server sau khi sửa .env.');
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false, // 587 dùng STARTTLS
        auth: { user, pass },
    });

    const mailOptions = {
        from: `"${process.env.FROM_NAME || 'POS Scanner'}" <${process.env.FROM_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        ...(options.html ? { html: options.html } : {}),
    };

    try {
        console.log(`Đang gửi email tới ${options.email} qua Brevo SMTP...`);
        const info = await transporter.sendMail(mailOptions);
        console.log('Email đã được gửi thành công! messageId:', info.messageId);
        return info;
    } catch (error) {
        console.error('Lỗi gửi email qua Brevo:', error && error.message ? error.message : error);
        if (error && error.response) {
            console.error('SMTP response:', error.response);
        }
        throw new Error('Lỗi hệ thống gửi mail');
    }
};

module.exports = sendEmail;
