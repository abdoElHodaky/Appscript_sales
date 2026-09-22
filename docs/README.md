# نظام إدارة طلبات المبيعات — v5.1

نظام متكامل لإدارة طلبات المبيعات مبني على **Google Apps Script + Google Sheets** وفق **Clean Architecture** ومبادئ **SOLID**، مع لوحة تحكم تفاعلية، بحث متقدم، تنبيهات ذكية، بوابة عملاء بدون كلمات مرور، و**مزامنة AppSheet ثنائية الاتجاه**.

---

## ✨ الميزات

| الوحدة | الميزات |
|---|---|
| 📦 الطلبات | إنشاء، تتبع حالة عبر State Machine، بحث فوري، إلغاء محكوم، **تحقق المخزون + استعادة تلقائية عند الإلغاء + فواتير** |
| 📊 لوحة التحكم | 6 مؤشرات KPI، 6 رسوم بيانية، 4 جداول، تحديث تلقائي |
| 🔍 البحث | Inverted Index للبحث الفوري + Query Builder + تصفية وفرز وترقيم صفحات |
| 🔔 التنبيهات | 6 قواعد جاهزة، Cooldown (يدعم >6 ساعات)، أولويات، بريد إلكتروني |
| 🛍️ بوابة العملاء | دخول OTP بدون كلمة مرور، تتبع الطلبات، تذاكر دعم |
| 🔄 مزامنة AppSheet | صادرة (System→AppSheet) فورية للطلبات والعملاء + واردة (AppSheet→System) كل 5 دقائق مع منع إعادة المحاولة اللانهائية |
| 🔐 الأمان | RBAC (4 أدوار)، Rate Limiting، XSS Protection، DTO Validation |

---

## 🚀 التشغيل السريع

```bash
# 1. فك الضغط
unzip sales-order-system-v5.1.zip && cd sales-order-system-v5.1

# 2. تثبيت clasp وتسجيل الدخول
npm install -g @google/clasp
clasp login

# 3. إنشاء مشروع مرتبط بجدول بيانات
clasp create --title "Sales System v5.1" --type sheets

# 4. رفع الملفات
clasp push

# 5. التهيئة (إنشاء الجداول + بيانات تجريبية + Triggers)
clasp run initializeSystem

# 6. تشغيل الاختبارات
clasp run runTests

# 7. النشر
clasp deploy -d "v5.1 Production"
```

---

## 📁 هيكل المشروع

```
├── Code.gs                      # نقطة الدخول + Triggers
├── appsscript.json              # Manifest + Scopes
├── src/
│   ├── domain/entities.gs       # Order, Customer, SupportTicket, State Machines
│   ├── application/
│   │   ├── dtos.gs              # 8 DTOs مع تحقق مخطط
│   │   ├── useCases.gs          # 10 حالات استخدام
│   │   └── appSheetUseCases.gs  # 3 حالات مزامنة AppSheet (جديد)
│   ├── infrastructure/
│   │   ├── repositories.gs      # 4 مستودعات على Google Sheets
│   │   ├── searchEngine.gs      # Inverted Index + QueryBuilder
│   │   ├── alertServices.gs     # قواعد + محرك + تسليم + سجل
│   │   ├── otpService.gs        # OTP بصلاحية 5 دقائق
│   │   ├── sessionService.gs    # جلسات 24 ساعة
│   │   └── appSheetSync.gs      # خدمة مزامنة AppSheet (جديد)
│   ├── interfaces/
│   │   ├── controllers.gs       # 3 متحكمات رفيعة
│   │   ├── appSheetController.gs# متحكم مزامنة AppSheet (جديد)
│   │   ├── webHandlers.gs       # Router موحد
│   │   ├── dashboardHtml.gs     # واجهة لوحة التحكم
│   │   └── portalHtml.gs        # واجهة بوابة العملاء
│   └── shared/
│       ├── dependencyContainer.gs  # DI Container (28 اعتمادية)
│       ├── logger.gs            # تسجيل JSON مهيكل
│       ├── security.gs          # RBAC + RateLimiter + XSS
│       └── helpers.gs           # IDs + DateRange + Formatter + EventBus
├── tests/unit-tests.gs          # 36 اختبار وحدة
└── docs/                        # README + ARCHITECTURE + DEPLOYMENT
```

---

## 🔄 مزامنة AppSheet

### الصادرة (System → AppSheet)
- يتم تلقائياً عند: `order.created` و `order.statusChanged`
- تكتب في: `app_orders` و `app_customers`

### الواردة (AppSheet → System)
- Trigger كل 5 دقائق: `runAppSheetSync`
- تقرأ من `app_orders` الصفوف حيث `sync_source != 'system'`
- تطبق State Machine validation
- تعيد وضع علامة `system` بعد المعالجة

### API Actions
| Action | الوصف |
|---|---|
| `appsheet.inbound` | سحب التغييرات من AppSheet |
| `appsheet.outbound` | دفع الكل أو طلب محدد إلى AppSheet |

---

## 🧪 الاختبارات

```bash
clasp run runTests
# → { total: 30, passed: 30, failed: 0 }
```

---

## 📡 واجهة API

كل الطلبات عبر `POST /exec` بجسم JSON يحوي `action`:

| Action | الوصف |
|---|---|
| `dashboard` | KPIs + Charts + Tables + Alerts |
| `kpi` | مؤشرات KPI فقط |
| `search` | بحث الطلبات |
| `createOrder` | إنشاء طلب (مع تحقق المخزون) |
| `updateStatus` | تغيير حالة طلب |
| `appsheet.inbound` | سحب من AppSheet |
| `appsheet.outbound` | دفع إلى AppSheet |
| `generateInvoice` | توليد فاتورة طلب |
| `system.status` | حالة النظام والإحصائيات |
| `portal.*` | بوابة العملاء |

---

## 🔐 الأدوار والصلاحيات

| الدور | الصلاحيات |
|---|---|
| `ADMIN` | كل شيء |
| `MANAGER` | لوحة التحكم + الطلبات + التذاكر |
| `SALES` | طلباته فقط |
| `CUSTOMER` | بوابة العميل |

---

## ⚙️ الإعدادات

| الإعداد | الموقع | الافتراضي |
|---|---|---|
| مدة OTP | `otpService.gs` | 300 ثانية |
| مدة الجلسة | `sessionService.gs` | 24 ساعة |
| TTL كاش KPI | `useCases.gs` | 300 ثانية |
| حد المخزون المنخفض | `repositories.gs` | 10 |
| فترة مزامنة AppSheet | `Code.gs` | 5 دقائق |
