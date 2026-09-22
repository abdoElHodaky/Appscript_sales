/**
 * ============================================================
 * Domain Layer — Entities & State Machines
 * ============================================================
 */

class DomainError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DomainError';
    this.code = code || 'DOMAIN_RULE_VIOLATION';
  }
}

const OrderStatus = Object.freeze({
  NEW: 'جديد',
  IN_PROGRESS: 'قيد التنفيذ',
  SHIPPED: 'تم الشحن',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي'
});

const OrderStateMachine = Object.freeze({
  transitions: Object.freeze({
    [OrderStatus.NEW]: Object.freeze([OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED]),
    [OrderStatus.IN_PROGRESS]: Object.freeze([OrderStatus.SHIPPED, OrderStatus.CANCELLED]),
    [OrderStatus.SHIPPED]: Object.freeze([OrderStatus.COMPLETED]),
    [OrderStatus.COMPLETED]: Object.freeze([]),
    [OrderStatus.CANCELLED]: Object.freeze([])
  }),

  canTransition(from, to) {
    const allowed = this.transitions[from];
    return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
  },

  isTerminal(status) {
    const allowed = this.transitions[status];
    return Array.isArray(allowed) && allowed.length === 0;
  },

  assertTransition(from, to) {
    if (!this.canTransition(from, to)) {
      throw new DomainError(
        'لا يمكن نقل الطلب من "' + from + '" إلى "' + to + '"',
        'INVALID_TRANSITION'
      );
    }
  }
});

const TicketStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
});

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

class OrderItem {
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

  getLineTotal() {
    return this.quantity * this.unitPrice;
  }

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

class Order {
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

  getTotal() {
    return this.items.reduce(function (sum, item) { return sum + item.getLineTotal(); }, 0);
  }

  transitionTo(newStatus) {
    OrderStateMachine.assertTransition(this.status, newStatus);
    this.status = newStatus;
    this.updatedAt = new Date();
  }

  isCancellable() {
    return OrderStateMachine.canTransition(this.status, OrderStatus.CANCELLED);
  }

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

class Customer {
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

  registerOrder(orderTotal) {
    if (typeof orderTotal !== 'number' || orderTotal < 0) {
      throw new DomainError('إجمالي الطلب غير صالح', 'ORDER_TOTAL_INVALID');
    }
    this.totalOrders += 1;
    this.totalSpent += orderTotal;
  }

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

  static fromJSON(raw) {
    return new Customer(raw);
  }
}

class SupportTicket {
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

  transitionTo(newStatus) {
    TicketStateMachine.assertTransition(this.status, newStatus);
    this.status = newStatus;
    this.updatedAt = new Date();
  }

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

  static fromJSON(raw) {
    return new SupportTicket(raw);
  }
}
