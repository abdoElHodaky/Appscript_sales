/**
 * ============================================================
 * Infrastructure Layer — Alert Services
 * ------------------------------------------------------------
 * Split into focused units (was one god-class):
 *   - AlertRule         : condition + threshold + priority
 *   - AlertEngine       : evaluates rules against a context
 *   - AlertDelivery     : email channel with sanitised body
 *   - AlertHistory      : cooldown store + audit trail
 *   - defaultRules()    : the 6 built-in business rules
 * ============================================================
 */

/** @enum {number} Alert priority (lower = more urgent). */
const AlertPriority = Object.freeze({
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4
});

/* ------------------------------------------------------------
 * AlertRule
 * ----------------------------------------------------------*/

class AlertRule {
  /**
   * @param {Object} props
   * @param {string} props.id          Unique rule id.
   * @param {string} props.name        Human label.
   * @param {number} props.priority    AlertPriority value.
   * @param {number} props.cooldownMin Minimum minutes between firings.
   * @param {Function} props.condition (context) → {fired: boolean, message: string}
   */
  constructor(props) {
    if (!props.id) throw new DomainError('معرّف القاعدة مطلوب', 'RULE_ID_REQUIRED');
    if (typeof props.condition !== 'function') {
      throw new DomainError('القاعدة تتطلب دالة condition', 'RULE_CONDITION_REQUIRED');
    }
    this.id = props.id;
    this.name = props.name || props.id;
    this.priority = props.priority || AlertPriority.MEDIUM;
    this.cooldownMin = props.cooldownMin || 60;
    this.condition = props.condition;
  }
}

/* ------------------------------------------------------------
 * AlertHistory — cooldown + audit via CacheService
 * ----------------------------------------------------------*/

class AlertHistory {
  /**
   * @param {Cache} cache
   * @param {Logger} logger
   */
  constructor(cache, logger) {
    this.cache = cache;
    this.logger = logger;
  }

  /**
   * @param {string} ruleId
   * @return {boolean} True while the rule is inside its cooldown.
   */
  inCooldown(ruleId) {
    return this.cache.get('alert:cd:' + ruleId) !== null;
  }

  /**
   * Marks a rule as fired; enforces cooldown for cooldownMin.
   * @param {string} ruleId
   * @param {number} cooldownMin
   */
  markFired(ruleId, cooldownMin) {
    this.cache.put('alert:cd:' + ruleId, String(Date.now()), cooldownMin * 60);
    const logKey = 'alert:log';
    const raw = this.cache.get(logKey);
    const log = raw ? JSON.parse(raw) : [];
    log.push({ ruleId: ruleId, at: new Date().toISOString() });
    while (log.length > 100) log.shift();
    this.cache.put(logKey, JSON.stringify(log), 21600); // 6h audit window
  }

  /** @return {Object[]} Recent firings (≤100). */
  getRecent() {
    const raw = this.cache.get('alert:log');
    return raw ? JSON.parse(raw) : [];
  }
}

/* ------------------------------------------------------------
 * AlertDelivery — email channel
 * ----------------------------------------------------------*/

class AlertDelivery {
  /**
   * @param {Logger} logger
   * @param {string} [recipient] Override recipient; defaults to script owner.
   */
  constructor(logger, recipient) {
    this.logger = logger;
    this.recipient = recipient || Session.getEffectiveUser().getEmail();
  }

  /**
   * Sends a sanitised alert email.
   * @param {AlertRule} rule
   * @param {string} message Evaluated message (will be sanitised).
   */
  send(rule, message) {
    const safeBody = Xss.sanitizeInput(message);
    const subject = '🔔 تنبيه: ' + Xss.sanitizeInput(rule.name);
    try {
      MailApp.sendEmail(this.recipient, subject, safeBody);
      this.logger.info('alert delivered', { rule: rule.id });
    } catch (err) {
      // Delivery failure must never break the evaluating use case.
      this.logger.error('alert delivery failed', { rule: rule.id, error: err });
    }
  }
}

/* ------------------------------------------------------------
 * AlertEngine — evaluates rules with lock + idempotency
 * ----------------------------------------------------------*/

class AlertEngine {
  /**
   * @param {AlertRule[]} rules
   * @param {AlertHistory} history
   * @param {AlertDelivery} delivery
   * @param {Logger} logger
   */
  constructor(rules, history, delivery, logger) {
    this.rules = rules.slice().sort(function (a, b) { return a.priority - b.priority; });
    this.history = history;
    this.delivery = delivery;
    this.logger = logger;
  }

