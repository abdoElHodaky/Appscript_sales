/**
 * ============================================================
 * Application Layer — Use Cases  [v5.1]
 * ------------------------------------------------------------
 * Changes:
 *   - CreateOrderUseCase now validates stock and deducts it
 *   - CreateOrderUseCase receives ProductRepository
 * ============================================================
 */

class BaseUseCase {
  assertValid_(dto) {
    if (!dto.isValid()) {
      throw new DomainError('مدخلات غير صالحة: ' + dto.getErrors().join('؛ '), 'VALIDATION');
    }
  }
}

class CreateOrderUseCase extends BaseUseCase {
  constructor(orderRepo, customerRepo, productRepo, eventBus, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.productRepo = productRepo;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  execute(dto) {
    this.assertValid_(dto);
    this.logger.startTimer('usecase:createOrder');

    // 1. Validate stock availability
    for (let i = 0; i < dto.items.length; i++) {
      const it = dto.items[i];
      const product = this.productRepo.findById(it.productId);
      if (!product) {
        throw new DomainError('المنتج غير موجود: ' + it.productId, 'PRODUCT_NOT_FOUND');
      }
      if (typeof product.stock !== 'number' || product.stock < it.quantity) {
        throw new DomainError(
          'المخزون غير كافٍ: ' + (product.name || it.productId) +
          ' (متاح: ' + (product.stock || 0) + '، مطلوب: ' + it.quantity + ')',
          'INSUFFICIENT_STOCK'
        );
      }
    }

    // 2. Create and persist order FIRST
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

    // 3. Deduct stock AFTER successful order save (with rollback on failure)
    try {
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i];
        const product = this.productRepo.findById(it.productId);
        product.stock -= it.quantity;
        this.productRepo.save(product);
      }
    } catch (stockErr) {
      this.logger.error('stock deduction failed, rolling back order', {
        orderId: order.id,
        error: stockErr.message
      });
      this.orderRepo.deleteById(order.id);
      throw new DomainError(
        'فشل تحديث المخزون بعد إنشاء الطلب. تم إلغاء الطلب تلقائياً.',
        'STOCK_UPDATE_FAILED'
      );
    }

    // 4. Update customer aggregates
    let customer = this.customerRepo.findById(dto.customerId);
    if (customer) {
      customer.registerOrder(order.getTotal());
      this.customerRepo.save(customer);
      this.eventBus.publish('customer.updated', customer.toJSON());
    }

    this.eventBus.publish('order.created', order.toJSON());
    this.logger.endTimer('usecase:createOrder');
    return order;
  }
}

class UpdateOrderStatusUseCase extends BaseUseCase {
  constructor(orderRepo, productRepo, eventBus, logger) {
    super();
    this.orderRepo = orderRepo;
    this.productRepo = productRepo;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  execute(dto) {
    this.assertValid_(dto);
    const order = this.orderRepo.findById(dto.orderId);
    if (!order) throw new DomainError('الطلب غير موجود: ' + dto.orderId, 'ORDER_NOT_FOUND');

    const previousStatus = order.status;
    order.transitionTo(dto.newStatus);

    // Restore stock when order is cancelled
    if (dto.newStatus === OrderStatus.CANCELLED && previousStatus !== OrderStatus.CANCELLED) {
      try {
        for (let i = 0; i < order.items.length; i++) {
          const item = order.items[i];
          const product = this.productRepo.findById(item.productId);
          if (product) {
            product.stock = (typeof product.stock === 'number' ? product.stock : 0) + item.quantity;
            this.productRepo.save(product);
            this.logger.info('stock restored on cancellation', {
              productId: item.productId,
              quantity: item.quantity,
              orderId: order.id
            });
          }
        }
      } catch (stockErr) {
        this.logger.error('stock restoration failed on cancellation', {
          orderId: order.id,
          error: stockErr.message
        });
        // Do not block cancellation if stock restore fails — log and continue
      }
    }

    this.orderRepo.save(order);
    this.eventBus.publish('order.statusChanged', {
      id: order.id, status: order.status, reason: dto.reason
    });
    this.logger.info('order status changed', { id: order.id, from: previousStatus, to: dto.newStatus });
    return order;
  }
}

class SearchOrdersUseCase extends BaseUseCase {
  constructor(searchEngine, rateLimiter, logger) {
    super();
    this.searchEngine = searchEngine;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
  }

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

class CalculateKPIsUseCase extends BaseUseCase {
  constructor(orderRepo, customerRepo, cache, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.cache = cache;
    this.logger = logger;
  }

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

class GenerateChartsUseCase extends BaseUseCase {
  constructor(orderRepo, customerRepo, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.logger = logger;
  }

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

  statusDist_(orders) {
    const counts = {};
    Object.keys(OrderStatus).forEach(function (k) { counts[OrderStatus[k]] = 0; });
    orders.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
    return { labels: Object.keys(counts), data: Object.keys(counts).map(function (k) { return counts[k]; }) };
  }

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

