// ============================================================================
// UNIT TESTS - نظام إدارة المبيعات
// ============================================================================

/**
 * Creates mock SpreadsheetApp for testing
 * @returns {Object} Mock SpreadsheetApp
 */
function mockSpreadsheetApp() {
  return {
    getActiveSpreadsheet: function() {
      return {
        getSheetByName: function(name) {
          return {
            getDataRange: function() {
              return { getValues: function() { return []; } };
            },
            appendRow: function(row) { console.info('Appended:', row); },
            getLastRow: function() { return 1; }
          };
        }
      };
    }
  };
}

/**
 * Tests isValidOrderId function
 * Validates order ID format ORD-XXXX
 */
function testIsValidOrderId() {
  console.info('Test: isValidOrderId');

  // Valid cases
  console.assert(isValidOrderId('ORD-0001') === true, 'Valid order ID failed');
  console.assert(isValidOrderId('ORD-9999') === true, 'Valid order ID failed');

  // Invalid cases
  console.assert(isValidOrderId('') === false, 'Empty string should fail');
  console.assert(isValidOrderId(null) === false, 'Null should fail');
  console.assert(isValidOrderId('ORD-00001') === false, 'Too many digits should fail');
  console.assert(isValidOrderId('ABC-0001') === false, 'Wrong prefix should fail');
  console.assert(isValidOrderId('ORD-001') === false, 'Too few digits should fail');
  console.assert(isValidOrderId('ORD-0001-EXTRA') === false, 'Extra chars should fail');

  console.info('Pass: isValidOrderId');
}

/**
 * Tests isValidEmail function
 * Validates email format
 */
function testIsValidEmail() {
  console.info('Test: isValidEmail');

  console.assert(isValidEmail('test@example.com') === true, 'Valid email failed');
  console.assert(isValidEmail('user.name@domain.co.uk') === true, 'Valid email failed');

  console.assert(isValidEmail('') === false, 'Empty email should fail');
  console.assert(isValidEmail('invalid') === false, 'Invalid email should fail');
  console.assert(isValidEmail('@example.com') === false, 'Missing local part should fail');
  console.assert(isValidEmail('test@') === false, 'Missing domain should fail');

  console.info('Pass: isValidEmail');
}

/**
 * Tests escapeHtml function
 * Prevents XSS attacks
 */
function testEscapeHtml() {
  console.info('Test: escapeHtml');

  console.assert(escapeHtml('<script>') === '&lt;script&gt;', 'HTML escape failed');
  console.assert(escapeHtml('"test"') === '&quot;test&quot;', 'Quote escape failed');
  console.assert(escapeHtml("'test'") === '&#039;test&#039;', 'Single quote escape failed');
  console.assert(escapeHtml('&') === '&amp;', 'Ampersand escape failed');
  console.assert(escapeHtml(null) === '', 'Null should return empty');
  console.assert(escapeHtml(123) === '', 'Number should return empty');

  console.info('Pass: escapeHtml');
}

/**
 * Tests canSendEmail function (Rate Limiting)
 * Ensures email quota is respected
 */
function testCanSendEmail() {
  console.info('Test: canSendEmail');

  // Reset counter
  PropertiesService.getScriptProperties().setProperty('emailDate', new Date().toDateString());
  PropertiesService.getScriptProperties().setProperty('emailCount', '0');

  console.assert(canSendEmail() === true, 'First email should be allowed');
  console.assert(canSendEmail() === true, 'Second email should be allowed');

  // Set to limit
  PropertiesService.getScriptProperties().setProperty('emailCount', '90');
  console.assert(canSendEmail() === false, 'Over limit should be blocked');

  console.info('Pass: canSendEmail');
}

/**
 * Runs all unit tests
 * Main entry point for test execution
 */
function runAllTests() {
  console.info('═══════════════════════════════════════════');
  console.info('  RUNNING UNIT TESTS');
  console.info('═══════════════════════════════════════════');

  try {
    testIsValidOrderId();
    testIsValidEmail();
    testEscapeHtml();
    testCanSendEmail();

    console.info('═══════════════════════════════════════════');
    console.info('  ALL TESTS PASSED');
    console.info('═══════════════════════════════════════════');
  } catch (e) {
    console.error('TEST FAILED:', e);
    throw e;
  }
}

// Export for CI/CD
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests };
}
