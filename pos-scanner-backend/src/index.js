const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const authRoutes = require('./routes/authRoutes');
const syncRoutes = require('./routes/syncRoutes');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', syncRoutes);

app.get('/', (req, res) => {
    res.send('POS Scanner API is running...');
});

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
