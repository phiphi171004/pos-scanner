require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Product = require('../src/models/Product');

async function run() {
    console.log('Kết nối database để dọn dẹp...');
    await connectDB();

    console.log('Đang tìm kiếm các sản phẩm tươi sống hiện có trong database...');
    
    // Tìm các sản phẩm có barcode độ dài < 12 hoặc bắt đầu bằng chữ số 2
    // Chúng ta dùng regex trong MongoDB để truy vấn nhanh
    const query = {
        $or: [
            { barcode: { $regex: /^2/ } }, // Bắt đầu bằng 2
            { $expr: { $lt: [{ $strLenCP: "$barcode" }, 12] } } // Độ dài < 12 kí tự
        ]
    };

    const freshProducts = await Product.find(query);
    console.log(`Tìm thấy ${freshProducts.length} sản phẩm khớp điều kiện thực phẩm tươi sống.`);

    if (freshProducts.length > 0) {
        console.log('\nDanh sách 15 sản phẩm mẫu sẽ bị xóa:');
        freshProducts.slice(0, 15).forEach((p, idx) => {
            console.log(`  ${idx + 1}. [${p.supermarket}] [Mã: ${p.barcode}] ${p.name} - Giá: ${p.price}đ`);
        });

        console.log('\nBắt đầu xóa khỏi cơ sở dữ liệu...');
        const deleteResult = await Product.deleteMany(query);
        console.log(`Đã xóa thành công ${deleteResult.deletedCount} sản phẩm tươi sống.`);
    } else {
        console.log('Không có sản phẩm tươi sống nào cần dọn dẹp trong cơ sở dữ liệu.');
    }

    await mongoose.connection.close();
    console.log('Hoàn tất dọn dẹp DB.');
}

run().catch(err => {
    console.error('Lỗi khi dọn dẹp:', err);
    process.exit(1);
});
