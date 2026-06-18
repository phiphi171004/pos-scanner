const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        default: 1
    },
    priceAtTime: {
        type: Number,
        required: true
    }
});

const orderSchema = new mongoose.Schema({
    items: [orderItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },
    supermarket: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled'],
        default: 'completed'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);
