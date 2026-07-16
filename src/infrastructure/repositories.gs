/**
 * ============================================================
 * Infrastructure Layer — Repositories
 * ------------------------------------------------------------
 * Sheet-backed persistence. Every repository stores entities as
 * JSON documents in a single 'data' column — this keeps the
 * schema evolvable and avoids brittle column-index mapping.
 *
 *   - BaseRepository     : sheet access + JSON row codec + lock
 *   - OrderRepository    : orders sheet
 *   - CustomerRepository : customers sheet (+ phone lookup)
 *   - TicketRepository   : support tickets sheet
 *   - ProductRepository  : products sheet (stock checks)
 * ============================================================
 */

/* ------------------------------------------------------------
 * BaseRepository
 * ----------------------------------------------------------*/

class BaseRepository {
  /**
   * @param {string} sheetName Target sheet/tab name.
   * @param {Logger} logger
   */
  constructor(sheetName, logger) {
    this.sheetName = sheetName;
    this.logger = logger;
    /** @private lazy sheet reference */
    this.sheet_ = null;
  }

  /**
   * Lazily resolves the sheet; creates it with headers on first use.
   * @protected
   * @return {Sheet}
   */
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

  /**
   * Reads all rows as parsed JSON documents.
   * @protected
   * @return {Object[]}
   */
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

  /**
   * Finds the 1-based row index for an id, or -1.
   * @protected
   * @param {string} id
   * @return {number}
   */
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

  /**
   * Inserts or updates a document under a document lock so
   * concurrent executions cannot corrupt the sheet.
   * @protected
   * @param {string} id
   * @param {Object} doc Plain serialisable entity.
   */
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

  /**
   * Deletes a row by id.
   * @protected
   * @param {string} id
   * @return {boolean} True when a row was removed.
   */
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

/* ------------------------------------------------------------
 * OrderRepository
 * ----------------------------------------------------------*/

class OrderRepository extends BaseRepository {
  /** @param {Logger} logger */
  constructor(logger) {
    super('orders', logger);
  }

  /** @return {Order[]} All orders, newest first. */
  findAll() {
    return this.readAll_()
      .map(function (raw) { return Order.fromJSON(raw); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  /**
   * @param {string} id
   * @return {Order|null}
   */
  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? Order.fromJSON(JSON.parse(raw)) : null;
  }

  /**
   * @param {string} customerId
   * @return {Order[]} Customer's orders, newest first.
   */
  findByCustomerId(customerId) {
    return this.findAll().filter(function (o) {
      return o.customerId === String(customerId);
    });
  }

  /**
   * @param {string} status One of OrderStatus.
   * @return {Order[]}
   */
  findByStatus(status) {
    return this.findAll().filter(function (o) { return o.status === status; });
  }

  /**
   * Persists an order (insert or update).
   * @param {Order} order
   * @return {Order}
   */
  save(order) {
    this.persist_(order.id, order.toJSON());
    this.logger.debug('order saved', { id: order.id, status: order.status });
    return order;
  }
}

/* ------------------------------------------------------------
 * CustomerRepository
 * ----------------------------------------------------------*/

class CustomerRepository extends BaseRepository {
  /** @param {Logger} logger */
  constructor(logger) {
    super('customers', logger);
  }

  /** @return {Customer[]} */
  findAll() {
    return this.readAll_().map(function (raw) { return Customer.fromJSON(raw); });
  }

  /**
   * @param {string} id
   * @return {Customer|null}
   */
  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? Customer.fromJSON(JSON.parse(raw)) : null;
  }

  /**
   * Phone is the natural login key for the customer portal.
   * @param {string} phone
   * @return {Customer|null}
   */
  findByPhone(phone) {
    const target = String(phone).replace(/\s+/g, '');
    const all = this.findAll();
    for (let i = 0; i < all.length; i++) {
      if (all[i].phone.replace(/\s+/g, '') === target) return all[i];
    }
    return null;
  }

  /**
   * @param {Customer} customer
   * @return {Customer}
   */
  save(customer) {
    this.persist_(customer.id, customer.toJSON());
    this.logger.debug('customer saved', { id: customer.id });
    return customer;
  }
}

/* ------------------------------------------------------------
 * TicketRepository
 * ----------------------------------------------------------*/

class TicketRepository extends BaseRepository {
  /** @param {Logger} logger */
  constructor(logger) {
    super('support_tickets', logger);
  }

  /** @return {SupportTicket[]} Newest first. */
  findAll() {
    return this.readAll_()
      .map(function (raw) { return SupportTicket.fromJSON(raw); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  /**
   * @param {string} id
   * @return {SupportTicket|null}
   */
  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? SupportTicket.fromJSON(JSON.parse(raw)) : null;
  }

  /**
   * @param {string} customerId
   * @return {SupportTicket[]}
   */
  findByCustomerId(customerId) {
    return this.findAll().filter(function (t) {
      return t.customerId === String(customerId);
    });
  }

  /**
   * @param {SupportTicket} ticket
   * @return {SupportTicket}
   */
  save(ticket) {
    this.persist_(ticket.id, ticket.toJSON());
    this.logger.debug('ticket saved', { id: ticket.id, status: ticket.status });
    return ticket;
  }
}

/* ------------------------------------------------------------
 * ProductRepository
 * ----------------------------------------------------------*/

class ProductRepository extends BaseRepository {
  /** @param {Logger} logger */
  constructor(logger) {
    super('products', logger);
  }

  /** @return {Object[]} Plain product documents. */
  findAll() {
    return this.readAll_();
  }

  /**
   * @param {string} id
   * @return {Object|null}
   */
  findById(id) {
    const row = this.findRowById_(id);
    if (row === -1) return null;
    const raw = this.getSheet_().getRange(row, 2).getValue();
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * @param {number} threshold Products at/below this stock level.
   * @return {Object[]}
   */
  findLowStock(threshold) {
    const limit = typeof threshold === 'number' ? threshold : 10;
    return this.findAll().filter(function (p) {
      return typeof p.stock === 'number' && p.stock <= limit;
    });
  }

  /**
   * @param {Object} product Plain product document (must include id).
   * @return {Object}
   */
  save(product) {
    if (!product.id) throw new DomainError('معرّف المنتج مطلوب', 'PRODUCT_ID_REQUIRED');
    this.persist_(product.id, product);
    return product;
  }
}
