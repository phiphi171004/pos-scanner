const Product = require('../models/Product');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/r2');
const crypto = require('crypto');
const sharp = require('sharp');

// Local memory storage fallback for offline/sandbox environments
let localProducts = [
  {
    _id: 'p1',
    barcode: '8936039140012',
    name: 'Sữa Tươi Tiệt Trùng TH True Milk - 1L',
    supermarket: 'WinMart',
    price: 34500,
    imageUrl: '',
    createdAt: new Date()
  },
  {
    _id: 'p2',
    barcode: '4902505623041',
    name: 'Tai nghe Bluetooth Sony',
    supermarket: 'GO!',
    price: 450000,
    imageUrl: '',
    createdAt: new Date()
  },
  {
    _id: 'p3',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'Bách Hóa Xanh',
    price: 26500,
    imageUrl: '',
    createdAt: new Date()
  },
  {
    _id: 'p4',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'WinMart',
    price: 28000,
    imageUrl: '',
    createdAt: new Date()
  },
  {
    _id: 'p5',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'GO!',
    price: 24900,
    imageUrl: '',
    createdAt: new Date()
  }
];

// Get all products
exports.getAllProducts = async (req, res) => {
    if (global.dbFallback) {
        return res.json(localProducts);
    }
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get product by barcode (trả về tất cả sản phẩm cùng barcode từ nhiều siêu thị)
exports.getProductByBarcode = async (req, res) => {
    const { barcode } = req.params;
    if (global.dbFallback) {
        const matches = localProducts.filter(p => p.barcode === barcode);
        if (matches.length === 0) {
            return res.status(404).json({ message: 'Product not found in local database (Fallback Mode)' });
        }
        return res.json(matches);
    }
    try {
        const products = await Product.find({ barcode });
        
        if (!products || products.length === 0) {
            return res.status(404).json({ message: 'Product not found in local database' });
        }
        
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create new product
exports.createProduct = async (req, res) => {
    if (global.dbFallback) {
        const { barcode, name, price, supermarket, imageUrl } = req.body;
        const existing = localProducts.find(p => p.barcode === barcode && p.supermarket === supermarket);
        if (existing) {
            return res.status(400).json({ message: 'Product with this barcode already exists at this supermarket' });
        }
        const newP = {
            _id: 'p_' + Date.now(),
            barcode,
            name,
            price: Number(price) || 0,
            supermarket: supermarket || 'Khác',
            imageUrl: imageUrl || '',
            createdAt: new Date()
        };
        localProducts.unshift(newP);
        return res.status(201).json(newP);
    }
    try {
        const { barcode, name, price, supermarket, imageUrl: bodyImageUrl } = req.body;
        
        const existingProduct = await Product.findOne({ barcode, supermarket });
        if (existingProduct) {
            return res.status(400).json({ message: 'Product with this barcode already exists at this supermarket' });
        }

        let imageUrl = bodyImageUrl || '';
        
        if (req.file) {
            const fileName = `${crypto.randomBytes(16).toString('hex')}.webp`;
            
            // Nén và chuyển đổi sang WebP bằng sharp
            const optimizedImageBuffer = await sharp(req.file.buffer)
                .webp({ quality: 80 }) // Nén chất lượng 80%
                .toBuffer();

            const uploadParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: `products/${fileName}`,
                Body: optimizedImageBuffer,
                ContentType: 'image/webp',
            };

            await s3Client.send(new PutObjectCommand(uploadParams));
            imageUrl = `${process.env.R2_PUBLIC_URL}/products/${fileName}`;
        }

        const newProduct = new Product({
            barcode,
            name,
            price: Number(price),
            supermarket,
            imageUrl
        });

        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Import product (JSON only, dùng cho scraper)
exports.importProduct = async (req, res) => {
    if (global.dbFallback) {
        const { barcode, name, price, supermarket, imageUrl } = req.body;
        if (!barcode || !name) {
            return res.status(400).json({ message: 'barcode và name là bắt buộc' });
        }
        const existing = localProducts.find(p => p.barcode === barcode && p.supermarket === (supermarket || 'Khác'));
        if (existing) {
            return res.status(409).json({ message: 'Product already exists' });
        }
        const newP = {
            _id: 'p_' + Date.now(),
            barcode,
            name,
            price: Number(price) || 0,
            supermarket: supermarket || 'Khác',
            imageUrl: imageUrl || '',
            createdAt: new Date()
        };
        localProducts.unshift(newP);
        return res.status(201).json(newP);
    }
    try {
        const { barcode, name, price, supermarket, imageUrl } = req.body;

        if (!barcode || !name) {
            return res.status(400).json({ message: 'barcode và name là bắt buộc' });
        }

        const existingProduct = await Product.findOne({ barcode, supermarket: supermarket || 'Khác' });
        if (existingProduct) {
            return res.status(409).json({ message: 'Product with this barcode already exists at this supermarket' });
        }

        const newProduct = new Product({
            barcode,
            name,
            price: Number(price) || 0,
            supermarket: supermarket || '',
            imageUrl: imageUrl || '',
        });

        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update product
exports.updateProduct = async (req, res) => {
    if (global.dbFallback) {
        const { name, price, supermarket } = req.body;
        const index = localProducts.findIndex(p => p._id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ message: 'Product not found' });
        }
        const p = localProducts[index];
        if (name) p.name = name;
        if (price !== undefined) p.price = Number(price);
        if (supermarket) p.supermarket = supermarket;
        return res.json(p);
    }
    try {
        const { name, price, supermarket } = req.body;
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        product.name = name || product.name;
        product.price = price !== undefined ? Number(price) : product.price;
        product.supermarket = supermarket || product.supermarket;

        if (req.file) {
            const fileName = `${crypto.randomBytes(16).toString('hex')}.webp`;
            
            const optimizedImageBuffer = await sharp(req.file.buffer)
                .webp({ quality: 80 })
                .toBuffer();

            const uploadParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: `products/${fileName}`,
                Body: optimizedImageBuffer,
                ContentType: 'image/webp',
            };

            await s3Client.send(new PutObjectCommand(uploadParams));
            product.imageUrl = `${process.env.R2_PUBLIC_URL}/products/${fileName}`;
        }

        const updatedProduct = await product.save();
        res.json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    if (global.dbFallback) {
        const index = localProducts.findIndex(p => p._id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ message: 'Product not found' });
        }
        localProducts.splice(index, 1);
        return res.json({ message: 'Product removed' });
    }
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        await product.deleteOne();
        res.json({ message: 'Product removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
