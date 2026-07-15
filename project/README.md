# نظام إدارة المبيعات والطلبات
# Sales Order Management System

<p align="center">
  <img src="assets/diagrams/system-architecture.png" alt="System Architecture" width="800"/>
</p>

<p align="center">
  <a href="https://github.com/google/clasp">
    <img src="https://img.shields.io/badge/built%20with-clasp-4285f4.svg" alt="clasp"/>
  </a>
  <a href="https://developers.google.com/apps-script">
    <img src="https://img.shields.io/badge/Google-Apps%20Script-green" alt="Apps Script"/>
  </a>
  <a href="https://www.appsheet.com">
    <img src="https://img.shields.io/badge/AppSheet-No--Code-blue" alt="AppSheet"/>
  </a>
  <img src="https://img.shields.io/badge/version-2.0.0-brightgreen" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License"/>
</p>

## 🌐 اللغات / Languages

- [العربية](#عربي)
- [English](#english)

---

<h2 id="عربي">🇦🇪 العربية</h2>

### 📋 نظرة عامة

نظام متكامل لإدارة المبيعات والطلبات يعتمد على **Google Workspace**، يتكون من:
- **AppSheet** - واجهة المستخدم (Web + Mobile)
- **Google Apps Script** - المنطق والأتمتة
- **Google Sheets** - قاعدة البيانات

### ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| 📱 واجهة الجوال | تصميم متجاوب يعمل على أي جهاز |
| 🔐 أمان مؤسسي | صلاحيات متعددة + تشفير + حماية من XSS |
| 📊 لوحة تحكم | إحصائيات فورية + رسوم بيانية |
| 🔔 إشعارات تلقائية | بريد + WhatsApp عند تغيير الحالة |
| 🔍 بحث سريع | فلترة متقدمة حسب العميل/الحالة/التاريخ |
| 📦 متابعة المخزون | تحديث تلقائي عند إتمام الطلب |

### 🚀 البدء السريع

```bash
# 1. تثبيت clasp
npm install -g @google/clasp

# 2. تسجيل الدخول
clasp login

# 3. استنساخ المشروع
clasp clone-script "YOUR_SCRIPT_ID"

# 4. تثبيت الاعتماديات
npm install

# 5. النشر
clasp push
```

### 📁 هيكل المشروع

```
sales-order-system/
├── src/
│   ├── triggers/          # Triggers (onEdit, Time-driven)
│   ├── services/          # Business logic (orders, inventory, notifications)
│   ├── utils/             # Utilities (validation, security, helpers)
│   └── web/               # Web App (customer portal)
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── docs/
│   ├── ar/                # Documentation (Arabic)
│   └── en/                # Documentation (English)
├── assets/
│   ├── diagrams/          # System diagrams
│   └── screenshots/       # UI screenshots
├── scripts/
│   ├── setup.sh           # Setup script
│   └── deploy.sh          # Deployment script
├── .github/
│   ├── workflows/           # CI/CD workflows
│   └── ISSUE_TEMPLATE/    # Issue templates
├── appsscript.json        # Apps Script manifest
├── .clasp.json            # Clasp configuration
├── .claspignore           # Files to ignore
└── README.md              # This file
```

### 🔐 الأمان

تم اختبار النظام باستخدام:
- **Shannon** - اختبار اختراق ذاتي (96% نسبة نجاح)
- **Code Reviewer** - مراجعة كود آلية (18 قضية مُكتشفة ومصلحة)

التقارير متاحة في `docs/security/`.

### 📄 الترخيص

هذا المشروع مرخص بموجب [MIT License](LICENSE).

---

<h2 id="english">🇺🇸 English</h2>

### 📋 Overview

A comprehensive sales and order management system built on **Google Workspace**, consisting of:
- **AppSheet** - User interface (Web + Mobile)
- **Google Apps Script** - Business logic & automation
- **Google Sheets** - Database

### ✨ Features

| Feature | Description |
|---------|-------------|
| 📱 Mobile UI | Responsive design for any device |
| 🔐 Enterprise Security | Multi-role permissions + encryption + XSS protection |
| 📊 Dashboard | Real-time statistics & charts |
| 🔔 Auto Notifications | Email + WhatsApp on status change |
| 🔍 Quick Search | Advanced filtering by customer/status/date |
| 📦 Inventory Tracking | Auto-update on order completion |

### 🚀 Quick Start

```bash
# 1. Install clasp
npm install -g @google/clasp

# 2. Login
clasp login

# 3. Clone project
clasp clone-script "YOUR_SCRIPT_ID"

# 4. Install dependencies
npm install

# 5. Deploy
clasp push
```

### 📁 Project Structure

(See Arabic section above for full structure)

### 🔐 Security

Tested with:
- **Shannon** - Autonomous pentesting (96% success rate)
- **Code Reviewer** - Automated code review (18 issues found & fixed)

Reports available in `docs/security/`.

### 📄 License

This project is licensed under the [MIT License](LICENSE).

---

### 🤝 المساهمة / Contributing

نرحب بالمساهمات! راجع [CONTRIBUTING.md](CONTRIBUTING.md).

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

### 📧 التواصل / Contact

- Email: YOUR_EMAIL@company.com
- Issues: [GitHub Issues](../../issues)
- Discussions: [GitHub Discussions](../../discussions)
