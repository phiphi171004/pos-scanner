const puppeteer = require('puppeteer');

async function testBhx() {
    console.log('Launching browser for BHX...');
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        page.on('request', request => {
            const url = request.url();
            if (url.includes('bachhoaxanh.com/gw/')) {
                console.log('[Intercepted BHX URL]:', url);
                console.log('Headers:', JSON.stringify(request.headers(), null, 2));
            }
        });

        console.log('Navigating to bachhoaxanh.com...');
        await page.goto('https://www.bachhoaxanh.com/', { waitUntil: 'networkidle2', timeout: 35000 });
        console.log('Page loaded.');

        await new Promise(r => setTimeout(r, 10000));
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

testBhx();
