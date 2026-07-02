const puppeteer = require('puppeteer');

async function testWinmart() {
    console.log('Launching browser for WinMart...');
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
            if (url.includes('api-crownx.winmart.vn')) {
                console.log('[Intercepted WinMart URL]:', url);
                console.log('Headers:', JSON.stringify(request.headers(), null, 2));
            }
        });

        console.log('Navigating to winmart.vn...');
        await page.goto('https://winmart.vn/', { waitUntil: 'networkidle2', timeout: 35000 });
        console.log('Page loaded.');

        const cookies = await page.cookies();
        console.log('Cookies count:', cookies.length);
        console.log('Cookies sample:', cookies.slice(0, 5).map(c => `${c.name}=${c.value}`));

        await new Promise(r => setTimeout(r, 10000));
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

testWinmart();
