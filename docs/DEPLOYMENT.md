# دليل النشر — Deployment

## المتطلبات

- حساب Google
- Node.js 16+ (لأداة clasp)
- جدول بيانات Google جديد أو موجود

## 1) تثبيت clasp وتسجيل الدخول

```bash
npm install -g @google/clasp
clasp login
```

فعّل Apps Script API من: https://script.google.com/home/usersettings

## 2) إنشاء المشروع وربطه بجدول بيانات

```bash
clasp create --title "Sales System v5.1" --type sheets
```

## 3) رفع الملفات

```bash
clasp push
```

## 4) التهيئة الأولى

```bash
clasp run initializeSystem
```

آمنة لإعادة التشغيل — تزيل الترiggers المكررة وتتجنب تسجيل listeners مكررة. تقوم بـ:
- إنشاء الأوراق: `orders`, `customers`, `products`, `support_tickets`
- إنشاء أوراق AppSheet: `app_orders`, `app_customers`
- بذر بيانات تجريبية (4 عملاء، 4 منتجات، 40 طلب)
- تثبيت Triggers: `runAlertEvaluation` كل ساعة + `runAppSheetSync` كل 5 دقائق

## 5) الاختبارات

```bash
clasp run runTests
# → { total: 30, passed: 30, failed: 0 }
```

## 6) النشر كـ Web App

```bash
clasp deploy -d "v5.1 Production"
```

أو من المحرر: **Deploy → New deployment → Web app**:
- Execute as: **Me**
- Who has access: حسب الحاجة

## 7) ربط AppSheet

1. أنشئ تطبيق AppSheet جديد
2. اربطه بجدول `app_orders` (وليس `orders`)
3. عمود `sync_source` يميّز التعديلات الواردة
4. عند تعديل حالة طلب في AppSheet:
   - اترك `sync_source` فارغاً أو اكتب `appsheet`
   - Trigger كل 5 دقائق يقرأ ويطبق التغييرات

## استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `Script function not found` | تأكد من `clasp push` وأعد النشر |
| صفحة بيضاء | افتح Executions في المحرر |
| `Spreadsheet not found` | شغّل `initializeSystem` يدوياً |
| التنبيهات لا تصل | تحقق من Triggers وبريد المالك |
| `Rate limited` | الحد 30 بحث/5 دقائق |
| AppSheet لا يتزامن | تأكد من أن `sync_source` ليس `system` |

## التحديثات اللاحقة

```bash
clasp push
clasp deploy -d "v5.2 description"
```
