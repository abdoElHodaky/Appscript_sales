/**
 * ============================================================
 * Domain Layer — Entities & State Machines
 * ------------------------------------------------------------
 * Pure business logic. Zero dependencies on Google Apps Script
 * services, frameworks, or infrastructure. Every rule that
 * protects the integrity of the business lives here.
 *
 * Contents:
 *   - DomainError            : typed business-rule violation
 *   - OrderStatus (Enum)     : canonical order states
 *   - OrderStateMachine      : legal order transitions
 *   - TicketStatus (Enum)    : canonical ticket states
 *   - TicketStateMachine     : legal ticket transitions
 *   - OrderItem (Value Obj)  : immutable line item
 *   - Order (Entity)         : aggregate root
 *   - Customer (Entity)
 *   - SupportTicket (Entity)
 * ============================================================
 */

/**
 * Typed error raised when a business rule is violated.
 * Distinguished from technical errors so the interface layer
 * can map it to HTTP 422 instead of 500.
 */
class DomainError extends Error {
  /**
   * @param {string} message  Human-readable rule description.
   * @param {string} [code]   Machine-readable code (e.g. 'INVALID_TRANSITION').
   */
  constructor(message, code) {
    super(message);
    this.name = 'DomainError';
    this.code = code || 'DOMAIN_RULE_VIOLATION';
  }
}

/* ------------------------------------------------------------
 * Order Status — Enum + State Machine
 * ----------------------------------------------------------*/

/** @enum {string} Canonical order lifecycle states. */
const OrderStatus = Object.freeze({
  NEW: 'جديد',
  IN_PROGRESS: 'قيد التنفيذ',
  SHIPPED: 'تم الشحن',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي'
});

/**
 * OrderStateMachine — single source of truth for legal transitions.
 * Terminal states (COMPLETED, CANCELLED) map to empty arrays.
 */
const OrderStateMachine = Object.freeze({
  transitions: Object.freeze({
    [OrderStatus.NEW]: Object.freeze([OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED]),
    [OrderStatus.IN_PROGRESS]: Object.freeze([OrderStatus.SHIPPED, OrderStatus.CANCELLED]),
    [OrderStatus.SHIPPED]: Object.freeze([OrderStatus.COMPLETED]),
    [OrderStatus.COMPLETED]: Object.freeze([]),
    [OrderStatus.CANCELLED]: Object.freeze([])
  }),

  /**
   * @param {string} from Current status.
   * @param {string} to   Desired status.
   * @return {boolean} True when the transition is legal.
   */
  canTransition(from, to) {
    const allowed = this.transitions[from];
    return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
  },

  /**
   * @param {string} status Value to check.
   * @return {boolean} True when no further transitions exist.
   */
  isTerminal(status) {
    const allowed = this.transitions[status];
    return Array.isArray(allowed) && allowed.length === 0;
  },

  /**
   * Asserts a transition or throws DomainError.
   * @param {string} from Current status.
   * @param {string} to   Desired status.
   * @throws {DomainError} When the transition is illegal.
   */
  assertTransition(from, to) {
    if (!this.canTransition(from, to)) {
      throw new DomainError(
        'لا يمكن نقل الطلب من "' + from + '" إلى "' + to + '"',
        'INVALID_TRANSITION'
      );
    }
  }
});

/* ------------------------------------------------------------
 * Ticket Status — Enum + State Machine
 * ----------------------------------------------------------*/

/** @enum {string} Support ticket lifecycle states. */
const TicketStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
});

