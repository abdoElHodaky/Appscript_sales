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

/** Typed security violation (mapped to 401/403 by controllers). */
class SecurityError extends Error {
  /**
   * @param {string} message
   * @param {string} [code] e.g. 'FORBIDDEN', 'RATE_LIMITED'.
   */
  constructor(message, code) {
    super(message);
    this.name = 'SecurityError';
    this.code = code || 'SECURITY_VIOLATION';
  }
}

/* ------------------------------------------------------------
 * Roles & RBAC
 * ----------------------------------------------------------*/

/** @enum {string} System roles. */
const Role = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALES: 'SALES',
  CUSTOMER: 'CUSTOMER'
});

/**
 * Rbac — static permission matrix.
 * Permissions use the form 'resource.action'.
 */
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

  /**
   * @param {string} role
   * @param {string} permission 'resource.action'
   * @return {boolean}
   */
  allows(role, permission) {
    const list = this.matrix[role] || [];
    return list.indexOf(permission) !== -1;
  },

  /**
   * Asserts permission or throws SecurityError.
   * @param {string} role
   * @param {string} permission
   * @throws {SecurityError}
   */
  assert(role, permission) {
    if (!this.allows(role, permission)) {
      throw new SecurityError(
        'الدور ' + role + ' لا يملك الصلاحية ' + permission,
        'FORBIDDEN'
      );
    }
  }
};

/* ------------------------------------------------------------
 * RateLimiter — fixed-window over CacheService
 * ----------------------------------------------------------*/

class RateLimiter {
  /**
   * @param {Cache} cache   CacheService instance (script cache).
   * @param {Logger} logger
   */
  constructor(cache, logger) {
    this.cache = cache;
    this.logger = logger;
  }

  /**
   * Checks & records a hit. Throws when the window is exhausted.
   * @param {string} key        Unique bucket, e.g. 'otp:9665xxxx'.
   * @param {number} maxHits    Allowed hits inside the window.
   * @param {number} windowSec  Window length in seconds (≤ 21600).
   * @throws {SecurityError} When limit exceeded.
   */
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
    // CacheService has no increment; put is atomic enough at this scale.
    this.cache.put(cacheKey, String(hits + 1), windowSec);
  }

  /**
   * Read-only check.
   * @param {string} key
   * @param {number} maxHits
   * @return {boolean} True when more hits are allowed.
   */
  isAllowed(key, maxHits) {
    const raw = this.cache.get('rl:' + key);
    return raw ? parseInt(raw, 10) < maxHits : true;
  }
}

/* ------------------------------------------------------------
 * Xss — escaping & sanitisation
 * ----------------------------------------------------------*/

const Xss = {
  /**
   * Escapes a value for safe interpolation into HTML.
   * @param {*} text
   * @return {string}
   */
  escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Strips dangerous constructs from user input before storage.
   * Removes angle brackets, javascript: URIs and inline handlers.
   * @param {*} text
   * @return {string}
   */
  sanitizeInput(text) {
    return String(text == null ? '' : text)
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  },

  /**
   * Escapes every string value in a plain object (shallow).
   * @param {Object} obj
   * @return {Object}
   */
  escapeObject(obj) {
    const out = {};
    for (const k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      out[k] = typeof obj[k] === 'string' ? this.escapeHtml(obj[k]) : obj[k];
    }
    return out;
  }
};
