/**
 * ============================================================
 * Shared Layer — Security
 * ------------------------------------------------------------
 *   - Role (Enum)        : ADMIN / MANAGER / SALES / CUSTOMER
 *   - Rbac               : role → permission matrix
 *   - RateLimiter        : fixed-window limiter over CacheService
 *   - Xss                : output escaping & input sanitisation
 *   - SecurityError      : typed 401/403-style violation
 * ============================================================
 */

class SecurityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SecurityError';
    this.code = code || 'SECURITY_VIOLATION';
  }
}

const Role = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALES: 'SALES',
  CUSTOMER: 'CUSTOMER'
});

const Rbac = {
  matrix: Object.freeze({
    [Role.ADMIN]: Object.freeze([
      'dashboard.view', 'order.read', 'order.create', 'order.update', 'order.cancel',
      'customer.read', 'customer.create', 'alert.manage', 'ticket.manage', 'logs.view'
    ]),
    [Role.MANAGER]: Object.freeze([
      'dashboard.view', 'order.read', 'order.create', 'order.update',
      'customer.read', 'ticket.manage'
    ]),
    [Role.SALES]: Object.freeze([
      'dashboard.view.own', 'order.read.own', 'order.create', 'order.update.own'
    ]),
    [Role.CUSTOMER]: Object.freeze([
      'order.read.own', 'ticket.create', 'ticket.read.own'
    ])
  }),

  allows(role, permission) {
    const list = this.matrix[role] || [];
    return list.indexOf(permission) !== -1;
  },

  assert(role, permission) {
    if (!this.allows(role, permission)) {
      throw new SecurityError(
        'الدور ' + role + ' لا يملك الصلاحية ' + permission,
        'FORBIDDEN'
      );
    }
  }
};

class RateLimiter {
  constructor(cache, logger) {
    this.cache = cache;
    this.logger = logger;
  }

  assertWithinLimit(key, maxHits, windowSec) {
    const cacheKey = 'rl:' + key;
    const raw = this.cache.get(cacheKey);
    const hits = raw ? parseInt(raw, 10) : 0;
    if (hits >= maxHits) {
      this.logger.warn('rate limit hit', { key: key, hits: hits });
      throw new SecurityError(
        'تم تجاوز الحد المسموح. حاول مرة أخرى لاحقاً',
        'RATE_LIMITED'
      );
    }
    this.cache.put(cacheKey, String(hits + 1), windowSec);
  }

  isAllowed(key, maxHits) {
    const raw = this.cache.get('rl:' + key);
    return raw ? parseInt(raw, 10) < maxHits : true;
  }
}

const Xss = {
  escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  sanitizeInput(text) {
    return String(text == null ? '' : text)
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  },

  escapeObject(obj) {
    const out = {};
    for (const k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      out[k] = typeof obj[k] === 'string' ? this.escapeHtml(obj[k]) : obj[k];
    }
    return out;
  }
};
