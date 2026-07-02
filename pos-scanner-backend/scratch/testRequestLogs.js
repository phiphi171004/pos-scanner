const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    console.log('Listening to requests...');
    page.on('request', request => {
        const url = request.url();
        if (url.includes('/api/')) {
            console.log(`- Request: ${url}`);
        }
    });

    try {
        console.log('Going to sieuthi-go.vn...');
        await page.goto('https://sieuthi-go.vn/', { waitUntil: 'networkidle2', timeout: 35000 });
        console.log('Page loaded.');
        await new Promise(r => setTimeout(r, 8000));
    } catch(err) {
        console.error('Error during goto:', err.message);
    } finally {
        await browser.close();
        console.log('Closed.');
    }
}

test();
