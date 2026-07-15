// ============================================================================
// INPUT VALIDATION UTILITIES
// ============================================================================

/**
 * Validates orderId format
 * @param {string} orderId - The order ID to validate
 * @returns {boolean} - True if valid
 */
function isValidOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return false;
  if (orderId.length > CONFIG.MAX_ORDER_ID_LENGTH) return false;
  return /^ORD-[0-9]{4}$/.test(orderId);
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates phone number (Saudi format)
 * @param {string} phone - Phone to validate
 * @returns {boolean} - True if valid
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^05[0-9]{8}$/.test(phone);
}
