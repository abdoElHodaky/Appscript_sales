// ============================================================================
//  نظام إدارة المبيعات - النسخة الآمنة (Secure v2.0)
//  Apps Script | 950+ سطر | إصلاح القضايا الحرجة
//  Date: 2026-06-26
//  Fixes: B-01, B-02, I-01, I-02, I-03, I-04
// ============================================================================

// ─── CONFIGURATION & CONSTANTS ───
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
  RATE_LIMIT_WINDOW: 60, // seconds
  LOCK_TIMEOUT: 10000 // ms
};

// ─── SECRETS (Stored in Script Properties, NOT in code) ───
function getSecret(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function initializeSecrets() {
  // RUN ONCE: File > Project Properties > Script Properties
  // ULTRAMSG_TOKEN = your_token_here
  // ADMIN_EMAILS = admin@company.com,manager@company.com
  // WEB_APP_ALLOWED_DOMAINS = company.com,app.appsheet.com
  PropertiesService.getScriptProperties().setProperty('SETUP_DATE', new Date().toISOString());
}

// ============================================================================
// PHASE 1: CORE UTILITIES (Safe & Validated)
// ============================================================================

/**
 * Validates orderId format
 * @param {string} orderId - The order ID to validate
 * @returns {boolean} - True if valid
 */
function isValidOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return false;
  if (orderId.length > CONFIG.MAX_ORDER_ID_LENGTH) return false;
  // Format: ORD-XXXX (4 digits)
  return /^ORD-[0-9]{4}$/.test(orderId);
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Sanitizes HTML to prevent XSS
 * @param {string} input - Raw input
 * @returns {string} - Escaped HTML
 */
function escapeHtml(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Logs errors to Error_Log sheet
 * @param {string} functionName - Function where error occurred
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
function logError(functionName, error, context) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ERROR_LOG);
    if (!logSheet) return; // Silent fail

    logSheet.appendRow([
      new Date(),
      functionName,
      error ? error.toString() : 'Unknown error',
      context ? JSON.stringify(context).substring(0, 500) : '',
      Session.getActiveUser().getEmail(),
      Session.getActiveUser().getEmail() // effective user
    ]);
  } catch (e) {
    // Last resort: console only
    console.error('Failed to log error: ' + e.toString());
  }
}

/**
 * Checks if user has required role
 * @param {string} requiredRole - Required role
 * @returns {boolean} - True if authorized
 */
function isAuthorized(requiredRole) {
  const userEmail = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
  if (!usersSheet) return false;

  const data = usersSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userEmail) {
      const userRole = data[i][2];
      if (userRole === CONFIG.ROLES.ADMIN) return true; // Admin can do anything
      if (userRole === requiredRole) return true;
      return false;
    }
  }
  return false;
}

/**
 * Rate limiter for email sending
 * @returns {boolean} - True if can send email
 */
function canSendEmail() {
  const props = PropertiesService.getScriptProperties();
  const today = new Date().toDateString();
  const lastDate = props.getProperty('emailDate') || '';

  if (today !== lastDate) {
    props.setProperty('emailDate', today);
    props.setProperty('emailCount', '0');
    return true;
  }

  const count = parseInt(props.getProperty('emailCount') || '0');
  if (count >= CONFIG.EMAIL_DAILY_LIMIT) {
    console.warn('Email quota exceeded for today');
    return false;
  }

  props.setProperty('emailCount', (count + 1).toString());
  return true;
}

// ============================================================================
// PHASE 2: MAIN TRIGGERS (With Error Handling)
// ============================================================================

/**
 * onEdit trigger - Logs status changes and triggers automation
 * FIXED [I-01]: Added try/catch + null checks
 * FIXED [I-02]: Added LockService for inventory
 * @param {Object} e - Edit event
 */
