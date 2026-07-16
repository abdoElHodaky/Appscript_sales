/**
 * ============================================================
 * Application Layer — DTOs
 * ------------------------------------------------------------
 * Every piece of external input crosses the boundary through a
 * DTO with schema validation. Controllers never touch raw input.
 *
 *   - BaseDTO                 : validation toolkit
 *   - CreateOrderDTO          : new order payload
 *   - UpdateOrderStatusDTO    : status transition request
 *   - SearchOrdersDTO         : search parameters
 *   - DashboardQueryDTO       : dashboard filters
 *   - RequestOtpDTO           : OTP issuance
 *   - VerifyOtpDTO            : OTP verification
 *   - CreateTicketDTO         : support ticket payload
 *   - CreateCustomerDTO       : customer registration
 * ============================================================
 */

/* ------------------------------------------------------------
 * BaseDTO — shared validation toolkit
 * ----------------------------------------------------------*/

class BaseDTO {
  constructor() {
    /** @protected {string[]} accumulated validation errors */
    this.errors_ = [];
  }

  /** @protected */
  require_(field, value, minLen) {
    const s = value == null ? '' : String(value).trim();
    if (!s || s.length < (minLen || 1)) {
      this.errors_.push(field + ': مطلوب' + (minLen ? ' (' + minLen + ' أحرف على الأقل)' : ''));
      return '';
    }
    return s;
  }

  /** @protected */
  optional_(value, fallback) {
    return value == null || value === '' ? (fallback || '') : String(value).trim();
  }

  /** @protected */
  requirePositiveInt_(field, value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      this.errors_.push(field + ': يجب أن يكون عدداً صحيحاً موجباً');
      return 0;
    }
    return n;
  }

  /** @protected */
  requireNonNegativeNumber_(field, value) {
    const n = Number(value);
    if (typeof n !== 'number' || isNaN(n) || n < 0) {
      this.errors_.push(field + ': يجب أن يكون رقماً غير سالب');
      return 0;
    }
    return n;
  }

  /** @protected */
  requireEnum_(field, value, allowed) {
    const s = String(value || '');
    if (allowed.indexOf(s) === -1) {
      this.errors_.push(field + ': قيمة غير مسموحة (' + allowed.join(' | ') + ')');
      return '';
    }
    return s;
  }

  /** @protected */
  requirePhone_(field, value) {
    const s = this.require_(field, value, 7);
    if (s && !/^[+0-9][0-9\s-]{6,14}$/.test(s)) {
      this.errors_.push(field + ': رقم جوال غير صالح');
    }
    return s;
  }

  /**
   * @return {boolean} True when no validation errors accumulated.
   */
  isValid() {
    return this.errors_.length === 0;
  }

  /**
   * @return {string[]} Validation error list (empty when valid).
   */
  getErrors() {
    return this.errors_.slice();
  }
}

/* ------------------------------------------------------------
 * CreateOrderDTO
 * ----------------------------------------------------------*/

class CreateOrderDTO extends BaseDTO {
  /**
   * @param {Object} data Raw input {customerId, customerName, city, notes, items[]}
   */
  constructor(data) {
    super();
    const d = data || {};
    this.customerId = this.require_('customerId', d.customerId);
    this.customerName = this.require_('customerName', d.customerName, 2);
    this.city = this.optional_(Xss.sanitizeInput(d.city));
    this.notes = this.optional_(Xss.sanitizeInput(d.notes));

    this.items = [];
    const rawItems = Array.isArray(d.items) ? d.items : [];
    if (!rawItems.length) {
      this.errors_.push('items: صنف واحد على الأقل مطلوب');
    }
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i] || {};
      this.items.push({
        productId: this.require_('items[' + i + '].productId', it.productId),
        productName: this.optional_(Xss.sanitizeInput(it.productName)),
        quantity: this.requirePositiveInt_('items[' + i + '].quantity', it.quantity),
        unitPrice: this.requireNonNegativeNumber_('items[' + i + '].unitPrice', it.unitPrice)
      });
    }
  }
}

/* ------------------------------------------------------------
 * UpdateOrderStatusDTO
 * ----------------------------------------------------------*/

