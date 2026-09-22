/**
 * ============================================================
 * Infrastructure Layer — OTP Service
 * ============================================================
 */

class OtpService {
  constructor(cache, rateLimiter, logger) {
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.TTL_ = 300;
    this.MAX_ATTEMPTS_ = 3;
  }

  key_(phone) {
    return 'otp:' + String(phone).replace(/\s+/g, '');
  }

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

    return {
      sent: true,
      expiresInSec: this.TTL_,
      devCode: code
    };
  }

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
      this.cache.remove(key);
      this.logger.info('otp verified', { phone: masked });
      return true;
    }
    payload.attempts += 1;
    const elapsed = Math.floor((Date.now() - payload.createdAt) / 1000);
    const remaining = Math.max(30, this.TTL_ - elapsed);
    this.cache.put(key, JSON.stringify(payload), remaining);
    this.logger.warn('otp verify: wrong code', { phone: masked, attempt: payload.attempts });
    return false;
  }
}
