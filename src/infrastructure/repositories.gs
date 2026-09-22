/**
 * ============================================================
 * Infrastructure Layer — Repositories
 * ============================================================
 */

class BaseRepository {
  constructor(sheetName, logger) {
    this.sheetName = sheetName;
    this.logger = logger;
    this.sheet_ = null;
  }

  getSheet_() {
    if (this.sheet_) return this.sheet_;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(this.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(this.sheetName);
      sheet.getRange(1, 1, 1, 2).setValues([['id', 'data']]);
      this.logger.info('sheet created', { sheet: this.sheetName });
    }
    this.sheet_ = sheet;
    return sheet;
  }

  readAll_() {
    const sheet = this.getSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const out = [];
    for (let i = 0; i < values.length; i++) {
      if (!values[i][0]) continue;
      try {
        out.push(JSON.parse(values[i][1]));
      } catch (err) {
        this.logger.warn('corrupt row skipped', { sheet: this.sheetName, row: i + 2 });
      }
    }
    return out;
  }

  findRowById_(id) {
    const sheet = this.getSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) return i + 2;
    }
    return -1;
  }

  persist_(id, doc) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = this.getSheet_();
      const row = this.findRowById_(id);
      const payload = [[String(id), JSON.stringify(doc)]];
      if (row === -1) {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues(payload);
      } else {
        sheet.getRange(row, 1, 1, 2).setValues(payload);
      }
    } finally {
      lock.releaseLock();
    }
  }

  deleteById_(id) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const row = this.findRowById_(id);
      if (row === -1) return false;
      this.getSheet_().deleteRow(row);
      return true;
    } finally {
      lock.releaseLock();
    }
  }
}

class OrderRepository extends BaseRepository {
  constructor(logger) {
    super('orders', logger);
  }

  findAll() {
    return this.readAll_()
      .map(function (raw) { return Order.fromJSON(raw); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? Order.fromJSON(JSON.parse(raw)) : null;
  }

  findByCustomerId(customerId) {
    return this.findAll().filter(function (o) {
      return o.customerId === String(customerId);
    });
  }

  findByStatus(status) {
    return this.findAll().filter(function (o) { return o.status === status; });
  }

  save(order) {
    this.persist_(order.id, order.toJSON());
    this.logger.debug('order saved', { id: order.id, status: order.status });
    return order;
  }

  deleteById(id) {
    return this.deleteById_(id);
  }
}

class CustomerRepository extends BaseRepository {
  constructor(logger) {
    super('customers', logger);
  }

  findAll() {
    return this.readAll_().map(function (raw) { return Customer.fromJSON(raw); });
  }

  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? Customer.fromJSON(JSON.parse(raw)) : null;
  }

  findByPhone(phone) {
    const target = String(phone).replace(/\s+/g, '');
    const all = this.findAll();
    for (let i = 0; i < all.length; i++) {
      if (all[i].phone.replace(/\s+/g, '') === target) return all[i];
    }
    return null;
  }

  save(customer) {
    this.persist_(customer.id, customer.toJSON());
    this.logger.debug('customer saved', { id: customer.id });
    return customer;
  }
}

class TicketRepository extends BaseRepository {
  constructor(logger) {
    super('support_tickets', logger);
  }

  findAll() {
    return this.readAll_()
      .map(function (raw) { return SupportTicket.fromJSON(raw); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? SupportTicket.fromJSON(JSON.parse(raw)) : null;
  }

  findByCustomerId(customerId) {
    return this.findAll().filter(function (t) {
      return t.customerId === String(customerId);
    });
  }

  save(ticket) {
    this.persist_(ticket.id, ticket.toJSON());
    this.logger.debug('ticket saved', { id: ticket.id, status: ticket.status });
    return ticket;
  }
}

class ProductRepository extends BaseRepository {
  constructor(logger) {
    super('products', logger);
  }

  findAll() {
    return this.readAll_();
  }

  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? JSON.parse(raw) : null;
  }

  findLowStock(threshold) {
    const limit = typeof threshold === 'number' ? threshold : 10;
    return this.findAll().filter(function (p) {
      return typeof p.stock === 'number' && p.stock <= limit;
    });
  }

  save(product) {
    if (!product.id) throw new DomainError('معرّف المنتج مطلوب', 'PRODUCT_ID_REQUIRED');
    this.persist_(product.id, product);
    return product;
  }
}
