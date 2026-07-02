const axios = require('axios');

async function run() {
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'origin': 'https://www.bachhoaxanh.com',
        'referer': 'https://www.bachhoaxanh.com/',
        'Platform': 'webnew',
    };
    
    try {
        const url = 'https://api.bachhoaxanh.com/gw/Menu/GetMenuV2?ProvinceId=1027&WardId=0&StoreId=2546';
        const res = await axios.get(url, { headers, timeout: 15000 });
        const menus = res.data?.data?.menus || [];
        
        console.log('--- Danh mục BHX (Cấp 1 & Cấp 2) ---');
        menus.forEach(m => {
            console.log(`- [${m.id}] ${m.name} (url: ${m.url})`);
            if (m.childrens) {
                m.childrens.forEach(c => {
                    console.log(`   * [${c.id}] ${c.name} (url: ${c.url})`);
                });
            }
        });
    } catch (err) {
        console.error('Lỗi khi gọi API:', err.message);
    }
}

run();
