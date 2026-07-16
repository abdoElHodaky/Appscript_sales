/**
 * ============================================================
 * Shared Layer — Dependency Container
 * ------------------------------------------------------------
 * Composition root: the ONLY place that knows how the layers
 * are wired. Every dependency is built lazily and cached as a
 * singleton for the duration of the execution.
 *
 * Graph (24 dependencies):
 *   Logger ──┬─► Repositories ──► SearchEngine
 *          ├─► Cache ─► RateLimiter ─► OtpService ─► SessionService
 *          ├─► AlertRule[] ─► AlertHistory/AlertDelivery ─► AlertEngine
 *          ├─► UseCases (10)
 *          ├─► Controllers (3)
 *          └─► Router
 * ============================================================
 */

class DependencyContainer {
  constructor() {
    /** @private singleton registry */
    this.singletons_ = {};
  }

  /** @private */
  get_(key, factory) {
    if (!this.singletons_[key]) this.singletons_[key] = factory.call(this);
    return this.singletons_[key];
  }

  /* ---------------- Shared ---------------- */

  /** @return {Logger} */
  getLogger() {
    return this.get_('logger', function () { return new Logger({ minLevel: LogLevel.INFO }); });
  }

  /** @return {Cache} CacheService script cache. */
  getCache() {
    return this.get_('cache', function () { return CacheService.getScriptCache(); });
  }

  /** @return {EventBus} */
  getEventBus() {
    return this.get_('eventBus', function () {
      const bus = new EventBus();
      const logger = this.getLogger();
      bus.subscribe('order.created', function (p) {
        logger.info('event: order.created', { id: p.id, total: p.total });
      });
      bus.subscribe('order.statusChanged', function (p) {
        logger.info('event: order.statusChanged', { id: p.id, status: p.status });
      });
      bus.subscribe('ticket.created', function (p) {
        logger.info('event: ticket.created', { id: p.id });
      });
      return bus;
    });
  }

  /** @return {RateLimiter} */
  getRateLimiter() {
    return this.get_('rateLimiter', function () {
      return new RateLimiter(this.getCache(), this.getLogger());
    });
  }

  /* ---------------- Infrastructure ---------------- */

  /** @return {OrderRepository} */
  getOrderRepository() {
    return this.get_('orderRepo', function () { return new OrderRepository(this.getLogger()); });
  }

  /** @return {CustomerRepository} */
  getCustomerRepository() {
    return this.get_('customerRepo', function () { return new CustomerRepository(this.getLogger()); });
  }

  /** @return {TicketRepository} */
  getTicketRepository() {
    return this.get_('ticketRepo', function () { return new TicketRepository(this.getLogger()); });
  }

  /** @return {ProductRepository} */
  getProductRepository() {
    return this.get_('productRepo', function () { return new ProductRepository(this.getLogger()); });
  }

  /** @return {SearchEngine} */
  getSearchEngine() {
    return this.get_('searchEngine', function () {
      return new SearchEngine(this.getOrderRepository(), this.getCache(), this.getLogger());
    });
  }

  /** @return {OtpService} */
  getOtpService() {
    return this.get_('otpService', function () {
      return new OtpService(this.getCache(), this.getRateLimiter(), this.getLogger());
    });
  }

  /** @return {SessionService} */
  getSessionService() {
    return this.get_('sessionService', function () {
      return new SessionService(this.getCache(), this.getLogger());
    });
  }

  /** @return {AlertRule[]} */
  getAlertRules() {
    return this.get_('alertRules', function () { return defaultAlertRules(); });
  }

  /** @return {AlertHistory} */
  getAlertHistory() {
    return this.get_('alertHistory', function () {
      return new AlertHistory(this.getCache(), this.getLogger());
    });
  }

  /** @return {AlertDelivery} */
  getAlertDelivery() {
    return this.get_('alertDelivery', function () { return new AlertDelivery(this.getLogger()); });
  }

  /** @return {AlertEngine} */
  getAlertEngine() {
    return this.get_('alertEngine', function () {
      return new AlertEngine(
        this.getAlertRules(), this.getAlertHistory(),
        this.getAlertDelivery(), this.getLogger()
      );
    });
  }

  /* ---------------- Use Cases ---------------- */

