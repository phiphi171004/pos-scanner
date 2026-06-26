// Design Read: Reading this as: Personal POS utility mobile web app for design-conscious retail customers, with a clean B2B/consumer utility visual language, leaning toward a refined dark-mode Slate + Blue theme with high-end typography and restrained spring-physics motion, adhering strictly to the `design-taste-frontend` guidelines.
// DESIGN_VARIANCE: 5
// MOTION_INTENSITY: 4
// VISUAL_DENSITY: 5

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Switch,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { darkColors, lightColors, radius, spacing, type } from './theme';
let colors = darkColors;
import { matchingProducts, orders as orderSeed, products as productSeed, syncLogs } from './mockData';
import * as api from './api';
let SecureStore = null;
try {
  SecureStore = require('expo-secure-store');
} catch (e) {
  console.warn('SecureStore module load error in App.js:', e);
}

// Safe wrapper for SecureStore with in-memory fallback to prevent native crashes
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

// Safe wrapper for ActivityIndicator to prevent ReferenceError / crashes in some React Native Web / bundler environments
const SafeActivityIndicator = ({ size = 'large', color, style }) => {
  try {
    if (ActivityIndicator) {
      return <ActivityIndicator size={size} color={color} style={style} />;
    }
  } catch (e) {}
  return <Text style={[{ color: color || '#888', textAlign: 'center', fontWeight: '500' }, style]}>Đang tải...</Text>;
};


// Conditional load of react-native-vision-camera to avoid crashing on Web
let Camera = null;
let useCameraDevice = null;
let useCodeScanner = null;
if (Platform.OS !== 'web') {
  try {
    const VisionCamera = require('react-native-vision-camera');
    Camera = VisionCamera.Camera;
    useCameraDevice = VisionCamera.useCameraDevice;
    useCodeScanner = VisionCamera.useCodeScanner;
  } catch (e) {
    console.warn('Vision Camera module load error:', e);
  }
}

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