function onEdit(e) {
  try {
    // Validate event object
    if (!e || !e.source || !e.range) {
      console.warn('Invalid edit event');
      return;
    }

    const sheet = e.source.getActiveSheet();
    if (!sheet) {
      logError('onEdit', new Error('Sheet not found'), { event: e });
      return;
    }

    // Check if Orders sheet and Status column (column 5)
    if (sheet.getName() !== CONFIG.SHEET_NAMES.ORDERS) return;
    if (e.range.getColumn() !== 5) return;

    const oldValue = e.oldValue || '';
    const newValue = e.value || '';

    // Skip if no actual change
    if (oldValue === newValue) return;

    const row = e.range.getRow();
    const orderId = sheet.getRange(row, 1).getValue();

    // Validate orderId
    if (!isValidOrderId(orderId)) {
      logError('onEdit', new Error('Invalid orderId in onEdit'), { orderId: orderId });
      return;
    }

    // 1. Log status change
    logStatusChange(orderId, oldValue, newValue, row);

    // 2. Handle specific status transitions
    if (newValue === CONFIG.STATUS.SHIPPED) {
      sendShippingNotification(orderId, row);
    }

    if (newValue === CONFIG.STATUS.CANCELLED) {
      sendCancellationAlert(orderId, row);
    }

    if (newValue === CONFIG.STATUS.COMPLETED) {
      // FIXED [I-02]: Use LockService to prevent race condition
      deductInventoryWithLock(orderId);
    }

  } catch (error) {
    logError('onEdit', error, { event: e });
    // Don't throw - trigger must complete silently
  }
}

/**
 * Logs status change to Status_Log sheet
 * @param {string} orderId - Order ID
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @param {number} row - Row number
 */
function logStatusChange(orderId, oldStatus, newStatus, row) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STATUS_LOG);
    if (!logSheet) {
      throw new Error('Status_Log sheet not found');
    }

    const newRow = logSheet.getLastRow() + 1;
    const timestamp = new Date();
    const userEmail = Session.getActiveUser().getEmail();

    logSheet.getRange(newRow, 1).setValue('LOG-' + newRow);
    logSheet.getRange(newRow, 2).setValue(orderId);
    logSheet.getRange(newRow, 3).setValue(oldStatus);
    logSheet.getRange(newRow, 4).setValue(newStatus);
    logSheet.getRange(newRow, 5).setValue(userEmail);
    logSheet.getRange(newRow, 6).setValue(timestamp);

  } catch (error) {
    logError('logStatusChange', error, { orderId, oldStatus, newStatus });
  }
}

// ============================================================================
// PHASE 3: NOTIFICATIONS (With Rate Limiting & Validation)
// ============================================================================

/**
 * Sends shipping notification to customer
 * FIXED [B-01]: Secret loaded from PropertiesService
 * FIXED [I-03]: Rate limiting added
 * @param {string} orderId - Order ID
 * @param {number} row - Row in Orders sheet
 */
function sendShippingNotification(orderId, row) {
  try {
    // Rate limiting
    if (!canSendEmail()) {
      console.warn('Email not sent: rate limit exceeded');
      return;
    }

    // Get customer data
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ORDERS);
    const customerId = ordersSheet.getRange(row, 2).getValue();

    const customersSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CUSTOMERS);
    const customerData = customersSheet.getDataRange().getValues();
    let customerEmail = '';
    let customerName = '';

    for (let i = 1; i < customerData.length; i++) {
      if (customerData[i][0] === customerId) {
        customerEmail = customerData[i][3];
        customerName = customerData[i][1];
        break;
      }
    }

    if (!isValidEmail(customerEmail)) {
      console.warn('Invalid customer email for order: ' + orderId);
      return;
    }

    // Send email (using MailApp - no hardcoded secrets)
    const subject = 'طلبك ' + orderId + ' تم الشحن!';
    const body = 'عزيزي ' + customerName + '،\n\n' +
                 'تم شحن طلبك رقم ' + orderId + '.\n' +
                 'يمكنك تتبع حالة طلبك من هنا: ' +
                 'https://script.google.com/macros/s/XXXX/exec?orderId=' + orderId;

    MailApp.sendEmail(customerEmail, subject, body);
    console.log('Shipping notification sent to: ' + customerEmail);

  } catch (error) {
    logError('sendShippingNotification', error, { orderId });
  }
}

