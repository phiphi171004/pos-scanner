const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const { autoRefreshGoConfig } = require('../src/controllers/syncController');
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

        console.log('\n--- STARTING AUTO REFRESH GO CONFIG TEST ---');
        await autoRefreshGoConfig(req, res);
        console.log('--- TEST FINISHED ---\n');

        // Fetch updated config to verify
        const updatedConfig = await ScraperConfig.findOne({ name: 'sieuthi-go' });
        console.log('Config in Database after test:');
        console.log('cookie length:', updatedConfig?.cookie?.length || 0);
        console.log('token:', updatedConfig?.headers?.token);
        console.log('sign:', updatedConfig?.headers?.sign);
        console.log('xCsrfToken:', updatedConfig?.headers?.xCsrfToken);
        console.log('xSignature:', updatedConfig?.headers?.xSignature);
        console.log('apiclientid:', updatedConfig?.headers?.apiclientid);
        console.log('storeId:', updatedConfig?.storeId);

    } catch (err) {
        console.error('Test execution error:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

runTest();
