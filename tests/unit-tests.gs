/**
 * ============================================================
 * Unit Tests — pure-domain & use-case tests with mocks  [v5.1]
 * ------------------------------------------------------------
 * Added:
 *   - MockProductRepository
 *   - MockTicketRepository
 *   - Stock validation tests
 *   - AppSheet sync round-trip tests
 * ============================================================
 */

const TestRunner = {
  results: [],

  test(name, fn) {
    try {
      fn();
      this.results.push({ name: name, passed: true });
    } catch (err) {
      this.results.push({ name: name, passed: false, error: String(err) });
    }
  },

  assertEqual(actual, expected) {
    if (actual !== expected) {
      throw new Error('expected [' + expected + '] but got [' + actual + ']');
    }
  },

  assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'expected condition to be true');
  },

  assertThrows(fn, code) {
    try {
      fn();
    } catch (err) {
      if (code && err.code !== code) {
        throw new Error('threw but with code [' + err.code + '] not [' + code + ']');
      }
      return;
    }
    throw new Error('expected function to throw');
  },

  runAll() {
    this.results = [];
    registerAllTests(this);
    const failed = this.results.filter(function (r) { return !r.passed; });
    return {
      total: this.results.length,
      passed: this.results.length - failed.length,
      failed: failed.length,
      details: this.results
    };
  }
};

class MockOrderRepository {
  constructor(seed) { this.store = (seed || []).slice(); }
  findAll() { return this.store.slice(); }
  findById(id) {
    const hit = this.store.filter(function (o) { return o.id === id; });
    return hit.length ? hit[0] : null;
  }
  findByCustomerId(cid) {
    return this.store.filter(function (o) { return o.customerId === cid; });
  }
  save(order) {
    this.store = this.store.filter(function (o) { return o.id !== order.id; });
    this.store.push(order);
    return order;
  }

  deleteById(id) {
    this.store = this.store.filter(function (o) { return o.id !== id; });
    return true;
  }
}

class MockCustomerRepository {
  constructor(seed) { this.store = (seed || []).slice(); }
  findAll() { return this.store.slice(); }
  findById(id) {
    const hit = this.store.filter(function (c) { return c.id === id; });
    return hit.length ? hit[0] : null;
  }
  findByPhone(phone) {
    const target = String(phone).replace(/\s+/g, '');
    const hit = this.store.filter(function (c) {
      return c.phone.replace(/\s+/g, '') === target;
    });
    return hit.length ? hit[0] : null;
  }
  save(c) {
    this.store = this.store.filter(function (x) { return x.id !== c.id; });
    this.store.push(c);
    return c;
  }
}

class MockProductRepository {
  constructor(seed) { this.store = (seed || []).slice(); }
  findAll() { return this.store.slice(); }
  findById(id) {
    const hit = this.store.filter(function (p) { return p.id === id; });
    return hit.length ? hit[0] : null;
  }
  save(p) {
    this.store = this.store.filter(function (x) { return x.id !== p.id; });
    this.store.push(p);
    return p;
  }
}

class MockTicketRepository {
  constructor(seed) { this.store = (seed || []).slice(); }
  findAll() { return this.store.slice(); }
  findById(id) {
    const hit = this.store.filter(function (t) { return t.id === id; });
    return hit.length ? hit[0] : null;
  }
  findByCustomerId(cid) {
    return this.store.filter(function (t) { return t.customerId === cid; });
  }
  save(t) {
    this.store = this.store.filter(function (x) { return x.id !== t.id; });
    this.store.push(t);
    return t;
  }
}

class MockCache {
  constructor() { this.map = {}; this.expiry = {}; }
  get(key) {
    if (this.expiry[key] && Date.now() > this.expiry[key]) {
      delete this.map[key];
      return null;
    }
    return this.map[key] || null;
  }
  put(key, value, ttlSec) {
    this.map[key] = String(value);
    this.expiry[key] = Date.now() + (ttlSec || 600) * 1000;
  }
  remove(key) { delete this.map[key]; delete this.expiry[key]; }
}

class MockEventBus {
  constructor() { this.published = []; }
  subscribe() {}
  publish(name, payload) { this.published.push({ name: name, payload: payload }); }
}

