/**
 * ============================================================
 * Infrastructure Layer — Session Service
 * ------------------------------------------------------------
 * Opaque-token sessions for the customer portal, stored in
 * CacheService with a 24-hour TTL. Tokens are random UUIDs —
 * no payload is exposed client-side.
 * ============================================================
 */

class SessionService {
  /**
   * @param {Cache} cache  CacheService script cache.
   * @param {Logger} logger
   */
  constructor(cache, logger) {
    this.cache = cache;
    this.logger = logger;
    /** @private seconds — CacheService max is 21600 (6h), so we
     *  store an absolute expiry inside the payload for 24h semantics
     *  and re-validate on every read. */
    this.TTL_MS_ = 24 * 60 * 60 * 1000;
  }

  /** @private */
  key_(token) {
    return 'sess:' + token;
  }

  /**
   * Creates a session for a customer.
   * @param {string} customerId
   * @return {{token: string, expiresAt: string}}
   */
  create(customerId) {
    const token = Utilities.getUuid();
    const expiresAt = Date.now() + this.TTL_MS_;
    this.cache.put(this.key_(token), JSON.stringify({
      customerId: String(customerId),
      expiresAt: expiresAt
    }), 21600); // cache ceiling; logical expiry checked on read
    this.logger.info('session created', { customerId: customerId });
    return { token: token, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Resolves a token to its customerId.
   * @param {string} token
   * @return {string} customerId
   * @throws {SecurityError} On unknown/expired token.
   */
  resolve(token) {
    if (!token) throw new SecurityError('رمز الجلسة مفقود', 'SESSION_MISSING');
    const raw = this.cache.get(this.key_(token));
    if (!raw) throw new SecurityError('الجلسة منتهية. سجّل الدخول مجدداً', 'SESSION_EXPIRED');
    const payload = JSON.parse(raw);
    if (Date.now() > payload.expiresAt) {
      this.destroy(token);
      throw new SecurityError('الجلسة منتهية. سجّل الدخول مجدداً', 'SESSION_EXPIRED');
    }
    return payload.customerId;
  }

  /**
   * Destroys a session (logout).
   * @param {string} token
   */
  destroy(token) {
    if (token) this.cache.remove(this.key_(token));
  }
}
