/**
 * ============================================================
 * Infrastructure Layer — Search Engine
 * ------------------------------------------------------------
 *   - QueryBuilder   : fluent, validated query assembly
 *   - SearchEngine   : inverted-index full-text search + filters
 *   - ResultFormatter: shapes hits for API/HTML consumers
 * ============================================================
 */

/* ------------------------------------------------------------
 * QueryBuilder — fluent, immutable-ish assembly
 * ----------------------------------------------------------*/

class QueryBuilder {
  constructor() {
    this.query_ = {
      text: '',
      filters: {},
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20
    };
  }

  /**
   * @param {string} text Free-text term.
   * @return {QueryBuilder} this (chainable)
   */
  text(text) {
    this.query_.text = Xss.sanitizeInput(text || '');
    return this;
  }

  /**
   * @param {string} field Filter field (status|city|customerId).
   * @param {*} value
   * @return {QueryBuilder}
   */
  filter(field, value) {
    const allowed = ['status', 'city', 'customerId', 'minTotal', 'maxTotal'];
    if (allowed.indexOf(field) === -1) {
      throw new DomainError('حقل تصفية غير مدعوم: ' + field, 'FILTER_UNSUPPORTED');
    }
    this.query_.filters[field] = typeof value === 'string' ? Xss.sanitizeInput(value) : value;
    return this;
  }

  /**
   * @param {string} field Sort field.
   * @param {string} [dir] 'asc'|'desc' (default desc).
   * @return {QueryBuilder}
   */
  sort(field, dir) {
    const allowed = ['createdAt', 'total', 'customerName', 'status'];
    if (allowed.indexOf(field) === -1) {
      throw new DomainError('حقل فرز غير مدعوم: ' + field, 'SORT_UNSUPPORTED');
    }
    this.query_.sortBy = field;
    this.query_.sortDir = dir === 'asc' ? 'asc' : 'desc';
    return this;
  }

  /**
   * @param {number} page     1-based page index.
   * @param {number} pageSize Items per page (1–100).
   * @return {QueryBuilder}
   */
  paginate(page, pageSize) {
    const p = parseInt(page, 10);
    const s = parseInt(pageSize, 10);
    this.query_.page = Number.isInteger(p) && p > 0 ? p : 1;
    this.query_.pageSize = Number.isInteger(s) && s > 0 ? Math.min(s, 100) : 20;
    return this;
  }

  /**
   * @return {Object} Frozen query object.
   */
  build() {
    return Object.freeze(JSON.parse(JSON.stringify(this.query_)));
  }
}

/* ------------------------------------------------------------
 * SearchEngine — inverted index over orders
 * ----------------------------------------------------------*/

class SearchEngine {
  /**
   * @param {OrderRepository} orderRepo
   * @param {Cache} cache     CacheService script cache.
   * @param {Logger} logger
   */
  constructor(orderRepo, cache, logger) {
    this.orderRepo = orderRepo;
    this.cache = cache;
    this.logger = logger;
    /** @private {Object<string, string[]>|null} token → orderIds */
    this.index_ = null;
    /** @private {Object<string, Order>} id → entity */
    this.docs_ = null;
  }

