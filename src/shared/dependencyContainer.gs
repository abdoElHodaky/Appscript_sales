/**
 * ============================================================
 * Shared Layer — Dependency Container  [v5.1]
 * ------------------------------------------------------------
 * Changes:
 *   - Added AppSheet Sync dependencies
 *   - CreateOrderUseCase now receives ProductRepository
 *   - Router includes AppSheetController
 *   - wireAppSheetSync() method added
 * ============================================================
 */

class DependencyContainer {
  constructor() {
    this.singletons_ = {};
  }

  get_(key, factory) {
    if (!this.singletons_[key]) this.singletons_[key] = factory.call(this);
    return this.singletons_[key];
  }

  getLogger() {
    return this.get_('logger', function () { return new Logger({ minLevel: LogLevel.INFO }); });
  }

  getCache() {
    return this.get_('cache', function () { return CacheService.getScriptCache(); });
  }

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

  getRateLimiter() {
    return this.get_('rateLimiter', function () {
      return new RateLimiter(this.getCache(), this.getLogger());
    });
  }

  getOrderRepository() {
    return this.get_('orderRepo', function () { return new OrderRepository(this.getLogger()); });
  }

  getCustomerRepository() {
    return this.get_('customerRepo', function () { return new CustomerRepository(this.getLogger()); });
  }

  getTicketRepository() {
    return this.get_('ticketRepo', function () { return new TicketRepository(this.getLogger()); });
  }

  getProductRepository() {
    return this.get_('productRepo', function () { return new ProductRepository(this.getLogger()); });
  }

  getSearchEngine() {
    return this.get_('searchEngine', function () {
      return new SearchEngine(this.getOrderRepository(), this.getCache(), this.getLogger());
    });
  }

  getOtpService() {
    return this.get_('otpService', function () {
      return new OtpService(this.getCache(), this.getRateLimiter(), this.getLogger());
    });
  }

  getSessionService() {
    return this.get_('sessionService', function () {
      return new SessionService(this.getCache(), this.getLogger());
    });
  }

  getAlertRules() {
    return this.get_('alertRules', function () { return defaultAlertRules(); });
  }

  getAlertHistory() {
    return this.get_('alertHistory', function () {
      return new AlertHistory(this.getCache(), this.getLogger());
    });
  }

  getAlertDelivery() {
    return this.get_('alertDelivery', function () { return new AlertDelivery(this.getLogger()); });
  }

  getAlertEngine() {
    return this.get_('alertEngine', function () {
      return new AlertEngine(
        this.getAlertRules(), this.getAlertHistory(),
        this.getAlertDelivery(), this.getLogger()
      );
    });
  }

  /* ---------- NEW: AppSheet Sync ---------- */

  getAppSheetSyncService() {
    return this.get_('appSheetSync', function () {
      return new AppSheetSyncService(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getTicketRepository(), this.getLogger()
      );
    });
  }

  getSyncOrderToAppSheetUseCase() {
    return this.get_('ucSyncToAppSheet', function () {
      return new SyncOrderToAppSheetUseCase(
        this.getAppSheetSyncService(), this.getLogger()
      );
    });
  }

  getSyncOrdersFromAppSheetUseCase() {
    return this.get_('ucSyncFromAppSheet', function () {
      return new SyncOrdersFromAppSheetUseCase(
        this.getAppSheetSyncService(), this.getEventBus(), this.getLogger()
      );
    });
  }

  getSyncAllToAppSheetUseCase() {
    return this.get_('ucSyncAll', function () {
      return new SyncAllToAppSheetUseCase(
        this.getAppSheetSyncService(), this.getLogger()
      );
    });
  }

  getAppSheetController() {
    return this.get_('ctrlAppSheet', function () {
      return new AppSheetController(
        this.getSyncOrdersFromAppSheetUseCase(),
        this.getSyncOrderToAppSheetUseCase(),
        this.getSyncAllToAppSheetUseCase(),
        this.getLogger()
      );
    });
  }

  /* ---------- Use Cases ---------- */

