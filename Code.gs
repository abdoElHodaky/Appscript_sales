/**
 * ============================================================
 * Entry Point — Code.gs
 * ------------------------------------------------------------
 * Apps Script global entry points + system initialisation.
 * All HTTP traffic flows: doGet/doPost → Router → Controllers.
 * ============================================================
 */

/**
 * Web app GET — serves pages (?page=dashboard|portal) and
 * JSON API actions (?action=...).
 * @param {Object} e Apps Script event.
 * @return {HtmlOutput|TextOutput}
 */
function doGet(e) {
  return container().getRouter().routeGet(e);
}

/**
 * Web app POST — JSON body with an `action` field.
 * @param {Object} e Apps Script event.
 * @return {TextOutput}
 */
function doPost(e) {
  return container().getRouter().routePost(e);
}

/**
 * One-time setup: creates sheets, seeds demo data, installs the
 * alert trigger. Safe to re-run (idempotent).
 * @return {string} Summary of what was done.
 */
function initializeSystem() {
  const c = container();
  const logger = c.getLogger();
  logger.info('initialise: start');

  // 1. Touch repositories → sheets get created with headers.
  c.getOrderRepository().getSheet_;
  seedIfEmpty_(c);

  // 2. Install hourly alert trigger (remove duplicates first).
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runAlertEvaluation') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('runAlertEvaluation')
    .timeBased().everyHours(1).create();

  logger.info('initialise: done');
  return 'تمت تهيئة النظام بنجاح ✅';
}

/**
 * Time-driven trigger handler: evaluates the 6 alert rules.
 * Wired by initializeSystem(); can also be run manually.
 * @return {Object} Evaluation summary.
 */
function runAlertEvaluation() {
  return container().getEvaluateAlertsUseCase().execute();
}

/**
 * Test runner entry (also exposed for `clasp run`).
 * @return {Object} Test summary from unit-tests.gs.
 */
function runTests() {
  return TestRunner.runAll();
}

/* ------------------------------------------------------------
 * Seed data — only when the orders sheet is empty
 * ----------------------------------------------------------*/

/**
 * @private
 * @param {DependencyContainer} c
 */
function seedIfEmpty_(c) {
  const orderRepo = c.getOrderRepository();
  if (orderRepo.findAll().length > 0) return;

  const customerRepo = c.getCustomerRepository();
  const productRepo = c.getProductRepository();
  const logger = c.getLogger();

  // --- customers ---
  const customers = [
    new Customer({ id: 'CUST-001', name: 'أحمد العتيبي', phone: '0501111111', city: 'الرياض', email: 'ahmad@example.com' }),
    new Customer({ id: 'CUST-002', name: 'سارة القحطاني', phone: '0502222222', city: 'جدة' }),
    new Customer({ id: 'CUST-003', name: 'محمد الشمري', phone: '0503333333', city: 'الدمام' }),
    new Customer({ id: 'CUST-004', name: 'نورة الدوسري', phone: '0504444444', city: 'الرياض' })
  ];
  customers.forEach(function (cu) { customerRepo.save(cu); });

  // --- products ---
  [
    { id: 'PRD-001', name: 'لابتوب HP', sku: 'LPT-HP-15', stock: 25, price: 3200 },
    { id: 'PRD-002', name: 'ماوس لاسلكي', sku: 'ACC-MSE-W1', stock: 8, price: 89 },
    { id: 'PRD-003', name: 'شاشة 27 بوصة', sku: 'MON-27-4K', stock: 15, price: 1450 },
    { id: 'PRD-004', name: 'لوحة مفاتيح ميكانيكية', sku: 'KBD-MCH-AR', stock: 5, price: 420 }
  ].forEach(function (p) { productRepo.save(p); });

  // --- orders spread over the last 30 days ---
  const createOrder = c.getCreateOrderUseCase();
  const statuses = [OrderStatus.COMPLETED, OrderStatus.COMPLETED, OrderStatus.COMPLETED,
    OrderStatus.IN_PROGRESS, OrderStatus.NEW, OrderStatus.SHIPPED, OrderStatus.CANCELLED];
  const catalog = [
    { productId: 'PRD-001', productName: 'لابتوب HP', unitPrice: 3200 },
    { productId: 'PRD-002', productName: 'ماوس لاسلكي', unitPrice: 89 },
    { productId: 'PRD-003', productName: 'شاشة 27 بوصة', unitPrice: 1450 },
    { productId: 'PRD-004', productName: 'لوحة مفاتيح ميكانيكية', unitPrice: 420 }
  ];

  for (let i = 0; i < 40; i++) {
    const cu = customers[i % customers.length];
    const item = catalog[i % catalog.length];
    const qty = 1 + (i % 3);
    const daysAgo = i % 30;

    const order = createOrder.execute(new CreateOrderDTO({
      customerId: cu.id,
      customerName: cu.name,
      city: cu.city,
      items: [{ productId: item.productId, productName: item.productName, quantity: qty, unitPrice: item.unitPrice }]
    }));

    // Backdate + push through a realistic status for demo charts.
    const past = new Date();
    past.setDate(past.getDate() - daysAgo);
    past.setHours(i % 24, 0, 0, 0);
    order.createdAt = past;
    order.updatedAt = past;
    const target = statuses[i % statuses.length];
    try {
      // walk the state machine legally toward the target
      while (order.status !== target) {
        if (order.status === OrderStatus.NEW && target !== OrderStatus.NEW) {
          order.transitionTo(target === OrderStatus.CANCELLED ? OrderStatus.CANCELLED : OrderStatus.IN_PROGRESS);
        } else if (order.status === OrderStatus.IN_PROGRESS) {
          order.transitionTo(target === OrderStatus.CANCELLED ? OrderStatus.CANCELLED : OrderStatus.SHIPPED);
        } else if (order.status === OrderStatus.SHIPPED) {
          order.transitionTo(OrderStatus.COMPLETED);
        } else {
          break;
        }
      }
    } catch (err) {
      logger.warn('seed transition skipped', { id: order.id });
    }
    orderRepo.save(order);
  }
  logger.info('seed complete', { customers: customers.length, orders: 40 });
}
