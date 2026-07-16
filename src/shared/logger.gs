/**
 * ============================================================
 * Shared Layer — Structured Logger
 * ------------------------------------------------------------
 * JSON-structured logging with levels, timers and contextual
 * metadata. Writes to console (Stackdriver picks it up) and
 * keeps a ring buffer of recent entries for the admin UI.
 * ============================================================
 */

/** @enum {number} Log severity levels. */
const LogLevel = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
});

class Logger {
  /**
   * @param {Object} [options]
   * @param {number} [options.minLevel]   Minimum level to emit (default INFO).
   * @param {number} [options.bufferSize] Ring-buffer capacity (default 200).
   */
  constructor(options) {
    const opts = options || {};
    this.minLevel = opts.minLevel || LogLevel.INFO;
    this.bufferSize = opts.bufferSize || 200;
    /** @private ring buffer of recent entries */
    this.buffer_ = [];
    /** @private active timers {name: epochMs} */
    this.timers_ = {};
  }

  /**
   * Core emit routine. All level helpers funnel here.
   * @private
   * @param {number} level   Severity.
   * @param {string} levelName 'INFO' etc.
   * @param {string} message Human message.
   * @param {Object} [context] Arbitrary metadata (serialisable).
   */
  emit_(level, levelName, message, context) {
    if (level < this.minLevel) return;
    const entry = {
      ts: new Date().toISOString(),
      level: levelName,
      msg: String(message),
      ctx: this.sanitizeContext_(context || {})
    };
    this.buffer_.push(entry);
    if (this.buffer_.length > this.bufferSize) this.buffer_.shift();
    // Stackdriver-visible output
    const line = JSON.stringify(entry);
    if (level >= LogLevel.ERROR) {
      console.error(line);
    } else if (level >= LogLevel.WARN) {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  /**
   * Strips functions/undefined so JSON.stringify never throws.
   * @private
   */
  sanitizeContext_(ctx) {
    const out = {};
    for (const key in ctx) {
      if (!ctx.hasOwnProperty(key)) continue;
      const v = ctx[key];
      if (typeof v === 'function' || typeof v === 'undefined') continue;
      if (v instanceof Error) {
        out[key] = { name: v.name, message: v.message, stack: v.stack };
      } else {
        out[key] = v;
      }
    }
    return out;
  }

  /** @param {string} msg @param {Object} [ctx] */
  debug(msg, ctx) { this.emit_(LogLevel.DEBUG, 'DEBUG', msg, ctx); }

  /** @param {string} msg @param {Object} [ctx] */
  info(msg, ctx) { this.emit_(LogLevel.INFO, 'INFO', msg, ctx); }

  /** @param {string} msg @param {Object} [ctx] */
  warn(msg, ctx) { this.emit_(LogLevel.WARN, 'WARN', msg, ctx); }

  /** @param {string} msg @param {Object} [ctx] */
  error(msg, ctx) { this.emit_(LogLevel.ERROR, 'ERROR', msg, ctx); }

  /**
   * Starts a named performance timer.
   * @param {string} name Timer label.
   */
  startTimer(name) {
    this.timers_[name] = Date.now();
  }

  /**
   * Stops a timer and logs elapsed milliseconds at INFO.
   * @param {string} name Timer label.
   * @return {number} Elapsed ms (−1 when timer unknown).
   */
  endTimer(name) {
    if (!this.timers_[name]) return -1;
    const elapsed = Date.now() - this.timers_[name];
    delete this.timers_[name];
    this.info('timer:' + name, { elapsedMs: elapsed });
    return elapsed;
  }

  /**
   * @param {number} [limit] Max entries returned (default 50).
   * @return {Object[]} Newest-first copy of the ring buffer.
   */
  getRecent(limit) {
    const n = limit || 50;
    return this.buffer_.slice(-n).reverse();
  }
}