  /**
   * Evaluates every rule against the context. A script lock plus
   * cooldown records make concurrent triggers idempotent.
   * @param {Object} context e.g. {orders, lowStock, pendingCount, stats}
   * @return {{fired: number, skipped: number, results: Object[]}}
   */
  evaluate(context) {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const results = [];
      let fired = 0, skipped = 0;
      for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];
        if (this.history.inCooldown(rule.id)) {
          skipped++;
          results.push({ rule: rule.id, fired: false, reason: 'cooldown' });
          continue;
        }
        let outcome;
        try {
          outcome = rule.condition(context);
        } catch (err) {
          this.logger.error('rule evaluation failed', { rule: rule.id, error: err });
          results.push({ rule: rule.id, fired: false, reason: 'error' });
          continue;
        }
        if (outcome && outcome.fired) {
          this.delivery.send(rule, outcome.message || rule.name);
          this.history.markFired(rule.id, rule.cooldownMin);
          fired++;
          results.push({ rule: rule.id, fired: true, message: outcome.message });
        } else {
          results.push({ rule: rule.id, fired: false });
        }
      }
      return { fired: fired, skipped: skipped, results: results };
    } finally {
      lock.releaseLock();
    }
  }
}

/* ------------------------------------------------------------
 * defaultRules — the 6 built-in business rules
 * ----------------------------------------------------------*/

/**
 * @return {AlertRule[]}
 */
function defaultAlertRules() {
  return [
    new AlertRule({
      id: 'LOW_STOCK',
      name: 'مخزون منخفض',
      priority: AlertPriority.HIGH,
      cooldownMin: 360,
      condition: function (ctx) {
        const low = ctx.lowStock || [];
        return low.length
          ? { fired: true, message: low.length + ' منتج وصل لحد الطلب: ' +
              low.map(function (p) { return p.name + ' (' + p.stock + ')'; }).join('، ') }
          : { fired: false };
      }
    }),
    new AlertRule({
      id: 'PENDING_BACKLOG',
      name: 'تراكم الطلبات الجديدة',
      priority: AlertPriority.MEDIUM,
      cooldownMin: 120,
      condition: function (ctx) {
        const n = ctx.pendingCount || 0;
        return n >= 10
          ? { fired: true, message: 'يوجد ' + n + ' طلب جديد بانتظار المعالجة' }
          : { fired: false };
      }
    }),
    new AlertRule({
      id: 'HIGH_CANCELLATION',
      name: 'معدل إلغاء مرتفع',
      priority: AlertPriority.HIGH,
      cooldownMin: 720,
      condition: function (ctx) {
        const rate = (ctx.stats && ctx.stats.cancellationRate) || 0;
        return rate >= 15
          ? { fired: true, message: 'معدل الإلغاء ' + rate.toFixed(1) + '% — يتجاوز 15%' }
          : { fired: false };
      }
    }),
    new AlertRule({
      id: 'SALES_DROP',
      name: 'هبوط المبيعات اليومية',
      priority: AlertPriority.CRITICAL,
      cooldownMin: 1440,
      condition: function (ctx) {
        const s = ctx.stats || {};
        if (!s.todaySales || !s.avgDailySales) return { fired: false };
        return s.todaySales < s.avgDailySales * 0.5
          ? { fired: true, message: 'مبيعات اليوم أقل من 50% من المتوسط' }
          : { fired: false };
      }
    }),
    new AlertRule({
      id: 'LARGE_ORDER',
      name: 'طلب كبير',
      priority: AlertPriority.LOW,
      cooldownMin: 60,
      condition: function (ctx) {
        const big = (ctx.orders || []).filter(function (o) { return o.getTotal() >= 10000; });
        return big.length
          ? { fired: true, message: big.length + ' طلب بقيمة ≥ 10,000' }
          : { fired: false };
      }
    }),
    new AlertRule({
      id: 'OPEN_TICKETS',
      name: 'تذاكر دعم مفتوحة',
      priority: AlertPriority.MEDIUM,
      cooldownMin: 240,
      condition: function (ctx) {
        const n = ctx.openTicketCount || 0;
        return n >= 5
          ? { fired: true, message: n + ' تذكرة دعم مفتوحة تحتاج متابعة' }
          : { fired: false };
      }
    })
  ];
}
