// Design Read: Reading this as: Personal POS utility mobile web app for design-conscious retail customers, with a clean B2B/consumer utility visual language, leaning toward a refined dark-mode Slate + Blue theme with high-end typography and restrained spring-physics motion, adhering strictly to the `design-taste-frontend` guidelines.
// DESIGN_VARIANCE: 5
// MOTION_INTENSITY: 4
// VISUAL_DENSITY: 5

import { useMemo, useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from './theme';
import { matchingProducts, orders as orderSeed, products as productSeed, syncLogs } from './mockData';
import * as api from './api';
// Conditional load of expo-secure-store to avoid crash when native module is missing
let SecureStore = null;
try {
  SecureStore = require('expo-secure-store');
} catch (e) {
  console.warn('SecureStore module load error:', e);
}

// Safe wrapper for SecureStore with in-memory fallback to prevent native crashes
const globalMemoryStorage = {};
const secureStorage = {
  getItem: async (key) => {
    try {
      if (Platform.OS !== 'web' && SecureStore && typeof SecureStore.getItemAsync === 'function') {
        return await SecureStore.getItemAsync(key);
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
    } catch (e) {
      console.warn('SecureStore.deleteItemAsync failed, using memory fallback:', e.message);
    }
    delete globalMemoryStorage[key];
  }
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
  const [apiIp, setApiIpState] = useState('192.168.1.163'); // Automatically binds to host on web

  // 3D perspective state for Web
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

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
  }, [apiIp]);

  const handleIpChange = (newIp) => {
    api.setApiIp(newIp);
    setApiIpState(newIp);
  };

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
        quantity: item.quantity
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
            apiIp={apiIp}
            onIpChange={handleIpChange}
            onDone={handleAuth} 
          />
        );
      case 'home':
        return (
          <HomeScreen
            userName={user ? user.name : 'Nguyễn Văn A'}
            isAdmin={user && user.role === 'admin'}
            orders={orders}
            onLogout={async () => {
              try {
                await secureStorage.deleteItem('userToken');
                await secureStorage.deleteItem('userInfo');
              } catch (e) {}
              setToken(null);
              setUser(null);
              setCart([]);
              setOrders([]);
              navigate('auth');
            }}
            onScan={() => navigate('scanner')}
            onContribute={() => navigate('contribute')}
            onAdmin={() => navigate('admin')}
            onOrder={(order) => {
              setActiveOrder(order);
              navigate('order');
            }}
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
        return <OrderDetailScreen order={activeOrder} onBack={() => navigate('home')} />;
      case 'admin':
        return <AdminScreen onBack={() => navigate('home')} token={token} />;// admin case has implicit admin access
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
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
      </View>
    </SafeAreaProvider>
  );
}

