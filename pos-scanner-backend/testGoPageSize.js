const connectDB = require('./src/config/db');
const mongoose = require('mongoose');
const axios = require('axios');
const ScraperConfig = require('./src/models/ScraperConfig');

async function testParam(paramName, paramValue) {
    const config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
    
    const payload = {
        filter_by: 'best_seller',
        page: 1,
        store: config.storeId,
        sitecode: config.storeId,
        platform: 2,
        hourDelivery: 0,
        pmh_id: null,
        lang: 'vi',
        [paramName]: paramValue
    };

    let currentCookie = config.cookie || '';
    let url = config.apiUrl;
    let redirectCount = 0;
    let finalRes = null;

    while (redirectCount < 5) {
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

        const res = await axios.post(url, payload, {
            headers,
            maxRedirects: 0,
            validateStatus: () => true
        });

        if (res.status === 307 || res.status === 302 || res.status === 301) {
            const setCookies = res.headers['set-cookie'];
            if (setCookies) {
                setCookies.forEach(sc => {
                    const cookiePart = sc.split(';')[0];
                    currentCookie = `${cookiePart}; ${currentCookie}`;
                });
            }
            url = res.headers['location'] || url;
            redirectCount++;
        } else {
            finalRes = res;
            break;
        }
    }

    if (finalRes && finalRes.status === 200 && finalRes.data.status === 'success') {
        const productsCount = finalRes.data.products ? finalRes.data.products.length : 0;
        console.log(`Parameter "${paramName}: ${paramValue}" -> Success! Returned ${productsCount} products.`);
        return productsCount;
    } else {
        console.log(`Parameter "${paramName}: ${paramValue}" -> Failed or status not success.`);
        return 0;
    }
}

async function run() {
    await connectDB();
    
    // Test various common pagination parameters
    await testParam('limit', 1000);
    await testParam('limit', 500);
    await testParam('limit', 100);
    
    await testParam('page_size', 500);
    await testParam('pageSize', 500);
    
    await testParam('per_page', 500);
    await testParam('perPage', 500);
    
    await testParam('size', 500);
    
    await mongoose.connection.close();
}

run();
