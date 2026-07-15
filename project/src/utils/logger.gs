// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Maximum log message length to prevent storage overflow
 * @constant {number}
 */
const MAX_LOG_LENGTH = 500;

/**
 * Logs errors to Error_Log sheet
 * Sanitizes sensitive data before logging
 * @param {string} functionName - Function where error occurred
 * @param {Error} error - Error object
 * @param {Object} context - Additional context (will be sanitized)
 */
function logError(functionName, error, context) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ERROR_LOG);
    if (!logSheet) return;

    // Sanitize context to remove sensitive data
    let safeContext = '';
    if (context) {
      try {
        const contextStr = JSON.stringify(context);
        // Remove potential sensitive fields
        safeContext = contextStr
          .replace(/password/gi, '[REDACTED]')
          .replace(/token/gi, '[REDACTED]')
          .replace(/secret/gi, '[REDACTED]')
          .substring(0, MAX_LOG_LENGTH);
      } catch (e) {
        safeContext = '[Context serialization failed]';
      }
    }

    logSheet.appendRow([
      new Date(),
      functionName,
      error ? error.toString() : 'Unknown error',
      safeContext,
      Session.getActiveUser().getEmail(),
      Session.getActiveUser().getEmail()
    ]);
  } catch (e) {
    // Last resort: console only (no sensitive data)
    console.error('Failed to log error: [REDACTED]');
  }
}
