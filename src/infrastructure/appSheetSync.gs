/**
 * ============================================================
 * Infrastructure Layer — AppSheet Sync Service
 * ------------------------------------------------------------
 * Two-way sync bridge between JSON-backed domain store
 * and flat-column AppSheet views.
 * ============================================================
 */

class AppSheetSyncService {
  constructor(orderRepo, customerRepo, ticketRepo, logger) {
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.ticketRepo = ticketRepo;
    this.logger = logger;
  }

  static get ORDER_HEADERS() {
    return ['id', 'customerId', 'customerName', 'city', 'status', 'total',
            'items', 'notes', 'createdAt', 'updatedAt', 'sync_source'];
  }

  static get CUSTOMER_HEADERS() {
    return ['id', 'name', 'phone', 'email', 'city', 'totalOrders', 'totalSpent',
            'createdAt', 'sync_source'];
  }

  getOrCreateSheet_(name, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      this.logger.info('appsheet: view created', { sheet: name });
    }
    return sheet;
  }

  findRowById_(sheet, id) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) return i + 2;
    }
    return -1;
  }

  orderToFlat(order) {
    return [
      order.id,
      order.customerId,
      order.customerName,
      order.city,
      order.status,
      order.getTotal(),
      JSON.stringify(order.items.map(function (i) { return i.toJSON(); })),
      order.notes,
      order.createdAt.toISOString(),
      order.updatedAt.toISOString(),
      'system'
    ];
  }

  orderFromFlat(row) {
    const items = JSON.parse(row[6] || '[]').map(function (i) {
      return new OrderItem(i);
    });
    return new Order({
      id: String(row[0]),
      customerId: String(row[1]),
      customerName: String(row[2] || ''),
      city: String(row[3] || ''),
      status: String(row[4]),
      items: items,
      notes: String(row[7] || ''),
      createdAt: row[8],
      updatedAt: row[9]
    });
  }

  syncOrderToAppSheet(order) {
    const sheet = this.getOrCreateSheet_('app_orders', AppSheetSyncService.ORDER_HEADERS);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const row = this.findRowById_(sheet, order.id);
      const flat = this.orderToFlat(order);
      if (row === -1) {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, flat.length).setValues([flat]);
      } else {
        sheet.getRange(row, 1, 1, flat.length).setValues([flat]);
      }
      this.logger.info('appsheet: order synced out', { id: order.id });
    } finally {
      lock.releaseLock();
    }
  }

  syncCustomerToAppSheet(customer) {
    const sheet = this.getOrCreateSheet_('app_customers', AppSheetSyncService.CUSTOMER_HEADERS);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const row = this.findRowById_(sheet, customer.id);
      const flat = [
        customer.id,
        customer.name,
        customer.phone,
        customer.email,
        customer.city,
        customer.totalOrders,
        customer.totalSpent,
        customer.createdAt.toISOString(),
        'system'
      ];
      if (row === -1) {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, flat.length).setValues([flat]);
      } else {
        sheet.getRange(row, 1, 1, flat.length).setValues([flat]);
      }
      this.logger.info('appsheet: customer synced out', { id: customer.id });
    } finally {
      lock.releaseLock();
    }
  }

  syncOrdersFromAppSheet() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('app_orders');
    if (!sheet || sheet.getLastRow() < 2) return [];

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
      const changes = [];
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        if (!row[0]) continue;
        if (row[10] === 'system') continue;

        try {
          const order = this.orderFromFlat(row);
          const existing = this.orderRepo.findById(order.id);
          if (!existing) {
            if (order.status !== OrderStatus.NEW) {
              throw new DomainError(
                'لا يمكن إنشاء طلب بحالة "' + order.status + '" من AppSheet',
                'INVALID_INITIAL_STATUS'
              );
            }
            changes.push({ type: 'created', order: order, existing: null, rowIndex: i + 2 });
          } else {
            const statusChanged = existing.status !== order.status;
            const notesChanged = existing.notes !== order.notes;
            if (statusChanged || notesChanged) {
              changes.push({
                type: 'updated',
                order: order,
                existing: existing,
                rowIndex: i + 2
              });
            }
          }
        } catch (err) {
          this.logger.error('appsheet: row parse failed', {
            row: i + 2,
            error: err.message,
            code: err.code
          });
        }
      }
      return changes;
    } finally {
      lock.releaseLock();
    }
  }

  applyOrderChanges(changes) {
    const results = [];
    for (let i = 0; i < changes.length; i++) {
      const ch = changes[i];
      try {
        if (ch.type === 'created') {
          this.orderRepo.save(ch.order);
          results.push({ id: ch.order.id, status: 'created' });
        } else if (ch.type === 'updated') {
          const existing = ch.existing;
          if (existing.status !== ch.order.status) {
            existing.transitionTo(ch.order.status);
          }
          if (ch.order.notes) {
            existing.notes = ch.order.notes;
            existing.updatedAt = new Date();
          }
          this.orderRepo.save(existing);
          results.push({ id: ch.order.id, status: 'updated' });
        }
      } catch (err) {
        this.logger.error('appsheet: apply failed', {
          id: ch.order.id,
          error: err.message,
          code: err.code
        });
        results.push({
          id: ch.order.id,
          status: 'error',
          error: err.message,
          code: err.code
        });
      }
    }
    return results;
  }

  markAsSynced(sheetName, rowIndex) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (sheet) {
      sheet.getRange(rowIndex, 11).setValue('system');
    }
  }

  markAsError(sheetName, rowIndex, errorCode) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (sheet) {
      sheet.getRange(rowIndex, 11).setValue('error:' + (errorCode || 'UNKNOWN'));
    }
  }
}
