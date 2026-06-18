const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    barcode: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    imageUrl: {
        type: String,
        default: ''
    },
    supermarket: {
        type: String,
        enum: ['Bách Hóa Xanh', 'WinMart', 'GO!', 'Big C', 'Shopee', 'Khác'],
        default: 'Khác'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Cùng barcode + cùng supermarket = trùng, nhưng khác supermarket thì OK
productSchema.index({ barcode: 1, supermarket: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
