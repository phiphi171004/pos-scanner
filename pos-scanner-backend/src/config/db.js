const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected successfully');
        global.dbFallback = false;
    } catch (error) {
        console.warn('MongoDB connection error:', error.message);
        console.warn('⚠️ MongoDB not connected. Fallback to Local In-Memory DB Mode.');
        global.dbFallback = true;
    }
};

module.exports = connectDB;
