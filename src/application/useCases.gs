/**
 * ============================================================
 * Application Layer — Use Cases
 * ------------------------------------------------------------
 * One class per application operation (Single Responsibility).
 * Use cases orchestrate domain entities + infrastructure via
 * injected interfaces — they contain no framework code.
 *
 *   1  CreateOrderUseCase
 *   2  UpdateOrderStatusUseCase
 *   3  SearchOrdersUseCase
 *   4  CalculateKPIsUseCase
 *   5  GenerateChartsUseCase
 *   6  GenerateTablesUseCase
 *   7  EvaluateAlertRulesUseCase
 *   8  GetAlertStatisticsUseCase
 *   9  AuthenticateCustomerUseCase (OTP request + verify)
 *   10 CreateSupportTicketUseCase
 * ============================================================
 */

/** Base class: shared guard for DTO validity. */
class BaseUseCase {
  /**
   * @protected
   * @param {BaseDTO} dto
   * @throws {DomainError} Listing all validation failures.
   */
  assertValid_(dto) {
    if (!dto.isValid()) {
      throw new DomainError('مدخلات غير صالحة: ' + dto.getErrors().join('؛ '), 'VALIDATION');
    }
  }
}

/* ============================================================
 * 1. CreateOrderUseCase
 * ==========================================================*/

class CreateOrderUseCase extends BaseUseCase {
  /**
   * @param {OrderRepository} orderRepo
   * @param {CustomerRepository} customerRepo
   * @param {EventBus} eventBus
   * @param {Logger} logger
   */
  constructor(orderRepo, customerRepo, eventBus, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  /**
   * @param {CreateOrderDTO} dto
   * @return {Order}
   */
  execute(dto) {
    this.assertValid_(dto);
    this.logger.startTimer('usecase:createOrder');

    const items = dto.items.map(function (i) { return new OrderItem(i); });
    const order = new Order({
      id: IdGenerator.next('ORD'),
      customerId: dto.customerId,
      customerName: dto.customerName,
      items: items,
      city: dto.city,
      notes: dto.notes
    });
    this.orderRepo.save(order);

    // Keep customer aggregates fresh (create-if-missing for walk-ins).
    let customer = this.customerRepo.findById(dto.customerId);
    if (customer) {
      customer.registerOrder(order.getTotal());
      this.customerRepo.save(customer);
    }

    this.eventBus.publish('order.created', order.toJSON());
    this.logger.endTimer('usecase:createOrder');
    return order;
  }
}

/* ============================================================
 * 2. UpdateOrderStatusUseCase
 * ==========================================================*/

class UpdateOrderStatusUseCase extends BaseUseCase {
  /**
   * @param {OrderRepository} orderRepo
   * @param {EventBus} eventBus
   * @param {Logger} logger
   */
  constructor(orderRepo, eventBus, logger) {
    super();
    this.orderRepo = orderRepo;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  /**
   * @param {UpdateOrderStatusDTO} dto
   * @return {Order}
   * @throws {DomainError} 404-style when the order is unknown.
   */
  execute(dto) {
    this.assertValid_(dto);
    const order = this.orderRepo.findById(dto.orderId);
    if (!order) throw new DomainError('الطلب غير موجود: ' + dto.orderId, 'ORDER_NOT_FOUND');

    order.transitionTo(dto.newStatus); // state machine enforces legality
    this.orderRepo.save(order);
    this.eventBus.publish('order.statusChanged', {
      id: order.id, status: order.status, reason: dto.reason
    });
    this.logger.info('order status changed', { id: order.id, to: dto.newStatus });
    return order;
  }
}

/* ============================================================
 * 3. SearchOrdersUseCase
 * ==========================================================*/

class SearchOrdersUseCase extends BaseUseCase {
  /**
   * @param {SearchEngine} searchEngine
   * @param {RateLimiter} rateLimiter
   * @param {Logger} logger
   */
  constructor(searchEngine, rateLimiter, logger) {
    super();
    this.searchEngine = searchEngine;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
  }

