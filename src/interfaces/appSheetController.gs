/**
 * ============================================================
 * Interface Layer — AppSheet Controller
 * ============================================================
 */

class AppSheetController extends BaseController {
  constructor(syncFromUseCase, syncToUseCase, syncAllUseCase, logger) {
    super(logger);
    this.syncFromUseCase = syncFromUseCase;
    this.syncToUseCase = syncToUseCase;
    this.syncAllUseCase = syncAllUseCase;
  }

  inboundSync(body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.update');
      return this.syncFromUseCase.execute();
    }.bind(this));
  }

  outboundSync(body, userRole) {
    return this.handle_(function () {
      Rbac.assert(userRole, 'order.read');
      if (body && body.orderId) {
        return this.syncToUseCase.execute(body.orderId);
      }
      return this.syncAllUseCase.execute();
    }.bind(this));
  }
}
