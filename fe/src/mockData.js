export const products = [
  {
    id: 'p1',
    barcode: '8936039140012',
    name: 'Sữa Tươi Tiệt Trùng TH True Milk - 1L',
    supermarket: 'WinMart+',
    price: 34500,
    quantity: 2,
  },
  {
    id: 'p2',
    barcode: '4902505623041',
    name: 'Tai nghe Bluetooth Sony',
    supermarket: 'GO!',
    price: 450000,
    quantity: 1,
  },
  {
    id: 'p3',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'Bách Hóa Xanh',
    price: 26500,
    quantity: 1,
  },
];

export const matchingProducts = [
  {
    id: 'm1',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'Bách Hóa Xanh',
    price: 26500,
  },
  {
    id: 'm2',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'WinMart',
    price: 28000,
  },
  {
    id: 'm3',
    barcode: '8934567890123',
    name: 'Nước Tương Maggi Đậu Nành 700ml',
    supermarket: 'GO!',
    price: 24900,
  },
];

export const orders = [
  {
    id: 'POS-8829-012X',
    supermarket: 'WinMart+ Landmark 81',
    createdAt: '14/10/2023 14:32',
    status: 'completed',
    totalAmount: 450000,
    items: products,
  },
  {
    id: 'POS-7710-88AB',
    supermarket: 'Bách Hóa Xanh',
    createdAt: '12/10/2023 09:18',
    status: 'completed',
    totalAmount: 89000,
    items: [products[2]],
  },
  {
    id: 'POS-5521-11QZ',
    supermarket: 'GO!',
    createdAt: '10/10/2023 18:04',
    status: 'pending',
    totalAmount: 125000,
    items: [products[1]],
  },
];

export const syncLogs = [
  '[14:25:00] Bắt đầu đồng bộ dữ liệu từ GO! Market...',
  '[14:25:01] Tìm thấy 1,284 sản phẩm tiềm năng.',
  '[14:25:05] Đang xử lý trang 1/45...',
  '[14:25:10] Đã bỏ qua SKU: 8934567890 - Không thay đổi giá.',
  '[14:25:12] Đã cập nhật SKU: 8931234567 - Sữa tươi TH True Milk.',
  '[14:25:15] Lỗi kết nối: Timeout tại product_id 9982.',
  '[14:25:20] Trang 1 hoàn tất. Đang chuyển sang trang 2...',
];
