const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const puppeteer = require('puppeteer');

dotenv.config({ path: path.join(__dirname, '../.env') });

const ScraperConfig = require('../src/models/ScraperConfig');

async function run() {
    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27015/pos-scanner');
        console.log('MongoDB connected.');

        const config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
        
        console.log('Launching browser...');
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Nạp cookie cũ nếu có
        if (config && config.cookie) {
            const cookiePairs = config.cookie.split(';');
            const puppeteerCookies = cookiePairs.map(pair => {
                const trimmed = pair.trim();
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    return {
                        name: trimmed.substring(0, eqIdx).trim(),
                        value: trimmed.substring(eqIdx + 1).trim(),
                        domain: '.sieuthi-go.vn'
                    };
                }
                return null;
            }).filter(c => c !== null);

            if (puppeteerCookies.length > 0) {
                await page.setCookie(...puppeteerCookies);
                console.log(`Loaded ${puppeteerCookies.length} existing cookies to browser.`);
            }
        }

        let capturedHeaders = null;
        page.on('request', request => {
            const url = request.url();
            if (url.includes('order2_listProduct')) {
                console.log(`[INTERCEPTED] order2_listProduct request url: ${url}`);
                capturedHeaders = request.headers();
            }
        });

        console.log('Navigating to sieuthi-go.vn...');
        await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2', timeout: 35000 });

        console.log('Waiting 5 seconds to ensure requests fire...');
        await new Promise(r => setTimeout(r, 5000));

        if (capturedHeaders) {
            console.log('Success! Intercepted headers:');
            console.log('token:', capturedHeaders['token']);
            console.log('sign:', capturedHeaders['sign']);
        } else {
            console.log('Failed to intercept order2_listProduct. Trying category direct navigation...');
            // Direct navigate to category page if home fails to trigger
            await page.goto('https://sieuthi-go.vn/category/san-pham-tuoi-song-1', { waitUntil: 'networkidle2', timeout: 35000 });
            await new Promise(r => setTimeout(r, 5000));
            if (capturedHeaders) {
                console.log('Success after category navigation! Intercepted headers:');
                console.log('token:', capturedHeaders['token']);
                console.log('sign:', capturedHeaders['sign']);
            } else {
                console.log('Still failed to intercept.');
            }
        }

        await browser.close();
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

run();
