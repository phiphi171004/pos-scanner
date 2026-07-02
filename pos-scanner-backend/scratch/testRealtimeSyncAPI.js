require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../src/models/User');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log('Kết nối database để lấy thông tin admin...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Tìm admin user
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
        console.error('Không tìm thấy tài khoản admin nào trong DB!');
        await mongoose.disconnect();
        return;
    }
    console.log(`Tìm thấy admin: ${adminUser.email} (ID: ${adminUser._id})`);

    // Tạo JWT Token hợp lệ
    const token = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, {
        expiresIn: '15m'
    });
    console.log('Đã tạo Token JWT Admin.');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    console.log('\nGửi request POST khởi chạy đồng bộ GO! (chạy nền)...');
    try {
        const startRes = await axios.post('http://127.0.0.1:5000/api/admin/sync-products', {
            source: 'go'
        }, { headers });
        console.log('Kết quả khởi chạy API:', startRes.data);
    } catch (err) {
        console.error('Lỗi khi gọi API sync-products:', err.response ? err.response.data : err.message);
        await mongoose.disconnect();
        return;
    }

    console.log('\nBắt đầu kiểm tra logs thời gian thực bằng cách polling GET /sync-status...');
    let isRunning = true;
    let loggedLinesCount = 0;

    for (let i = 0; i < 30; i++) { // Quét 30 lần (~30 giây)
        await sleep(1000);
        try {
            const statusRes = await axios.get('http://127.0.0.1:5000/api/admin/sync-status', { headers });
            const data = statusRes.data.data;
            
            console.log(`\n--- Poll #${i+1} [Status: ${data.status}] ---`);
            if (data.logs && data.logs.length > loggedLinesCount) {
                // In ra các dòng log mới xuất hiện
                const newLines = data.logs.slice(loggedLinesCount);
                newLines.forEach(line => console.log('  LOG:', line));
                loggedLinesCount = data.logs.length;
            } else {
                console.log('  (Không có dòng log mới)');
            }

            if (data.status !== 'running') {
                console.log(`\nTiến trình kết thúc với trạng thái: ${data.status}`);
                isRunning = false;
                break;
            }
        } catch (err) {
            console.error('Lỗi khi poll status:', err.message);
        }
    }

    if (isRunning) {
        console.log('\nTiến trình vẫn đang tiếp tục chạy trong nền...');
    }

    await mongoose.disconnect();
    console.log('\nHoàn tất test script.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
