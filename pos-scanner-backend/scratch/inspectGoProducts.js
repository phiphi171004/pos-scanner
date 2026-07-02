const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Product = require('../src/models/Product');

async function run() {
    await connectDB();
    console.log('Truy vấn 5 sản phẩm của GO!...');
    const products = await Product.find({ supermarket: 'GO!' }).limit(5);
    console.log(JSON.stringify(products, null, 2));
    await mongoose.connection.close();
}

run();
