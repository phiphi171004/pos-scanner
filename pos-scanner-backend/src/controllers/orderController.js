const Order = require('../models/Order');

// Local orders storage fallback
let localOrders = [
  {
    _id: 'POS-8829-012X',
    supermarket: 'WinMart+ Landmark 81',
    createdAt: new Date(Date.now() - 3600000),
    status: 'completed',
    totalAmount: 450000,
    items: [
        {
            product: {
                barcode: '8936039140012',
                name: 'Sữa Tươi Tiệt Trùng TH True Milk - 1L',
                price: 34500
            },
            quantity: 2
        }
    ]
  }
];

// Create new order
exports.createOrder = async (req, res) => {
    if (global.dbFallback) {
        const { items, totalAmount, supermarket } = req.body;
        const newOrder = {
            _id: 'POS-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.random().toString(36).substring(2,6).toUpperCase(),
            supermarket: supermarket || 'Khác',
            createdAt: new Date(),
            status: 'completed',
            totalAmount: Number(totalAmount) || 0,
            items: items || []
        };
        localOrders.unshift(newOrder);
        return res.status(201).json(newOrder);
    }
    try {
        const { items, totalAmount, supermarket } = req.body;
        
        const newOrder = new Order({
            user: req.user._id,
            items,
            totalAmount,
            supermarket
        });

        const savedOrder = await newOrder.save();
        res.status(201).json(savedOrder);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all orders (history)
exports.getOrders = async (req, res) => {
    if (global.dbFallback) {
        return res.json(localOrders);
    }
    try {
        const orders = await Order.find({ user: req.user._id }).populate('items.product').sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
    if (global.dbFallback) {
        const order = localOrders.find(o => o._id === req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        return res.json(order);
    }
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).populate('items.product');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