export default function App() {
  const [authMode, setAuthMode] = useState('login');
  const [screen, setScreen] = useState('auth');
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scannedMatches, setScannedMatches] = useState([]);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [detailProduct, setDetailProduct] = useState(null);

  // 3D perspective state for Web
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Load theme preference on startup
  useEffect(() => {
    const restoreTheme = async () => {
      try {
        const savedTheme = await secureStorage.getItem('isDarkMode');
        if (savedTheme !== null) {
          setIsDark(savedTheme === 'true');
        }
      } catch (err) {
        console.warn('Failed to restore theme preference:', err.message);
      }
    };
    restoreTheme();
  }, []);

  const toggleTheme = async () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    try {
      await secureStorage.setItem('isDarkMode', nextDark ? 'true' : 'false');
    } catch (e) {}
  };

  // Dynamically update the global colors and styles references before render
  colors = isDark ? darkColors : lightColors;
  styles = createStyles(colors);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  // Read current API url host
  useEffect(() => {
    const url = api.getApiUrl();
    try {
      const match = url.match(/\/\/([^:/]+)/);
      if (match && match[1]) {
        setApiIpState(match[1]);
      }
    } catch (e) {}
  }, []);

  // Listen to silent refresh and session expiration events from api.js
  useEffect(() => {
    const handleTokenRefreshed = (newToken) => {
      console.log('React state sync: token refreshed silent');
      setToken(newToken);
    };

    const handleSessionExpired = () => {
      console.warn('Session expired. Redirecting to login screen.');
      setToken(null);
      setUser(null);
      setCart([]);
      setOrders([]);
      navigate('auth');
      alert('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    };

    api.addTokenRefreshListener(handleTokenRefreshed);
    api.addSessionExpiredListener(handleSessionExpired);

    return () => {
      api.removeTokenRefreshListener(handleTokenRefreshed);
      api.removeSessionExpiredListener(handleSessionExpired);
    };
  }, []);

  // Restore token on startup
  useEffect(() => {
    const restoreToken = async () => {
      try {
        const savedToken = await secureStorage.getItem('userToken');
        const savedUserStr = await secureStorage.getItem('userInfo');
        if (savedToken && savedUserStr) {
          const savedUser = JSON.parse(savedUserStr);
          setToken(savedToken);
          setUser(savedUser);
          loadOrders(savedToken);
          setScreen('home');
          console.log('Restored login session for:', savedUser.email);
        }
      } catch (err) {
        console.warn('Failed to restore token:', err.message);
      }
    };
    restoreToken();
  }, []);

  const loadOrders = async (userToken) => {
    try {
      const history = await api.getOrders(userToken);
      setOrders(history);
    } catch (err) {
      console.warn('Failed to load orders:', err.message);
    }
  };

  const navigate = (nextScreen) => {
    if (nextScreen === 'home' && token) {
      loadOrders(token);
    }
    setScreen(nextScreen);
  };

  const updateQuantity = (id, val, isAbsolute = false) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item._id === id || item.id === id) {
            const nextQty = isAbsolute ? val : item.quantity + val;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const addProduct = (product) => {
    setCart((prev) => {
      const found = prev.find((item) => item.barcode === product.barcode && item.supermarket === product.supermarket);
      if (found) {
        // Keep the quantity exactly as is, do not auto-increment on repeated scans
        return prev;
      }
      return [...prev, { ...product, id: product._id || product.id || `p-${Date.now()}`, quantity: 1 }];
    });
  };

  const handleScan = async (barcode) => {
    try {
      const products = await api.getProductByBarcode(barcode);
      if (products.length === 0) {
        setScannedBarcode(barcode);
        setManualOpen(true);
      } else if (products.length === 1) {
        addProduct(products[0]);
      } else {
        setScannedBarcode(barcode);
        setScannedMatches(products);
        setPickerOpen(true);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleManualSave = async (productData) => {
    try {
      // 1. Save product to API so other scans can find it
      const savedProduct = await api.createProduct(productData, token);
      // 2. Add it to local cart
      addProduct(savedProduct);
      setManualOpen(false);
    } catch (err) {
      // If error (e.g. duplicate barcode on same supermarket), just add it locally
      addProduct({
        ...productData,
        _id: 'p_' + Date.now(),
        createdAt: new Date()
      });
      setManualOpen(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    try {
      const orderItems = cart.map(item => ({
        product: item._id || item.id,
        quantity: item.quantity,
        priceAtTime: item.price
      }));
      const supermarket = cart[0]?.supermarket || 'Khác';
      await api.createOrder({ items: orderItems, totalAmount: cartTotal, supermarket }, token);
      setCart([]);
      loadOrders(token);
      navigate('home');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAuth = async (credentials) => {
    try {
      let res;
      if (authMode === 'login') {
        res = await api.login(credentials.email, credentials.password);
      } else {
        res = await api.register(credentials.name, credentials.email, credentials.password);
      }
      const tokenVal = res.accessToken || res.token;
      if (tokenVal) {
        await secureStorage.setItem('userToken', tokenVal);
        if (res.refreshToken) {
          await secureStorage.setItem('refreshToken', res.refreshToken);
        }
        await secureStorage.setItem('userInfo', JSON.stringify(res.user));
        setToken(tokenVal);
        setUser(res.user);
        loadOrders(tokenVal);
        navigate('home');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleContributionSave = async (productData) => {
    try {
      await api.createProduct(productData, token);
      alert('Đóng góp sản phẩm thành công!');
      navigate('home');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMouseMove = (e) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const { clientX, clientY } = e;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rotateY = ((clientX - w / 2) / (w / 2)) * 8;
    const rotateX = -((clientY - h / 2) / (h / 2)) * 8;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const renderScreen = () => {
    switch (screen) {
      case 'auth':
        return (
          <AuthScreen 
            mode={authMode} 
            setMode={setAuthMode} 
            onDone={handleAuth} 
          />
        );
      case 'home':
        return (
          <HomeScreen
            userName={user ? user.name : 'Nguyễn Văn A'}
            isAdmin={user && user.role === 'admin'}
            orders={orders}
            onScan={() => navigate('scanner')}
            onContribute={() => navigate('contribute')}
            onAdmin={() => navigate('admin')}
            onOrder={(order) => {
              setActiveOrder(order);
              navigate('order');
            }}
            onNavigate={navigate}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            user={user}
            onLogout={async () => {
              try {
                await secureStorage.deleteItem('userToken');
                await secureStorage.deleteItem('refreshToken');
                await secureStorage.deleteItem('userInfo');
              } catch (e) {}
              setToken(null);
              setUser(null);
              setCart([]);
              setOrders([]);
              navigate('auth');
            }}
            onNavigate={navigate}
            isDark={isDark}
            onToggleTheme={toggleTheme}
          />
        );
      case 'scanner':
        return (
          <ScannerScreen
            cart={cart}
            cartCount={cartCount}
            cartTotal={cartTotal}
            onBack={() => navigate('home')}
            onManual={() => {
              setScannedBarcode('8934567890123'); // Default scan barcode mock
              setManualOpen(true);
            }}
            onMultiMatch={() => handleScan('8934567890123')}
            onQuantity={updateQuantity}
            onCheckout={handleCheckout}
            onScan={handleScan}
            onProductDetail={setDetailProduct}
          />
        );
      case 'contribute':
        return (
          <ContributionScreen 
            onBack={() => navigate('home')} 
            onSave={handleContributionSave}
            isAdmin={user && user.role === 'admin'}
          />
        );
      case 'order':
        return <OrderDetailScreen order={activeOrder} onBack={() => navigate('home')} onProductDetail={setDetailProduct} />;
      case 'admin':
        return <AdminScreen onBack={() => navigate('home')} token={token} onProductDetail={setDetailProduct} />;// admin case has implicit admin access
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View 
        style={styles.rootContainer}
        {...(Platform.OS === 'web' ? {
          onMouseMove: handleMouseMove,
          onMouseLeave: handleMouseLeave,
        } : {})}
      >
        {/* Decorative Blurred Neon Orbs in Background */}
        <View style={styles.glowOrb1} />
        <View style={styles.glowOrb2} />
        <View style={styles.glowOrb3} />

        {/* 3D Perspective Wrapper */}
        <View style={styles.perspectiveWrapper}>
          <View 
            style={[
              styles.mainGlassPanel,
              Platform.OS === 'web' && {
                transform: [
                  { perspective: 1200 },
                  { rotateX: `${tilt.x}deg` },
                  { rotateY: `${tilt.y}deg` }
                ]
              }
            ]}
          >
            {renderScreen()}
          </View>
        </View>

        {/* Floating Modals */}
        <ProductPickerModal
          visible={pickerOpen}
          barcode={scannedBarcode}
          products={scannedMatches}
          onClose={() => setPickerOpen(false)}
          onPick={(product) => {
            addProduct(product);
            setPickerOpen(false);
          }}
        />
        <ManualEntryModal
          visible={manualOpen}
          barcode={scannedBarcode}
          onClose={() => setManualOpen(false)}
          onSave={handleManualSave}
        />
        <ProductDetailModal
          visible={!!detailProduct}
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      </View>
    </SafeAreaProvider>
  );
}

function AuthScreen({ mode, setMode, onDone }) {
  const isLogin = mode === 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('example@retail.com');
  const [password, setPassword] = useState('123456');

  const handleSubmit = () => {
    onDone({ name, email, password });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.authScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.authWrap}>
          <View style={styles.logo}>
            <MaterialCommunityIcons name="barcode-scan" size={38} color="#ffffff" />
          </View>
          <Text style={styles.appTitle}>POS Scanner</Text>
          <Text style={styles.kicker}>Hệ thống quét cá nhân</Text>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>{isLogin ? 'Đăng nhập' : 'Tạo tài khoản mới'}</Text>
            {!isLogin && <Field icon="account" placeholder="Nguyễn Văn A" value={name} onChangeText={setName} />}
            <Field icon="email-outline" placeholder="example@retail.com" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Field icon="lock-outline" placeholder="Mật khẩu" secureTextEntry value={password} onChangeText={setPassword} />
            <PrimaryButton label={isLogin ? 'Đăng nhập' : 'Đăng ký'} icon="arrow-right" onPress={handleSubmit} />
          </View>

          <Pressable onPress={() => setMode(isLogin ? 'register' : 'login')}>
            <Text style={styles.linkText}>
              {isLogin ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({ userName, isAdmin, orders, onScan, onContribute, onAdmin, onOrder, onNavigate }) {
  return (
    <AppScaffold active="home" isAdmin={isAdmin} onNavigate={onNavigate}>
      <Header 
        title={`Xin chào, ${userName}`} 
        rightIcon="account-circle-outline" 
        onRight={() => onNavigate('profile')} 
      />
      <ScrollView contentContainerStyle={styles.contentWithNav} showsVerticalScrollIndicator={false}>
        <View style={styles.actionGrid}>
          <ActionTile
            icon="barcode-scan"
            title="Tạo đơn hàng"
            label="Nhấn để bắt đầu quét"
            onPress={onScan}
          />
          <ActionTile
            icon="archive-plus-outline"
            title="Đóng góp sp"
            label="Cập nhật kho dữ liệu"
            onPress={onContribute}
          />
        </View>
        
        {isAdmin && (
          <Pressable style={styles.adminBanner} onPress={onAdmin}>
            <View>
              <Text style={styles.kicker}>Admin tools</Text>
              <Text style={styles.bodyStrong}>Đồng bộ dữ liệu sản phẩm</Text>
            </View>
            <View style={styles.storeIcon}>
              <MaterialCommunityIcons name="database-sync-outline" size={22} color={colors.primary} />
            </View>
          </Pressable>
        )}
        
        <SectionHeader title="Lịch sử đơn hàng" icon="refresh" />
        {orders.length === 0 ? (
          <View style={styles.panel}>
            <Text style={[styles.bodyMuted, { textAlign: 'center' }]}>Chưa có đơn hàng nào.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <OrderCard key={order._id || order.id} order={order} onPress={() => onOrder(order)} />
          ))
        )}
      </ScrollView>
    </AppScaffold>
  );
}

function ScannerScreen({ cart, cartCount, cartTotal, onBack, onManual, onMultiMatch, onQuantity, onCheckout, onScan, onProductDetail }) {
  const [hasPermission, setHasPermission] = useState(false);
  const [torch, setTorch] = useState('off');
  const [lastScanned, setLastScanned] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web' || !Camera) return;
    (async () => {
      const status = await Camera.getCameraPermissionStatus();
      if (status === 'granted') {
        setHasPermission(true);
      } else {
        const requestStatus = await Camera.requestCameraPermission();
        setHasPermission(requestStatus === 'granted');
      }
    })();
  }, []);

  const device = Platform.OS !== 'web' && useCameraDevice ? useCameraDevice('back') : null;

  const codeScanner = Platform.OS !== 'web' && useCodeScanner ? useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'qr', 'code-128', 'upc-a', 'upc-e'],
    onCodeScanned: (codes) => {
      const now = Date.now();
      if (now - lastScanned < 2000) return; // Throttle 2s
      if (codes.length > 0 && codes[0].value) {
        setLastScanned(now);
        if (onScan) onScan(codes[0].value);
      }
    }
  }) : null;

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      contentContainerStyle={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'position' : 'height'}
    >
      <View style={styles.scannerRoot}>
        <Pressable style={styles.fakeCamera} onPress={Keyboard.dismiss}>
        {Platform.OS !== 'web' && hasPermission && device && Camera ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            codeScanner={codeScanner}
            torch={torch}
          />
        ) : null}

        <View style={styles.scanTopActions}>
          <RoundCameraButton icon="arrow-left" onPress={onBack} />
          <RoundCameraButton 
            icon={torch === 'on' ? "flash" : "flash-off"} 
            onPress={() => setTorch(t => t === 'on' ? 'off' : 'on')} 
          />
          <RoundCameraButton icon="keyboard-outline" onPress={onManual} />
        </View>
        
        <View style={styles.viewfinderWrap}>
          <View style={styles.viewfinder}>
            <View style={styles.scanLine} />
          </View>
          <Text style={styles.scanHint}>Đưa mã vạch vào khung scan</Text>
        </View>

        <Pressable style={styles.testScanButton} onPress={onMultiMatch}>
          <Text style={styles.testScanText}>Mô phỏng: Quét Maggi (nhiều KQ)</Text>
        </Pressable>
        </Pressable>
      <View style={styles.cartSheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sectionTitle}>Giỏ hàng ({cartCount} sp)</Text>
          <Text style={styles.priceLarge}>{money(cartTotal)}</Text>
        </View>
        <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
          {cart.length === 0 ? (
            <Text style={[styles.bodyMuted, { textAlign: 'center', marginVertical: spacing.md }]}>Giỏ hàng trống</Text>
          ) : (
            cart.map((item) => (
              <CartItem key={item._id || item.id} item={item} onQuantity={onQuantity} onPress={() => onProductDetail && onProductDetail(item)} />
            ))
          )}
        </ScrollView>
        <PrimaryButton 
          label="Hoàn tất đơn hàng" 
          icon="credit-card-check-outline" 
          onPress={onCheckout} 
          disabled={cart.length === 0}
        />
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ContributionScreen({ onBack, onSave, isAdmin }) {
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [supermarket, setSupermarket] = useState('Bách Hóa Xanh');
  const [imageUrl, setImageUrl] = useState('');

  const handleSave = () => {
    if (!barcode || !name || !price) {
      alert('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }
    onSave({ barcode, name, price: Number(price), supermarket, imageUrl });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header title="Đóng góp sản phẩm" leftIcon="arrow-left" onLeft={onBack} />
      <ScrollView contentContainerStyle={styles.contentWithNav} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <Text style={styles.bodyMuted}>
            Giúp cập nhật dữ liệu barcode. Cùng barcode nhưng giá có thể khác nhau tùy siêu thị.
          </Text>
          <Field icon="barcode" placeholder="Mã vạch" keyboardType="number-pad" value={barcode} onChangeText={setBarcode} />
          <Field icon="basket-outline" placeholder="Tên sản phẩm" value={name} onChangeText={setName} />
          <Field icon="cash" placeholder="Giá sản phẩm" keyboardType="number-pad" value={price} onChangeText={setPrice} />
          <Segmented options={['Bách Hóa Xanh', 'WinMart', 'GO!', 'Khác']} value={supermarket} onChange={setSupermarket} />
          <Field icon="image-outline" placeholder="Link ảnh sản phẩm (tùy chọn)" value={imageUrl} onChangeText={setImageUrl} />
          <PrimaryButton label="Gửi đóng góp" icon="cloud-upload-outline" onPress={handleSave} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderDetailScreen({ order, onBack, onProductDetail }) {
  if (!order) return null;
  return (
    <SafeAreaView style={styles.screen}>
      <Header title="Chi tiết đơn hàng" leftIcon="arrow-left" onLeft={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <Text style={styles.kicker}>Cửa hàng</Text>
          <Text style={styles.sectionTitle}>{order.supermarket}</Text>
          <View style={styles.metaGrid}>
            <Meta label="Mã đơn hàng" value={`#${order._id || order.id}`} />
            <Meta label="Ngày giao dịch" value={new Date(order.createdAt).toLocaleString('vi-VN')} />
          </View>
          <View style={styles.statusPill}>
            <View style={styles.led} />
            <Text style={styles.successText}>Hoàn tất</Text>
          </View>
        </View>

        <SectionHeader title="Danh sách sản phẩm" badge={`${order.items.length} mặt hàng`} />
        {order.items.map((item, idx) => (
          <OrderLine key={idx} item={item} onPress={onProductDetail} />
        ))}

        <View style={styles.totalPanel}>
          <Text style={styles.kicker}>Tổng tiền</Text>
          <Text style={styles.totalAmount}>{money(order.totalAmount)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AdminScreen({ onBack, token, onProductDetail }) {
  const [activeTab, setActiveTab] = useState('sync'); // 'sync' | 'config' | 'products'
  
  // Tab 1: Sync & Logs
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState(syncLogs);
  const [market, setMarket] = useState('GO!');

  const sourceMap = {
    'GO!': 'go',
    'BHX': 'bhx',
    'WinMart': 'winmart',
    'Tất cả': 'all'
  };

  const pollIntervalRef = useRef(null);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.getSyncStatus(token);
        if (res.success && res.data) {
          const session = res.data;
          
          if (session.status === 'running') {
            setSyncing(true);
            if (session.logs && session.logs.length > 0) {
              const reversedLogs = [...session.logs].reverse();
              setLogs(reversedLogs);
            }
          } else if (session.status === 'success' || session.status === 'failed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setSyncing(false);
            if (session.logs && session.logs.length > 0) {
              const reversedLogs = [...session.logs].reverse();
              setLogs(reversedLogs);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi thăm dò trạng thái đồng bộ:', err);
      }
    }, 1500); // Thăm dò mỗi 1.5 giây
  }, [token]);

  useEffect(() => {
    // Kiểm tra trạng thái cào chạy nền khi mới vào màn hình Admin
    const checkInitialStatus = async () => {
      try {
        const res = await api.getSyncStatus(token);
        if (res.success && res.data && res.data.status === 'running') {
          setSyncing(true);
          startPolling();
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra trạng thái đồng bộ ban đầu:', err);
      }
    };
    checkInitialStatus();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [token, startPolling]);

  const handleSync = async () => {
    setSyncing(true);
    const source = sourceMap[market] || 'all';
    setLogs([`[${new Date().toLocaleTimeString()}] Đang yêu cầu máy chủ khởi chạy tiến trình đồng bộ ${market}...`]);
    try {
      await api.syncProducts(source, token);
      // Khởi chạy vòng thăm dò log thời gian thực
      startPolling();
    } catch (err) {
      setLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Lỗi khởi chạy: ${err.message}`,
        ...prev
      ]);
      setSyncing(false);
    }
  };

  // Tab 2: Config
  const [configsList, setConfigsList] = useState([]);
  const [configMarket, setConfigMarket] = useState('GO!'); // 'GO!' | 'BHX' | 'WinMart'
  const [cookie, setCookie] = useState('');
  const [rawLogText, setRawLogText] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [sign, setSign] = useState('');
  const [xCsrfToken, setXCsrfToken] = useState('');
  const [xSignature, setXSignature] = useState('');
  const [apiclientid, setApiclientid] = useState('');
  const [storeId, setStoreId] = useState('');
  const [supermarketName, setSupermarketName] = useState('');
  
  // BHX fields
  const [authorization, setAuthorization] = useState('');
  const [deviceid, setDeviceid] = useState('');
  const [xapikey, setXapikey] = useState('');
  const [provinceId, setProvinceId] = useState('');

  // WinMart fields
  const [storeCode, setStoreCode] = useState('');
  const [storeGroupCode, setStoreGroupCode] = useState('');

  const [hasConfig, setHasConfig] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  const handleAutoRefreshConfig = async (market) => {
    setAutoRefreshing(true);
    try {
      let res;
      if (market === 'GO!') {
        res = await api.autoRefreshGoConfig(token);
      } else if (market === 'BHX') {
        res = await api.autoRefreshBhxConfig(token);
      } else if (market === 'WinMart') {
        res = await api.autoRefreshWinmartConfig(token);
      }

      if (res && res.success) {
        alert(`Tự động cập nhật Cookie & Cấu hình ${market} thành công!`);
        // Reload configs
        const confRes = await api.getScraperConfig(token);
        if (confRes.success && confRes.configs) {
          setConfigsList(confRes.configs);
          loadConfigForMarket(configMarket, confRes.configs);
        }
      } else {
        alert('Lỗi: ' + (res?.message || 'Không thể lấy cấu hình tự động.'));
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setAutoRefreshing(false);
    }
  };

  const loadConfigForMarket = (marketName, list = configsList) => {
    const dbName = marketName === 'GO!' ? 'sieuthi-go' : marketName === 'BHX' ? 'sieuthi-bhx' : 'sieuthi-winmart';
    const cfg = list.find(c => c.name === dbName);
    
    setCookie(cfg?.hasCookie ? 'COOKIE_ALREADY_SAVED' : '');
    setRawLogText('');
    setStoreId(cfg?.storeId ? String(cfg.storeId) : '');
    setSupermarketName(cfg?.supermarketName || '');
    
    // GO! fields
    setApiclientid(cfg?.headers?.apiclientid || '');
    setTokenInput(cfg?.headers?.token || '');
    setSign(cfg?.headers?.sign || '');
    setXCsrfToken(cfg?.headers?.xCsrfToken || '');
    setXSignature(cfg?.headers?.xSignature || '');
    
    // BHX fields
    setAuthorization(cfg?.headers?.authorization || '');
    setDeviceid(cfg?.headers?.deviceid || '');
    setXapikey(cfg?.headers?.xapikey || '');
    setProvinceId(cfg?.provinceId ? String(cfg.provinceId) : '');
    
    // WinMart fields
    setStoreCode(cfg?.storeCode || '');
    setStoreGroupCode(cfg?.storeGroupCode || '');
    
    setHasConfig(!!cfg?.hasCookie);
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await api.getScraperConfig(token);
        if (res.success && res.configs) {
          setConfigsList(res.configs);
          loadConfigForMarket(configMarket, res.configs);
        }
      } catch (err) {
        console.warn('Failed to load scraper configs:', err.message);
      }
    };
    if (token && activeTab === 'config') {
      fetchConfig();
    }
  }, [token, activeTab, configMarket]);

  const handleSaveConfig = async () => {
    try {
      const dbName = configMarket === 'GO!' ? 'sieuthi-go' : configMarket === 'BHX' ? 'sieuthi-bhx' : 'sieuthi-winmart';
      const payload = { name: dbName };
      
      if (rawLogText) {
        payload.rawLogText = rawLogText;
      }
      if (cookie && cookie !== 'COOKIE_ALREADY_SAVED') {
        payload.cookie = cookie;
      }
      if (storeId) payload.storeId = storeId;
      if (supermarketName) payload.supermarketName = supermarketName;

      if (configMarket === 'GO!') {
        if (tokenInput && !tokenInput.startsWith('***')) payload.token = tokenInput;
        if (sign && !sign.startsWith('***')) payload.sign = sign;
        if (xCsrfToken && !xCsrfToken.startsWith('***')) payload.xCsrfToken = xCsrfToken;
        if (xSignature && !xSignature.startsWith('***')) payload.xSignature = xSignature;
        if (apiclientid) payload.apiclientid = apiclientid;
      } else if (configMarket === 'BHX') {
        if (authorization && !authorization.startsWith('***')) payload.authorization = authorization;
        if (deviceid && !deviceid.startsWith('***')) payload.deviceid = deviceid;
        if (xapikey && !xapikey.startsWith('***')) payload.xapikey = xapikey;
        if (provinceId) payload.provinceId = provinceId;
      } else if (configMarket === 'WinMart') {
        if (storeCode) payload.storeCode = storeCode;
        if (storeGroupCode) payload.storeGroupCode = storeGroupCode;
      }

      await api.updateScraperConfig(payload, token);
      alert(`Cập nhật cấu hình ${configMarket} thành công!`);
      
      // Reload configs after saving
      const res = await api.getScraperConfig(token);
      if (res.success && res.configs) {
        setConfigsList(res.configs);
        loadConfigForMarket(configMarket, res.configs);
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  // Tab 3: Products explorer
  const [productsList, setProductsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editSupermarket, setEditSupermarket] = useState('');
  const [deletingProduct, setDeletingProduct] = useState(null);

  const loadProducts = async (searchVal = searchQuery) => {
    setLoadingProducts(true);
    try {
      const data = await api.getAllProducts(searchVal);
      setProductsList(data);
    } catch (err) {
      console.warn('Failed to load products list:', err.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'products') {
      if (!searchQuery) {
        loadProducts('');
      } else {
        const delayDebounceFn = setTimeout(() => {
          loadProducts(searchQuery);
        }, 400);
        return () => clearTimeout(delayDebounceFn);
      }
    }
  }, [searchQuery, activeTab]);

  const filteredProducts = Array.isArray(productsList) ? productsList : [];

  const handleUpdateProduct = async () => {
    if (!editName || !editPrice || !editSupermarket) {
      alert('Vui lòng điền đủ thông tin');
      return;
    }
    try {
      await api.updateProduct(editingProduct._id || editingProduct.id, {
        name: editName,
        price: Number(editPrice),
        supermarket: editSupermarket
      }, token);
      alert('Cập nhật sản phẩm thành công!');
      setEditingProduct(null);
      loadProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProduct = async () => {
    try {
      await api.deleteProduct(deletingProduct._id || deletingProduct.id, token);
      alert('Đã xóa sản phẩm!');
      setDeletingProduct(null);
      loadProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header title="Hệ thống quản trị" leftIcon="arrow-left" onLeft={onBack} />
      
      {/* Dynamic Navigation Tabs */}
      <View style={styles.adminTabs}>
        <Pressable 
          style={[styles.adminTabBtn, activeTab === 'sync' && styles.adminTabBtnActive]} 
          onPress={() => setActiveTab('sync')}
        >
          <MaterialCommunityIcons name="sync" size={18} color={activeTab === 'sync' ? '#ffffff' : colors.secondary} />
          <Text style={[styles.adminTabTxt, activeTab === 'sync' && styles.adminTabTxtActive]}>Đồng bộ</Text>
        </Pressable>
        <Pressable 
          style={[styles.adminTabBtn, activeTab === 'config' && styles.adminTabBtnActive]} 
          onPress={() => setActiveTab('config')}
        >
          <MaterialCommunityIcons name="cog-outline" size={18} color={activeTab === 'config' ? '#ffffff' : colors.secondary} />
          <Text style={[styles.adminTabTxt, activeTab === 'config' && styles.adminTabTxtActive]}>Cấu hình</Text>
        </Pressable>
        <Pressable 
          style={[styles.adminTabBtn, activeTab === 'products' && styles.adminTabBtnActive]} 
          onPress={() => setActiveTab('products')}
        >
          <MaterialCommunityIcons name="database-outline" size={18} color={activeTab === 'products' ? '#ffffff' : colors.secondary} />
          <Text style={[styles.adminTabTxt, activeTab === 'products' && styles.adminTabTxtActive]}>Sản phẩm</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentWithNav} showsVerticalScrollIndicator={false}>
        {activeTab === 'sync' && (
          <>
            <View style={styles.panel}>
              <View style={styles.rowCenter}>
                <MaterialCommunityIcons name="sync" size={22} color={colors.primary} />
                <Text style={styles.sectionTitle}>Đồng bộ dữ liệu</Text>
              </View>
              <Text style={styles.bodyMuted}>Đồng bộ và cào dữ liệu sản phẩm từ siêu thị GO!, Bách Hóa Xanh và WinMart.</Text>
              <Segmented options={['GO!', 'BHX', 'WinMart', 'Tất cả']} value={market} onChange={setMarket} />
              <PrimaryButton 
                label={syncing ? "Đang đồng bộ..." : "Đồng bộ sản phẩm"} 
                icon="cloud-download-outline" 
                onPress={handleSync} 
                disabled={syncing}
              />
            </View>

            <View style={styles.statGrid}>
              <Stat label="Nguồn cào" value="3" color={colors.primary} />
              <Stat label="Đang hoạt động" value="Đồng bộ" color={colors.success} />
              <Stat label="Cookie Scraper" value={hasConfig ? "Đã nạp" : "Trống"} color={hasConfig ? colors.success : colors.error} />
              <Stat label="Lịch sử nhật ký" value={String(logs.length)} color={colors.secondary} />
            </View>

            <View style={styles.console}>
              <View style={styles.sheetHeader}>
                <Text style={styles.kicker}>Nhật ký hệ thống</Text>
                <Pressable onPress={() => setLogs([])}>
                  <Text style={styles.codeTextLink}>CLEAR</Text>
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={true}>
                {logs.map((line, idx) => (
                  <Text
                    key={idx}
                    style={[
                      styles.consoleLine,
                      line.includes('Lỗi') && { color: colors.error },
                      line.includes('thành công') && { color: colors.success },
                      line.includes('Bắt đầu') && { color: colors.primary },
                    ]}
                  >
                    {line}
                  </Text>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {activeTab === 'config' && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Cấu hình Scraper {configMarket}</Text>
            <Text style={styles.bodyMuted}>Cập nhật Cookie và các tham số bảo mật của hệ thống cào dữ liệu.</Text>
            
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Segmented 
                options={['GO!', 'BHX', 'WinMart']} 
                value={configMarket} 
                onChange={(val) => {
                  setConfigMarket(val);
                  loadConfigForMarket(val);
                }} 
              />

              {configMarket === 'GO!' && (
                <View style={{ marginTop: spacing.xs, marginBottom: spacing.xs }}>
                  <PrimaryButton 
                    label={autoRefreshing ? "Đang lấy Token tự động..." : "Tự động lấy Cookie & Token GO! qua Chrome"} 
                    icon="chrome" 
                    onPress={() => handleAutoRefreshConfig('GO!')} 
                    disabled={autoRefreshing}
                  />
                  <Text style={[styles.bodyMuted, { fontSize: 12, marginTop: 4 }]}>
                    * Nhấn nút này để khởi chạy trình duyệt Chrome tự động thu thập Cookie/Tokens mới từ GO!.
                  </Text>
                </View>
              )}

              {configMarket === 'BHX' && (
                <View style={{ marginTop: spacing.xs, marginBottom: spacing.xs }}>
                  <PrimaryButton 
                    label={autoRefreshing ? "Đang lấy cấu hình tự động..." : "Tự động lấy Cookie & Token BHX qua Chrome"} 
                    icon="chrome" 
                    onPress={() => handleAutoRefreshConfig('BHX')} 
                    disabled={autoRefreshing}
                  />
                  <Text style={[styles.bodyMuted, { fontSize: 12, marginTop: 4 }]}>
                    * Nhấn nút này để khởi chạy trình duyệt Chrome tự động thu thập Cookie, Tokens & Store ID mới từ Bách Hóa Xanh.
                  </Text>
                </View>
              )}

              {configMarket === 'WinMart' && (
                <View style={{ marginTop: spacing.xs, marginBottom: spacing.xs }}>
                  <PrimaryButton 
                    label={autoRefreshing ? "Đang lấy cấu hình tự động..." : "Tự động lấy Cookie & Cấu hình WinMart qua Chrome"} 
                    icon="chrome" 
                    onPress={() => handleAutoRefreshConfig('WinMart')} 
                    disabled={autoRefreshing}
                  />
                  <Text style={[styles.bodyMuted, { fontSize: 12, marginTop: 4 }]}>
                    * Nhấn nút này để khởi chạy trình duyệt Chrome tự động thu thập Cookie & Store Code mới từ WinMart.
                  </Text>
                </View>
              )}

              <Text style={styles.bodyStrong}>Dán cURL / Headers từ DevTools (Tự động tách Cookie & Tokens)</Text>
              <Field 
                icon="text-box-search-outline" 
                placeholder="Dán toàn bộ Request Headers hoặc lệnh cURL vào đây..." 
                value={rawLogText} 
                onChangeText={setRawLogText}
                multiline={true}
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.xs }}
                containerStyle={{ alignItems: 'flex-start', paddingTop: spacing.xs }}
              />

              <Text style={styles.bodyStrong}>Cookie thủ công</Text>
              <Field 
                icon="cookie" 
                placeholder={cookie === 'COOKIE_ALREADY_SAVED' ? "Cookie đã được lưu (nhập cookie mới để cập nhật)..." : "Nhập cookie đầy đủ từ DevTools..."} 
                value={cookie === 'COOKIE_ALREADY_SAVED' ? '' : cookie} 
                onChangeText={setCookie} 
              />

              {/* Advanced Configuration Accordion Trigger */}
              <Pressable 
                style={({ pressed }) => [
                  styles.settingsRow, 
                  { paddingVertical: spacing.sm, marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.glassBorder },
                  pressed && styles.pressed
                ]} 
                onPress={() => setShowAdvancedConfig(!showAdvancedConfig)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <MaterialCommunityIcons 
                    name={showAdvancedConfig ? "chevron-down" : "chevron-right"} 
                    size={20} 
                    color={colors.primary} 
                  />
                  <Text style={styles.bodyStrong}>Cấu hình nâng cao ({configMarket})</Text>
                </View>
              </Pressable>

              {showAdvancedConfig && (
                <View style={{ gap: spacing.sm, paddingLeft: spacing.sm }}>
                  {configMarket === 'GO!' && (
                    <>
                      <Text style={styles.bodyStrong}>Store ID & Supermarket</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Field 
                            icon="storefront-outline" 
                            placeholder="Store ID (e.g. 123)" 
                            value={storeId} 
                            onChangeText={setStoreId} 
                          />
                        </View>
                        <View style={{ flex: 1.5 }}>
                          <Field 
                            icon="tag-outline" 
                            placeholder="Supermarket Name" 
                            value={supermarketName} 
                            onChangeText={setSupermarketName} 
                          />
                        </View>
                      </View>

                      <Text style={styles.bodyStrong}>Headers & Security tokens</Text>
                      <Field 
                        icon="lock-outline" 
                        placeholder="Header: token" 
                        value={tokenInput} 
                        onChangeText={setTokenInput} 
                      />
                      <Field 
                        icon="shield-key-outline" 
                        placeholder="Header: sign" 
                        value={sign} 
                        onChangeText={setSign} 
                      />
                      <Field 
                        icon="api" 
                        placeholder="Header: apiclientid" 
                        value={apiclientid} 
                        onChangeText={setApiclientid} 
                      />
                      <Field 
                        icon="form-textbox-password" 
                        placeholder="Header: x-csrf-token" 
                        value={xCsrfToken} 
                        onChangeText={setXCsrfToken} 
                      />
                      <Field 
                        icon="signature" 
                        placeholder="Header: x-signature" 
                        value={xSignature} 
                        onChangeText={setXSignature} 
                      />
                    </>
                  )}

                  {configMarket === 'BHX' && (
                    <>
                      <Text style={styles.bodyStrong}>Store ID & Province ID & Supermarket</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Field 
                            icon="storefront-outline" 
                            placeholder="Store ID (e.g. 2546)" 
                            value={storeId} 
                            onChangeText={setStoreId} 
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Field 
                            icon="map-marker-outline" 
                            placeholder="Province ID (e.g. 1027)" 
                            value={provinceId} 
                            onChangeText={setProvinceId} 
                          />
                        </View>
                      </View>
                      <Field 
                        icon="tag-outline" 
                        placeholder="Supermarket Name" 
                        value={supermarketName} 
                        onChangeText={setSupermarketName} 
                      />

                      <Text style={styles.bodyStrong}>Headers & Credentials</Text>
                      <Field 
                        icon="lock-outline" 
                        placeholder="Header: authorization" 
                        value={authorization} 
                        onChangeText={setAuthorization} 
                      />
                      <Field 
                        icon="cellphone" 
                        placeholder="Header: deviceid" 
                        value={deviceid} 
                        onChangeText={setDeviceid} 
                      />
                      <Field 
                        icon="api" 
                        placeholder="Header: xapikey" 
                        value={xapikey} 
                        onChangeText={setXapikey} 
                      />
                    </>
                  )}

                  {configMarket === 'WinMart' && (
                    <>
                      <Text style={styles.bodyStrong}>Store Code & Store Group Code & Supermarket</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Field 
                            icon="storefront-outline" 
                            placeholder="Store Code (e.g. 1535)" 
                            value={storeCode} 
                            onChangeText={setStoreCode} 
                          />
                        </View>
                        <View style={{ flex: 1.5 }}>
                          <Field 
                            icon="group" 
                            placeholder="Store Group Code (e.g. 1998)" 
                            value={storeGroupCode} 
                            onChangeText={setStoreGroupCode} 
                          />
                        </View>
                      </View>
                      <Field 
                        icon="tag-outline" 
                        placeholder="Supermarket Name" 
                        value={supermarketName} 
                        onChangeText={setSupermarketName} 
                      />
                    </>
                  )}
                </View>
              )}

              <PrimaryButton 
                label={`Lưu cấu hình ${configMarket}`} 
                icon="check" 
                onPress={handleSaveConfig} 
              />
            </View>
          </View>
        )}

        {activeTab === 'products' && (
          <>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Cơ sở dữ liệu sản phẩm</Text>
              <Text style={styles.bodyMuted}>Tìm kiếm, chỉnh sửa thông tin hoặc xóa sản phẩm khỏi cơ sở dữ liệu.</Text>
              <Field 
                icon="magnify" 
                placeholder="Tìm kiếm sản phẩm (tên, mã vạch, siêu thị)..." 
                value={searchQuery} 
                onChangeText={setSearchQuery} 
              />
            </View>

            {loadingProducts ? (
              <SafeActivityIndicator size="large" color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : filteredProducts.length === 0 ? (
              <Text style={[styles.bodyMuted, { textAlign: 'center', marginVertical: spacing.xl }]}>Không tìm thấy sản phẩm nào.</Text>
            ) : (
              filteredProducts.map((p) => (
                <View key={p._id || p.id} style={styles.adminProductCard}>
                  <Pressable 
                    style={({ pressed }) => [styles.adminProductInfo, pressed && styles.pressed]} 
                    onPress={() => onProductDetail && onProductDetail(p)}
                  >
                    <Text style={styles.bodyStrong} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.codeText}>{p.barcode} · <Text style={{ color: colors.primary, fontWeight: '500' }}>{p.supermarket}</Text></Text>
                    <Text style={styles.priceText}>{money(p.price)}</Text>
                  </Pressable>
                  <View style={styles.adminProductActions}>
                    <Pressable 
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]} 
                      onPress={() => {
                        setEditingProduct(p);
                        setEditName(p.name);
                        setEditPrice(String(p.price));
                        setEditSupermarket(p.supermarket);
                      }}
                    >
                      <MaterialCommunityIcons name="pencil" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable 
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]} 
                      onPress={() => setDeletingProduct(p)}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Edit Product Modal */}
      <Modal visible={!!editingProduct} transparent animationType="fade" onRequestClose={() => setEditingProduct(null)}>
        <View style={styles.modalCenterContainer}>
          <View style={styles.confirmModalSheet}>
            <Text style={styles.sectionTitle}>Sửa thông tin sản phẩm</Text>
            <View style={{ gap: spacing.sm, marginVertical: spacing.sm }}>
              <Text style={styles.kicker}>Tên sản phẩm</Text>
              <Field icon="basket-outline" value={editName} onChangeText={setEditName} />
              
              <Text style={styles.kicker}>Giá sản phẩm</Text>
              <Field icon="cash" value={editPrice} onChangeText={setEditPrice} keyboardType="number-pad" />
              
              <Text style={styles.kicker}>Siêu thị</Text>
              <Segmented options={['Bách Hóa Xanh', 'WinMart', 'GO!', 'Khác']} value={editSupermarket} onChange={setEditSupermarket} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable 
                style={({ pressed }) => [styles.secondaryButton, { flex: 1, marginTop: 0 }, pressed && styles.pressed]} 
                onPress={() => setEditingProduct(null)}
              >
                <Text style={styles.secondaryButtonText}>Hủy</Text>
              </Pressable>
              <Pressable 
                style={({ pressed }) => [styles.primaryButton, { flex: 1, marginTop: 0 }, pressed && styles.pressed]} 
                onPress={handleUpdateProduct}
              >
                <Text style={styles.primaryButtonText}>Lưu lại</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Product Confirmation Modal */}
      <Modal visible={!!deletingProduct} transparent animationType="fade" onRequestClose={() => setDeletingProduct(null)}>
        <View style={styles.modalCenterContainer}>
          <View style={styles.confirmModalSheet}>
            <View style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <MaterialCommunityIcons name="trash-can-outline" size={28} color="#EF4444" />
              </View>
              <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Xóa sản phẩm?</Text>
              <Text style={[styles.bodyMuted, { textAlign: 'center' }]}>
                Bạn có chắc chắn muốn xóa sản phẩm "{deletingProduct?.name}" khỏi cơ sở dữ liệu?
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable 
                style={({ pressed }) => [styles.secondaryButton, { flex: 1, marginTop: 0 }, pressed && styles.pressed]} 
                onPress={() => setDeletingProduct(null)}
              >
                <Text style={styles.secondaryButtonText}>Hủy</Text>
              </Pressable>
              <Pressable 
                style={({ pressed }) => [
                  styles.primaryButton, 
                  { flex: 1, marginTop: 0, backgroundColor: '#EF4444', borderColor: 'rgba(255, 255, 255, 0.1)' }, 
                  pressed && styles.pressed
                ]} 
                onPress={handleDeleteProduct}
              >
                <Text style={styles.primaryButtonText}>Xóa vĩnh viễn</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProductPickerModal({ visible, barcode, products, onClose, onPick }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.kicker}>Quét mã: {barcode}</Text>
          <Text style={styles.sectionTitle}>Tìm thấy nhiều kết quả</Text>
          <Text style={styles.bodyMuted}>Vui lòng chọn siêu thị tương ứng:</Text>
          <ScrollView style={{ maxHeight: 220, marginVertical: spacing.sm }}>
            {products.map((product) => (
              <Pressable key={product._id || product.id} style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]} onPress={() => onPick(product)}>
                <ProductMark imageUrl={product.imageUrl} />
                <View style={styles.flex}>
                  <Text style={styles.bodyStrong}>{product.name}</Text>
                  <Text style={styles.codeText}>{product.supermarket}</Text>
                </View>
                <Text style={styles.priceText}>{money(product.price)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <PrimaryButton label="Đóng" icon="close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function ProductDetailModal({ visible, product, onClose }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [product]);

  if (!product) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { padding: spacing.lg, maxHeight: '90%' }]}>
          {/* Close button top-right */}
          <Pressable style={styles.modalCloseBtn} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
          </Pressable>

          {/* Product Image Area */}
          <View style={styles.detailImageContainer}>
            {product.imageUrl && !hasError ? (
              <Image
                source={{ uri: product.imageUrl }}
                style={styles.detailImage}
                onError={() => setHasError(true)}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.detailImageFallback}>
                <MaterialCommunityIcons name="cube-outline" size={56} color={colors.primary} />
                <Text style={styles.bodyMuted}>Không có ảnh sản phẩm</Text>
              </View>
            )}
          </View>

          {/* Supermarket Tag */}
          <View style={styles.detailTagRow}>
            <View style={[
              styles.supermarketTag, 
              product.supermarket === 'WinMart' && { backgroundColor: '#e51f2b20' },
              product.supermarket === 'Bách Hóa Xanh' && { backgroundColor: '#008b4520' },
              product.supermarket === 'GO!' && { backgroundColor: '#e3061320' },
            ]}>
              <Text style={[
                styles.supermarketTagText,
                product.supermarket === 'WinMart' && { color: '#e51f2b' },
                product.supermarket === 'Bách Hóa Xanh' && { color: '#008b45' },
                product.supermarket === 'GO!' && { color: '#e30613' },
              ]}>
                {product.supermarket || 'Khác'}
              </Text>
            </View>
          </View>

          {/* Product Info */}
          <View style={{ gap: spacing.xs }}>
            <Text style={[styles.sectionTitle, { fontSize: 18 }]} numberOfLines={2}>
              {product.name}
            </Text>

            <Text style={styles.detailBarcode}>
              Mã vạch: <Text style={{ color: colors.onSurface, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{product.barcode}</Text>
            </Text>

            {product.category && (
              <Text style={styles.detailBarcode}>
                Danh mục: <Text style={{ color: colors.onSurface }}>{product.category}</Text>
              </Text>
            )}
          </View>

          {/* Divider */}
          <View style={styles.detailDivider} />

          {/* Price Section */}
          <View style={styles.detailPriceRow}>
            <Text style={styles.bodyMuted}>Giá niêm yết</Text>
            <Text style={styles.detailPriceText}>{money(product.price)}</Text>
          </View>

          {/* Footer Action */}
          <PrimaryButton label="Đóng" icon="check" onPress={onClose} style={{ marginTop: spacing.xs }} />
        </View>
      </View>
    </Modal>
  );
}

function ManualEntryModal({ visible, barcode, onClose, onSave }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [supermarket, setSupermarket] = useState('Bách Hóa Xanh');

  const handleSave = () => {
    if (!name || !price) {
      alert('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    onSave({
      barcode,
      name,
      price: Number(price),
      supermarket,
    });
    setName('');
    setPrice('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.sectionTitle}>Nhập thủ công</Text>
          <Text style={styles.bodyMuted}>
            Mã vạch này chưa có trong hệ thống. Vui lòng thêm thông tin sản phẩm mới.
          </Text>
          <Field icon="barcode" value={barcode} editable={false} />
          <Field icon="basket-outline" placeholder="Nhập tên sản phẩm..." value={name} onChangeText={setName} />
          <Field icon="cash" placeholder="0" keyboardType="number-pad" value={price} onChangeText={setPrice} />
          <Segmented options={['Bách Hóa Xanh', 'WinMart', 'GO!', 'Khác']} value={supermarket} onChange={setSupermarket} />
          <PrimaryButton
            label="Thêm vào giỏ hàng"
            icon="plus-circle-outline"
            onPress={handleSave}
          />
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Bỏ qua</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ProfileScreen({ user, onLogout, onNavigate, isDark, onToggleTheme }) {
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  return (
    <AppScaffold active="profile" isAdmin={user && user.role === 'admin'} onNavigate={onNavigate}>
      <Header title="Trang cá nhân" />
      <ScrollView contentContainerStyle={styles.contentWithNav} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{user?.name ? user.name.slice(0, 1).toUpperCase() : 'U'}</Text>
          </View>
          <Text style={styles.profileName}>{user?.name || 'Tài khoản'}</Text>
          <Text style={styles.profileEmail}>{user?.email || 'email@example.com'}</Text>
          <View style={[
            styles.roleBadge, 
            user?.role === 'admin' ? styles.roleAdmin : styles.roleUser
          ]}>
            <Text style={styles.roleText}>{user?.role === 'admin' ? 'Admin' : 'User'}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.kicker}>Cài đặt & Thông tin</Text>
          
          <Pressable style={styles.settingsRow}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.primary} />
              <Text style={styles.bodyStrong}>Bảo mật tài khoản</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.secondary} />
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.settingsRow}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="theme-light-dark" size={20} color={colors.primary} />
              <Text style={styles.bodyStrong}>Giao diện tối (Dark Mode)</Text>
            </View>
            <Switch 
              value={isDark} 
              onValueChange={onToggleTheme}
              trackColor={{ false: '#94A3B8', true: colors.primaryContainer }}
              thumbColor={isDark ? colors.primary : '#F1F5F9'}
            />
          </View>

          <View style={styles.divider} />

          <Pressable style={styles.settingsRow}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="translate" size={20} color={colors.primary} />
              <Text style={styles.bodyStrong}>Ngôn ngữ</Text>
            </View>
            <Text style={styles.bodyMuted}>Tiếng Việt</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.settingsRow}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
              <Text style={styles.bodyStrong}>Phiên bản ứng dụng</Text>
            </View>
            <Text style={styles.bodyMuted}>v1.0.0</Text>
          </Pressable>
        </View>

        <Pressable 
          style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]} 
          onPress={() => setLogoutConfirmVisible(true)}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text style={styles.logoutButtonText}>Đăng xuất tài khoản</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={logoutConfirmVisible} transparent animationType="fade" onRequestClose={() => setLogoutConfirmVisible(false)}>
        <View style={styles.modalCenterContainer}>
          <View style={styles.confirmModalSheet}>
            <View style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <MaterialCommunityIcons name="logout" size={28} color="#EF4444" />
              </View>
              <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Đăng xuất?</Text>
              <Text style={[styles.bodyMuted, { textAlign: 'center' }]}>Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable 
                style={({ pressed }) => [
                  styles.secondaryButton, 
                  { flex: 1, marginTop: 0 }, 
                  pressed && styles.pressed
                ]} 
                onPress={() => setLogoutConfirmVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>Hủy</Text>
              </Pressable>
              
              <Pressable 
                style={({ pressed }) => [
                  styles.primaryButton, 
                  { flex: 1, marginTop: 0, backgroundColor: '#EF4444', borderColor: 'rgba(255, 255, 255, 0.1)' }, 
                  pressed && styles.pressed
                ]} 
                onPress={() => {
                  setLogoutConfirmVisible(false);
                  onLogout();
                }}
              >
                <Text style={styles.primaryButtonText}>Đăng xuất</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScaffold>
  );
}

function AppScaffold({ children, active, isAdmin, onNavigate }) {
  return (
    <SafeAreaView style={styles.screen}>
      {children}
      <BottomNav active={active} isAdmin={isAdmin} onNavigate={onNavigate} />
    </SafeAreaView>
  );
}

function BottomNav({ active, isAdmin, onNavigate }) {
  return (
    <View style={styles.bottomNav}>
      <Pressable 
        style={({ pressed }) => [
          styles.navItem, 
          active === 'home' && styles.navItemActive,
          pressed && styles.pressed
        ]} 
        onPress={() => onNavigate('home')}
      >
        <MaterialCommunityIcons 
          name={active === 'home' ? "home" : "home-outline"} 
          size={22} 
          color={active === 'home' ? (colors.background === '#090D16' ? '#ffffff' : colors.primary) : colors.secondary} 
        />
        <Text style={[styles.navText, active === 'home' && { color: colors.background === '#090D16' ? '#ffffff' : colors.primary, fontWeight: '600' }]}>Trang chủ</Text>
      </Pressable>

      <Pressable 
        style={({ pressed }) => [
          styles.centerScanButton,
          pressed && styles.pressed
        ]} 
        onPress={() => onNavigate('scanner')}
      >
        <MaterialCommunityIcons name="barcode-scan" size={26} color="#ffffff" />
      </Pressable>

      <Pressable 
        style={({ pressed }) => [
          styles.navItem, 
          active === 'profile' && styles.navItemActive,
          pressed && styles.pressed
        ]} 
        onPress={() => onNavigate('profile')}
      >
        <MaterialCommunityIcons 
          name={active === 'profile' ? "account" : "account-outline"} 
          size={22} 
          color={active === 'profile' ? (colors.background === '#090D16' ? '#ffffff' : colors.primary) : colors.secondary} 
        />
        <Text style={[styles.navText, active === 'profile' && { color: colors.background === '#090D16' ? '#ffffff' : colors.primary, fontWeight: '600' }]}>Cá nhân</Text>
      </Pressable>
    </View>
  );
}

function Header({ title, leftIcon, rightIcon, onLeft, onRight }) {
  return (
    <View style={[styles.header, styles.headerShadow]}>
      <View style={styles.headerSide}>
        {leftIcon && <IconButton icon={leftIcon} onPress={onLeft} />}
      </View>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.headerSide}>
        {rightIcon && <IconButton icon={rightIcon} onPress={onRight} />}
      </View>
    </View>
  );
}

function Field(props) {
  const { icon, containerStyle, style, ...inputProps } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={[
      styles.field, 
      styles.sunken, 
      focused && { borderColor: colors.primary },
      containerStyle
    ]}>
      <MaterialCommunityIcons 
        name={icon} 
        size={20} 
        color={focused ? colors.primary : colors.secondary} 
        style={containerStyle?.alignItems === 'flex-start' && { marginTop: 12 }}
      />
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={[styles.input, style]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...inputProps}
      />
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, disabled }) {
  return (
    <Pressable 
      style={({ pressed }) => [
        styles.primaryButton, 
        pressed && styles.pressed,
        disabled && { opacity: 0.5 }
      ]} 
      onPress={disabled ? null : onPress}
    >
      {icon && <MaterialCommunityIcons name={icon} size={18} color="#ffffff" />}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ icon, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}

function RoundCameraButton({ icon, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={20} color="#ffffff" />
    </Pressable>
  );
}

// Keep the rest of helper components ...
function ActionTile({ icon, title, label, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.tileTop}>
        <View style={styles.tileIcon}>
          <MaterialCommunityIcons name={icon} size={26} color={colors.primary} />
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.secondary} />
      </View>
      <View>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

function SectionHeader({ title, icon, badge }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {badge ? (
        <Text style={styles.badge}>{badge}</Text>
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
      ) : null}
    </View>
  );
}

function OrderCard({ order, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.storeIcon}>
        <MaterialCommunityIcons name="storefront-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.bodyStrong} numberOfLines={1}>{order.supermarket}</Text>
        <Text style={styles.codeText}>{new Date(order.createdAt).toLocaleDateString('vi-VN')} · {order.items.length} mặt hàng</Text>
      </View>
      <View style={styles.alignEnd}>
        <Text style={styles.priceText}>{money(order.totalAmount)}</Text>
        <Text style={[styles.statusSmall, order.status === 'pending' && { color: colors.tertiary }]}>
          {order.status === 'completed' ? 'Thành công' : 'Đang xử lý'}
        </Text>
      </View>
    </Pressable>
  );
}

function CartItem({ item, onQuantity, onPress }) {
  const [localQty, setLocalQty] = useState(String(item.quantity));

  useEffect(() => {
    setLocalQty(String(item.quantity));
  }, [item.quantity]);

  const handleChangeText = (text) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setLocalQty(cleaned);
  };

  const handleBlur = () => {
    const parsed = parseInt(localQty, 10);
    if (isNaN(parsed) || parsed <= 0) {
      onQuantity(item._id || item.id, 0, true);
    } else {
      onQuantity(item._id || item.id, parsed, true);
    }
  };

  return (
    <View style={styles.cartItem}>
      <Pressable 
        style={({ pressed }) => [styles.cartItemContent, pressed && styles.pressed]} 
        onPress={onPress}
      >
        <ProductMark imageUrl={item.imageUrl} />
        <View style={styles.flex}>
          <Text style={styles.kicker}>SKU: {item.barcode ? item.barcode.slice(-6) : 'N/A'}</Text>
          <Text style={styles.bodyStrong} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.priceText}>{money(item.price)}</Text>
        </View>
      </Pressable>
      <View style={styles.stepper}>
        <Pressable style={styles.stepperBtn} onPress={() => onQuantity(item._id || item.id, -1)}>
          <MaterialCommunityIcons name="minus" size={14} color={colors.onSurface} />
        </Pressable>
        <TextInput
          style={styles.stepperInput}
          value={localQty}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          onSubmitEditing={handleBlur}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholderTextColor={colors.placeholder}
        />
        <Pressable style={styles.stepperBtn} onPress={() => onQuantity(item._id || item.id, 1)}>
          <MaterialCommunityIcons name="plus" size={14} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

function OrderLine({ item, onPress }) {
  const pName = item.product ? item.product.name : 'Sản phẩm';
  const pBarcode = item.product ? item.product.barcode : '';
  const pPrice = item.product ? item.product.price : 0;
  const pImageUrl = item.product ? item.product.imageUrl : '';
  return (
    <Pressable 
      style={({ pressed }) => [styles.cartItem, pressed && item.product && styles.pressed]} 
      onPress={() => item.product && onPress && onPress(item.product)}
      disabled={!item.product}
    >
      <ProductMark imageUrl={pImageUrl} />
      <View style={styles.flex}>
        <Text style={styles.bodyStrong} numberOfLines={1}>{pName}</Text>
        <Text style={styles.codeText}>{pBarcode}</Text>
      </View>
      <View style={styles.alignEnd}>
        <Text style={styles.priceText}>{money(pPrice * item.quantity)}</Text>
        <Text style={styles.codeText}>x{item.quantity} @ {money(pPrice)}</Text>
      </View>
    </Pressable>
  );
}

function ProductMark({ imageUrl }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  return (
    <View style={styles.productMark}>
      {imageUrl && !hasError ? (
        <Image 
          source={{ uri: imageUrl }} 
          style={{ width: '100%', height: '100%', borderRadius: radius.base }}
          onError={() => setHasError(true)}
          resizeMode="cover"
        />
      ) : (
        <MaterialCommunityIcons name="cube-outline" size={22} color={colors.primary} />
      )}
    </View>
  );
}

function Segmented({ options, value, onChange }) {
  const [active, setActive] = useState(value || options[0]);
  
  const handlePress = (opt) => {
    setActive(opt);
    if (onChange) onChange(opt);
  };

  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const isSelected = (value !== undefined ? value === option : active === option);
        return (
          <Pressable
            key={option}
            style={[styles.segment, isSelected && styles.segmentActive]}
            onPress={() => handlePress(option)}
          >
            <Text style={[styles.segmentText, isSelected && { color: '#ffffff', fontWeight: '600' }]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Meta({ label, value }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.kicker}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.kicker, { color }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: colors.background, // Deep Slate background
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  // Background decorative glow orbs (subtle, non-neon)
  glowOrb1: {
    position: 'absolute',
    top: -150,
    left: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: colors.primary,
    opacity: 0.08,
    ...Platform.select({
      web: { filter: 'blur(100px)' },
    }),
    zIndex: 0,
  },
  glowOrb2: {
    position: 'absolute',
    bottom: -150,
    right: -150,
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: '#6366F1', // Premium Indigo
    opacity: 0.06,
    ...Platform.select({
      web: { filter: 'blur(120px)' },
    }),
    zIndex: 0,
  },
  glowOrb3: {
    position: 'absolute',
    top: '30%',
    left: '25%',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#38BDF8', // Premium Sky Accent
    opacity: 0.04,
    ...Platform.select({
      web: { filter: 'blur(90px)' },
    }),
    zIndex: 0,
  },
  perspectiveWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    padding: Platform.OS === 'web' ? spacing.xl : 0,
  },
  mainGlassPanel: {
    width: '100%',
    height: '100%',
    ...Platform.select({
      web: {
        maxWidth: 440,
        maxHeight: 880,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glassPanelBg, // Dynamic Slate/White transparent
        backdropFilter: 'blur(20px) saturate(1.2)',
        boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        transformStyle: 'preserve-3d',
      },
      default: {
        backgroundColor: colors.background,
      }
    }),
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  contentWithNav: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 120, // space for floating bottom nav
  },
  flex: { flex: 1 },
  alignEnd: { alignItems: 'flex-end' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  headerShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  authWrap: {
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.base,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.2)',
    borderWidth: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
      }
    })
  },
  appTitle: {
    ...type.headline,
    color: colors.onSurface,
    textAlign: 'center',
  },
  kicker: {
    ...type.label,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...type.title,
    color: colors.onSurface,
  },
  bodyStrong: {
    ...type.body,
    color: colors.onSurface,
    fontWeight: '600',
  },
  bodyMuted: {
    ...type.body,
    color: colors.secondary,
  },
  codeText: {
    ...type.code,
    color: colors.secondary,
  },
  codeTextLink: {
    ...type.code,
    color: colors.primary,
    fontWeight: '600',
  },
  linkText: {
    ...type.body,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  panel: {
    borderRadius: radius.base,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
      }
    })
  },
  field: {
    minHeight: 50,
    borderRadius: radius.base,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sunken: {
    backgroundColor: colors.surfaceDim,
    borderColor: colors.glassBorder,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 48,
    ...type.body,
    color: colors.onSurface,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      }
    })
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.base,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
      }
    })
  },
  primaryButtonText: {
    ...type.body,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassBg,
    marginTop: spacing.xs,
  },
  secondaryButtonText: {
    ...type.body,
    color: colors.secondary,
    fontWeight: '600',
  },
  configChip: {
    minHeight: 38,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
  },
  header: {
    minHeight: 60,
    backgroundColor: colors.background === '#090D16' ? 'rgba(6, 11, 24, 0.8)' : 'rgba(255, 255, 255, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
      }
    })
  },
  headerSide: {
    width: 40,
    alignItems: 'center',
  },
  headerTitle: {
    ...type.title,
    flex: 1,
    textAlign: 'center',
    color: colors.onSurface,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.default,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionTile: {
    flex: 1,
    minHeight: 170,
    borderRadius: radius.base,
    padding: spacing.md,
    justifyContent: 'space-between',
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
      }
    })
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
  },
  tileTitle: {
    ...type.title,
    fontSize: 16,
    color: colors.onSurface,
    marginTop: spacing.md,
  },
  tileLabel: {
    ...type.label,
    fontSize: 10,
    color: colors.secondary,
    marginTop: 2,
    textTransform: 'none',
  },
  adminBanner: {
    borderRadius: radius.base,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
      }
    })
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  badge: {
    ...type.label,
    color: '#ffffff',
    backgroundColor: colors.primary,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  orderCard: {
    borderRadius: radius.base,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  storeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
  },
  priceText: {
    ...type.code,
    color: colors.primaryContainer,
  },
  priceLarge: {
    ...type.title,
    color: colors.primary,
    fontWeight: '700',
  },
  statusSmall: {
    ...type.label,
    fontSize: 10,
    color: colors.success,
  },
  bottomNav: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    height: 64,
    backgroundColor: colors.glassPanelBg, // Dynamic surface translucent
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderRadius: 32,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
      }
    })
  },
  navItem: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  navItemActive: {
    backgroundColor: colors.glassBgActive,
    borderColor: colors.glassBorder,
    borderWidth: 1,
  },
  navText: {
    ...type.label,
    fontSize: 9,
    color: colors.secondary,
    marginTop: 2,
    textTransform: 'none',
  },
  scannerRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fakeCamera: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: '54%',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.background,
  },
  scanTopActions: {
    position: 'absolute',
    top: 24,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  cameraButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      }
    })
  },
  viewfinderWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  viewfinder: {
    width: 220,
    height: 220,
    borderRadius: radius.base,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'rgba(9, 13, 22, 0.5)',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }
    })
  },
  scanLine: {
    height: 2,
    backgroundColor: colors.success,
    width: '100%',
  },
  scanHint: {
    color: '#94a3b8',
    ...type.body,
    fontWeight: '500',
    textAlign: 'center',
  },
  testScanButton: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      }
    })
  },
  testScanText: {
    color: '#ffffff',
    ...type.code,
  },
  cartSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '52%',
    backgroundColor: colors.glassPanelBg,
    borderTopLeftRadius: radius.base,
    borderTopRightRadius: radius.base,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    padding: spacing.md,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
      }
    })
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cartList: {
    maxHeight: 220,
    marginVertical: spacing.md,
  },
  cartItem: {
    borderRadius: radius.base,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  productMark: {
    width: 44,
    height: 44,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
  },
  stepper: {
    width: 90,
    minHeight: 32,
    borderRadius: radius.full,
    backgroundColor: colors.glassBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  stepperBtn: {
    padding: 6,
  },
  stepperText: {
    ...type.code,
    color: colors.onSurface,
  },
  stepperInput: {
    ...type.code,
    color: colors.onSurface,
    textAlign: 'center',
    minWidth: 32,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      }
    })
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.background === '#090D16' ? 'rgba(3, 7, 18, 0.6)' : 'rgba(15, 23, 42, 0.4)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      }
    })
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderTopLeftRadius: radius.base,
    borderTopRightRadius: radius.base,
    padding: spacing.md,
    gap: spacing.md,
    maxHeight: '86%',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
      }
    })
  },
  modalCloseBtn: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    zIndex: 10,
    padding: spacing.xs,
  },
  detailImageContainer: {
    width: '100%',
    height: 180,
    backgroundColor: colors.glassBg,
    borderRadius: radius.base,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginTop: spacing.md,
  },
  detailImage: {
    width: '100%',
    height: '100%',
  },
  detailImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  detailTagRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  supermarketTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  supermarketTagText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  detailBarcode: {
    fontSize: 12,
    color: colors.onSurfaceMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: spacing.xxs,
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.glassBorder,
    marginVertical: spacing.sm,
  },
  detailPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  detailPriceText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
  },
  cartItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  choiceCard: {
    borderRadius: radius.base,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  segmentActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderColor: colors.primary,
  },
  segmentText: {
    ...type.code,
    color: colors.secondary,
  },
  metaGrid: {
    gap: spacing.sm,
  },
  metaItem: {
    gap: spacing.xs,
  },
  metaValue: {
    ...type.code,
    color: colors.onSurface,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 153, 102, 0.15)',
    borderColor: 'rgba(0, 153, 102, 0.25)',
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  led: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
  successText: {
    ...type.label,
    color: colors.success,
  },
  totalPanel: {
    borderRadius: radius.base,
    padding: spacing.md,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  totalAmount: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    color: '#ffffff',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '47.5%',
    borderRadius: radius.base,
    padding: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  statValue: {
    ...type.title,
    marginTop: spacing.xs,
  },
  console: {
    borderRadius: radius.base,
    padding: spacing.md,
    backgroundColor: '#030712',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    gap: spacing.xs,
  },
  consoleLine: {
    ...type.code,
    color: '#d8e3f7',
  },
  profileCard: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.base,
    backgroundColor: colors.glassBg,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
  },
  profileName: {
    ...type.title,
    fontSize: 22,
    color: colors.onSurface,
    fontWeight: '700',
  },
  profileEmail: {
    ...type.body,
    color: colors.secondary,
  },
  roleBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  roleAdmin: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderColor: colors.primary,
  },
  roleUser: {
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
    borderColor: '#9CA3AF',
  },
  roleText: {
    ...type.label,
    fontSize: 11,
    color: colors.onSurface,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.glassBorder,
  },
  logoutButton: {
    minHeight: 52,
    borderRadius: radius.base,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  logoutButtonText: {
    ...type.body,
    color: '#EF4444',
    fontWeight: '600',
  },
  centerScanButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#10B981', // Emerald green
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24, // Protrude upwards
    borderWidth: 4,
    borderColor: colors.background, // Match app background
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
      },
      default: {
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
      }
    })
  },
  modalCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background === '#090D16' ? 'rgba(3, 7, 18, 0.6)' : 'rgba(15, 23, 42, 0.4)',
    padding: spacing.lg,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      }
    })
  },
  confirmModalSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderRadius: radius.base,
    padding: spacing.lg,
    gap: spacing.md,
    width: '90%',
    maxWidth: 340,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
      }
    })
  },
  adminTabs: {
    flexDirection: 'row',
    backgroundColor: colors.background === '#090D16' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
    borderRadius: radius.base,
    padding: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  adminTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  adminTabBtnActive: {
    backgroundColor: colors.primary,
  },
  adminTabTxt: {
    ...type.body,
    fontSize: 13,
    color: colors.secondary,
  },
  adminTabTxtActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  adminProductCard: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderRadius: radius.base,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  adminProductInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  adminProductActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background === '#090D16' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
  },
});

let styles = createStyles(colors);
