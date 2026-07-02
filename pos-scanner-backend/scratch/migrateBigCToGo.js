const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Product = require('../src/models/Product');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27015/pos-scanner');
        console.log('MongoDB Connected.');

        const bigCProducts = await Product.find({ supermarket: 'Big C' });
        console.log(`Found ${bigCProducts.length} products with supermarket "Big C".`);

        let mergedCount = 0;
        let deletedCount = 0;

        for (const prod of bigCProducts) {
            const barcode = prod.barcode;
            // Check if there is already a GO! product with the same barcode
            const goExists = await Product.findOne({ barcode, supermarket: 'GO!' });
            
            if (goExists) {
                // If it already exists under GO!, delete the Big C duplicate
                await Product.deleteOne({ _id: prod._id });
                deletedCount++;
            } else {
                // If not, update supermarket to GO!
                prod.supermarket = 'GO!';
                await prod.save();
                mergedCount++;
            }
        }

        console.log('Migration completed successfully:');
        console.log(`- Updated from "Big C" to "GO!": ${mergedCount} products`);
        console.log(`- Deleted duplicate "Big C" records: ${deletedCount} products`);

    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

run();
