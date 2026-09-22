# المعمارية — Clean Architecture

## الطبقات الأربع

```
┌─────────────────────────────────────────────────────┐
│ Interface Layer (الواجهات)                          │
│ controllers · webHandlers · *Html · appSheetCtrl    │
├─────────────────────────────────────────────────────┤
│ Application Layer (التطبيق)                         │
│ useCases · dtos · appSheetUseCases                  │
├─────────────────────────────────────────────────────┤
│ Domain Layer (النطاق)                               │
│ entities — Order/Customer/SupportTicket             │
├─────────────────────────────────────────────────────┤
│ Infrastructure Layer (البنية التحتية)               │
│ repositories · searchEngine · alertServices · otp   │
│ appSheetSync                                        │
└─────────────────────────────────────────────────────┘
         ▲ تعتمد كل طبقة على ما داخلها فقط ▲
┌─────────────────────────────────────────────────────┐
│ Shared: dependencyContainer (Composition Root)      │
│         logger · security · helpers                 │
└─────────────────────────────────────────────────────┘
```

## مبادئ SOLID المطبقة

| المبدأ | التطبيق |
|---|---|
| **S** Single Responsibility | DashboardService → 3 Use Cases منفصلة |
| **O** Open/Closed | قاعدة تنبيه جديدة = `new AlertRule` دون لمس المحرك |
| **L** Liskov Substitution | Mocks تستبدل المستودعات دون تعديل Use Cases |
| **I** Interface Segregation | كل مستودع 4–5 دوال مركزة |
| **D** Dependency Inversion | Use Cases تستقبل `orderRepo` كتجريد |

## State Machines

```
الطلب:   جديد ──► قيد التنفيذ ──► تم الشحن ──► مكتمل
           │           │
           └────► ملغي ◄┘

التذكرة: OPEN ──► IN_PROGRESS ──► RESOLVED ──► CLOSED
           │            │             │
           └────────► CLOSED ◄────────┘
```

## الأمان

| الطبقة | الآلية |
|---|---|
| المدخلات | DTO Schema Validation |
| المخرجات | `Xss.escapeHtml` تلقائي |
| الجلسات | UUID عشوائي معتم، 24 ساعة |
| OTP | 5 دقائق، 3 محاولات، أرقام مُقنّعة |
| Rate Limiting | نافذة ثابتة على CacheService |
| RBAC | مصفوفة دور←صلاحية |
| التزامن | LockService حول الكتابة |

## الأداء

| التقنية | أين |
|---|---|
| Inverted Index | `SearchEngine` — بحث O(tokens) |
| كاش النتائج | بحث: 5 دقائق · KPI: 5 دقائق |
| Lazy Loading | مرجع الـ Sheet يُحل عند أول استخدام |
| Cooldown | التنبيهات لا تتكرر قبل انتهاء الفترة |
