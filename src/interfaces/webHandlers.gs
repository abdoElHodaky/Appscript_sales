/**
 * ============================================================
 * Interface Layer — Web Handlers (Router)
 * ------------------------------------------------------------
 * Single entry routing for the Apps Script web app:
 *   - Router          : action → controller method dispatch
 *   - doGet / doPost  : global entry points (defined in Code.gs
 *                       and delegating here)
 * ============================================================
 */

class Router {
  /**
   * @param {Object} deps
   * @param {DashboardController} deps.dashboard
   * @param {OrderController} deps.order
   * @param {PortalController} deps.portal
   * @param {Logger} deps.logger
   */
  constructor(deps, logger) {
    this.dashboard = deps.dashboard;
    this.order = deps.order;
    this.portal = deps.portal;
    this.logger = logger;
  }

  /**
   * Routes a GET request.
   * Pages:  ?page=dashboard | ?page=portal  → HTML
   * API:    ?action=dashboard|search|...    → JSON
   * @param {Object} e Apps Script doGet event.
   * @return {HtmlOutput|TextOutput}
   */
  routeGet(e) {
    const params = (e && e.parameter) || {};
    const page = params.page;
    if (page === 'portal') return renderPortalPage();
    if (page === 'dashboard' || !params.action) return renderDashboardPage();

    const out = this.dispatch_(params.action, params, null);
    return jsonResponse_(out);
  }

  /**
   * Routes a POST request. Body is JSON with an `action` field.
   * @param {Object} e Apps Script doPost event.
   * @return {TextOutput}
   */
  routePost(e) {
    let body = {};
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return jsonResponse_({
        success: false,
        error: { status: 400, code: 'BAD_JSON', message: 'جسم الطلب ليس JSON صالحاً' }
      });
    }
    const action = body.action;
    const out = this.dispatch_(action, body, body);
    return jsonResponse_(out);
  }

  /**
   * Central action dispatch table.
   * @private
   * @param {string} action
   * @param {Object} params Query params (GET) or body (POST).
   * @param {Object|null} body POST body when present.
   * @return {Object} Envelope {success, data|error}.
   */
  dispatch_(action, params, body) {
    const role = params.userRole || Role.ADMIN;
    const caller = params.userEmail || 'anonymous';
    this.logger.info('dispatch', { action: action, caller: caller });

    switch (action) {
      /* ---------- dashboard ---------- */
      case 'dashboard':
        return this.dashboard.getDashboardData(params);
      case 'kpi':
        return this.dashboard.getKpi(params);

      /* ---------- orders ---------- */
      case 'search':
        return this.order.search(params, caller);
      case 'createOrder':
        return this.order.create(body || {}, role);
      case 'updateStatus':
        return this.order.changeStatus(body || {}, role);

      /* ---------- portal ---------- */
      case 'portal.requestOtp':
        return this.portal.requestOtp(body || {});
      case 'portal.verifyOtp':
        return this.portal.verifyOtp(body || {});
      case 'portal.orders':
        return this.portal.myOrders(params.token || (body && body.token));
      case 'portal.tickets':
        return this.portal.myTickets(params.token || (body && body.token));
      case 'portal.createTicket':
        return this.portal.createTicket((body && body.token), body || {});
      case 'portal.logout':
        return this.portal.logout(params.token || (body && body.token));

      default:
        return {
          success: false,
          error: { status: 404, code: 'UNKNOWN_ACTION', message: 'إجراء غير معروف: ' + action }
        };
    }
  }
}

/**
 * Wraps a payload in a JSON TextOutput.
 * @private
 * @param {Object} payload
 * @return {TextOutput}
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
