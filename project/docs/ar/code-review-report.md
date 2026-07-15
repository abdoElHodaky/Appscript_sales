
═══════════════════════════════════════════════════════════════════════════════
                    تقرير مراجعة الكود - Code Review Report
                    نظام إدارة المبيعات (Apps Script)
                    904 سطر | 8 وظائف رئيسية | 3 Triggers
═══════════════════════════════════════════════════════════════════════════════

المُراجع: Claude Code Review Skill (awesome-skills/code-review-skill)
التاريخ: 2026-06-26
الإصدار: v1.0 (Development)

───────────────────────────────────────────────────────────────────────────────
الملخص التنفيذي
───────────────────────────────────────────────────────────────────────────────

الملفات المُراجعة: 1 (Code.gs - 904 سطر)
القضايا الحرجة (Blocking):     2
القضايا المهمة (Important):    5
الاقتراحات (Suggestion):      8
التفاصيل الطفيفة (Nit):         3

التقييم العام: ⚠️ يحتاج إصلاح قبل النشر على Production

───────────────────────────────────────────────────────────────────────────────
القضايا الحرجة (Blocking) - يجب إصلاحها قبل النشر
───────────────────────────────────────────────────────────────────────────────

[B-01] 🔴 Secret Exposure Risk
─────────────────────────────────────────────────────
الموقع:  السطر 45-48 (sendShippingNotification)
الكود:
    var url = 'https://api.ultramsg.com/instanceXXXX/messages/chat';
    var payload = {
      'token': 'XXXXXXXX',  // ← HARDCODED TOKEN
      ...
    };

المشكلة: مفتاح API مكتوب مباشرة في الكود. إذا تم مشاركة النص البرمجي،
         يتم تسريب المفتاح.

الإصلاح:
    var token = PropertiesService.getScriptProperties().getProperty('ULTRAMSG_TOKEN');
    var payload = { 'token': token, ... };

    // الإعداد: File → Project Properties → Script Properties

[B-02] 🔴 Missing Input Validation in Web App
─────────────────────────────────────────────────────
الموقع:  السطر 320-340 (doGet)
الكود:
    function doGet(e) {
      var orderId = e.parameter.orderId;
      // ← لا تحقق من orderId
      var data = getOrderData(orderId);
      ...
    }

المشكلة: orderId يُستخدم مباشرة في الاستعلام بدون:
         • التحقق من نوعه (string)
         • التحقق من طوله (max 20 chars)
         • التحقق من تنسيقه (REGEX: /^ORD-[0-9]{4}$/)

الإصلاح:
    function doGet(e) {
      var orderId = e.parameter.orderId;

      // Validation
      if (!orderId || typeof orderId !== 'string') {
        return errorResponse('Invalid orderId parameter');
      }
      if (!/^ORD-[0-9]{4}$/.test(orderId)) {
        return errorResponse('Invalid orderId format');
      }
      if (orderId.length > 20) {
        return errorResponse('orderId too long');
      }

      var data = getOrderData(orderId);
      ...
    }

───────────────────────────────────────────────────────────────────────────────
القضايا المهمة (Important) - يجب إصلاحها في الأسبوع الأول
───────────────────────────────────────────────────────────────────────────────

[I-01] 🟡 Missing Error Handling in onEdit
─────────────────────────────────────────────────────
الموقع:  السطر 12-30 (onEdit)
الكود:
    function onEdit(e) {
      var sheet = e.source.getActiveSheet();
      if (sheet.getName() !== 'Orders' || e.range.getColumn() !== 5) return;

      var logSheet = e.source.getSheetByName('Status_Log');
      var newRow = logSheet.getLastRow() + 1;  // ← قد يكون null
      ...
    }

المشكلة: لا يوجد try/catch. إذا فشل أي سطر، يتوقف التنفيذ بدون سجل.

الإصلاح:
    function onEdit(e) {
      try {
        var sheet = e.source.getActiveSheet();
        if (sheet.getName() !== 'Orders' || e.range.getColumn() !== 5) return;

        var logSheet = e.source.getSheetByName('Status_Log');
        if (!logSheet) {
          console.error('Status_Log sheet not found');
          return;
        }
        ...
      } catch (error) {
        console.error('onEdit error: ' + error.toString());
        logError('onEdit', error);
      }
    }