class UpdateOrderStatusDTO extends BaseDTO {
  /**
   * @param {Object} data {orderId, newStatus}
   */
  constructor(data) {
    super();
    const d = data || {};
    this.orderId = this.require_('orderId', d.orderId);
    this.newStatus = this.requireEnum_('newStatus', d.newStatus, [
      OrderStatus.NEW, OrderStatus.IN_PROGRESS, OrderStatus.SHIPPED,
      OrderStatus.COMPLETED, OrderStatus.CANCELLED
    ]);
    this.reason = this.optional_(Xss.sanitizeInput(d.reason));
  }
}

/* ------------------------------------------------------------
 * SearchOrdersDTO
 * ----------------------------------------------------------*/

class SearchOrdersDTO extends BaseDTO {
  /**
   * @param {Object} data {text, status, city, customerId, sortBy, sortDir, page, pageSize}
   */
  constructor(data) {
    super();
    const d = data || {};
    this.text = this.optional_(Xss.sanitizeInput(d.text));
    this.status = this.optional_(d.status);
    if (this.status && !OrderStateMachine.transitions.hasOwnProperty(this.status)) {
      this.errors_.push('status: حالة غير معروفة');
    }
    this.city = this.optional_(Xss.sanitizeInput(d.city));
    this.customerId = this.optional_(d.customerId);
    this.sortBy = this.optional_(d.sortBy, 'createdAt');
    this.sortDir = this.optional_(d.sortDir, 'desc');
    const page = parseInt(d.page, 10);
    const size = parseInt(d.pageSize, 10);
    this.page = Number.isInteger(page) && page > 0 ? page : 1;
    this.pageSize = Number.isInteger(size) && size > 0 ? Math.min(size, 100) : 20;
  }
}

/* ------------------------------------------------------------
 * DashboardQueryDTO
 * ----------------------------------------------------------*/

class DashboardQueryDTO extends BaseDTO {
  /**
   * @param {Object} data {dateRange, customFrom, customTo, userRole, userEmail}
   */
  constructor(data) {
    super();
    const d = data || {};
    this.dateRange = this.requireEnum_('dateRange', d.dateRange || DateRange.Names.THIS_MONTH, [
      DateRange.Names.TODAY, DateRange.Names.THIS_WEEK,
      DateRange.Names.THIS_MONTH, DateRange.Names.THIS_YEAR, DateRange.Names.CUSTOM
    ]);
    this.customFrom = this.optional_(d.customFrom);
    this.customTo = this.optional_(d.customTo);
    this.userRole = this.requireEnum_('userRole', d.userRole || Role.ADMIN, [
      Role.ADMIN, Role.MANAGER, Role.SALES
    ]);
    this.userEmail = this.optional_(d.userEmail);
  }
}

/* ------------------------------------------------------------
 * RequestOtpDTO
 * ----------------------------------------------------------*/

class RequestOtpDTO extends BaseDTO {
  /** @param {Object} data {phone} */
  constructor(data) {
    super();
    const d = data || {};
    this.phone = this.requirePhone_('phone', d.phone);
  }
}

/* ------------------------------------------------------------
 * VerifyOtpDTO
 * ----------------------------------------------------------*/

class VerifyOtpDTO extends BaseDTO {
  /** @param {Object} data {phone, code} */
  constructor(data) {
    super();
    const d = data || {};
    this.phone = this.requirePhone_('phone', d.phone);
    this.code = this.require_('code', d.code, 6);
    if (this.code && !/^\d{6}$/.test(this.code)) {
      this.errors_.push('code: يجب أن يكون 6 أرقام');
    }
  }
}

/* ------------------------------------------------------------
 * CreateTicketDTO
 * ----------------------------------------------------------*/

class CreateTicketDTO extends BaseDTO {
  /** @param {Object} data {subject, message} (customerId from session) */
  constructor(data) {
    super();
    const d = data || {};
    this.subject = this.require_('subject', Xss.sanitizeInput(d.subject), 5);
    this.message = this.require_('message', Xss.sanitizeInput(d.message), 10);
  }
}

/* ------------------------------------------------------------
 * CreateCustomerDTO
 * ----------------------------------------------------------*/

class CreateCustomerDTO extends BaseDTO {
  /** @param {Object} data {name, phone, email, city} */
  constructor(data) {
    super();
    const d = data || {};
    this.name = this.require_('name', Xss.sanitizeInput(d.name), 2);
    this.phone = this.requirePhone_('phone', d.phone);
    this.email = this.optional_(d.email);
    if (this.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.errors_.push('email: صيغة بريد غير صالحة');
    }
    this.city = this.optional_(Xss.sanitizeInput(d.city));
  }
}
