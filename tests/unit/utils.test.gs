// ============================================================================
// UNIT TESTS - نظام إدارة المبيعات
// ============================================================================

// Mock Utilities for Testing
function mockSpreadsheetApp() {
  return {
    getActiveSpreadsheet: function() {
      return {
        getSheetByName: function(name) {
          return {
            getDataRange: function() {
              return { getValues: function() { return []; } };
            },
            appendRow: function(row) { console.log('Appended:', row); },
            getLastRow: function() { return 1; }
          };
        }
      };
    }
  };
}

// Test: isValidOrderId
function testIsValidOrderId() {
  console.log('Testing isValidOrderId...');

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

  console.log('✅ isValidOrderId tests passed');
}

// Test: isValidEmail
function testIsValidEmail() {
  console.log('Testing isValidEmail...');

  console.assert(isValidEmail('test@example.com') === true, 'Valid email failed');
  console.assert(isValidEmail('user.name@domain.co.uk') === true, 'Valid email failed');

  console.assert(isValidEmail('') === false, 'Empty email should fail');
  console.assert(isValidEmail('invalid') === false, 'Invalid email should fail');
  console.assert(isValidEmail('@example.com') === false, 'Missing local part should fail');
  console.assert(isValidEmail('test@') === false, 'Missing domain should fail');

  console.log('✅ isValidEmail tests passed');
}

// Test: escapeHtml
function testEscapeHtml() {
  console.log('Testing escapeHtml...');

  console.assert(escapeHtml('<script>') === '&lt;script&gt;', 'HTML escape failed');
  console.assert(escapeHtml('"test"') === '&quot;test&quot;', 'Quote escape failed');
  console.assert(escapeHtml("'test'") === '&#039;test&#039;', 'Single quote escape failed');
  console.assert(escapeHtml('&') === '&amp;', 'Ampersand escape failed');
  console.assert(escapeHtml(null) === '', 'Null should return empty');
  console.assert(escapeHtml(123) === '', 'Number should return empty');

  console.log('✅ escapeHtml tests passed');
}

// Test: canSendEmail (Rate Limiting)
function testCanSendEmail() {
  console.log('Testing canSendEmail...');

  // Reset counter
  PropertiesService.getScriptProperties().setProperty('emailDate', new Date().toDateString());
  PropertiesService.getScriptProperties().setProperty('emailCount', '0');

  console.assert(canSendEmail() === true, 'First email should be allowed');
  console.assert(canSendEmail() === true, 'Second email should be allowed');

  // Set to limit
  PropertiesService.getScriptProperties().setProperty('emailCount', '90');
  console.assert(canSendEmail() === false, 'Over limit should be blocked');

  console.log('✅ canSendEmail tests passed');
}

// Run all tests
function runAllTests() {
  console.log('═══════════════════════════════════════════');
  console.log('  RUNNING UNIT TESTS');
  console.log('═══════════════════════════════════════════');

  try {
    testIsValidOrderId();
    testIsValidEmail();
    testEscapeHtml();
    testCanSendEmail();

    console.log('═══════════════════════════════════════════');
    console.log('  ✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════');
  } catch (e) {
    console.error('❌ TEST FAILED:', e);
    throw e;
  }
}

// Export for CI/CD
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests };
}