/** TicketStateMachine — OPEN → IN_PROGRESS → RESOLVED → CLOSED. */
const TicketStateMachine = Object.freeze({
  transitions: Object.freeze({
    [TicketStatus.OPEN]: Object.freeze([TicketStatus.IN_PROGRESS, TicketStatus.CLOSED]),
    [TicketStatus.IN_PROGRESS]: Object.freeze([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
    [TicketStatus.RESOLVED]: Object.freeze([TicketStatus.CLOSED, TicketStatus.IN_PROGRESS]),
    [TicketStatus.CLOSED]: Object.freeze([])
  }),

  canTransition(from, to) {
    const allowed = this.transitions[from];
    return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
  },

  assertTransition(from, to) {
    if (!this.canTransition(from, to)) {
      throw new DomainError(
        'لا يمكن نقل التذكرة من "' + from + '" إلى "' + to + '"',
        'INVALID_TICKET_TRANSITION'
      );
    }
  }
});

/* ------------------------------------------------------------
 * OrderItem — immutable value object
 * ----------------------------------------------------------*/

class OrderItem {
  /**
   * @param {Object} props
   * @param {string} props.productId
   * @param {string} props.productName
   * @param {number} props.quantity   Positive integer.
   * @param {number} props.unitPrice  Non-negative number.
   */
  constructor(props) {
    if (!props.productId) {
      throw new DomainError('معرّف المنتج مطلوب', 'ITEM_PRODUCT_REQUIRED');
    }
    if (!Number.isInteger(props.quantity) || props.quantity <= 0) {
      throw new DomainError('الكمية يجب أن تكون عدداً صحيحاً موجباً', 'ITEM_QTY_INVALID');
    }
    if (typeof props.unitPrice !== 'number' || props.unitPrice < 0) {
      throw new DomainError('سعر الوحدة غير صالح', 'ITEM_PRICE_INVALID');
    }
    this.productId = String(props.productId);
    this.productName = String(props.productName || '');
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    Object.freeze(this);
  }

  /** @return {number} quantity × unitPrice */
  getLineTotal() {
    return this.quantity * this.unitPrice;
  }

  /** @return {Object} Plain serialisable representation. */
  toJSON() {
    return {
      productId: this.productId,
      productName: this.productName,
      quantity: this.quantity,
      unitPrice: this.unitPrice,
      lineTotal: this.getLineTotal()
    };
  }
}

/* ------------------------------------------------------------
 * Order — aggregate root
 * ----------------------------------------------------------*/

class Order {
  /**
   * @param {Object} props
   * @param {string} props.id
   * @param {string} props.customerId
   * @param {string} props.customerName
   * @param {OrderItem[]} props.items
   * @param {string} [props.status]   Defaults to OrderStatus.NEW.
   * @param {string} [props.city]
   * @param {string} [props.notes]
   * @param {Date}   [props.createdAt]
   * @param {Date}   [props.updatedAt]
   */
  constructor(props) {
    if (!props.id) throw new DomainError('معرّف الطلب مطلوب', 'ORDER_ID_REQUIRED');
    if (!props.customerId) throw new DomainError('معرّف العميل مطلوب', 'ORDER_CUSTOMER_REQUIRED');
    if (!Array.isArray(props.items) || props.items.length === 0) {
      throw new DomainError('الطلب يجب أن يحتوي على صنف واحد على الأقل', 'ORDER_ITEMS_EMPTY');
    }
    const status = props.status || OrderStatus.NEW;
    if (!OrderStateMachine.transitions.hasOwnProperty(status)) {
      throw new DomainError('حالة طلب غير معروفة: ' + status, 'ORDER_STATUS_UNKNOWN');
    }
    this.id = String(props.id);
    this.customerId = String(props.customerId);
    this.customerName = String(props.customerName || '');
    this.items = props.items.slice();
    this.status = status;
    this.city = String(props.city || '');
    this.notes = String(props.notes || '');
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this.updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
  }

  /** @return {number} Sum of all line totals. */
  getTotal() {
    return this.items.reduce(function (sum, item) { return sum + item.getLineTotal(); }, 0);
  }

  /**
   * Moves the order to a new status through the state machine.
   * @param {string} newStatus Target status (OrderStatus enum).
   * @throws {DomainError} On illegal transition.
   */
  transitionTo(newStatus) {
    OrderStateMachine.assertTransition(this.status, newStatus);
    this.status = newStatus;
    this.updatedAt = new Date();
  }

  /** @return {boolean} True when the order can still be cancelled. */
  isCancellable() {
    return OrderStateMachine.canTransition(this.status, OrderStatus.CANCELLED);
  }

  /** @return {Object} Plain serialisable representation. */
  toJSON() {
    return {
      id: this.id,
      customerId: this.customerId,
      customerName: this.customerName,
      items: this.items.map(function (i) { return i.toJSON(); }),
      status: this.status,
      city: this.city,
      notes: this.notes,
      total: this.getTotal(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  /**
   * Rehydrates an Order from a plain object (repository row).
   * @param {Object} raw Plain data.
   * @return {Order}
   */
  static fromJSON(raw) {
    const items = (raw.items || []).map(function (i) {
      return new OrderItem(i);
    });
    return new Order({
      id: raw.id,
      customerId: raw.customerId,
      customerName: raw.customerName,
      items: items,
      status: raw.status,
      city: raw.city,
      notes: raw.notes,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    });
  }
}

/* ------------------------------------------------------------
 * Customer — entity
 * ----------------------------------------------------------*/

class Customer {
  /**
   * @param {Object} props
   * @param {string} props.id
   * @param {string} props.name
   * @param {string} props.phone    E.164 or local format; required.
   * @param {string} [props.email]
   * @param {string} [props.city]
   * @param {number} [props.totalOrders]
   * @param {number} [props.totalSpent]
   * @param {Date}   [props.createdAt]
   */
  constructor(props) {
    if (!props.id) throw new DomainError('معرّف العميل مطلوب', 'CUSTOMER_ID_REQUIRED');
    if (!props.name || String(props.name).trim().length < 2) {
      throw new DomainError('اسم العميل يجب أن يكون حرفين على الأقل', 'CUSTOMER_NAME_SHORT');
    }
    if (!props.phone) throw new DomainError('رقم الجوال مطلوب', 'CUSTOMER_PHONE_REQUIRED');
    this.id = String(props.id);
    this.name = String(props.name).trim();
    this.phone = String(props.phone);
    this.email = String(props.email || '');
    this.city = String(props.city || '');
    this.totalOrders = props.totalOrders || 0;
    this.totalSpent = props.totalSpent || 0;
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
  }

  /**
   * Records a completed order against customer aggregates.
   * @param {number} orderTotal Total of the new order.
   */
  registerOrder(orderTotal) {
    if (typeof orderTotal !== 'number' || orderTotal < 0) {
      throw new DomainError('إجمالي الطلب غير صالح', 'ORDER_TOTAL_INVALID');
    }
    this.totalOrders += 1;
    this.totalSpent += orderTotal;
  }

  /** @return {Object} Plain serialisable representation. */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      email: this.email,
      city: this.city,
      totalOrders: this.totalOrders,
      totalSpent: this.totalSpent,
      createdAt: this.createdAt.toISOString()
    };
  }

  /** @return {Customer} Rehydrated entity. */
  static fromJSON(raw) {
    return new Customer(raw);
  }
}

/* ------------------------------------------------------------
 * SupportTicket — entity with state machine
 * ----------------------------------------------------------*/

class SupportTicket {
  /**
   * @param {Object} props
   * @param {string} props.id
   * @param {string} props.customerId
   * @param {string} props.subject   Min 5 characters.
   * @param {string} props.message
   * @param {string} [props.status]  Defaults to TicketStatus.OPEN.
   * @param {Array}  [props.notes]   Internal staff notes.
   * @param {Date}   [props.createdAt]
   * @param {Date}   [props.updatedAt]
   */
  constructor(props) {
    if (!props.id) throw new DomainError('معرّف التذكرة مطلوب', 'TICKET_ID_REQUIRED');
    if (!props.customerId) throw new DomainError('معرّف العميل مطلوب', 'TICKET_CUSTOMER_REQUIRED');
    if (!props.subject || String(props.subject).trim().length < 5) {
      throw new DomainError('موضوع التذكرة يجب أن يكون 5 أحرف على الأقل', 'TICKET_SUBJECT_SHORT');
    }
    this.id = String(props.id);
    this.customerId = String(props.customerId);
    this.subject = String(props.subject).trim();
    this.message = String(props.message || '');
    this.status = props.status || TicketStatus.OPEN;
    this.notes = Array.isArray(props.notes) ? props.notes.slice() : [];
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this.updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
  }

  /**
   * Moves ticket to a new status through the state machine.
   * @param {string} newStatus Target status (TicketStatus enum).
   * @throws {DomainError} On illegal transition.
   */
  transitionTo(newStatus) {
    TicketStateMachine.assertTransition(this.status, newStatus);
    this.status = newStatus;
    this.updatedAt = new Date();
  }

  /**
   * Appends a timestamped staff note.
   * @param {string} author Note author email/name.
   * @param {string} text   Note body.
   */
  addNote(author, text) {
    if (!text || !String(text).trim()) {
      throw new DomainError('نص الملاحظة مطلوب', 'NOTE_EMPTY');
    }
    this.notes.push({
      author: String(author || 'system'),
      text: String(text).trim(),
      at: new Date().toISOString()
    });
    this.updatedAt = new Date();
  }

  /** @return {Object} Plain serialisable representation. */
  toJSON() {
    return {
      id: this.id,
      customerId: this.customerId,
      subject: this.subject,
      message: this.message,
      status: this.status,
      notes: this.notes.slice(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  /** @return {SupportTicket} Rehydrated entity. */
  static fromJSON(raw) {
    return new SupportTicket(raw);
  }
}
