require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        // Cập nhật tất cả người dùng chưa có trường role thành 'user'
        const resUser = await User.updateMany(
            { role: { $exists: false } },
            { $set: { role: 'user' } }
        );
        console.log(`Đã cập nhật ${resUser.modifiedCount} người dùng thành vai trò 'user'.`);

        // Gán cụ thể tài khoản example@retail.com thành 'admin'
        const resAdmin = await User.updateMany(
            { email: 'example@retail.com' },
            { $set: { role: 'admin' } }
        );
        console.log(`Đã cập nhật ${resAdmin.modifiedCount} tài khoản example@retail.com thành vai trò 'admin'.`);

        console.log('Quá trình di trú dữ liệu (migration) hoàn tất thành công!');
    } catch (err) {
        console.error('Di trú thất bại:', err);
    } finally {
        await mongoose.disconnect();
    }
}

migrate();
