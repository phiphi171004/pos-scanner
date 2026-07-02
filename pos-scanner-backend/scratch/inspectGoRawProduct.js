require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const ScraperConfig = require('../src/models/ScraperConfig');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
    
    let currentCookie = config.cookie || '';
    const url = config.apiUrl;

    const payload = {
        filter_by: 'best_seller',
        page: 1,
        store: config.storeId,
        sitecode: config.storeId,
        platform: 2,
        hourDelivery: 0,
        pmh_id: null,
        lang: 'vi',
    };

    const headers = {
        'Content-Type': 'application/json',
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://sieuthi-go.vn',
        'referer': 'https://sieuthi-go.vn/',
        'language': 'vi',
        'apiclientid': config.headers.apiclientid,
        'storeid': String(config.storeId),
        'token': config.headers.token,
        'sign': config.headers.sign,
        'x-csrf-token': config.headers.xCsrfToken,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    };

    if (config.headers.xSignature) {
        headers['x-signature'] = config.headers.xSignature;
    }
    if (currentCookie) {
        headers['cookie'] = currentCookie;
    }

    try {
        console.log('Đang gửi yêu cầu lấy trang 1 từ GO!...');
        const res = await axios.post(url, payload, { headers, timeout: 15000 });
        if (res.data && res.data.products && res.data.products.length > 0) {
            console.log('\nSố lượng sản phẩm nhận được:', res.data.products.length);
            console.log('\nChi tiết sản phẩm thô thứ nhất (Raw Product):');
            console.log(JSON.stringify(res.data.products[0], null, 2));
            
            console.log('\nChi tiết sản phẩm thô thứ hai (Raw Product):');
            console.log(JSON.stringify(res.data.products[1], null, 2));
        } else {
            console.log('Không tìm thấy sản phẩm trong phản hồi:', res.data);
        }
    } catch (err) {
        console.error('Lỗi khi gọi API:', err.message);
    }

    await mongoose.connection.close();
}

run();
