/**
 * ============================================================
 * Shared Layer — Helpers
 * ------------------------------------------------------------
 * Small, dependency-free utilities used across layers:
 *   - IdGenerator  : unique IDs with readable prefixes
 *   - DateRange    : named ranges (TODAY/THIS_WEEK/...) → Date pair
 *   - Formatter    : currency / number / phone masking
 *   - EventBus     : in-process pub/sub for domain events
 * ============================================================
 */

const IdGenerator = {
  next(prefix) {
    const year = new Date().getFullYear();
    const rand = Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
    return prefix + '-' + year + '-' + rand;
  }
};

const DateRange = {
  Names: Object.freeze({
    TODAY: 'TODAY',
    THIS_WEEK: 'THIS_WEEK',
    THIS_MONTH: 'THIS_MONTH',
    THIS_YEAR: 'THIS_YEAR',
    CUSTOM: 'CUSTOM'
  }),

  resolve(name, custom) {
    const now = new Date();
    const endOfDay = function (d) {
      const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
    };
    const startOfDay = function (d) {
      const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
    };
    switch (name) {
      case this.Names.TODAY:
        return { from: startOfDay(now), to: endOfDay(now) };
      case this.Names.THIS_WEEK: {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay());
        return { from: startOfDay(d), to: endOfDay(now) };
      }
      case this.Names.THIS_MONTH: {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: startOfDay(d), to: endOfDay(now) };
      }
      case this.Names.THIS_YEAR: {
        const d = new Date(now.getFullYear(), 0, 1);
        return { from: startOfDay(d), to: endOfDay(now) };
      }
      case this.Names.CUSTOM: {
        if (!custom || !custom.from || !custom.to) {
          throw new DomainError('النطاق المخصص يتطلب from و to', 'CUSTOM_RANGE_INVALID');
        }
        return { from: startOfDay(new Date(custom.from)), to: endOfDay(new Date(custom.to)) };
      }
      default:
        return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    }
  }
};

const Formatter = {
  currency(amount, currency) {
    const n = Number(amount) || 0;
    const symbol = (currency === 'USD') ? '$' : 'ر.س';
    const formatted = n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return currency === 'USD' ? symbol + formatted : formatted + ' ' + symbol;
  },

  number(n) {
    return (Number(n) || 0).toLocaleString('en-US');
  },

  maskPhone(phone) {
    const p = String(phone || '');
    if (p.length <= 7) return '****';
    return p.substring(0, 5) + '****' + p.substring(p.length - 4);
  },

  dateTime(d) {
    if (!d) return '';
    const date = new Date(d);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  }
};

class EventBus {
  constructor() {
    this.handlers_ = {};
  }

  subscribe(eventName, handler) {
    if (!this.handlers_[eventName]) this.handlers_[eventName] = [];
    this.handlers_[eventName].push(handler);
  }

  publish(eventName, payload) {
    const list = this.handlers_[eventName] || [];
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload || {});
      } catch (err) {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'ERROR',
          msg: 'EventBus handler failed',
          ctx: { event: eventName, error: String(err) }
        }));
      }
    }
  }
}