  /**
   * (Re)builds the inverted index from the repository.
   * Tokenises customer name, city, status and product names.
   * @private
   */
  buildIndex_() {
    this.logger.startTimer('search:index');
    const orders = this.orderRepo.findAll();
    const index = {};
    const docs = {};
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      docs[o.id] = o;
      const haystack = [
        o.id, o.customerName, o.city, o.status,
        o.items.map(function (it) { return it.productName; }).join(' ')
      ].join(' ').toLowerCase();
      const tokens = haystack.split(/[^\p{L}\p{N}]+/u);
      for (let t = 0; t < tokens.length; t++) {
        const token = tokens[t];
        if (!token || token.length < 2) continue;
        if (!index[token]) index[token] = [];
        if (index[token].indexOf(o.id) === -1) index[token].push(o.id);
      }
    }
    this.index_ = index;
    this.docs_ = docs;
    this.logger.endTimer('search:index');
  }

  /**
   * Executes a built query.
   * @param {Object} query From QueryBuilder.build().
   * @return {{hits: Order[], total: number, page: number, pageSize: number, pages: number}}
   */
  search(query) {
    // Result caching: identical query strings reuse the previous hit list.
    const cacheKey = 'srch:' + Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5, JSON.stringify(query)
    ).map(function (b) { return (b + 256) % 256; }).join('');
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug('search cache hit');
      const parsed = JSON.parse(cached);
      parsed.hits = parsed.hits.map(function (h) { return Order.fromJSON(h); });
      return parsed;
    }

    this.buildIndex_();
    let candidates = Object.keys(this.docs_);

    // Full-text phase: intersect token postings.
    if (query.text) {
      const terms = query.text.toLowerCase().split(/[^\p{L}\p{N}]+/u)
        .filter(function (t) { return t.length >= 2; });
      if (terms.length) {
        let posting = null;
        for (let i = 0; i < terms.length; i++) {
          const ids = this.index_[terms[i]] || [];
          posting = posting === null
            ? ids.slice()
            : posting.filter(function (id) { return ids.indexOf(id) !== -1; });
        }
        candidates = posting || [];
      }
    }

    // Filter phase.
    let results = candidates.map(function (id) { return this.docs_[id]; }, this);
    const f = query.filters || {};
    if (f.status) results = results.filter(function (o) { return o.status === f.status; });
    if (f.city) results = results.filter(function (o) { return o.city === f.city; });
    if (f.customerId) results = results.filter(function (o) { return o.customerId === f.customerId; });
    if (typeof f.minTotal === 'number') {
      results = results.filter(function (o) { return o.getTotal() >= f.minTotal; });
    }
    if (typeof f.maxTotal === 'number') {
      results = results.filter(function (o) { return o.getTotal() <= f.maxTotal; });
    }

    // Sort phase.
    const dir = query.sortDir === 'asc' ? 1 : -1;
    const field = query.sortBy;
    results.sort(function (a, b) {
      let av = a[field], bv = b[field];
      if (field === 'total') { av = a.getTotal(); bv = b.getTotal(); }
      if (av instanceof Date) { av = av.getTime(); bv = bv.getTime(); }
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return ((av || 0) - (bv || 0)) * dir;
    });

    // Pagination phase.
    const total = results.length;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const start = (query.page - 1) * query.pageSize;
    const hits = results.slice(start, start + query.pageSize);

    const out = {
      hits: hits,
      total: total,
      page: query.page,
      pageSize: query.pageSize,
      pages: pages
    };

    // Cache serialised hits for 5 minutes.
    const toCache = {
      hits: hits.map(function (o) { return o.toJSON(); }),
      total: total, page: query.page, pageSize: query.pageSize, pages: pages
    };
    this.cache.put(cacheKey, JSON.stringify(toCache), 300);
    return out;
  }
}

/* ------------------------------------------------------------
 * ResultFormatter — API/HTML shaping
 * ----------------------------------------------------------*/

const ResultFormatter = {
  /**
   * @param {Object} searchResult Output of SearchEngine.search().
   * @return {Object} API-safe payload with escaped strings.
   */
  toApi(searchResult) {
    return {
      total: searchResult.total,
      page: searchResult.page,
      pageSize: searchResult.pageSize,
      pages: searchResult.pages,
      hits: searchResult.hits.map(function (o) {
        const j = o.toJSON();
        j.customerName = Xss.escapeHtml(j.customerName);
        j.city = Xss.escapeHtml(j.city);
        j.totalFormatted = Formatter.currency(j.total);
        j.createdAtFormatted = Formatter.dateTime(j.createdAt);
        return j;
      })
    };
  }
};
