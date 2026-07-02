const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    try {
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        console.log('Listening to requests...');
        page.on('request', request => {
            const url = request.url();
            if (url.includes('/api/')) {
                console.log(`[API REQUEST] URL: ${url}`);
                const headers = request.headers();
                if (url.includes('listProduct') || url.includes('Product')) {
                    console.log('Found listProduct/Product request! Headers:');
                    console.log(JSON.stringify(headers, null, 2));
                }
            }
        });

        await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait a few seconds to let any lazy requests load
        await new Promise(r => setTimeout(r, 5000));
        
        await browser.close();
        console.log('Finished interception test');
    } catch (err) {
        console.error('Interception failed:', err.message);
    }
}

test();