  /**
   * @param {SearchOrdersDTO} dto
   * @param {string} callerKey Rate-limit bucket (email/IP).
   * @return {Object} ResultFormatter.toApi() payload.
   */
  execute(dto, callerKey) {
    this.assertValid_(dto);
    this.rateLimiter.assertWithinLimit('search:' + (callerKey || 'anon'), 30, 300);

    const builder = new QueryBuilder()
      .text(dto.text)
      .sort(dto.sortBy, dto.sortDir)
      .paginate(dto.page, dto.pageSize);
    if (dto.status) builder.filter('status', dto.status);
    if (dto.city) builder.filter('city', dto.city);
    if (dto.customerId) builder.filter('customerId', dto.customerId);

    const result = this.searchEngine.search(builder.build());
    return ResultFormatter.toApi(result);
  }
}

/* ============================================================
 * 4. CalculateKPIsUseCase
 * ==========================================================*/

class CalculateKPIsUseCase extends BaseUseCase {
  /**
   * @param {OrderRepository} orderRepo
   * @param {CustomerRepository} customerRepo
   * @param {Cache} cache
   * @param {Logger} logger
   */
  constructor(orderRepo, customerRepo, cache, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.cache = cache;
    this.logger = logger;
  }

  /**
   * Computes the 6 KPI cards for a date range.
   * Results cached 5 minutes per range+role key.
   * @param {DashboardQueryDTO} dto
   * @return {Object} {sales, orders, aov, completionRate, cancellationRate, activeCustomers}
   */
  execute(dto) {
    this.assertValid_(dto);
    const cacheKey = 'kpi:' + dto.dateRange + ':' + dto.userRole + ':' +
      (dto.customFrom || '') + ':' + (dto.customTo || '');
    const cached = this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const range = DateRange.resolve(dto.dateRange, { from: dto.customFrom, to: dto.customTo });
    let orders = this.orderRepo.findAll().filter(function (o) {
      return o.createdAt >= range.from && o.createdAt <= range.to;
    });

    // Role scoping: SALES sees own orders only (matched by email in notes).
    if (dto.userRole === Role.SALES && dto.userEmail) {
      const email = dto.userEmail;
      orders = orders.filter(function (o) { return o.notes.indexOf(email) !== -1; });
    }

    const completed = orders.filter(function (o) { return o.status === OrderStatus.COMPLETED; });
    const cancelled = orders.filter(function (o) { return o.status === OrderStatus.CANCELLED; });
    const sales = completed.reduce(function (s, o) { return s + o.getTotal(); }, 0);
    const uniqueCustomers = {};
    orders.forEach(function (o) { uniqueCustomers[o.customerId] = true; });

    const kpi = {
      sales: Math.round(sales * 100) / 100,
      salesFormatted: Formatter.currency(sales),
      orders: orders.length,
      aov: orders.length ? Math.round((sales / Math.max(1, completed.length)) * 100) / 100 : 0,
      aovFormatted: Formatter.currency(orders.length ? sales / Math.max(1, completed.length) : 0),
      completionRate: orders.length ? Math.round((completed.length / orders.length) * 1000) / 10 : 0,
      cancellationRate: orders.length ? Math.round((cancelled.length / orders.length) * 1000) / 10 : 0,
      activeCustomers: Object.keys(uniqueCustomers).length,
      range: { from: range.from.toISOString(), to: range.to.toISOString() }
    };
    this.cache.put(cacheKey, JSON.stringify(kpi), 300);
    return kpi;
  }
}

/* ============================================================
 * 5. GenerateChartsUseCase
 * ==========================================================*/

class GenerateChartsUseCase extends BaseUseCase {
  /**
   * @param {OrderRepository} orderRepo
   * @param {CustomerRepository} customerRepo
   * @param {Logger} logger
   */
  constructor(orderRepo, customerRepo, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.logger = logger;
  }

