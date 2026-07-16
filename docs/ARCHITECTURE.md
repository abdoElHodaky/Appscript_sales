# المعمارية — Clean Architecture

## الطبقات الأربع

```
┌─────────────────────────────────────────────────────┐
│ Interface Layer (الواجهات)                          │
│ controllers.gs · webHandlers.gs · *Html.gs          │
│ رفيعة تماماً: تحويل HTTP ↔ DTO، صفر منطق أعمال     │
├─────────────────────────────────────────────────────┤
│ Application Layer (التطبيق)                         │
│ useCases.gs (10) · dtos.gs (8)                      │
│ تنسيق الكيانات والبنية التحتية عبر واجهات مُحقونة  │
├─────────────────────────────────────────────────────┤
│ Domain Layer (النطاق)                               │
│ entities.gs — Order/Customer/SupportTicket          │
│ منطق أعمال نقي + State Machines، صفر اعتماديات     │
├─────────────────────────────────────────────────────┤
│ Infrastructure Layer (البنية التحتية)               │
│ repositories · searchEngine · alertServices · otp   │
│ كود خاص بـ Apps Script (Sheets/Cache/Lock/Mail)    │
└─────────────────────────────────────────────────────┘
         ▲ تعتمد كل طبقة على ما داخلها فقط ▲
┌─────────────────────────────────────────────────────┐
│ Shared: dependencyContainer (Composition Root)      │
│         logger · security · helpers                 │
└─────────────────────────────────────────────────────┘
```

## قاعدة الاعتماد

- **Domain** لا يستورد شيئاً — لا يعرف حتى أن Google Sheets موجود.
- **Application** يعتمد على Domain + واجهات (بشائر) البنية التحتية عبر Constructor Injection.
- **Infrastructure** يطبّق تلك الواجهات فعلياً (Liskov Substitution: MockRepository يحل محل SheetRepository في الاختبارات).
- **Interface** يحوّل الطلبات إلى DTOs ويستدعي Use Cases فقط.
- **DependencyContainer** هو المكان الوحيد الذي يعرف التوصيلات (Composition Root).

## مسار الطلب

```
HTTP ──► doGet/doPost (Code.gs)
      ──► Router.dispatch_ (webHandlers.gs)
      ──► Controller (controllers.gs)
            │ 1. Rbac.assert (security.gs)
            │ 2. new DTO(body) — تحقق مخطط (dtos.gs)
            ▼
      ──► UseCase.execute(dto) (useCases.gs)
            │ تنسيق الكيانات + المستودعات + الأحداث
            ▼
      ──► Repository (repositories.gs) ──► Google Sheets
            │ LockService حول كل كتابة
            ▼
      ──► EventBus.publish('order.created')
      ◄── غلاف موحد {success, data|error}
```

## مبادئ SOLID المطبقة

| المبدأ | التطبيق |
|---|---|
| **S** Single Responsibility | DashboardService القديم (272 سطر) → 3 Use Cases منفصلة (KPIs/Charts/Tables)، كل دالة < 50 سطر |
| **O** Open/Closed | قاعدة تنبيه جديدة = `new AlertRule` في `defaultAlertRules()` دون لمس المحرك |
| **L** Liskov Substitution | الاختبارات تستبدل المستودعات بـ Mocks دون أي تعديل على Use Cases |
| **I** Interface Segregation | كل مستودع يعرض 4–5 دوال مركزة فقط |
| **D** Dependency Inversion | Use Cases تستقبل `orderRepo` كتجريد، لا `SpreadsheetApp` |

## State Machines

```
الطلب:   جديد ──► قيد التنفيذ ──► تم الشحن ──► مكتمل
           │           │
           └────► ملغي ◄┘            (مكتمل/ملغي: نهائي)

التذكرة: OPEN ──► IN_PROGRESS ──► RESOLVED ──► CLOSED
           │            │             │
           └────────► CLOSED ◄────────┘
           (RESOLVED يمكن أن يعود IN_PROGRESS — إعادة فتح)
```

أي انتقال غير قانوني يرمي `DomainError('INVALID_TRANSITION')` ← `HTTP 422`.

## الأمان

| الطبقة | الآلية |
|---|---|
| المدخلات | DTO Schema Validation — لا بيانات خام تعبر الحدود |
| المخرجات | `Xss.escapeHtml` تلقائي + الواجهات تستخدم `textContent` فقط |
| الجلسات | UUID عشوائي معتم، 24 ساعة، حذف عند الخروج |
| OTP | 5 دقائق، 3 محاولات تحقق، 3 إصدارات/5 دقائق، أرقام مُقنّعة في السجلات |
| Rate Limiting | نافذة ثابتة على CacheService (بحث 30/5د، OTP 3/5د) |
| RBAC | مصفوفة دور←صلاحية، فحص في المتحكم قبل أي Use Case |
| التزامن | LockService حول الكتابة للجداول + Idempotency للتنبيهات |

## الأداء

| التقنية | أين |
|---|---|
| Inverted Index | `SearchEngine` — بحث O(tokens) بدل مسح كامل |
| كاش النتائج | بحث: MD5(query) كمفتاح، 5 دقائق · KPI: لكل (range+role)، 5 دقائق |
| Lazy Loading | مرجع الـ Sheet لا يُحل إلا عند أول استخدام |
| Cooldown | التنبيهات لا تتكرر قبل انتهاء فترة الهدوء |

## التوسعة

**إضافة ميزة جديدة** (مثال: الفواتير):

1. `domain/entities.gs` ← كيان `Invoice` + State Machine إن لزم
2. `application/dtos.gs` ← `CreateInvoiceDTO`
3. `application/useCases.gs` ← `CreateInvoiceUseCase`
4. `infrastructure/repositories.gs` ← `InvoiceRepository extends BaseRepository`
5. `interfaces/controllers.gs` ← دالة رفيعة في متحكم
6. `webHandlers.gs` ← سطر في `dispatch_`
7. `dependencyContainer.gs` ← getter للتوصيل
8. `tests/unit-tests.gs` ← اختبارات عبر Mocks

**بدون تعديل أي سطر موجود** (Open/Closed).
