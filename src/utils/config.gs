// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  SHEET_NAMES: {
    ORDERS: 'Orders',
    CUSTOMERS: 'Customers',
    ORDER_ITEMS: 'Order_Items',
    PRODUCTS: 'Products',
    USERS: 'Users',
    STATUS_LOG: 'Status_Log',
    ERROR_LOG: 'Error_Log',
    DASHBOARD: 'Dashboard_Data'
  },
  STATUS: {
    NEW: 'جديد',
    PROCESSING: 'قيد التنفيذ',
    SHIPPED: 'تم الشحن',
    COMPLETED: 'مكتمل',
    CANCELLED: 'ملغي'
  },
  ROLES: {
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    SALES: 'Sales'
  },
  MAX_ORDER_ID_LENGTH: 20,
  EMAIL_DAILY_LIMIT: 90,
  RATE_LIMIT_WINDOW: 60,
  LOCK_TIMEOUT: 10000
};