  hourlyDist_(orders) {
    const hours = [];
    for (let h = 0; h < 24; h++) hours.push(0);
    orders.forEach(function (o) { hours[o.createdAt.getHours()] += 1; });
    return {
      labels: hours.map(function (_, h) { return h + ':00'; }),
      data: hours
    };
  }

  cityDist_(orders) {
    const cities = {};
    orders.forEach(function (o) {
      const c = o.city || 'غير محدد';
      cities[c] = (cities[c] || 0) + 1;
    });
    const sorted = Object.keys(cities).sort(function (a, b) { return cities[b] - cities[a]; }).slice(0, 8);
    return { labels: sorted, data: sorted.map(function (k) { return cities[k]; }) };
  }

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

class GenerateTablesUseCase extends BaseUseCase {
  constructor(orderRepo, customerRepo, productRepo, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.productRepo = productRepo;
    this.logger = logger;
  }

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

class EvaluateAlertRulesUseCase {
  constructor(alertEngine, orderRepo, productRepo, ticketRepo, logger) {
    this.alertEngine = alertEngine;
    this.orderRepo = orderRepo;
    this.productRepo = productRepo;
    this.ticketRepo = ticketRepo;
    this.logger = logger;
  }

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


class GenerateInvoiceUseCase extends BaseUseCase {
  constructor(orderRepo, customerRepo, logger) {
    super();
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.logger = logger;
  }

  execute(orderId) {
    if (!orderId) throw new DomainError('معرّف الطلب مطلوب', 'ORDER_ID_REQUIRED');
    const order = this.orderRepo.findById(orderId);
    if (!order) throw new DomainError('الطلب غير موجود: ' + orderId, 'ORDER_NOT_FOUND');

    const customer = this.customerRepo.findById(order.customerId);
    this.logger.info('invoice generated', { orderId: orderId });

    return {
      orderId: order.id,
      customerName: Xss.escapeHtml(order.customerName),
      customerPhone: customer ? Xss.escapeHtml(customer.phone) : '',
      customerEmail: customer ? Xss.escapeHtml(customer.email) : '',
      customerCity: Xss.escapeHtml(order.city),
      items: order.items.map(function (item) {
        return {
          productName: Xss.escapeHtml(item.productName),
          quantity: item.quantity,
          unitPrice: Formatter.currency(item.unitPrice),
          lineTotal: Formatter.currency(item.getLineTotal())
        };
      }),
      total: Formatter.currency(order.getTotal()),
      status: order.status,
      notes: Xss.escapeHtml(order.notes),
      createdAt: Formatter.dateTime(order.createdAt),
      invoiceDate: Formatter.dateTime(new Date())
    };
  }
}

class GetAlertStatisticsUseCase {
  constructor(history, rules, logger) {
    this.history = history;
    this.rules = rules;
    this.logger = logger;
  }

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

class AuthenticateCustomerUseCase extends BaseUseCase {
  constructor(customerRepo, otpService, sessionService, logger) {
    super();
    this.customerRepo = customerRepo;
    this.otpService = otpService;
    this.sessionService = sessionService;
    this.logger = logger;
  }

  requestOtp(dto) {
    this.assertValid_(dto);
    const customer = this.customerRepo.findByPhone(dto.phone);
    if (!customer) {
      this.logger.warn('otp requested for unknown phone', { phone: Formatter.maskPhone(dto.phone) });
      return { sent: true, expiresInSec: 300 };
    }
    return this.otpService.issue(dto.phone);
  }

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

class CreateSupportTicketUseCase extends BaseUseCase {
  constructor(ticketRepo, eventBus, logger) {
    super();
    this.ticketRepo = ticketRepo;
    this.eventBus = eventBus;
    this.logger = logger;
  }

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

class GetSystemStatusUseCase {
  constructor(orderRepo, customerRepo, productRepo, ticketRepo, logger) {
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.productRepo = productRepo;
    this.ticketRepo = ticketRepo;
    this.logger = logger;
  }

  execute() {
    const orders = this.orderRepo.findAll();
    const customers = this.customerRepo.findAll();
    const products = this.productRepo.findAll();
    const tickets = this.ticketRepo.findAll();

    const statusCounts = {};
    Object.keys(OrderStatus).forEach(function (k) { statusCounts[OrderStatus[k]] = 0; });
    orders.forEach(function (o) { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

    return {
      counts: {
        orders: orders.length,
        customers: customers.length,
        products: products.length,
        tickets: tickets.length
      },
      orderStatusBreakdown: statusCounts,
      lowStockCount: this.productRepo.findLowStock(10).length,
      openTicketCount: tickets.filter(function (t) { return t.status === TicketStatus.OPEN; }).length,
      systemVersion: '5.1',
      timestamp: new Date().toISOString()
    };
  }
}