[I-02] 🟡 Race Condition in Inventory Deduction
─────────────────────────────────────────────────────
الموقع:  السطر 180-200 (deductInventory)
الكود:
    function deductInventory(orderId) {
      var items = getOrderItems(orderId);
      for (var i = 0; i < items.length; i++) {
        var currentStock = getStock(items[i].product);
        var newStock = currentStock - items[i].quantity;
        updateStock(items[i].product, newStock);  // ← Race condition
      }
    }

المشكلة: إذا تزامن طلبان في نفس اللحظة، قد يُخصم المخزون مرتين.

الإصلاح:
    // استخدام Lock Service
    function deductInventory(orderId) {
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);

        var items = getOrderItems(orderId);
        for (var i = 0; i < items.length; i++) {
          var currentStock = getStock(items[i].product);
          if (currentStock < items[i].quantity) {
            throw new Error('Insufficient stock for ' + items[i].product);
          }
          var newStock = currentStock - items[i].quantity;
          updateStock(items[i].product, newStock);
        }
      } finally {
        lock.releaseLock();
      }
    }

[I-03] 🟡 No Rate Limiting on Email Notifications
─────────────────────────────────────────────────────
الموقع:  السطر 60-90 (sendShippingNotification)
المشكلة: إذا تغيرت حالة 100 طلب في دقيقة، يُرسل 100 إيميل.
         Google Apps Script لها حدود يومية (100 رسائل/يوم).

الإصلاح:
    // استخدام PropertiesService لتتبع العدد
    function canSendEmail() {
      var props = PropertiesService.getScriptProperties();
      var count = parseInt(props.getProperty('emailCount') || '0');
      var today = new Date().toDateString();
      var lastDate = props.getProperty('emailDate') || '';

      if (today !== lastDate) {
        props.setProperty('emailDate', today);
        props.setProperty('emailCount', '0');
        count = 0;
      }

      if (count >= 90) {  // buffer
        console.warn('Email quota exceeded');
        return false;
      }

      props.setProperty('emailCount', (count + 1).toString());
      return true;
    }

[I-04] 🟡 Missing Authorization Check in Admin Functions
─────────────────────────────────────────────────────
الموقع:  السطر 400-420 (deployToProduction)
الكود:
    function deployToProduction() {
      // ← لا يتحقق من هوية المستخدم
      ...
    }

المشكلة: أي شخص يمكنه تشغيل هذه الوظيفة من محرر النصوص.

الإصلاح:
    function deployToProduction() {
      var userEmail = Session.getActiveUser().getEmail();
      var allowedAdmins = ['admin@company.com'];  // أو من ورقة Users

      if (allowedAdmins.indexOf(userEmail) === -1) {
        throw new Error('Unauthorized: ' + userEmail);
      }
      ...
    }

[I-05] 🟡 Web App CORS Not Configured
─────────────────────────────────────────────────────
الموقع:  السطر 320 (doGet)
المشكلة: Web App يقبل الطلبات من أي مصدر.

الإصلاح:
    function doGet(e) {
      var output = ContentService.createTextOutput();
      output.setMimeType(ContentService.MimeType.JSON);

      // CORS
      // Apps Script Web Apps لا تدعم CORS headers مباشرة
      // استخدام JSONP أو نطاق فرعي مخصص

      var referer = e.parameter.referer || '';
      var allowedDomains = ['company.com', 'app.appsheet.com'];
      ...
    }

───────────────────────────────────────────────────────────────────────────────
الاقتراحات (Suggestion) - تحسين اختياري
───────────────────────────────────────────────────────────────────────────────

[S-01] 🟢 Use const/let instead of var
─────────────────────────────────────────────────────
    // قبل
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var orders = ss.getSheetByName('Orders');

    // بعد
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orders = ss.getSheetByName('Orders');
    let count = 0;  // إذا يتغير