class MockLogger {
  constructor() { this.lines = []; }
  debug(m) { this.lines.push(m); }
  info(m) { this.lines.push(m); }
  warn(m) { this.lines.push(m); }
  error(m) { this.lines.push(m); }
  startTimer() {}
  endTimer() { return 0; }
}

function fixtureOrder_(id, status, total, customerId) {
  return new Order({
    id: id || 'ORD-T1',
    customerId: customerId || 'CUST-T1',
    customerName: 'عميل اختبار',
    items: [new OrderItem({ productId: 'P1', productName: 'منتج', quantity: 1, unitPrice: total || 100 })],
    status: status || OrderStatus.NEW
  });
}

function registerAllTests(T) {

  T.test('Order: totals computed from items', function () {
    const o = new Order({
      id: 'O1', customerId: 'C1', customerName: 'اختبار',
      items: [
        new OrderItem({ productId: 'P1', productName: 'أ', quantity: 2, unitPrice: 50 }),
        new OrderItem({ productId: 'P2', productName: 'ب', quantity: 1, unitPrice: 30 })
      ]
    });
    T.assertEqual(o.getTotal(), 130);
  });

  T.test('Order: legal transition NEW → IN_PROGRESS', function () {
    const o = fixtureOrder_();
    o.transitionTo(OrderStatus.IN_PROGRESS);
    T.assertEqual(o.status, OrderStatus.IN_PROGRESS);
  });

  T.test('Order: illegal transition COMPLETED → NEW blocked', function () {
    const o = fixtureOrder_('O2', OrderStatus.COMPLETED);
    T.assertThrows(function () { o.transitionTo(OrderStatus.NEW); }, 'INVALID_TRANSITION');
  });

  T.test('Order: terminal states have no exits', function () {
    T.assertTrue(OrderStateMachine.isTerminal(OrderStatus.COMPLETED));
    T.assertTrue(OrderStateMachine.isTerminal(OrderStatus.CANCELLED));
  });

  T.test('OrderItem: rejects zero quantity', function () {
    T.assertThrows(function () {
      new OrderItem({ productId: 'P', productName: 'x', quantity: 0, unitPrice: 10 });
    }, 'ITEM_QTY_INVALID');
  });

  T.test('SupportTicket: state machine OPEN → CLOSED', function () {
    const t = new SupportTicket({ id: 'T1', customerId: 'C1', subject: 'مشكلة اختبار' });
    T.assertEqual(t.status, TicketStatus.OPEN);
    t.transitionTo(TicketStatus.CLOSED);
    T.assertEqual(t.status, TicketStatus.CLOSED);
  });

  T.test('SupportTicket: CLOSED is terminal', function () {
    const t = new SupportTicket({ id: 'T2', customerId: 'C1', subject: 'مشكلة اختبار', status: TicketStatus.CLOSED });
    T.assertThrows(function () { t.transitionTo(TicketStatus.OPEN); }, 'INVALID_TICKET_TRANSITION');
  });

  T.test('CreateOrderDTO: valid payload passes', function () {
    const dto = new CreateOrderDTO({
      customerId: 'C1', customerName: 'اختبار',
      items: [{ productId: 'P1', productName: 'أ', quantity: 1, unitPrice: 10 }]
    });
    T.assertTrue(dto.isValid(), 'DTO should be valid: ' + dto.getErrors().join(','));
  });

  T.test('CreateOrderDTO: missing items fails', function () {
    const dto = new CreateOrderDTO({ customerId: 'C1', customerName: 'اختبار', items: [] });
    T.assertTrue(!dto.isValid());
  });

  T.test('UpdateOrderStatusDTO: rejects unknown status', function () {
    const dto = new UpdateOrderStatusDTO({ orderId: 'O1', newStatus: 'حالة_وهمية' });
    T.assertTrue(!dto.isValid());
  });

  T.test('VerifyOtpDTO: enforces 6-digit code', function () {
    const dto = new VerifyOtpDTO({ phone: '0501234567', code: '12ab' });
    T.assertTrue(!dto.isValid());
  });

  T.test('CreateOrderUseCase: persists order + updates customer + publishes', function () {
    const orderRepo = new MockOrderRepository();
    const customer = new Customer({ id: 'C1', name: 'اختبار', phone: '0501234567' });
    const customerRepo = new MockCustomerRepository([customer]);
    const productRepo = new MockProductRepository([
      { id: 'P1', name: 'منتج', sku: 'SKU1', stock: 100, price: 100 }
    ]);
    const bus = new MockEventBus();
    const uc = new CreateOrderUseCase(orderRepo, customerRepo, productRepo, bus, new MockLogger());

    const order = uc.execute(new CreateOrderDTO({
      customerId: 'C1', customerName: 'اختبار',
      items: [{ productId: 'P1', productName: 'أ', quantity: 2, unitPrice: 100 }]
    }));
    T.assertTrue(order.id.indexOf('ORD-') === 0);
    T.assertEqual(orderRepo.findAll().length, 1);
    T.assertEqual(customerRepo.findById('C1').totalSpent, 200);
    T.assertEqual(bus.published.length, 1);
    T.assertEqual(bus.published[0].name, 'order.created');
  });

  T.test('CreateOrderUseCase: rejects out-of-stock item', function () {
    const orderRepo = new MockOrderRepository();
    const customer = new Customer({ id: 'C1', name: 'اختبار', phone: '0501234567' });
    const customerRepo = new MockCustomerRepository([customer]);
    const productRepo = new MockProductRepository([
      { id: 'P1', name: 'منتج', sku: 'SKU1', stock: 2, price: 100 }
    ]);
    const bus = new MockEventBus();
    const uc = new CreateOrderUseCase(orderRepo, customerRepo, productRepo, bus, new MockLogger());

    uc.execute(new CreateOrderDTO({
      customerId: 'C1', customerName: 'اختبار',
      items: [{ productId: 'P1', productName: 'منتج', quantity: 2, unitPrice: 100 }]
    }));
    T.assertEqual(productRepo.findById('P1').stock, 0);

    T.assertThrows(function () {
      uc.execute(new CreateOrderDTO({
        customerId: 'C1', customerName: 'اختبار',
        items: [{ productId: 'P1', productName: 'منتج', quantity: 5, unitPrice: 100 }]
      }));
    }, 'INSUFFICIENT_STOCK');
  });

  T.test('CreateOrderUseCase: invalid DTO rejected', function () {
    const uc = new CreateOrderUseCase(
      new MockOrderRepository(), new MockCustomerRepository(),
      new MockProductRepository(), new MockEventBus(), new MockLogger()
    );
    T.assertThrows(function () { uc.execute(new CreateOrderDTO({})); }, 'VALIDATION');
  });

  T.test('UpdateOrderStatusUseCase: walks NEW → SHIPPED legally', function () {
    const repo = new MockOrderRepository([fixtureOrder_('O9')]);
    const uc = new UpdateOrderStatusUseCase(repo, new MockProductRepository(), new MockEventBus(), new MockLogger());
    uc.execute(new UpdateOrderStatusDTO({ orderId: 'O9', newStatus: OrderStatus.IN_PROGRESS }));
    const done = uc.execute(new UpdateOrderStatusDTO({ orderId: 'O9', newStatus: OrderStatus.SHIPPED }));
    T.assertEqual(done.status, OrderStatus.SHIPPED);
  });

  T.test('UpdateOrderStatusUseCase: 404 on unknown order', function () {
    const uc = new UpdateOrderStatusUseCase(
      new MockOrderRepository(), new MockProductRepository(), new MockEventBus(), new MockLogger()
    );
    T.assertThrows(function () {
      uc.execute(new UpdateOrderStatusDTO({ orderId: 'NOPE', newStatus: OrderStatus.IN_PROGRESS }));
    }, 'ORDER_NOT_FOUND');
  });

  T.test('OtpService: issue + verify happy path', function () {
    const cache = new MockCache();
    const limiter = new RateLimiter(cache, new MockLogger());
    const otp = new OtpService(cache, limiter, new MockLogger());
    const issued = otp.issue('0501234567');
    T.assertTrue(issued.sent);
    T.assertTrue(otp.verify('0501234567', issued.devCode));
  });

  T.test('OtpService: wrong code fails, 3 misses lock out', function () {
    const cache = new MockCache();
    const limiter = new RateLimiter(cache, new MockLogger());
    const otp = new OtpService(cache, limiter, new MockLogger());
    otp.issue('0509999999');
    T.assertTrue(!otp.verify('0509999999', '000000'));
    T.assertTrue(!otp.verify('0509999999', '000000'));
    T.assertTrue(!otp.verify('0509999999', '000000'));
    T.assertThrows(function () { otp.verify('0509999999', '000000'); }, 'OTP_LOCKED');
  });

  T.test('OtpService: rate limit on issuance', function () {
    const cache = new MockCache();
    const limiter = new RateLimiter(cache, new MockLogger());
    const otp = new OtpService(cache, limiter, new MockLogger());
    otp.issue('0507777777');
    otp.issue('0507777777');
    otp.issue('0507777777');
    T.assertThrows(function () { otp.issue('0507777777'); }, 'RATE_LIMITED');
  });

  T.test('SessionService: create → resolve → destroy', function () {
    const svc = new SessionService(new MockCache(), new MockLogger());
    const s = svc.create('CUST-1');
    T.assertEqual(svc.resolve(s.token), 'CUST-1');
    svc.destroy(s.token);
    T.assertThrows(function () { svc.resolve(s.token); }, 'SESSION_EXPIRED');
  });

  T.test('Rbac: SALES cannot cancel orders', function () {
    T.assertTrue(!Rbac.allows(Role.SALES, 'order.cancel'));
    T.assertThrows(function () { Rbac.assert(Role.SALES, 'order.cancel'); }, 'FORBIDDEN');
  });

  T.test('Rbac: ADMIN can manage alerts', function () {
    T.assertTrue(Rbac.allows(Role.ADMIN, 'alert.manage'));
  });

  T.test('Xss: escapes markup and strips handlers', function () {
    T.assertEqual(Xss.escapeHtml('<b>hi</b>'), '&lt;b&gt;hi&lt;/b&gt;');
    T.assertEqual(Xss.sanitizeInput('<script>alert(1)</script>'), 'scriptalert(1)/script');
    T.assertTrue(Xss.sanitizeInput('<x>').indexOf('<') === -1);
    T.assertTrue(Xss.sanitizeInput('x onclick=hack()').indexOf('onclick') === -1);
  });

  T.test('RateLimiter: blocks after maxHits', function () {
    const limiter = new RateLimiter(new MockCache(), new MockLogger());
    limiter.assertWithinLimit('k', 2, 60);
    limiter.assertWithinLimit('k', 2, 60);
    T.assertThrows(function () { limiter.assertWithinLimit('k', 2, 60); }, 'RATE_LIMITED');
  });

  T.test('QueryBuilder: rejects unsupported filter field', function () {
    T.assertThrows(function () {
      new QueryBuilder().filter('password', 'x');
    }, 'FILTER_UNSUPPORTED');
  });

  T.test('QueryBuilder: builds frozen paginated query', function () {
    const q = new QueryBuilder().text('بحث').sort('total', 'asc').paginate(2, 10).build();
    T.assertEqual(q.page, 2);
    T.assertEqual(q.pageSize, 10);
    T.assertEqual(q.sortBy, 'total');
  });

  T.test('Customer: registerOrder accumulates aggregates', function () {
    const c = new Customer({ id: 'C9', name: 'اختبار', phone: '0501234567' });
    c.registerOrder(150);
    c.registerOrder(50);
    T.assertEqual(c.totalOrders, 2);
    T.assertEqual(c.totalSpent, 200);
  });

  T.test('UpdateOrderStatusUseCase: restores stock on cancellation', function () {
    const orderRepo = new MockOrderRepository();
    const productRepo = new MockProductRepository([
      { id: 'P1', name: 'منتج', sku: 'SKU1', stock: 10, price: 100 }
    ]);
    const bus = new MockEventBus();
    const createUc = new CreateOrderUseCase(orderRepo, new MockCustomerRepository([
      new Customer({ id: 'C1', name: 'اختبار', phone: '0501234567' })
    ]), productRepo, bus, new MockLogger());

    const order = createUc.execute(new CreateOrderDTO({
      customerId: 'C1', customerName: 'اختبار',
      items: [{ productId: 'P1', productName: 'منتج', quantity: 3, unitPrice: 100 }]
    }));
    T.assertEqual(productRepo.findById('P1').stock, 7);

    const updateUc = new UpdateOrderStatusUseCase(orderRepo, productRepo, bus, new MockLogger());
    updateUc.execute(new UpdateOrderStatusDTO({ orderId: order.id, newStatus: OrderStatus.CANCELLED }));
    T.assertEqual(productRepo.findById('P1').stock, 10);
  });

  T.test('GenerateInvoiceUseCase: returns invoice for existing order', function () {
    const order = fixtureOrder_('O-INV', OrderStatus.COMPLETED, 500, 'C-INV');
    const orderRepo = new MockOrderRepository([order]);
    const customerRepo = new MockCustomerRepository([
      new Customer({ id: 'C-INV', name: 'عميل فاتورة', phone: '0501111111', email: 'inv@test.com' })
    ]);
    const uc = new GenerateInvoiceUseCase(orderRepo, customerRepo, new MockLogger());
    const invoice = uc.execute('O-INV');
    T.assertEqual(invoice.orderId, 'O-INV');
    T.assertEqual(invoice.customerName, 'عميل فاتورة');
    T.assertEqual(invoice.customerPhone, '0501111111');
    T.assertEqual(invoice.total, '500.00 ر.س');
    T.assertEqual(invoice.items.length, 1);
  });

  T.test('GenerateInvoiceUseCase: 404 on unknown order', function () {
    const uc = new GenerateInvoiceUseCase(
      new MockOrderRepository(), new MockCustomerRepository(), new MockLogger()
    );
    T.assertThrows(function () { uc.execute('NOPE'); }, 'ORDER_NOT_FOUND');
  });

  T.test('GenerateInvoiceUseCase: rejects missing orderId', function () {
    const uc = new GenerateInvoiceUseCase(
      new MockOrderRepository(), new MockCustomerRepository(), new MockLogger()
    );
    T.assertThrows(function () { uc.execute(null); }, 'ORDER_ID_REQUIRED');
  });

  T.test('GetSystemStatusUseCase: returns counts and breakdown', function () {
    const orderRepo = new MockOrderRepository([
      fixtureOrder_('O1', OrderStatus.NEW),
      fixtureOrder_('O2', OrderStatus.COMPLETED)
    ]);
    const customerRepo = new MockCustomerRepository([
      new Customer({ id: 'C1', name: 'أ', phone: '0501234567' })
    ]);
    const productRepo = new MockProductRepository([
      { id: 'P1', name: 'منتج', stock: 5, price: 100 }
    ]);
    const ticketRepo = new MockTicketRepository([
      new SupportTicket({ id: 'T1', customerId: 'C1', subject: 'مشكلة اختبار' })
    ]);
    const uc = new GetSystemStatusUseCase(orderRepo, customerRepo, productRepo, ticketRepo, new MockLogger());
    const status = uc.execute();
    T.assertEqual(status.counts.orders, 2);
    T.assertEqual(status.counts.customers, 1);
    T.assertEqual(status.counts.products, 1);
    T.assertEqual(status.counts.tickets, 1);
    T.assertEqual(status.lowStockCount, 1);
    T.assertEqual(status.openTicketCount, 1);
    T.assertEqual(status.orderStatusBreakdown[OrderStatus.NEW], 1);
    T.assertEqual(status.orderStatusBreakdown[OrderStatus.COMPLETED], 1);
    T.assertTrue(status.systemVersion === '5.1');
  });

  T.test('AppSheetSyncService: order round-trip flat conversion', function () {
    const order = fixtureOrder_('O-APP', OrderStatus.NEW, 250, 'C-APP');
    const svc = new AppSheetSyncService(
      new MockOrderRepository(), new MockCustomerRepository(),
      new MockTicketRepository(), new MockLogger()
    );
    const flat = svc.orderToFlat(order);
    T.assertEqual(flat[0], 'O-APP');
    T.assertEqual(flat[4], OrderStatus.NEW);

    const restored = svc.orderFromFlat(flat);
    T.assertEqual(restored.id, 'O-APP');
    T.assertEqual(restored.getTotal(), 250);
  });
}
