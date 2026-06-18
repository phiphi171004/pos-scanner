/**
 * Script một lần: đọc headers/cookie từ api-go.txt → lưu vào MongoDB
 * Chạy: node seed-config.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ScraperConfig = require('./src/models/ScraperConfig');

const API_FILE = path.join(__dirname, '..', 'api-go.txt');

function parseApiFile() {
    const raw = fs.readFileSync(API_FILE, 'utf-8');
    const lines = raw.split('\n').map(l => l.replace('\r', ''));

    let cookie = '', token = '', sign = '', csrfToken = '', apiclientid = '';
    let xSignature = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === 'cookie' && !cookie) cookie = lines[i + 1] || '';
        if (line === 'token' && !token) token = lines[i + 1]?.trim() || '';
        if (line === 'sign' && !sign) sign = lines[i + 1]?.trim() || '';
        if (line === 'x-csrf-token' && !csrfToken) csrfToken = lines[i + 1]?.trim() || '';
        if (line === 'apiclientid' && !apiclientid) apiclientid = lines[i + 1]?.trim() || '';
    }

    // x-signature từ API 2 (phân trang)
    let inApi2 = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('api2')) inApi2 = true;
        if (inApi2 && lines[i].trim() === 'x-signature') {
            xSignature = lines[i + 1]?.trim() || '';
            break;
        }
    }

    return { cookie, token, sign, csrfToken, xSignature, apiclientid };
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const parsed = parseApiFile();
    console.log('Cookie length:', parsed.cookie.length);
    console.log('Token:', parsed.token.slice(0, 8) + '...');

    const config = await ScraperConfig.findOneAndUpdate(
        { name: 'sieuthi-go' },
        {
            cookie: parsed.cookie,
            headers: {
                token: parsed.token,
                sign: parsed.sign,
                xCsrfToken: parsed.csrfToken,
                xSignature: parsed.xSignature,
                apiclientid: parsed.apiclientid,
            },
        },
        { upsert: true, new: true }
    );

    console.log('Config saved! ID:', config._id);
    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
