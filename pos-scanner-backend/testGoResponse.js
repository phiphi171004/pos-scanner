const connectDB = require('./src/config/db');
const mongoose = require('mongoose');
const axios = require('axios');
const ScraperConfig = require('./src/models/ScraperConfig');

async function run() {
    await connectDB();
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
        'token': 'dummy_token_123456789', // Dummy token
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

    console.log(`\n--- Sending request for Page 1 with DUMMY token ---`);
    const res = await axios.post(url, payload, {
        headers,
        maxRedirects: 0,
        validateStatus: () => true
    });

    console.log('Status:', res.status);
    console.log('Data:', typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 500) : String(res.data).slice(0, 500));

    await mongoose.connection.close();
}

run();
