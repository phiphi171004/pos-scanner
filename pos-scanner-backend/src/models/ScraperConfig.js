const mongoose = require('mongoose');

const scraperConfigSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        default: 'sieuthi-go',
    },
    apiUrl: {
        type: String,
        default: 'https://sieuthi-go.vn/api/order2_listProduct?platform=2&lang=vi',
    },
    storeId: {
        type: Number,
        default: 123,
    },
    supermarketName: {
        type: String,
        default: 'Big C',
    },
    cookie: {
        type: String,
        default: '',
    },
    headers: {
        token: { type: String, default: '' },
        sign: { type: String, default: '' },
        xCsrfToken: { type: String, default: '' },
        xSignature: { type: String, default: '' },
        apiclientid: { type: String, default: '8465102' },
    },
    lastSyncAt: {
        type: Date,
        default: null,
    },
    lastSyncResult: {
        total: { type: Number, default: 0 },
        created: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
    },
}, { timestamps: true });

module.exports = mongoose.model('ScraperConfig', scraperConfigSchema);
