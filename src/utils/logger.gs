// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Logs errors to Error_Log sheet
 * @param {string} functionName - Function where error occurred
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
function logError(functionName, error, context) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ERROR_LOG);
    if (!logSheet) return;

    logSheet.appendRow([
      new Date(),
      functionName,
      error ? error.toString() : 'Unknown error',
      context ? JSON.stringify(context).substring(0, 500) : '',
      Session.getActiveUser().getEmail(),
      Session.getActiveUser().getEmail()
    ]);
  } catch (e) {
    console.error('Failed to log error: ' + e.toString());
  }
}
