// ============================================================================
// SECURITY UTILITIES
// ============================================================================

/**
 * Sanitizes HTML to prevent XSS
 * @param {string} input - Raw input
 * @returns {string} - Escaped HTML
 */
function escapeHtml(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Gets secret from Script Properties
 * @param {string} key - Secret key
 * @returns {string|null} - Secret value
 */
function getSecret(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key);
  } catch (e) {
    console.error("Failed to get secret: [REDACTED]");
    return null;
  }
}

function getSecretOld(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Checks if user has required role
 * @param {string} requiredRole - Required role
 * @returns {boolean} - True if authorized
 */
function isAuthorized(requiredRole) {
  const userEmail = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
  if (!usersSheet) return false;

  const data = usersSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userEmail) {
      const userRole = data[i][2];
      if (userRole === CONFIG.ROLES.ADMIN) return true;
      if (userRole === requiredRole) return true;
      return false;
    }
  }
  return false;
}

/**
 * Rate limiter for email sending
 * @returns {boolean} - True if can send email
 */
function canSendEmail() {
  const props = PropertiesService.getScriptProperties();
  const today = new Date().toDateString();
  const lastDate = props.getProperty('emailDate') || '';

  if (today !== lastDate) {
    props.setProperty('emailDate', today);
    props.setProperty('emailCount', '0');
    return true;
  }

  const count = parseInt(props.getProperty('emailCount') || '0');
  if (count >= CONFIG.EMAIL_DAILY_LIMIT) {
    console.warn('Email quota exceeded');
    return false;
  }

  props.setProperty('emailCount', (count + 1).toString());
  return true;
}
