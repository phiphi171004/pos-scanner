const connectDB = require('./src/config/db');
const mongoose = require('mongoose');
const { autoParseAndSaveConfigs } = require('./src/utils/logParser');
const goScraper = require('./src/services/goScraper');
const ScraperConfig = require('./src/models/ScraperConfig');

async function run() {
    console.log('Kết nối database...');
    await connectDB();
    
    console.log('Chạy parser tự động...');
    await autoParseAndSaveConfigs();

    const config = await ScraperConfig.findOne({ name: 'sieuthi-go' });
    console.log('Cấu hình sieuthi-go trong DB:', JSON.stringify(config, null, 2));

    console.log('Bắt đầu chạy scraper đồng bộ GO!...');
    try {
        const result = await goScraper.syncProducts(console.log);
        console.log('\nKết quả đồng bộ:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('\nLỗi khi đồng bộ GO!:', error.message);
    }

    await mongoose.connection.close();
}

run().catch(err => {
    console.error('Lỗi chạy test:', err);
    process.exit(1);
});