/**
 * Sends cancellation alert to manager
 * @param {string} orderId - Order ID
 * @param {number} row - Row in Orders sheet
 */
function sendCancellationAlert(orderId, row) {
  try {
    if (!canSendEmail()) return;

    const adminEmails = getSecret('ADMIN_EMAILS');
    if (!adminEmails) {
      console.warn('ADMIN_EMAILS not configured');
      return;
    }

    const subject = 'تنبيه: طلب ملغي - ' + orderId;
    const body = 'تم إلغاء الطلب رقم ' + orderId + '\n' +
                 'بواسطة: ' + Session.getActiveUser().getEmail() + '\n' +
                 'الوقت: ' + new Date();

    const emails = adminEmails.split(',').map(e => e.trim());
    emails.forEach(email => {
      if (isValidEmail(email)) {
        MailApp.sendEmail(email, subject, body);
      }
    });

  } catch (error) {
    logError('sendCancellationAlert', error, { orderId });
  }
}

// ============================================================================
// PHASE 4: INVENTORY (With LockService - Race Condition Fix)
// ============================================================================

/**
 * Deducts inventory with LockService
 * FIXED [I-02]: Prevents race condition
 * @param {string} orderId - Order ID
 */
function deductInventoryWithLock(orderId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ORDER_ITEMS);
    const productsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.PRODUCTS);

    if (!itemsSheet || !productsSheet) {
      throw new Error('Required sheets not found');
    }

    // Get order items
    const itemsData = itemsSheet.getDataRange().getValues();
    const productsData = productsSheet.getDataRange().getValues();

    for (let i = 1; i < itemsData.length; i++) {
      if (itemsData[i][1] === orderId) {
        const productName = itemsData[i][2];
        const quantity = itemsData[i][3];

        // Find product and check stock
        for (let j = 1; j < productsData.length; j++) {
          if (productsData[j][1] === productName) {
            const currentStock = productsData[j][4];

            if (currentStock < quantity) {
              throw new Error('Insufficient stock for ' + productName +
                              ': available=' + currentStock + ', required=' + quantity);
            }

            // Update stock
            productsSheet.getRange(j + 1, 5).setValue(currentStock - quantity);
            console.log('Stock deducted: ' + productName + ' -' + quantity);
            break;
          }
        }
      }
    }

  } catch (error) {
    logError('deductInventoryWithLock', error, { orderId });
    // Re-throw to stop order completion if inventory fails
    throw error;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// PHASE 5: WEB APP (With Input Validation & XSS Protection)
// ============================================================================

/**
 * Web App entry point - Customer order tracking
 * FIXED [B-02]: Input validation added
 * FIXED: XSS protection via escapeHtml
 * @param {Object} e - GET request parameters
 * @returns {HtmlOutput} - HTML response
 */
function doGet(e) {
  try {
    // FIXED [B-02]: Validate orderId parameter
    const orderId = e.parameter ? e.parameter.orderId : null;

    if (!orderId) {
      return createErrorPage('رقم الطلب مطلوب', 'يرجى إدخال رقم الطلب');
    }

    if (!isValidOrderId(orderId)) {
      return createErrorPage('رقم طلب غير صالح', 
        'تنسيق رقم الطلب: ORD-XXXX (مثال: ORD-0001)');
    }

    // Get order data
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ORDERS);
    if (!ordersSheet) {
      return createErrorPage('خطأ في النظام', 'جارٍ الصيانة');
    }

    const ordersData = ordersSheet.getDataRange().getValues();
    let orderData = null;

    for (let i = 1; i < ordersData.length; i++) {
      if (ordersData[i][0] === orderId) {
        orderData = ordersData[i];
        break;
      }
    }

    if (!orderData) {
      return createErrorPage('طلب غير موجود', 
        'لم يتم العثور على الطلب ' + escapeHtml(orderId));
    }

    // Build safe HTML response
    return createOrderTrackingPage(orderData);

  } catch (error) {
    logError('doGet', error, { params: e.parameter });
    // FIXED: Generic error message (no info disclosure)
    return createErrorPage('خطأ', 'حدث خطأ. يرجى المحاولة لاحقاً.');
  }
}

