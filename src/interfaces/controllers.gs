/**
 * ============================================================
 * Interface Layer — Controllers
 * ============================================================
 */

class BaseController {
  constructor(logger) {
    this.logger = logger;
  }

  ok_(data) {
    return { success: true, data: data };
  }

  fail_(err) {
    let status = 500;
    if (err instanceof DomainError) status = err.code === 'ORDER_NOT_FOUND' ? 404 : 422;
    else if (err instanceof SecurityError) status = err.code === 'RATE_LIMITED' ? 429 : 401;
    this.logger.error('request failed', { error: err, code: err.code });
    return {
      success: false,
      error: {
        status: status,
        code: err.code || 'INTERNAL',
        message: err instanceof DomainError || err instanceof SecurityError
          ? err.message
          : 'حدث خطأ داخلي. حاول لاحقاً'
      }
    };
  }

  handle_(fn) {
    try {
      return this.ok_(fn());
    } catch (err) {
      return this.fail_(err);
    }
  }
}

class OrderController extends BaseController {
  constructor(createOrder, updateStatus, searchOrders, generateInvoice, logger) {
    super(logger);
    this.createOrder = createOrder;
    this.updateStatus = updateStatus;
    this.searchOrders = searchOrders;
    this.generateInvoice = generateInvoice;
  }

  create(body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.create');
      const order = this.createOrder.execute(new CreateOrderDTO(body));
      return order.toJSON();
    }.bind(this));
  }

  changeStatus(body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.update');
      const order = this.updateStatus.execute(new UpdateOrderStatusDTO(body));
      return order.toJSON();
    }.bind(this));
  }

  search(params, callerKey) {
    return this.handle_(function () {
      return this.searchOrders.execute(new SearchOrdersDTO(params), callerKey);
    }.bind(this));
  }

  generateInvoice(params, body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.read');
      const orderId = (params && params.orderId) || (body && body.orderId);
      if (!orderId) throw new DomainError('معرّف الطلب مطلوب', 'ORDER_ID_REQUIRED');
      return this.generateInvoice.execute(orderId);
    }.bind(this));
  }
}

class DashboardController extends BaseController {
  constructor(calculateKPIs, generateCharts, generateTables, alertStats, systemStatus, logger) {
    super(logger);
    this.calculateKPIs = calculateKPIs;
    this.generateCharts = generateCharts;
    this.generateTables = generateTables;
    this.alertStats = alertStats;
    this.systemStatus = systemStatus;
  }

  getDashboardData(params) {
    return this.handle_(function () {
      const dto = new DashboardQueryDTO(params || {});
      Rbac.assert(dto.userRole, dto.userRole === Role.SALES ? 'dashboard.view.own' : 'dashboard.view');
      return {
        kpi: this.calculateKPIs.execute(dto),
        charts: this.generateCharts.execute(dto),
        tables: this.generateTables.execute(dto),
        alerts: this.alertStats.execute(),
        lastUpdated: new Date().toISOString()
      };
    }.bind(this));
  }

  getKpi(params) {
    return this.handle_(function () {
      return this.calculateKPIs.execute(new DashboardQueryDTO(params || {}));
    }.bind(this));
  }

  getSystemStatus(params, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'dashboard.view');
      return this.systemStatus.execute();
    }.bind(this));
  }
}

class PortalController extends BaseController {
  constructor(auth, createTicketUseCase, orderRepo, ticketRepo, sessionService, logger) {
    super(logger);
    this.auth = auth;
    this.createTicketUseCase = createTicketUseCase;
    this.orderRepo = orderRepo;
    this.ticketRepo = ticketRepo;
    this.sessionService = sessionService;
  }

  requestOtp(body) {
    return this.handle_(function () {
      return this.auth.requestOtp(new RequestOtpDTO(body));
    }.bind(this));
  }

  verifyOtp(body) {
    return this.handle_(function () {
      return this.auth.verifyOtp(new VerifyOtpDTO(body));
    }.bind(this));
  }

  myOrders(token) {
    return this.handle_(function () {
      const customerId = this.sessionService.resolve(token);
      return this.orderRepo.findByCustomerId(customerId).map(function (o) {
        const j = o.toJSON();
        j.customerName = Xss.escapeHtml(j.customerName);
        j.totalFormatted = Formatter.currency(j.total);
        j.createdAtFormatted = Formatter.dateTime(j.createdAt);
        return j;
      });
    }.bind(this));
  }

  myTickets(token) {
    return this.handle_(function () {
      const customerId = this.sessionService.resolve(token);
      return this.ticketRepo.findByCustomerId(customerId).map(function (t) {
        const j = t.toJSON();
        j.subject = Xss.escapeHtml(j.subject);
        j.createdAtFormatted = Formatter.dateTime(j.createdAt);
        return j;
      });
    }.bind(this));
  }

  createTicket(token, body) {
    return this.handle_(function () {
      const customerId = this.sessionService.resolve(token);
      const ticket = this.createTicketUseCase.execute(new CreateTicketDTO(body), customerId);
      return ticket.toJSON();
    }.bind(this));
  }

  logout(token) {
    return this.handle_(function () {
      this.sessionService.destroy(token);
      return { loggedOut: true };
    }.bind(this));
  }
}
