/**
 * ============================================================
 * Infrastructure Layer — OTP Service
 * ------------------------------------------------------------
 * Password-less 6-digit OTP for the customer portal.
 *   - 5-minute TTL (CacheService)
 *   - Max 3 verification attempts per code
 *   - Rate-limited issuance (3 codes / 5 min per phone)
 *   - Phones masked in every log line
 * ============================================================
 */

class OtpService {
  /**
   * @param {Cache} cache          CacheService script cache.
   * @param {RateLimiter} rateLimiter
   * @param {Logger} logger
   */
  constructor(cache, rateLimiter, logger) {
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    /** @private seconds */
    this.TTL_ = 300;        // 5 minutes
    this.MAX_ATTEMPTS_ = 3;
  }

  /** @private */
  key_(phone) {
    return 'otp:' + String(phone).replace(/\s+/g, '');
  }

  /**
   * Issues a new OTP for a phone number.
   * Rate limit: 3 issuances per 5 minutes per phone.
   * @param {string} phone
   * @return {{sent: boolean, expiresInSec: number, devCode: (string|undefined)}}
   * @throws {SecurityError} When rate-limited.
   */
  issue(phone) {
    const masked = Formatter.maskPhone(phone);
    this.rateLimiter.assertWithinLimit('otp-issue:' + phone, 3, 300);

    const code = ('' + Math.floor(100000 + Math.random() * 900000));
    const payload = {
      code: code,
      attempts: 0,
      createdAt: Date.now()
    };
    this.cache.put(this.key_(phone), JSON.stringify(payload), this.TTL_);
    this.logger.info('otp issued', { phone: masked });

    // Delivery hook: in production send via SMS/WhatsApp provider.
    // For development the code is returned so the flow is testable.
    return {
      sent: true,
      expiresInSec: this.TTL_,
      devCode: code // TODO: remove when SMS gateway is wired
    };
  }

  /**
   * Verifies a code. Consumes the OTP on success; increments the
   * attempt counter on failure and destroys it after 3 misses.
   * @param {string} phone
   * @param {string} code 6-digit user input.
   * @return {boolean} True on success.
   * @throws {SecurityError} On expiry or too many attempts.
   */
  verify(phone, code) {
    const masked = Formatter.maskPhone(phone);
    const key = this.key_(phone);
    const raw = this.cache.get(key);
    if (!raw) {
      this.logger.warn('otp verify: expired/missing', { phone: masked });
      throw new SecurityError('انتهت صلاحية الرمز. اطلب رمزاً جديداً', 'OTP_EXPIRED');
    }
    const payload = JSON.parse(raw);
    if (payload.attempts >= this.MAX_ATTEMPTS_) {
      this.cache.remove(key);
      this.logger.warn('otp verify: max attempts', { phone: masked });
      throw new SecurityError('تم تجاوز عدد المحاولات. اطلب رمزاً جديداً', 'OTP_LOCKED');
    }
    if (String(code).trim() === payload.code) {
      this.cache.remove(key); // single-use
      this.logger.info('otp verified', { phone: masked });
      return true;
    }
    payload.attempts += 1;
    // Keep remaining TTL: approximate by re-putting with leftover time.
    const elapsed = Math.floor((Date.now() - payload.createdAt) / 1000);
    const remaining = Math.max(30, this.TTL_ - elapsed);
    this.cache.put(key, JSON.stringify(payload), remaining);
    this.logger.warn('otp verify: wrong code', { phone: masked, attempt: payload.attempts });
    return false;
  }
}
