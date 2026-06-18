const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testAddProductWithRealImage() {
    const url = 'http://localhost:5000/api/products';
    const form = new FormData();
    
    // Đường dẫn tới file img1.png của bạn
    const imagePath = path.join(__dirname, '..', 'img1.png');

    if (!fs.existsSync(imagePath)) {
        console.error(`Không tìm thấy file ảnh tại: ${imagePath}`);
        return;
    }

    // 1. Chuẩn bị dữ liệu Form
    form.append('barcode', '8934588012237'); // Đổi mã vạch mới cho lần test WebP
    form.append('name', 'Nước Ngọt Coca Cola');
    form.append('price', '10000');
    form.append('supermarket', 'Bách Hóa Xanh');
    form.append('image', fs.createReadStream(imagePath));

    try {
        console.log('Đang gửi yêu cầu thêm sản phẩm với file img1.png...');
        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders(),
            },
        });

        console.log('Thêm sản phẩm thành công!');
        console.log('Dữ liệu phản hồi:', JSON.stringify(response.data, null, 2));
        console.log('\nBạn có thể kiểm tra ảnh tại URL:', response.data.imageUrl);

    } catch (error) {
        console.error('Lỗi khi thêm sản phẩm:', error.response ? error.response.data : error.message);
    }
}

testAddProductWithRealImage();
