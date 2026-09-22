/**
 * ============================================================
 * Interface Layer — Web Handlers (Router)  [v5.1]
 * ------------------------------------------------------------
 * Changes:
 *   1. SECURITY: default role is now CUSTOMER (was ADMIN).
 *   2. Added AppSheet sync routes.
 * ============================================================
 */

class Router {
  constructor(deps, logger) {
    this.dashboard = deps.dashboard;
    this.order = deps.order;
    this.portal = deps.portal;
    this.appSheet = deps.appSheet;
    this.logger = logger;
  }

  routeGet(e) {
    const params = (e && e.parameter) || {};
    const page = params.page;
    if (page === 'portal') return renderPortalPage();
    if (page === 'dashboard' || !params.action) return renderDashboardPage();

    const out = this.dispatch_(params.action, params, null);
    return jsonResponse_(out);
  }

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

  dispatch_(action, params, body) {
    /* FIX: default to CUSTOMER instead of ADMIN */
    const role = params.userRole || Role.CUSTOMER;
    const caller = params.userEmail || 'anonymous';
    this.logger.info('dispatch', { action: action, caller: caller, role: role });

    switch (action) {
      case 'dashboard':
        return this.dashboard.getDashboardData(params);
      case 'kpi':
        return this.dashboard.getKpi(params);

      case 'search':
        return this.order.search(params, caller);
      case 'createOrder':
        return this.order.create(body || {}, role);
      case 'updateStatus':
        return this.order.changeStatus(body || {}, role);

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

      /* NEW: AppSheet sync */
      case 'appsheet.inbound':
        return this.appSheet.inboundSync(body || {}, role);
      case 'appsheet.outbound':
        return this.appSheet.outboundSync(body || {}, role);

      /* NEW: Invoice + System Status */
      case 'generateInvoice':
        return this.order.generateInvoice(params, body, role);
      case 'system.status':
        return this.dashboard.getSystemStatus(params, role);

      default:
        return {
          success: false,
          error: { status: 404, code: 'UNKNOWN_ACTION', message: 'إجراء غير معروف: ' + action }
        };
    }
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
