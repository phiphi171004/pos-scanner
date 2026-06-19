const PORT = '5000';
let BASE_URL = `http://192.168.1.163:${PORT}/api`;

// Check if running on web and set appropriate host
if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    BASE_URL = `http://${hostname}:${PORT}/api`;
}

export const setApiIp = (ip) => {
    BASE_URL = `http://${ip}:${PORT}/api`;
};

export const getApiUrl = () => {
    return BASE_URL;
};

// Auth APIs
export const login = async (email, password) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Đăng nhập thất bại');
    return data;
};

export const register = async (name, email, password) => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Đăng ký thất bại');
    return data;
};

// Product APIs
export const getProductByBarcode = async (barcode) => {
    try {
        const res = await fetch(`${BASE_URL}/products/${barcode}`);
        if (res.status === 404) return [];
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tải thông tin sản phẩm');
        return Array.isArray(data) ? data : [data];
    } catch (error) {
        console.warn('Get product by barcode error:', error);
        return [];
    }
};

export const getAllProducts = async () => {
    try {
        const res = await fetch(`${BASE_URL}/products`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tải danh sách sản phẩm');
        return data;
    } catch (error) {
        console.warn('Get all products error:', error);
        return [];
    }
};

export const createProduct = async (productData, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(productData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Không thể đóng góp sản phẩm');
    return data;
};

// Order APIs
export const createOrder = async (orderData, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi lưu đơn hàng');
    return data;
};

export const getOrders = async (token) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch(`${BASE_URL}/orders`, { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tải lịch sử đơn hàng');
        return data;
    } catch (error) {
        console.warn('Get orders error:', error);
        return [];
    }
};

// Admin Sync APIs
export const syncProducts = async (token) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/admin/sync-products`, {
        method: 'POST',
        headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi đồng bộ sản phẩm');
    return data;
};