[S-02] 🟢 Extract Magic Numbers to Constants
─────────────────────────────────────────────────────
    // قبل
    if (orderId.length > 20) { ... }

    // بعد
    const MAX_ORDER_ID_LENGTH = 20;
    if (orderId.length > MAX_ORDER_ID_LENGTH) { ... }

[S-03] 🟢 Add JSDoc Comments
─────────────────────────────────────────────────────
    /**
     * Sends shipping notification to customer
     * @param {Object} e - Edit event object
     * @param {string} e.range.row - Row number
     * @returns {boolean} Success status
     */
    function sendShippingNotification(e) { ... }

[S-04] 🟢 Use Template Literals for Messages
─────────────────────────────────────────────────────
    // قبل
    var message = 'طلبك ' + orderId + ' تم الشحن';

    // بعد
    const message = `طلبك ${orderId} تم الشحن`;

[S-05] 🟢 Separate Concerns
─────────────────────────────────────────────────────
    // قبل: onEdit يفعل كل شيء
    function onEdit(e) {
      logStatusChange(e);
      sendNotification(e);
      deductInventory(e);
    }

    // بعد: Event Bus pattern
    function onEdit(e) {
      EventBus.publish('order.status.changed', e);
    }

    // EventBus.subscribe('order.status.changed', logStatusChange);
    // EventBus.subscribe('order.status.changed', sendNotification);

[S-06] 🟢 Add Unit Tests
─────────────────────────────────────────────────────
    // استخدام clasp + jest
    // أو اختبارات بسيطة في Apps Script
    function testDeductInventory() {
      var mockOrder = { product: 'PRD-0001', quantity: 2 };
      var beforeStock = getStock('PRD-0001');
      deductInventory('ORD-TEST-001');
      var afterStock = getStock('PRD-0001');
      console.assert(afterStock === beforeStock - 2, 'Stock deduction failed');
    }

[S-07] 🟢 Use Batch Operations
─────────────────────────────────────────────────────
    // قبل: loop مع setValue لكل خلية
    for (var i = 0; i < items.length; i++) {
      sheet.getRange(i+1, 1).setValue(items[i].id);
    }

    // بعد: setValues مرة واحدة
    var values = items.map(item => [item.id, item.name, item.price]);
    sheet.getRange(1, 1, values.length, 3).setValues(values);

[S-08] 🟢 Add Logging Strategy
─────────────────────────────────────────────────────
    // قبل
    console.log('Error: ' + error);

    // بعد: ورقة مخصصة للأخطاء
    function logError(functionName, error, context) {
      var logSheet = SpreadsheetApp.getActive().getSheetByName('Error_Log');
      logSheet.appendRow([
        new Date(),
        functionName,
        error.toString(),
        JSON.stringify(context),
        Session.getActiveUser().getEmail()
      ]);
    }

───────────────────────────────────────────────────────────────────────────────
التفاصيل الطفيفة (Nit)
───────────────────────────────────────────────────────────────────────────────

[N-01] 🔵 Inconsistent Naming
    // بعض الدوال: camelCase
    sendShippingNotification()
    // وبعضها: snake_case
    send_daily_summary()
    // التوحيد: camelCase لكل شيء

[N-02] 🔵 Trailing Whitespace
    // السطور 120, 340, 560 تحتوي على مسافات زائدة

[N-03] 🔵 Missing Final Newline
    // الملف لا ينتهي بسطر فارغ (Unix convention)

───────────────────────────────────────────────────────────────────────────────
التوصيات النهائية
───────────────────────────────────────────────────────────────────────────────

الأولوية 1 (قبل النشر):
  □ إصلاح [B-01] - Secret Exposure
  □ إصلاح [B-02] - Input Validation
  □ إصلاح [I-01] - Error Handling
  □ إصلاح [I-02] - Race Condition

الأولوية 2 (الأسبوع الأول):
  □ إصلاح [I-03] - Rate Limiting
  □ إصلاح [I-04] - Authorization
  □ إصلاح [I-05] - CORS

الأولوية 3 (الشهر الأول):
  □ تطبيق [S-01] إلى [S-08]
  □ إضافة Unit Tests
  □ إنشاء Error_Log ورقة

───────────────────────────────────────────────────────────────────────────────
