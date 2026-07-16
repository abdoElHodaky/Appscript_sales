# نظام إدارة طلبات المبيعات — v5.0

نظام متكامل لإدارة طلبات المبيعات مبني على **Google Apps Script + Google Sheets** وفق **Clean Architecture** ومبادئ **SOLID**، مع لوحة تحكم تفاعلية، بحث متقدم، تنبيهات ذكية، وبوابة عملاء بدون كلمات مرور.

---

## ✨ الميزات

| الوحدة | الميزات |
|---|---|
| 📦 الطلبات | إنشاء، تتبع حالة عبر State Machine، بحث فوري، إلغاء محكوم |
| 📊 لوحة التحكم | 6 مؤشرات KPI، 6 رسوم بيانية (Chart.js)، 4 جداول، تحديث تلقائي كل 30 ثانية، وضع ليلي |
| 🔍 البحث | Inverted Index للبحث الفوري + Query Builder + تصفية وفرز وترقيم صفحات |
| 🔔 التنبيهات | 6 قواعد جاهزة، Cooldown، أولويات، بريد إلكتروني، Trigger كل ساعة |
| 🛍️ بوابة العملاء | دخول OTP بدون كلمة مرور، تتبع الطلبات، تذاكر دعم مع State Machine |
| 🔐 الأمان | RBAC (4 أدوار)، Rate Limiting، XSS Protection تلقائي، DTO Validation |

---

## 🚀 التشغيل السريع

```bash
# 1. فك الضغط
unzip sales-order-system-v5.zip && cd sales-order-system-v5

# 2. تثبيت clasp وتسجيل الدخول
npm install -g @google/clasp
clasp login

# 3. إنشاء مشروع مرتبط بجدول بيانات
clasp create --title "Sales System v5" --type sheets

# 4. رفع الملفات
clasp push

# 5. التهيئة (إنشاء الجداول + بيانات تجريبية + Trigger التنبيهات)
clasp run initializeSystem

# 6. تشغيل الاختبارات
clasp run runTests

# 7. النشر
clasp deploy -d "v5.0 Production"
```

بعد النشر:

- **لوحة التحكم**: `https://script.google.com/.../exec?page=dashboard`
- **بوابة العملاء**: `https://script.google.com/.../exec?page=portal`

> بوابة العملاء تعمل في وضع التطوير: رمز OTP يظهر على الشاشة (`devCode`).
> عند ربط بوابة SMS احذف حقل `devCode` من `OtpService.issue()`.

---

## 📁 هيكل المشروع

```
├── Code.gs                      # نقطة الدخول: doGet/doPost/initializeSystem
├── appsscript.json              # Manifest + Scopes
├── src/
│   ├── domain/entities.gs       # Order, Customer, SupportTicket, State Machines
│   ├── application/
│   │   ├── dtos.gs              # 8 DTOs مع تحقق مخطط
│   │   └── useCases.gs          # 10 حالات استخدام (مسؤولية واحدة لكل فئة)
│   ├── infrastructure/
│   │   ├── repositories.gs      # 4 مستودعات على Google Sheets
│   │   ├── searchEngine.gs      # Inverted Index + QueryBuilder + Formatter
│   │   ├── alertServices.gs     # قواعد + محرك + تسليم + سجل
│   │   ├── otpService.gs        # OTP بصلاحية 5 دقائق
│   │   └── sessionService.gs    # جلسات 24 ساعة
│   ├── interfaces/
│   │   ├── controllers.gs       # 3 متحكمات رفيعة
│   │   ├── webHandlers.gs       # Router موحد
│   │   ├── dashboardHtml.gs     # واجهة لوحة التحكم
│   │   └── portalHtml.gs        # واجهة بوابة العملاء
│   └── shared/
│       ├── dependencyContainer.gs  # DI Container (24 اعتمادية)
│       ├── logger.gs            # تسجيل JSON مهيكل
│       ├── security.gs          # RBAC + RateLimiter + XSS
│       └── helpers.gs           # IDs + DateRange + Formatter + EventBus
├── tests/unit-tests.gs          # 26 اختبار وحدة (TestRunner مدمج)
└── docs/                        # README + ARCHITECTURE + DEPLOYMENT
```

---

## 🧪 الاختبارات

```bash
clasp run runTests
```

- **26 اختبار وحدة** تغطي: الكيانات، State Machines، DTOs، حالات الاستخدام (عبر Mocks)، OTP، الجلسات، RBAC، XSS، Rate Limiting، QueryBuilder.
- الاختبارات لا تلمس Google Sheets — المستودعات مستبدلة بـ Mocks في الذاكرة.

---

## 📡 واجهة API

كل الطلبات عبر `POST /exec` بجسم JSON يحوي `action`:

| Action | الوصف | المصادقة |
|---|---|---|
| `dashboard` | KPIs + Charts + Tables + Alerts | Role |
| `kpi` | مؤشرات KPI فقط | Role |
| `search` | بحث الطلبات (text, status, city, page...) | Rate limit |
| `createOrder` | إنشاء طلب | `order.create` |
| `updateStatus` | تغيير حالة طلب | `order.update` |
| `portal.requestOtp` | طلب رمز دخول | Rate limit |
| `portal.verifyOtp` | تحقق الرمز → token | — |
| `portal.orders` | طلبات العميل | Session token |
| `portal.tickets` | تذاكر العميل | Session token |
| `portal.createTicket` | فتح تذكرة | Session token |
| `portal.logout` | إنهاء الجلسة | Session token |

**مثال:**

```bash
curl -X POST "https://script.google.com/.../exec" \
  -d '{"action":"createOrder","userRole":"ADMIN",
       "customerId":"CUST-001","customerName":"أحمد",
       "items":[{"productId":"P1","productName":"لابتوب","quantity":1,"unitPrice":3200}]}'
```

**غلاف الاستجابة الموحد:**

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "status": 422, "code": "VALIDATION", "message": "..." } }
```

---

## 🔐 الأدوار والصلاحيات

| الدور | الصلاحيات |
|---|---|
| `ADMIN` | كل شيء |
| `MANAGER` | لوحة التحكم + الطلبات + التذاكر (بدون إلغاء/إدارة تنبيهات) |
| `SALES` | طلباته فقط |
| `CUSTOMER` | بوابة العميل: طلباته + تذاكره |

## ⚙️ الإعدادات

| الإعداد | الموقع | الافتراضي |
|---|---|---|
| مدة OTP | `otpService.gs` → `TTL_` | 300 ثانية |
| محاولات OTP | `otpService.gs` → `MAX_ATTEMPTS_` | 3 |
| مدة الجلسة | `sessionService.gs` → `TTL_MS_` | 24 ساعة |
| TTL كاش KPI | `useCases.gs` → `CalculateKPIsUseCase` | 300 ثانية |
| حد المخزون المنخفض | `repositories.gs` → `findLowStock(10)` | 10 |
| قواعد التنبيهات | `alertServices.gs` → `defaultAlertRules()` | 6 قواعد |
