const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    try {
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        let capturedHeaders = null;

        console.log('Listening to requests...');
        page.on('request', request => {
            const url = request.url();
            if (url.includes('order2_listProduct')) {
                console.log(`Found listProduct request: ${url}`);
                capturedHeaders = request.headers();
            }
        });

        await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 3000));
        
        if (capturedHeaders) {
            console.log('\n--- Captured Headers ---');
            console.log('token:', capturedHeaders['token']);
            console.log('sign:', capturedHeaders['sign']);
            console.log('x-csrf-token:', capturedHeaders['x-csrf-token']);
            console.log('x-signature:', capturedHeaders['x-signature']);
            console.log('apiclientid:', capturedHeaders['apiclientid']);
            
            const cookies = await page.cookies('https://sieuthi-go.vn');
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            console.log('\n--- Captured Cookie String ---');
            console.log(cookieStr);
        } else {
            console.log('No order2_listProduct request intercepted.');
        }

        await browser.close();
    } catch (err) {
        console.error('Test failed:', err.message);
    }
}

test();
