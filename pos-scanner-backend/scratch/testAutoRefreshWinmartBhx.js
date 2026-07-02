const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const { autoRefreshWinmartConfig, autoRefreshBhxConfig } = require('../src/controllers/syncController');
const ScraperConfig = require('../src/models/ScraperConfig');

async function runTest() {
    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27015/pos-scanner');
        console.log('MongoDB connected.');

        // Mock req and res
        const req = {};
        const res = {
            status: function(code) {
                console.log(`[res.status] ${code}`);
                return this;
            },
            json: function(data) {
                console.log('[res.json] Success response:', JSON.stringify(data, null, 2));
                return this;
            }
        };

        console.log('\n--- STARTING AUTO REFRESH WINMART TEST ---');
        await autoRefreshWinmartConfig(req, res);
        console.log('--- WINMART TEST FINISHED ---\n');

        // Fetch updated WinMart config to verify
        const winmartConfig = await ScraperConfig.findOne({ name: 'sieuthi-winmart' });
        console.log('WinMart Config in DB after test:');
        console.log('- cookie length:', winmartConfig?.cookie?.length || 0);
        console.log('- storeCode:', winmartConfig?.storeCode);
        console.log('- storeGroupCode:', winmartConfig?.storeGroupCode);

        console.log('\n--- STARTING AUTO REFRESH BHX TEST ---');
        await autoRefreshBhxConfig(req, res);
        console.log('--- BHX TEST FINISHED ---\n');

        // Fetch updated BHX config to verify
        const bhxConfig = await ScraperConfig.findOne({ name: 'sieuthi-bhx' });
        console.log('BHX Config in DB after test:');
        console.log('- cookie length:', bhxConfig?.cookie?.length || 0);
        console.log('- authorization:', bhxConfig?.headers?.authorization);
        console.log('- deviceid:', bhxConfig?.headers?.deviceid);
        console.log('- xapikey:', bhxConfig?.headers?.xapikey);
        console.log('- provinceId:', bhxConfig?.provinceId);
        console.log('- storeId:', bhxConfig?.storeId);

    } catch (err) {
        console.error('Test execution error:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

runTest();
