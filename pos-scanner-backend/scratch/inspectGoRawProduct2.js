require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const ScraperConfig = require('../src/models/ScraperConfig');

function buildHeaders(config, includeSignature = true) {
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

    if (includeSignature && config.headers.xSignature) {
        headers['x-signature'] = config.headers.xSignature;
    }

    if (config.cookie) {
        headers['cookie'] = config.cookie;
    }

    return headers;
}

async function fetchPage(config, page = 1) {
    const payload = {
        filter_by: 'best_seller',
        page,
        store: config.storeId,
        sitecode: config.storeId,
        platform: 2,
        hourDelivery: 0,
        pmh_id: null,
        lang: 'vi',
    };

    let currentCookie = config.cookie || '';
    let url = config.apiUrl;
    let redirectCount = 0;
    let response = null;
    let cookieChanged = false;

    while (redirectCount < 5) {
        const headers = buildHeaders(config);
        if (currentCookie) {
            headers['cookie'] = currentCookie;
        }

        const res = await axios.post(url, payload, {
            headers,
            timeout: 15000,
            maxRedirects: 0,
            validateStatus: () => true
        });

        if (res.status === 307 || res.status === 302 || res.status === 301) {
            const setCookies = res.headers['set-cookie'];
            if (setCookies) {
                setCookies.forEach(sc => {
                    const cookiePart = sc.split(';')[0];
                    const eqIdx = cookiePart.indexOf('=');
                    if (eqIdx !== -1) {
                        const cookieName = cookiePart.substring(0, eqIdx);
                        const cleanName = cookieName.trim();
                        const escapedCleanName = cleanName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const cookieRegex = new RegExp(`${escapedCleanName}\\s*=\\s*[^;]*;?\\s*`, 'g');
                        currentCookie = currentCookie.replace(cookieRegex, '').trim();
                        if (currentCookie && !currentCookie.endsWith(';')) {
                            currentCookie += ';';
                        }
                        currentCookie = `${cookiePart}; ${currentCookie}`.trim();
                        cookieChanged = true;
                    }
                });
            }
            url = res.headers['location'] || url;
            redirectCount++;
        } else {
            response = res;
            break;
        }
    }

    if (!response) {
        throw new Error('Lỗi chuyển hướng quá giới hạn (Max redirects exceeded)');
    }

    if (cookieChanged) {
        config.cookie = currentCookie;
        await config.save();
    }

    return response;
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
    
    try {
        console.log('Đang lấy dữ liệu trang 1 từ GO!...');
        const res = await fetchPage(config, 1);
        console.log('Trạng thái HTTP:', res.status);
        if (res.data && res.data.products && res.data.products.length > 0) {
            console.log('\n--- Sản phẩm thô #1 từ GO! ---');
            console.log(JSON.stringify(res.data.products[0], null, 2));
            
            console.log('\n--- Sản phẩm thô #2 từ GO! ---');
            console.log(JSON.stringify(res.data.products[1], null, 2));
        } else {
            console.log('Phản hồi API:', JSON.stringify(res.data).slice(0, 500));
        }
    } catch (err) {
        console.error('Lỗi khi gọi API:', err.message);
    }

    await mongoose.connection.close();
}

run();
