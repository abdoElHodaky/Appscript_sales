/**
 * ============================================================
 * Infrastructure Layer — Session Service
 * ============================================================
 */

class SessionService {
  constructor(cache, logger) {
    this.cache = cache;
    this.logger = logger;
    this.TTL_MS_ = 24 * 60 * 60 * 1000;
  }

  key_(token) {
    return 'sess:' + token;
  }

  create(customerId) {
    const token = Utilities.getUuid();
    const expiresAt = Date.now() + this.TTL_MS_;
    this.cache.put(this.key_(token), JSON.stringify({
      customerId: String(customerId),
      expiresAt: expiresAt
    }), 21600);
    this.logger.info('session created', { customerId: customerId });
    return { token: token, expiresAt: new Date(expiresAt).toISOString() };
  }

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

  destroy(token) {
    if (token) this.cache.remove(this.key_(token));
  }
}