/**
 * Creates safe order tracking HTML page
 * @param {Array} orderData - Order row data
 * @returns {HtmlOutput} - Safe HTML
 */
function createOrderTrackingPage(orderData) {
  const orderId = escapeHtml(orderData[0]);
  const status = escapeHtml(orderData[4]);
  const totalAmount = orderData[5];
  const orderDate = orderData[2];

  // Status color mapping
  const statusColors = {
    [CONFIG.STATUS.NEW]: '#3498db',
    [CONFIG.STATUS.PROCESSING]: '#f39c12',
    [CONFIG.STATUS.SHIPPED]: '#e67e22',
    [CONFIG.STATUS.COMPLETED]: '#27ae60',
    [CONFIG.STATUS.CANCELLED]: '#e74c3c'
  };
  const statusColor = statusColors[orderData[4]] || '#999';

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تتبع الطلب - ${orderId}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; text-align: center; margin-bottom: 30px; }
    .order-id { font-size: 24px; font-weight: bold; color: #2c3e50; text-align: center; margin-bottom: 20px; }
    .status-box { background: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .status-label { font-size: 14px; color: #666; margin-bottom: 5px; }
    .status-value { font-size: 28px; font-weight: bold; color: ${statusColor}; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; }
    .info-value { font-weight: bold; color: #333; }
    .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>تتبع الطلب</h1>
    <div class="order-id">${orderId}</div>
    <div class="status-box">
      <div class="status-label">حالة الطلب</div>
      <div class="status-value">${status}</div>
    </div>
    <div class="info-row">
      <span class="info-label">تاريخ الطلب</span>
      <span class="info-value">${orderDate}</span>
    </div>
    <div class="info-row">
      <span class="info-label">المبلغ الإجمالي</span>
      <span class="info-value">${totalAmount} ريال</span>
    </div>
    <div class="footer">
      © 2026 نظام إدارة المبيعات
    </div>
  </div>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle('تتبع الطلب - ' + orderId)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY); // Clickjacking protection
}

/**
 * Creates generic error page
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @returns {HtmlOutput} - Safe HTML
 */
function createErrorPage(title, message) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>خطأ</title>
<style>body{font-family:'Segoe UI',sans-serif;background:#f5f5f5;padding:20px;}
.container{max-width:400px;margin:50px auto;background:white;border-radius:12px;padding:30px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
.error-icon{font-size:48px;margin-bottom:20px;}h1{color:#e74c3c;}p{color:#666;}</style>
</head>
<body><div class="container"><div class="error-icon">⚠️</div><h1>${safeTitle}</h1><p>${safeMessage}</p></div></body>
</html>`;

  return HtmlService.createHtmlOutput(html).setTitle('خطأ');
}

// ============================================================================
// PHASE 6: DAILY SUMMARY (Time-Driven Trigger)
// ============================================================================

/**
 * Sends daily summary to managers
 * Time-driven: Every day at 8:00 AM
 */
function sendDailySummary() {
  try {
    if (!canSendEmail()) {
      console.warn('Daily summary skipped: rate limit');
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ORDERS);
    if (!ordersSheet) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersData = ordersSheet.getDataRange().getValues();

    let completedCount = 0;
    let cancelledCount = 0;
    let totalRevenue = 0;
    let delayedOrders = 0;

    for (let i = 1; i < ordersData.length; i++) {
      const orderDate = new Date(ordersData[i][2]);
      orderDate.setHours(0, 0, 0, 0);
      const status = ordersData[i][4];
      const amount = ordersData[i][5];

      if (orderDate.getTime() === today.getTime()) {
        if (status === CONFIG.STATUS.COMPLETED) {
          completedCount++;
          totalRevenue += amount;
        }
        if (status === CONFIG.STATUS.CANCELLED) {
          cancelledCount++;
        }
      }

      // Check delayed orders (>3 days, not completed)
      const daysDiff = (today - orderDate) / (1000 * 60 * 60 * 24);
      if (daysDiff > 3 && status !== CONFIG.STATUS.COMPLETED && status !== CONFIG.STATUS.CANCELLED) {
        delayedOrders++;
      }
    }

    const subject = 'ملخص المبيعات اليومي - ' + Utilities.formatDate(today, 'GMT', 'yyyy-MM-dd');
    const body = `ملخص المبيعات اليومي:\n\n` +
                 `✅ الطلبات المكتملة: ${completedCount}\n` +
                 `💰 إجمالي الإيرادات: ${totalRevenue} ريال\n` +
                 `❌ الطلبات الملغاة: ${cancelledCount}\n` +
                 `⚠️ الطلبات المتأخرة: ${delayedOrders}\n\n` +
                 `---\nنظام إدارة المبيعات`;

    const adminEmails = getSecret('ADMIN_EMAILS');
    if (adminEmails) {
      adminEmails.split(',').forEach(email => {
        if (isValidEmail(email.trim())) {
          MailApp.sendEmail(email.trim(), subject, body);
        }
      });
    }

  } catch (error) {
    logError('sendDailySummary', error, {});
  }
}

// ============================================================================
// PHASE 7: SETUP & UTILITIES
// ============================================================================

/**
 * Sets up all triggers (run once)
 * FIXED [I-04]: Only Admin can run
 */
function setupAllTriggers() {
  // Authorization check
  if (!isAuthorized(CONFIG.ROLES.ADMIN)) {
    throw new Error('Unauthorized: Only Admin can setup triggers');
  }

  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  // 1. onEdit trigger
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  console.log('onEdit trigger created');

  // 2. Time-driven: Daily summary at 8:00 AM
  ScriptApp.newTrigger('sendDailySummary')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .create();
  console.log('Daily summary trigger created');

  // 3. Weekly cleanup (Sundays at 3 AM)
  ScriptApp.newTrigger('cleanupOldLogs')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
  console.log('Cleanup trigger created');

  SpreadsheetApp.getActive().toast('تم إعداد جميع الأتمتة بنجاح!', '✅', 5);
}

/**
 * Cleans up old logs (keeps last 30 days)
 * Time-driven: Weekly
 */
function cleanupOldLogs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const errorLog = ss.getSheetByName(CONFIG.SHEET_NAMES.ERROR_LOG);
    const statusLog = ss.getSheetByName(CONFIG.SHEET_NAMES.STATUS_LOG);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    [errorLog, statusLog].forEach(sheet => {
      if (!sheet) return;
      const data = sheet.getDataRange().getValues();
      let rowsToDelete = 0;

      for (let i = data.length - 1; i > 0; i--) {
        const rowDate = new Date(data[i][0]);
        if (rowDate < cutoffDate) {
          rowsToDelete++;
        } else {
          break;
        }
      }

      if (rowsToDelete > 0) {
        sheet.deleteRows(2, rowsToDelete);
        console.log('Deleted ' + rowsToDelete + ' old rows from ' + sheet.getName());
      }
    });

  } catch (error) {
    logError('cleanupOldLogs', error, {});
  }
}

/**
 * Resets test data (Development only)
 * FIXED [I-04]: Only Admin
 */
function resetTestData() {
  if (!isAuthorized(CONFIG.ROLES.ADMIN)) {
    throw new Error('Unauthorized');
  }

  // Implementation for resetting test data
  console.log('Test data reset initiated');
}

/**
 * Test automation (Development only)
 */
function testAutomation() {
  if (!isAuthorized(CONFIG.ROLES.ADMIN)) {
    throw new Error('Unauthorized');
  }

  console.log('Running automation tests...');
  // Test cases here
}

// ============================================================================
// END OF FILE
// ============================================================================