  /**
   * Builds the 6 chart datasets for a date range.
   * @param {DashboardQueryDTO} dto
   * @return {Object} {salesTrend, statusDist, topProducts, hourlyDist, cityDist, customerGrowth}
   */
  execute(dto) {
    this.assertValid_(dto);
    const range = DateRange.resolve(dto.dateRange, { from: dto.customFrom, to: dto.customTo });
    const orders = this.orderRepo.findAll().filter(function (o) {
      return o.createdAt >= range.from && o.createdAt <= range.to;
    });

    return {
      salesTrend: this.salesTrend_(orders),
      statusDist: this.statusDist_(orders),
      topProducts: this.topProducts_(orders),
      hourlyDist: this.hourlyDist_(orders),
      cityDist: this.cityDist_(orders),
      customerGrowth: this.customerGrowth_(range)
    };
  }

  /** @private Daily sales series. */
  salesTrend_(orders) {
    const byDay = {};
    orders.forEach(function (o) {
      if (o.status !== OrderStatus.COMPLETED) return;
      const day = Utilities.formatDate(o.createdAt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      byDay[day] = (byDay[day] || 0) + o.getTotal();
    });
    const labels = Object.keys(byDay).sort();
    return {
      labels: labels,
      data: labels.map(function (d) { return Math.round(byDay[d] * 100) / 100; })
    };
  }

  /** @private Orders per status. */
  statusDist_(orders) {
    const counts = {};
    Object.keys(OrderStatus).forEach(function (k) { counts[OrderStatus[k]] = 0; });
    orders.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
    return { labels: Object.keys(counts), data: Object.keys(counts).map(function (k) { return counts[k]; }) };
  }

  /** @private Top 5 products by quantity. */
  topProducts_(orders) {
    const qty = {};
    orders.forEach(function (o) {
      o.items.forEach(function (it) {
        qty[it.productName] = (qty[it.productName] || 0) + it.quantity;
      });
    });
    const sorted = Object.keys(qty).sort(function (a, b) { return qty[b] - qty[a]; }).slice(0, 5);
    return { labels: sorted, data: sorted.map(function (k) { return qty[k]; }) };
  }

  /** @private Orders per hour (0–23). */
  hourlyDist_(orders) {
    const hours = [];
    for (let h = 0; h < 24; h++) hours.push(0);
    orders.forEach(function (o) { hours[o.createdAt.getHours()] += 1; });
    return {
      labels: hours.map(function (_, h) { return h + ':00'; }),
      data: hours
    };
  }

  /** @private Orders per city (top 8). */
  cityDist_(orders) {
    const cities = {};
    orders.forEach(function (o) {
      const c = o.city || 'غير محدد';
      cities[c] = (cities[c] || 0) + 1;
    });
    const sorted = Object.keys(cities).sort(function (a, b) { return cities[b] - cities[a]; }).slice(0, 8);
    return { labels: sorted, data: sorted.map(function (k) { return cities[k]; }) };
  }

  /** @private Cumulative customers inside the range. */
  customerGrowth_(range) {
    const customers = this.customerRepo.findAll().filter(function (c) {
      return c.createdAt <= range.to;
    }).sort(function (a, b) { return a.createdAt - b.createdAt; });
    const byDay = {};
    customers.forEach(function (c) {
      const day = Utilities.formatDate(c.createdAt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      byDay[day] = (byDay[day] || 0) + 1;
    });
    const labels = Object.keys(byDay).sort();
    let cumulative = 0;
    return {
      labels: labels,
      data: labels.map(function (d) { cumulative += byDay[d]; return cumulative; })
    };
  }
}

/* ============================================================
 * 6. GenerateTablesUseCase
 * ==========================================================*/

class GenerateTablesUseCase extends BaseUseCase {
  /**
   * @param {OrderRepository} orderRepo
   * @param {CustomerRepository} customerRepo
   * @param {ProductRepository} productRepo
   * @param {Logger} logger
   */
  constructor(orderRepo, customerRepo, productRepo, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.productRepo = productRepo;
    this.logger = logger;
  }

  /**
   * Builds the 4 dashboard tables.
   * @param {DashboardQueryDTO} dto
   * @return {Object} {recentOrders, topCustomers, pendingOrders, lowStock}
   */
  execute(dto) {
    this.assertValid_(dto);
    const range = DateRange.resolve(dto.dateRange, { from: dto.customFrom, to: dto.customTo });
    const inRange = this.orderRepo.findAll().filter(function (o) {
      return o.createdAt >= range.from && o.createdAt <= range.to;
    });

    return {
      recentOrders: inRange.slice(0, 10).map(this.orderRow_),
      pendingOrders: inRange
        .filter(function (o) { return o.status === OrderStatus.NEW; })
        .slice(0, 10)
        .map(this.orderRow_),
      topCustomers: this.customerRepo.findAll()
        .sort(function (a, b) { return b.totalSpent - a.totalSpent; })
        .slice(0, 5)
        .map(function (c) {
          return {
            name: Xss.escapeHtml(c.name),
            city: Xss.escapeHtml(c.city),
            orders: c.totalOrders,
            spent: Formatter.currency(c.totalSpent)
          };
        }),
      lowStock: this.productRepo.findLowStock(10).slice(0, 10).map(function (p) {
        return {
          name: Xss.escapeHtml(p.name || p.id),
          stock: p.stock,
          sku: Xss.escapeHtml(p.sku || '')
        };
      })
    };
  }

  /** @private */
  orderRow_(o) {
    return {
      id: o.id,
      customer: Xss.escapeHtml(o.customerName),
      total: Formatter.currency(o.getTotal()),
      status: o.status,
      date: Formatter.dateTime(o.createdAt)
    };
  }
}

/* ============================================================
 * 7. EvaluateAlertRulesUseCase
 * ==========================================================*/

class EvaluateAlertRulesUseCase {
  /**
   * @param {AlertEngine} alertEngine
   * @param {OrderRepository} orderRepo
   * @param {ProductRepository} productRepo
   * @param {TicketRepository} ticketRepo
   * @param {Logger} logger
   */
  constructor(alertEngine, orderRepo, productRepo, ticketRepo, logger) {
    this.alertEngine = alertEngine;
    this.orderRepo = orderRepo;
    this.productRepo = productRepo;
    this.ticketRepo = ticketRepo;
    this.logger = logger;
  }

  /**
   * Assembles the evaluation context and runs the engine.
   * @return {Object} AlertEngine.evaluate() summary.
   */
  execute() {
    const orders = this.orderRepo.findAll();
    const completed = orders.filter(function (o) { return o.status === OrderStatus.COMPLETED; });
    const cancelled = orders.filter(function (o) { return o.status === OrderStatus.CANCELLED; });
    const openTickets = this.ticketRepo.findAll()
      .filter(function (t) { return t.status === TicketStatus.OPEN; });

    const today = DateRange.resolve(DateRange.Names.TODAY);
    const todaySales = completed
      .filter(function (o) { return o.createdAt >= today.from; })
      .reduce(function (s, o) { return s + o.getTotal(); }, 0);
    const month = DateRange.resolve(DateRange.Names.THIS_MONTH);
    const daysElapsed = Math.max(1, new Date().getDate());
    const monthSales = completed
      .filter(function (o) { return o.createdAt >= month.from; })
      .reduce(function (s, o) { return s + o.getTotal(); }, 0);

    const context = {
      orders: orders,
      lowStock: this.productRepo.findLowStock(10),
      pendingCount: orders.filter(function (o) { return o.status === OrderStatus.NEW; }).length,
      openTicketCount: openTickets.length,
      stats: {
        cancellationRate: orders.length ? (cancelled.length / orders.length) * 100 : 0,
        todaySales: todaySales,
        avgDailySales: monthSales / daysElapsed
      }
    };
    return this.alertEngine.evaluate(context);
  }
}

/* ============================================================
 * 8. GetAlertStatisticsUseCase
 * ==========================================================*/

class GetAlertStatisticsUseCase {
  /**
   * @param {AlertHistory} history
   * @param {AlertRule[]} rules
   * @param {Logger} logger
   */
  constructor(history, rules, logger) {
    this.history = history;
    this.rules = rules;
    this.logger = logger;
  }

  /**
   * @return {Object} {totalRules, inCooldown, recentFirings}
   */
  execute() {
    const recent = this.history.getRecent();
    const inCooldown = this.rules
      .filter(function (r) { return this.history.inCooldown(r.id); }, this)
      .map(function (r) { return r.id; });
    return {
      totalRules: this.rules.length,
      inCooldown: inCooldown,
      recentFirings: recent.slice(-20).reverse()
    };
  }
}

/* ============================================================
 * 9. AuthenticateCustomerUseCase
 * ==========================================================*/

class AuthenticateCustomerUseCase extends BaseUseCase {
  /**
   * @param {CustomerRepository} customerRepo
   * @param {OtpService} otpService
   * @param {SessionService} sessionService
   * @param {Logger} logger
   */
  constructor(customerRepo, otpService, sessionService, logger) {
    super();
    this.customerRepo = customerRepo;
    this.otpService = otpService;
    this.sessionService = sessionService;
    this.logger = logger;
  }

  /**
   * Step 1 — request an OTP. Unknown phones get the same generic
   * answer so the endpoint cannot be used to enumerate customers.
   * @param {RequestOtpDTO} dto
   * @return {Object} {sent: true, expiresInSec, devCode?}
   */
  requestOtp(dto) {
    this.assertValid_(dto);
    const customer = this.customerRepo.findByPhone(dto.phone);
    if (!customer) {
      this.logger.warn('otp requested for unknown phone', { phone: Formatter.maskPhone(dto.phone) });
      // Return the same shape; no enumeration leak.
      return { sent: true, expiresInSec: 300 };
    }
    return this.otpService.issue(dto.phone);
  }

  /**
   * Step 2 — verify the OTP and open a session.
   * @param {VerifyOtpDTO} dto
   * @return {Object} {token, expiresAt, customer}
   * @throws {SecurityError} On bad/expired code or unknown customer.
   */
  verifyOtp(dto) {
    this.assertValid_(dto);
    const customer = this.customerRepo.findByPhone(dto.phone);
    if (!customer) throw new SecurityError('بيانات الدخول غير صحيحة', 'AUTH_FAILED');
    const ok = this.otpService.verify(dto.phone, dto.code);
    if (!ok) throw new SecurityError('الرمز غير صحيح', 'OTP_MISMATCH');
    const session = this.sessionService.create(customer.id);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      customer: {
        id: customer.id,
        name: Xss.escapeHtml(customer.name),
        city: Xss.escapeHtml(customer.city)
      }
    };
  }
}

/* ============================================================
 * 10. CreateSupportTicketUseCase
 * ==========================================================*/

class CreateSupportTicketUseCase extends BaseUseCase {
  /**
   * @param {TicketRepository} ticketRepo
   * @param {EventBus} eventBus
   * @param {Logger} logger
   */
  constructor(ticketRepo, eventBus, logger) {
    super();
    this.ticketRepo = ticketRepo;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  /**
   * @param {CreateTicketDTO} dto
   * @param {string} customerId From the authenticated session.
   * @return {SupportTicket}
   */
  execute(dto, customerId) {
    this.assertValid_(dto);
    if (!customerId) throw new SecurityError('الجلسة مطلوبة', 'SESSION_REQUIRED');

    const ticket = new SupportTicket({
      id: IdGenerator.next('TKT'),
      customerId: customerId,
      subject: dto.subject,
      message: dto.message
    });
    this.ticketRepo.save(ticket);
    this.eventBus.publish('ticket.created', ticket.toJSON());
    this.logger.info('ticket created', { id: ticket.id, customer: customerId });
    return ticket;
  }
}
