import { Platform } from 'react-native';

let BASE_URL = 'https://api.shopaccsheap.pro.vn/api';

export const setApiIp = (ip) => {
    // Hardcoded production URL, setting IP is disabled
};

export const getApiUrl = () => {
    return BASE_URL;
};

// SecureStore conditional loading
let SecureStore = null;
try {
    SecureStore = require('expo-secure-store');
} catch (e) {
    console.warn('SecureStore module load error in api.js:', e);
}

const globalMemoryStorage = {};
const secureStorage = {
    getItem: async (key) => {
        try {
            if (Platform.OS !== 'web' && SecureStore && typeof SecureStore.getItemAsync === 'function') {
                return await SecureStore.getItemAsync(key);
            }
            if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            }
        } catch (e) {
            console.warn('SecureStore.getItemAsync failed, using memory fallback:', e.message);
        }
        return globalMemoryStorage[key] || null;
    },
    setItem: async (key, value) => {
        try {
            if (Platform.OS !== 'web' && SecureStore && typeof SecureStore.setItemAsync === 'function') {
                await SecureStore.setItemAsync(key, value);
                return;
            }
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
                return;
            }
        } catch (e) {
            console.warn('SecureStore.setItemAsync failed, using memory fallback:', e.message);
        }
        globalMemoryStorage[key] = value;
    },
    deleteItem: async (key) => {
        try {
            if (Platform.OS !== 'web' && SecureStore && typeof SecureStore.deleteItemAsync === 'function') {
                await SecureStore.deleteItemAsync(key);
                return;
            }
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
                return;
            }
        } catch (e) {
            console.warn('SecureStore.deleteItemAsync failed, using memory fallback:', e.message);
        }
        delete globalMemoryStorage[key];
    }
};

// Event Listeners for Silent Token Refresh and Expiration
let tokenRefreshListeners = [];
let sessionExpiredListeners = [];

export const addTokenRefreshListener = (listener) => {
    tokenRefreshListeners.push(listener);
};

export const removeTokenRefreshListener = (listener) => {
    tokenRefreshListeners = tokenRefreshListeners.filter(l => l !== listener);
};

export const addSessionExpiredListener = (listener) => {
    sessionExpiredListeners.push(listener);
};

export const removeSessionExpiredListener = (listener) => {
    sessionExpiredListeners = sessionExpiredListeners.filter(l => l !== listener);
};

const notifyTokenRefreshed = (newToken) => {
    tokenRefreshListeners.forEach(listener => {
        try { listener(newToken); } catch (e) {}
    });
};

const notifySessionExpired = () => {
    sessionExpiredListeners.forEach(listener => {
        try { listener(); } catch (e) {}
    });
};

// Request queueing mechanism to prevent concurrent token refresh requests
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
    refreshSubscribers.push(cb);
};

const onRefreshed = (newToken) => {
    refreshSubscribers.forEach((cb) => cb(newToken));
    refreshSubscribers = [];
};

const attemptTokenRefresh = async () => {
    if (isRefreshing) {
        return new Promise((resolve) => {
            subscribeTokenRefresh((newToken) => {
                resolve(newToken);
            });
        });
    }

    isRefreshing = true;

    try {
        const storedRefreshToken = await secureStorage.getItem('refreshToken');
        if (!storedRefreshToken) {
            throw new Error('No refresh token available');
        }

        const res = await fetch(`${BASE_URL}/auth/refreshtoken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedRefreshToken })
        });

        const data = await res.json();
        if (!res.ok || !data.accessToken) {
            throw new Error(data.message || 'Refresh token failed');
        }

        const newAccessToken = data.accessToken;
        await secureStorage.setItem('userToken', newAccessToken);
        notifyTokenRefreshed(newAccessToken);
        
        isRefreshing = false;
        onRefreshed(newAccessToken);
        
        return newAccessToken;
    } catch (err) {
        isRefreshing = false;
        refreshSubscribers = [];
        // Clear all storage on hard failure
        await secureStorage.deleteItem('userToken');
        await secureStorage.deleteItem('refreshToken');
        await secureStorage.deleteItem('userInfo');
        throw err;
    }
};

// Custom Fetch Wrapper with Automatic Silent Retry on 401
const authenticatedFetch = async (url, options = {}, originalToken) => {
    let activeToken = originalToken;
    if (!activeToken) {
        activeToken = await secureStorage.getItem('userToken');
    }

    options.headers = options.headers || {};
    if (activeToken) {
        options.headers['Authorization'] = `Bearer ${activeToken}`;
    }

    let res = await fetch(url, options);
    
    if (res.status === 401) {
        try {
            const freshToken = await attemptTokenRefresh();
            if (freshToken) {
                options.headers['Authorization'] = `Bearer ${freshToken}`;
                res = await fetch(url, options);
            }
        } catch (refreshErr) {
            console.warn('Failed to auto refresh token:', refreshErr);
            notifySessionExpired();
            throw new Error('Phiên đăng nhập đã hết hạn');
        }
    }
    
    return res;
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

export const getAllProducts = async (search = '') => {
    try {
        const url = search 
            ? `${BASE_URL}/products?search=${encodeURIComponent(search)}` 
            : `${BASE_URL}/products`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tải danh sách sản phẩm');
        return data;
    } catch (error) {
        console.warn('Get all products error:', error);
        return [];
    }
};

export const createProduct = async (productData, token) => {
    const res = await authenticatedFetch(`${BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Không thể đóng góp sản phẩm');
    return data;
};

// Order APIs
export const createOrder = async (orderData, token) => {
    const res = await authenticatedFetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi lưu đơn hàng');
    return data;
};

export const getOrders = async (token) => {
    try {
        const res = await authenticatedFetch(`${BASE_URL}/orders`, {}, token);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tải lịch sử đơn hàng');
        return data;
    } catch (error) {
        console.warn('Get orders error:', error);
        return [];
    }
};

// Admin Sync APIs
export const syncProducts = async (source = 'all', token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/sync-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi đồng bộ sản phẩm');
    return data;
};

export const getSyncStatus = async (token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/sync-status`, {}, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi lấy trạng thái đồng bộ');
    return data;
};

export const getScraperConfig = async (token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/scraper-config`, {}, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi lấy cấu hình scraper');
    return data;
};

export const updateScraperConfig = async (configData, token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/scraper-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi cập nhật cấu hình scraper');
    return data;
};

export const autoRefreshGoConfig = async (token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/scraper-config/auto-refresh-go`, {
        method: 'POST'
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi tự động lấy cấu hình GO!');
    return data;
};

export const autoRefreshWinmartConfig = async (token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/scraper-config/auto-refresh-winmart`, {
        method: 'POST'
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi tự động lấy cấu hình WinMart!');
    return data;
};

export const autoRefreshBhxConfig = async (token) => {
    const res = await authenticatedFetch(`${BASE_URL}/admin/scraper-config/auto-refresh-bhx`, {
        method: 'POST'
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi tự động lấy cấu hình Bách Hóa Xanh!');
    return data;
};

export const deleteProduct = async (id, token) => {
    const res = await authenticatedFetch(`${BASE_URL}/products/${id}`, {
        method: 'DELETE'
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi xóa sản phẩm');
    return data;
};

export const updateProduct = async (id, productData, token) => {
    const res = await authenticatedFetch(`${BASE_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
    }, token);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi cập nhật sản phẩm');
    return data;
};