  /** @return {CreateOrderUseCase} */
  getCreateOrderUseCase() {
    return this.get_('ucCreateOrder', function () {
      return new CreateOrderUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getEventBus(), this.getLogger()
      );
    });
  }

  /** @return {UpdateOrderStatusUseCase} */
  getUpdateOrderStatusUseCase() {
    return this.get_('ucUpdateStatus', function () {
      return new UpdateOrderStatusUseCase(
        this.getOrderRepository(), this.getEventBus(), this.getLogger()
      );
    });
  }

  /** @return {SearchOrdersUseCase} */
  getSearchOrdersUseCase() {
    return this.get_('ucSearch', function () {
      return new SearchOrdersUseCase(
        this.getSearchEngine(), this.getRateLimiter(), this.getLogger()
      );
    });
  }

  /** @return {CalculateKPIsUseCase} */
  getCalculateKPIsUseCase() {
    return this.get_('ucKpi', function () {
      return new CalculateKPIsUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getCache(), this.getLogger()
      );
    });
  }

  /** @return {GenerateChartsUseCase} */
  getGenerateChartsUseCase() {
    return this.get_('ucCharts', function () {
      return new GenerateChartsUseCase(
        this.getOrderRepository(), this.getCustomerRepository(), this.getLogger()
      );
    });
  }

  /** @return {GenerateTablesUseCase} */
  getGenerateTablesUseCase() {
    return this.get_('ucTables', function () {
      return new GenerateTablesUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getProductRepository(), this.getLogger()
      );
    });
  }

  /** @return {EvaluateAlertRulesUseCase} */
  getEvaluateAlertsUseCase() {
    return this.get_('ucEvalAlerts', function () {
      return new EvaluateAlertRulesUseCase(
        this.getAlertEngine(), this.getOrderRepository(),
        this.getProductRepository(), this.getTicketRepository(), this.getLogger()
      );
    });
  }

  /** @return {GetAlertStatisticsUseCase} */
  getAlertStatisticsUseCase() {
    return this.get_('ucAlertStats', function () {
      return new GetAlertStatisticsUseCase(
        this.getAlertHistory(), this.getAlertRules(), this.getLogger()
      );
    });
  }

  /** @return {AuthenticateCustomerUseCase} */
  getAuthenticateCustomerUseCase() {
    return this.get_('ucAuth', function () {
      return new AuthenticateCustomerUseCase(
        this.getCustomerRepository(), this.getOtpService(),
        this.getSessionService(), this.getLogger()
      );
    });
  }

  /** @return {CreateSupportTicketUseCase} */
  getCreateTicketUseCase() {
    return this.get_('ucCreateTicket', function () {
      return new CreateSupportTicketUseCase(
        this.getTicketRepository(), this.getEventBus(), this.getLogger()
      );
    });
  }

  /* ---------------- Controllers & Router ---------------- */

  /** @return {OrderController} */
  getOrderController() {
    return this.get_('ctrlOrder', function () {
      return new OrderController(
        this.getCreateOrderUseCase(), this.getUpdateOrderStatusUseCase(),
        this.getSearchOrdersUseCase(), this.getLogger()
      );
    });
  }

  /** @return {DashboardController} */
  getDashboardController() {
    return this.get_('ctrlDashboard', function () {
      return new DashboardController(
        this.getCalculateKPIsUseCase(), this.getGenerateChartsUseCase(),
        this.getGenerateTablesUseCase(), this.getAlertStatisticsUseCase(),
        this.getLogger()
      );
    });
  }

  /** @return {PortalController} */
  getPortalController() {
    return this.get_('ctrlPortal', function () {
      return new PortalController(
        this.getAuthenticateCustomerUseCase(), this.getCreateTicketUseCase(),
        this.getOrderRepository(), this.getTicketRepository(),
        this.getSessionService(), this.getLogger()
      );
    });
  }

  /** @return {Router} Fully-wired HTTP router. */
  getRouter() {
    return this.get_('router', function () {
      return new Router({
        dashboard: this.getDashboardController(),
        order: this.getOrderController(),
        portal: this.getPortalController()
      }, this.getLogger());
    });
  }
}

/**
 * Per-execution container accessor. Apps Script runs are
 * single-shot, so a module-level instance is safe and gives
 * us singletons scoped to the execution.
 * @return {DependencyContainer}
 */
function container() {
  if (!globalThis.__container__) {
    globalThis.__container__ = new DependencyContainer();
  }
  return globalThis.__container__;
}
