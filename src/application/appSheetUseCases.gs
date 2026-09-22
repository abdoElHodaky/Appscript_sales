/**
 * ============================================================
 * Application Layer — AppSheet Sync Use Cases
 * ------------------------------------------------------------
 * 1. SyncOrdersFromAppSheetUseCase  : inbound (AppSheet → System)
 * 2. SyncOrderToAppSheetUseCase     : outbound single order
 * 3. SyncAllToAppSheetUseCase       : bulk outbound seed
 * ============================================================
 */

class SyncOrdersFromAppSheetUseCase extends BaseUseCase {
  constructor(syncService, eventBus, logger) {
    super();
    this.syncService = syncService;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  execute() {
    this.logger.info('appsheet: inbound sync start');
    const changes = this.syncService.syncOrdersFromAppSheet();
    const results = this.syncService.applyOrderChanges(changes);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'created') {
        this.eventBus.publish('order.created', { id: r.id, source: 'appsheet' });
      } else if (r.status === 'updated') {
        this.eventBus.publish('order.statusChanged', { id: r.id, source: 'appsheet' });
      }
    }

    for (let i = 0; i < changes.length; i++) {
      if (results[i] && results[i].status === 'error') {
        this.syncService.markAsError('app_orders', changes[i].rowIndex, results[i].code);
      } else {
        this.syncService.markAsSynced('app_orders', changes[i].rowIndex);
      }
    }

    this.logger.info('appsheet: inbound sync done', { count: results.length });
    return { synced: results.length, details: results };
  }
}

class SyncOrderToAppSheetUseCase extends BaseUseCase {
  constructor(syncService, logger) {
    super();
    this.syncService = syncService;
    this.logger = logger;
  }

  execute(orderId) {
    const order = this.syncService.orderRepo.findById(orderId);
    if (!order) {
      throw new DomainError('الطلب غير موجود: ' + orderId, 'ORDER_NOT_FOUND');
    }
    this.syncService.syncOrderToAppSheet(order);
    return { synced: true, id: orderId };
  }
}

class SyncAllToAppSheetUseCase extends BaseUseCase {
  constructor(syncService, logger) {
    super();
    this.syncService = syncService;
    this.logger = logger;
  }

  execute() {
    const orders = this.syncService.orderRepo.findAll();
    for (let i = 0; i < orders.length; i++) {
      this.syncService.syncOrderToAppSheet(orders[i]);
    }
    const customers = this.syncService.customerRepo.findAll();
    for (let i = 0; i < customers.length; i++) {
      this.syncService.syncCustomerToAppSheet(customers[i]);
    }
    this.logger.info('appsheet: bulk sync done', {
      orders: orders.length,
      customers: customers.length
    });
    return { orders: orders.length, customers: customers.length };
  }
}
