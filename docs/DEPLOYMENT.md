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
# من داخل مجلد المشروع بعد فك الضغط
clasp create --title "Sales System v5" --type sheets
```

ينشئ هذا `.clasp.json` يحوي `scriptId`. إن كان لديك مشروع موجود:

```json
// .clasp.json
{ "scriptId": "YOUR_SCRIPT_ID", "rootDir": "." }
```

## 3) رفع الملفات

```bash
clasp push
```

> ملاحظة: clasp يدعم المجلدات المتداخلة — ستظهر الملفات في المحرر
> بأسماء مثل `src/domain/entities`.

## 4) التهيئة الأولى

```bash
clasp run initializeSystem
```

تقوم بـ:
- إنشاء الأوراق: `orders`, `customers`, `products`, `support_tickets`
- بذر بيانات تجريبية (4 عملاء، 4 منتجات، 40 طلب موزعة على 30 يوم)
- تثبيت Trigger زمني: `runAlertEvaluation` كل ساعة

لإعادة البذر: احذف محتوى ورقة `orders` ثم أعد التشغيل (التهيئة idempotent).

## 5) الاختبارات

```bash
clasp run runTests
# → { total: 26, passed: 26, failed: 0 }
```

## 6) النشر كـ Web App

```bash
clasp deploy -d "v5.0 Production"
```

أو من المحرر: **Deploy → New deployment → Web app**:
- Execute as: **Me**
- Who has access: حسب الحاجة (`Anyone` للبوابة العامة)

الروابط الناتجة:

| الصفحة | الرابط |
|---|---|
| لوحة التحكم | `.../exec?page=dashboard` |
| بوابة العملاء | `.../exec?page=portal` |
| API JSON | `.../exec?action=dashboard&dateRange=THIS_MONTH` |

## 7) ما بعد النشر

### ربط SMS لإرسال OTP (إنتاج حقيقي)

حالياً يعمل OTP بوضع التطوير (`devCode` يُرجع في الاستجابة). للإنتاج:

1. في `otpService.gs` دالة `issue()` أضف إرسال SMS عبر مزودك:

```javascript
UrlFetchApp.fetch('https://sms-provider.example/send', {
  method: 'post',
  contentType: 'application/json',
  payload: JSON.stringify({ to: phone, text: 'رمز الدخول: ' + code })
});
```

2. احذف `devCode` من الاستجابة.

### قفل لوحة التحكم

الوصول الحالي يعتمد على `userRole` المرسل. للإنتاج اربطه بـ
`Session.getActiveUser().getEmail()` + قائمة بيضاء في `security.gs`.

### النطاقات (Scopes) المستخدمة

موجودة في `appsscript.json` — أضف نطاقات المزود الخارجي عند ربط SMS.

## استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `Script function not found` | تأكد أن `clasp push` رفع كل الملفات، وأعد النشر |
| صفحة بيضاء | افتح Executions في المحرر — غالباً خطأ في صلاحيات النشر |
| `Spreadsheet not found` | شغّل `initializeSystem` من المحرر مرة واحدة يدوياً لتفويض الصلاحيات |
| التنبيهات لا تصل | تحقق من Triggers في المحرر، ومن بريد المالك الفعلي للسكربت |
| `Rate limited` على البحث | الحد 30 بحث/5 دقائق لكل مستخدم — ارفعه في `SearchOrdersUseCase` |

## التحديثات اللاحقة

```bash
# تعديل الكود ثم:
clasp push
clasp deploy -d "v5.1 description"   # نسخة جديدة
# أو تحديث النشر الحالي من المحرر: Deploy → Manage deployments → Edit
```
