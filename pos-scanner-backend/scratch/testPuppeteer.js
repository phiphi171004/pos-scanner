const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    try {
        const browser = await puppeteer.launch({
            headless: false, // headed mode so we can see it
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Browser launched successfully!');
        const page = await browser.newPage();
        await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2' });
        console.log('Loaded sieuthi-go.vn, page title:', await page.title());
        await browser.close();
        console.log('Test passed!');
    } catch (err) {
        console.error('Test failed with error:', err.message);
    }
}

test();
