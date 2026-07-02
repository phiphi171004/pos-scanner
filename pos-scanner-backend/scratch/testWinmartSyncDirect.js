const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const winmartScraper = require('../src/services/winmartScraper');

async function run() {
    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27015/pos-scanner');
        console.log('MongoDB connected.');

        console.log('Running winmartScraper.syncProducts...');
        const result = await winmartScraper.syncProducts(console.log);
        console.log('Sync Result:', JSON.stringify(result, null, 2));

    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

run();
