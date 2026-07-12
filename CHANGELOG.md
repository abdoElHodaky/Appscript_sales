# سجل التغييرات / Changelog

## [2.0.0] - 2026-06-27

### 🔐 Security (الأمان)
- إصلاح XSS vulnerability في Web App
- نقل Secrets إلى Script Properties
- إضافة Input Validation لجميع المدخلات
- إضافة Rate Limiting للإشعارات
- إضافة LockService لمنع Race Condition
- إضافة Authorization Checks للوظائف الحساسة

### ✨ Features (الميزات)
- إنشاء Error_Log ورقة مخصصة
- إضافة escapeHtml() utility
- إضافة isValidOrderId() validator
- إضافة isValidEmail() validator
- تحسين رسائل الأخطاء (Generic)

### 🧪 Testing (الاختبار)
- Shannon Pentest: 8 ثغرات مُكتشفة
- Code Review: 18 قضية مُكتشفة ومصلحة

## [1.0.0] - 2026-06-11

### 🎉 الإصدار الأول
- إنشاء نظام إدارة المبيعات الأساسي
- AppSheet + Google Sheets + Apps Script
- 5 حالات للطلب (جديد → قيد التنفيذ → تم الشحن → مكتمل → ملغي)
- 3 مستويات صلاحيات (Admin/Manager/Sales)
- Web App لتتبع الطلبات
- إشعارات بريد إلكتروني
