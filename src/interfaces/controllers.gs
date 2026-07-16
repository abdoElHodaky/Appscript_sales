/**
 * ============================================================
 * Interface Layer — Controllers
 * ------------------------------------------------------------
 * Thin controllers: parse input → build DTO → call use case →
 * shape the response. Zero business logic here.
 *
 *   - BaseController     : success/error envelope + error mapping
 *   - OrderController    : create / updateStatus / search
 *   - DashboardController: kpi / charts / tables / alerts
 *   - PortalController   : requestOtp / verifyOtp / orders / tickets
 * ============================================================
 */

/* ------------------------------------------------------------
 * BaseController
 * ----------------------------------------------------------*/

class BaseController {
  /** @param {Logger} logger */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Standard success envelope.
   * @protected
   * @param {*} data
   * @return {Object}
   */
  ok_(data) {
    return { success: true, data: data };
  }

  /**
   * Maps typed errors to stable client codes.
   * @protected
   * @param {Error} err
   * @return {Object}
   */
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

  /**
   * Runs a controller action inside the standard envelope.
   * @protected
   * @param {Function} fn () => data
   * @return {Object}
   */
  handle_(fn) {
    try {
      return this.ok_(fn());
    } catch (err) {
      return this.fail_(err);
    }
  }
}

/* ------------------------------------------------------------
 * OrderController
 * ----------------------------------------------------------*/

class OrderController extends BaseController {
  /**
   * @param {CreateOrderUseCase} createOrder
   * @param {UpdateOrderStatusUseCase} updateStatus
   * @param {SearchOrdersUseCase} searchOrders
   * @param {Logger} logger
   */
  constructor(createOrder, updateStatus, searchOrders, logger) {
    super(logger);
    this.createOrder = createOrder;
    this.updateStatus = updateStatus;
    this.searchOrders = searchOrders;
  }

  /**
   * POST /orders — create a new order.
   * @param {Object} body {customerId, customerName, city, notes, items[]}
   * @param {string} userRole
   * @return {Object} Envelope with the created order.
   */
  create(body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.create');
      const order = this.createOrder.execute(new CreateOrderDTO(body));
      return order.toJSON();
    }.bind(this));
  }

  /**
   * PATCH /orders/:id/status — transition an order.
   * @param {Object} body {orderId, newStatus, reason?}
   * @param {string} userRole
   * @return {Object}
   */
  changeStatus(body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.update');
      const order = this.updateStatus.execute(new UpdateOrderStatusDTO(body));
      return order.toJSON();
    }.bind(this));
  }

  /**
   * GET /search — full-text + filters + pagination.
   * @param {Object} params Query string parameters.
   * @param {string} callerKey Rate-limit bucket.
   * @return {Object}
   */
  search(params, callerKey) {
    return this.handle_(function () {
      return this.searchOrders.execute(new SearchOrdersDTO(params), callerKey);
    }.bind(this));
  }
}

/* ------------------------------------------------------------
 * DashboardController
 * ----------------------------------------------------------*/

class DashboardController extends BaseController {
  /**
   * @param {CalculateKPIsUseCase} calculateKPIs
   * @param {GenerateChartsUseCase} generateCharts
   * @param {GenerateTablesUseCase} generateTables
   * @param {GetAlertStatisticsUseCase} alertStats
   * @param {Logger} logger
   */
  constructor(calculateKPIs, generateCharts, generateTables, alertStats, logger) {
    super(logger);
    this.calculateKPIs = calculateKPIs;
    this.generateCharts = generateCharts;
    this.generateTables = generateTables;
    this.alertStats = alertStats;
  }

  /**
   * Full dashboard payload in one round-trip.
   * @param {Object} params {dateRange, customFrom, customTo, userRole, userEmail}
   * @return {Object} {kpi, charts, tables, alerts, lastUpdated}
   */
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

  /** @param {Object} params @return {Object} KPI cards only. */
  getKpi(params) {
    return this.handle_(function () {
      return this.calculateKPIs.execute(new DashboardQueryDTO(params || {}));
    }.bind(this));
  }
}

/* ------------------------------------------------------------
 * PortalController — customer-facing (session-authenticated)
 * ----------------------------------------------------------*/

class PortalController extends BaseController {
  /**
   * @param {AuthenticateCustomerUseCase} auth
   * @param {CreateSupportTicketUseCase} createTicket
   * @param {OrderRepository} orderRepo
   * @param {TicketRepository} ticketRepo
   * @param {SessionService} sessionService
   * @param {Logger} logger
   */
  constructor(auth, createTicketUseCase, orderRepo, ticketRepo, sessionService, logger) {
    super(logger);
    this.auth = auth;
    // NB: property named *UseCase so it never shadows the createTicket() method.
    this.createTicketUseCase = createTicketUseCase;
    this.orderRepo = orderRepo;
    this.ticketRepo = ticketRepo;
    this.sessionService = sessionService;
  }

  /**
   * POST /portal/otp — step 1 of login.
   * @param {Object} body {phone}
   * @return {Object}
   */
  requestOtp(body) {
    return this.handle_(function () {
      return this.auth.requestOtp(new RequestOtpDTO(body));
    }.bind(this));
  }

  /**
   * POST /portal/verify — step 2 of login; returns a session token.
   * @param {Object} body {phone, code}
   * @return {Object}
   */
  verifyOtp(body) {
    return this.handle_(function () {
      return this.auth.verifyOtp(new VerifyOtpDTO(body));
    }.bind(this));
  }

  /**
   * GET /portal/orders — authenticated customer's orders.
   * @param {string} token Session token.
   * @return {Object}
   */
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

  /**
   * GET /portal/tickets — authenticated customer's tickets.
   * @param {string} token
   * @return {Object}
   */
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

  /**
   * POST /portal/tickets — open a support ticket.
   * @param {string} token
   * @param {Object} body {subject, message}
   * @return {Object}
   */
  createTicket(token, body) {
    return this.handle_(function () {
      const customerId = this.sessionService.resolve(token);
      const ticket = this.createTicketUseCase.execute(new CreateTicketDTO(body), customerId);
      return ticket.toJSON();
    }.bind(this));
  }

  /**
   * POST /portal/logout.
   * @param {string} token
   * @return {Object}
   */
  logout(token) {
    return this.handle_(function () {
      this.sessionService.destroy(token);
      return { loggedOut: true };
    }.bind(this));
  }
}
