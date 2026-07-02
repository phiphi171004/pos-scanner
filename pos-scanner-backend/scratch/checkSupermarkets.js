const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Product = require('../src/models/Product');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27015/pos-scanner');
        console.log('MongoDB Connected.');

        const bigCCount = await Product.countDocuments({ supermarket: 'Big C' });
        const goCount = await Product.countDocuments({ supermarket: 'GO!' });
        const bhxCount = await Product.countDocuments({ supermarket: 'BHX' });
        const winmartCount = await Product.countDocuments({ supermarket: 'WinMart' });

        console.log('Product count by supermarket:');
        console.log(`- Big C: ${bigCCount}`);
        console.log(`- GO!: ${goCount}`);
        console.log(`- BHX: ${bhxCount}`);
        console.log(`- WinMart: ${winmartCount}`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