function AuthScreen({ mode, setMode, apiIp, onIpChange, onDone }) {
  const isLogin = mode === 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('example@retail.com');
  const [password, setPassword] = useState('123456');
  const [showConfig, setShowConfig] = useState(false);
  const [ipVal, setIpVal] = useState(apiIp);

  const handleSubmit = () => {
    onDone({ name, email, password });
  };

  const handleSaveIp = () => {
    onIpChange(ipVal);
    setShowConfig(false);
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

          {showConfig ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Cấu hình API IP</Text>
              <Field icon="server" value={ipVal} onChangeText={setIpVal} placeholder="IP Address (e.g. 192.168.1.10)" />
              <PrimaryButton label="Lưu IP" icon="check" onPress={handleSaveIp} />
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>{isLogin ? 'Đăng nhập' : 'Tạo tài khoản mới'}</Text>
              {!isLogin && <Field icon="account" placeholder="Nguyễn Văn A" value={name} onChangeText={setName} />}
              <Field icon="email-outline" placeholder="example@retail.com" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <Field icon="lock-outline" placeholder="Mật khẩu" secureTextEntry value={password} onChangeText={setPassword} />
              <PrimaryButton label={isLogin ? 'Đăng nhập' : 'Đăng ký'} icon="arrow-right" onPress={handleSubmit} />
            </View>
          )}

          <Pressable style={styles.configChip} onPress={() => setShowConfig(!showConfig)}>
            <MaterialCommunityIcons name="cog-outline" size={16} color={colors.secondary} />
            <Text style={styles.codeText}>API IP: {apiIp}</Text>
            <MaterialCommunityIcons name="check-circle" size={16} color={colors.success} />
          </Pressable>

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

function HomeScreen({ userName, isAdmin, orders, onLogout, onScan, onContribute, onAdmin, onOrder }) {
  return (
    <AppScaffold active="scan" isAdmin={isAdmin}>
      <Header title={`Xin chào, ${userName} (${isAdmin ? 'Admin' : 'User'})`} rightIcon="logout" onRight={onLogout} />
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

function ScannerScreen({ cart, cartCount, cartTotal, onBack, onManual, onMultiMatch, onQuantity, onCheckout, onScan }) {
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
              <CartItem key={item._id || item.id} item={item} onQuantity={onQuantity} />
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
    <AppScaffold active="inventory" isAdmin={isAdmin}>
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
    </AppScaffold>
  );
}

function OrderDetailScreen({ order, onBack }) {
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
          <OrderLine key={idx} item={item} />
        ))}

        <View style={styles.totalPanel}>
          <Text style={styles.kicker}>Tổng tiền</Text>
          <Text style={styles.totalAmount}>{money(order.totalAmount)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AdminScreen({ onBack, token }) {
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState(syncLogs);
  const [market, setMarket] = useState('GO!');

  const handleSync = async () => {
    setSyncing(true);
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] Bắt đầu đồng bộ từ ${market}...`, ...prev]);
    try {
      const res = await api.syncProducts(token);
      setLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Đồng bộ thành công: ${res.message || 'Cập nhật kho hàng'}`,
        ...prev
      ]);
    } catch (err) {
      setLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Lỗi đồng bộ: ${err.message}`,
        ...prev
      ]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppScaffold active="inventory" isAdmin={true}>
      <Header title="Hệ thống quản trị" leftIcon="arrow-left" onLeft={onBack} />
      <ScrollView contentContainerStyle={styles.contentWithNav} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <View style={styles.rowCenter}>
            <MaterialCommunityIcons name="sync" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>Đồng bộ dữ liệu</Text>
          </View>
          <Segmented options={['GO!', 'BHX', 'WinMart', 'Tất cả']} value={market} onChange={setMarket} />
          <PrimaryButton 
            label={syncing ? "Đang đồng bộ..." : "Đồng bộ sản phẩm"} 
            icon="cloud-download-outline" 
            onPress={handleSync} 
          />
        </View>

        <View style={styles.statGrid}>
          <Stat label="Tổng cộng" value="1.284" color={colors.primary} />
          <Stat label="Đã tạo" value="1.042" color={colors.success} />
          <Stat label="Bỏ qua" value="231" color={colors.secondary} />
          <Stat label="Thất bại" value="11" color={colors.error} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.kicker}>Cấu hình scraper</Text>
          <Meta label="Trạng thái cookie" value="sess_************k9a2" />
          <Meta label="Lần cuối đồng bộ" value="Hôm nay, 14:25:01" />
        </View>

        <View style={styles.console}>
          <View style={styles.sheetHeader}>
            <Text style={styles.kicker}>Nhật ký hệ thống</Text>
            <Pressable onPress={() => setLogs([])}>
              <Text style={styles.codeTextLink}>CLEAR</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={true}>
            {logs.map((line, idx) => (
              <Text
                key={idx}
                style={[
                  styles.consoleLine,
                  line.includes('Lỗi') && { color: colors.error },
                  line.includes('Bắt đầu') && { color: colors.success },
                ]}
              >
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </AppScaffold>
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
                <ProductMark />
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

function AppScaffold({ children, active, isAdmin }) {
  return (
    <SafeAreaView style={styles.screen}>
      {children}
      <BottomNav active={active} isAdmin={isAdmin} />
    </SafeAreaView>
  );
}

// Custom components
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

function BottomNav({ active, isAdmin }) {
  const items = [
    ['scan', 'barcode-scan', 'Scan'],
    ...(isAdmin ? [['inventory', 'archive-outline', 'Inventory']] : []),
    ['cart', 'cart-outline', 'Cart'],
    ['history', 'history', 'History'],
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map(([key, icon, label]) => {
        const selected = active === key;
        return (
          <View key={key} style={[styles.navItem, selected && styles.navItemActive]}>
            <MaterialCommunityIcons name={icon} size={20} color={selected ? '#ffffff' : colors.secondary} />
            <Text style={[styles.navText, selected && { color: '#ffffff' }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Field(props) {
  const { icon, ...inputProps } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={[
      styles.field, 
      styles.sunken, 
      focused && { borderColor: colors.primary }
    ]}>
      <MaterialCommunityIcons name={icon} size={20} color={focused ? colors.primary : colors.secondary} />
      <TextInput
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
        style={styles.input}
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

function CartItem({ item, onQuantity }) {
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
      <ProductMark />
      <View style={styles.flex}>
        <Text style={styles.kicker}>SKU: {item.barcode.slice(-6)}</Text>
        <Text style={styles.bodyStrong} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.priceText}>{money(item.price)}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable style={styles.stepperBtn} onPress={() => onQuantity(item._id || item.id, -1)}>
          <MaterialCommunityIcons name="minus" size={14} color="#ffffff" />
        </Pressable>
        <TextInput
          style={styles.stepperInput}
          value={localQty}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          onSubmitEditing={handleBlur}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholderTextColor="rgba(255, 255, 255, 0.3)"
        />
        <Pressable style={styles.stepperBtn} onPress={() => onQuantity(item._id || item.id, 1)}>
          <MaterialCommunityIcons name="plus" size={14} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}

function OrderLine({ item }) {
  const pName = item.product ? item.product.name : 'Sản phẩm';
  const pBarcode = item.product ? item.product.barcode : '';
  const pPrice = item.product ? item.product.price : 0;
  return (
    <View style={styles.cartItem}>
      <ProductMark />
      <View style={styles.flex}>
        <Text style={styles.bodyStrong} numberOfLines={1}>{pName}</Text>
        <Text style={styles.codeText}>{pBarcode}</Text>
      </View>
      <View style={styles.alignEnd}>
        <Text style={styles.priceText}>{money(pPrice * item.quantity)}</Text>
        <Text style={styles.codeText}>x{item.quantity} @ {money(pPrice)}</Text>
      </View>
    </View>
  );
}

function ProductMark() {
  return (
    <View style={styles.productMark}>
      <MaterialCommunityIcons name="cube-outline" size={22} color={colors.primary} />
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

const styles = StyleSheet.create({
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
        backgroundColor: 'rgba(17, 24, 39, 0.75)', // Elevated Slate transparent
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
    color: '#ffffff',
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
    color: '#ffffff',
  },
  bodyStrong: {
    ...type.body,
    color: '#ffffff',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(19, 27, 46, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 48,
    ...type.body,
    color: '#ffffff',
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
  },
  header: {
    minHeight: 60,
    backgroundColor: 'rgba(6, 11, 24, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#f1f5f9',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.default,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#ffffff',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(17, 24, 39, 0.8)', // Slate surface translucent
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderTopLeftRadius: radius.base,
    borderTopRightRadius: radius.base,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  productMark: {
    width: 44,
    height: 44,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  stepper: {
    width: 90,
    minHeight: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  stepperBtn: {
    padding: 6,
  },
  stepperText: {
    ...type.code,
    color: '#ffffff',
  },
  stepperInput: {
    ...type.code,
    color: '#ffffff',
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
    backgroundColor: 'rgba(3, 7, 18, 0.6)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      }
    })
  },
  modalSheet: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
  choiceCard: {
    borderRadius: radius.base,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#ffffff',
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
});