  getCreateOrderUseCase() {
    return this.get_('ucCreateOrder', function () {
      return new CreateOrderUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getProductRepository(),
        this.getEventBus(), this.getLogger()
      );
    });
  }

  getUpdateOrderStatusUseCase() {
    return this.get_('ucUpdateStatus', function () {
      return new UpdateOrderStatusUseCase(
        this.getOrderRepository(), this.getProductRepository(),
        this.getEventBus(), this.getLogger()
      );
    });
  }

  getSearchOrdersUseCase() {
    return this.get_('ucSearch', function () {
      return new SearchOrdersUseCase(
        this.getSearchEngine(), this.getRateLimiter(), this.getLogger()
      );
    });
  }

  getCalculateKPIsUseCase() {
    return this.get_('ucKpi', function () {
      return new CalculateKPIsUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getCache(), this.getLogger()
      );
    });
  }

  getGenerateChartsUseCase() {
    return this.get_('ucCharts', function () {
      return new GenerateChartsUseCase(
        this.getOrderRepository(), this.getCustomerRepository(), this.getLogger()
      );
    });
  }

  getGenerateTablesUseCase() {
    return this.get_('ucTables', function () {
      return new GenerateTablesUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getProductRepository(), this.getLogger()
      );
    });
  }

  getEvaluateAlertsUseCase() {
    return this.get_('ucEvalAlerts', function () {
      return new EvaluateAlertRulesUseCase(
        this.getAlertEngine(), this.getOrderRepository(),
        this.getProductRepository(), this.getTicketRepository(), this.getLogger()
      );
    });
  }

  getAlertStatisticsUseCase() {
    return this.get_('ucAlertStats', function () {
      return new GetAlertStatisticsUseCase(
        this.getAlertHistory(), this.getAlertRules(), this.getLogger()
      );
    });
  }

  getGenerateInvoiceUseCase() {
    return this.get_('ucInvoice', function () {
      return new GenerateInvoiceUseCase(
        this.getOrderRepository(), this.getCustomerRepository(), this.getLogger()
      );
    });
  }

  getSystemStatusUseCase() {
    return this.get_('ucStatus', function () {
      return new GetSystemStatusUseCase(
        this.getOrderRepository(), this.getCustomerRepository(),
        this.getProductRepository(), this.getTicketRepository(), this.getLogger()
      );
    });
  }

  getAuthenticateCustomerUseCase() {
    return this.get_('ucAuth', function () {
      return new AuthenticateCustomerUseCase(
        this.getCustomerRepository(), this.getOtpService(),
        this.getSessionService(), this.getLogger()
      );
    });
  }

  getCreateTicketUseCase() {
    return this.get_('ucCreateTicket', function () {
      return new CreateSupportTicketUseCase(
        this.getTicketRepository(), this.getEventBus(), this.getLogger()
      );
    });
  }

  /* ---------- Controllers & Router ---------- */

  getOrderController() {
    return this.get_('ctrlOrder', function () {
      return new OrderController(
        this.getCreateOrderUseCase(), this.getUpdateOrderStatusUseCase(),
        this.getSearchOrdersUseCase(), this.getGenerateInvoiceUseCase(),
        this.getLogger()
      );
    });
  }

  getDashboardController() {
    return this.get_('ctrlDashboard', function () {
      return new DashboardController(
        this.getCalculateKPIsUseCase(), this.getGenerateChartsUseCase(),
        this.getGenerateTablesUseCase(), this.getAlertStatisticsUseCase(),
        this.getSystemStatusUseCase(), this.getLogger()
      );
    });
  }

  getPortalController() {
    return this.get_('ctrlPortal', function () {
      return new PortalController(
        this.getAuthenticateCustomerUseCase(), this.getCreateTicketUseCase(),
        this.getOrderRepository(), this.getTicketRepository(),
        this.getSessionService(), this.getLogger()
      );
    });
  }

  getRouter() {
    return this.get_('router', function () {
      return new Router({
        dashboard: this.getDashboardController(),
        order: this.getOrderController(),
        portal: this.getPortalController(),
        appSheet: this.getAppSheetController()
      }, this.getLogger());
    });
  }

  /* ---------- NEW: wire AppSheet event listeners ---------- */

  wireAppSheetSync() {
    if (this.appSheetWired_) return;
    this.appSheetWired_ = true;
    const bus = this.getEventBus();
    const logger = this.getLogger();
    const syncToAppSheet = this.getSyncOrderToAppSheetUseCase();
    const syncSvc = this.getAppSheetSyncService();
    bus.subscribe('order.created', function (p) {
      try { syncToAppSheet.execute(p.id); } catch (e) {
        logger.error('appsheet sync failed', { error: e.message });
      }
    });
    bus.subscribe('order.statusChanged', function (p) {
      try { syncToAppSheet.execute(p.id); } catch (e) {
        logger.error('appsheet sync failed', { error: e.message });
      }
    });
    bus.subscribe('customer.updated', function (p) {
      try { syncSvc.syncCustomerToAppSheet(new Customer(p)); } catch (e) {
        logger.error('appsheet customer sync failed', { error: e.message });
      }
    });
  }
}

function container() {
  if (!globalThis.__container__) {
    globalThis.__container__ = new DependencyContainer();
  }
  return globalThis.__container__;
}
