const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser with stealth features...');
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    const page = await browser.newPage();
    
    // Hide webdriver
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    let capturedHeaders = null;
    page.on('request', request => {
        const url = request.url();
        if (url.includes('order2_listProduct')) {
            console.log(`[STEALTH SUCCESS] Intercepted url: ${url}`);
            capturedHeaders = request.headers();
        }
    });

    try {
        console.log('Navigating...');
        await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2', timeout: 35000 });
        console.log('Page loaded, page title:', await page.title());
        
        await new Promise(r => setTimeout(r, 6000));
        
        if (capturedHeaders) {
            console.log('Token captured successfully!');
            console.log('token:', capturedHeaders['token']);
        } else {
            console.log('Failed to capture token. Trying category page...');
            await page.goto('https://sieuthi-go.vn/category/san-pham-tuoi-song-1', { waitUntil: 'networkidle2', timeout: 35000 });
            await new Promise(r => setTimeout(r, 6000));
            if (capturedHeaders) {
                console.log('Token captured on category page!');
            } else {
                console.log('Still failed.');
            }
        }
    } catch(err) {
        console.error('Error:', err.message);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

test();
