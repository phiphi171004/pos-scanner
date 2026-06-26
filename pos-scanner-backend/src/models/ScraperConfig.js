const mongoose = require('mongoose');

const scraperConfigSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    apiUrl: {
        type: String,
        default: '',
    },
    storeId: {
        type: String,
        default: '',
    },
    provinceId: {
        type: Number,
        default: null,
    },
    storeCode: {
        type: String,
        default: '',
    },
    storeGroupCode: {
        type: String,
        default: '',
    },
    supermarketName: {
        type: String,
        default: '',
    },
    cookie: {
        type: String,
        default: '',
    },
    headers: {
        // sieuthi-go fields
        token: { type: String, default: '' },
        sign: { type: String, default: '' },
        xCsrfToken: { type: String, default: '' },
        xSignature: { type: String, default: '' },
        apiclientid: { type: String, default: '' },
        
        // sieuthi-bhx fields
        authorization: { type: String, default: '' },
        deviceid: { type: String, default: '' },
        xapikey: { type: String, default: '' },
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

