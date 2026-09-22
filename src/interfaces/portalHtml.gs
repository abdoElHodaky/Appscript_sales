/**
 * ============================================================
 * Interface Layer — Customer Portal HTML Page
 * ============================================================
 */

function renderPortalPage() {
  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>بوابة العميل — نظام المبيعات</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#f5f7fa;color:#333;line-height:1.6}
.container{max-width:600px;margin:0 auto;padding:20px}
.card{background:#fff;padding:24px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);margin-bottom:16px}
.card h2{font-size:20px;margin-bottom:16px;color:#444}
input,textarea{width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:12px}
input:focus,textarea:focus{outline:none;border-color:#667eea}
.btn{width:100%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;padding:14px;border-radius:8px;cursor:pointer;font-size:16px;transition:opacity 0.2s}
.btn:hover{opacity:0.9}
.btn-secondary{background:#f5f5f5;color:#555;border:1px solid #ddd}
.otp-display{font-size:32px;letter-spacing:8px;text-align:center;padding:20px;background:#f8f9fa;border-radius:8px;margin:16px 0;color:#667eea;font-weight:700}
.order-card{background:#f8f9fa;padding:16px;border-radius:8px;margin-bottom:12px;border-right:4px solid #667eea}
.order-card .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.order-card .total{font-size:20px;font-weight:700;color:#667eea}
.status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
.status-جديد{background:#e3f2fd;color:#1976d2}
.status-قيد-التنفيذ{background:#fff3e0;color:#f57c00}
.status-تم-الشحن{background:#e8f5e9;color:#388e3c}
.status-مكتمل{background:#e8f5e9;color:#2e7d32}
.status-ملغي{background:#ffebee;color:#c62828}
.hidden{display:none}
#step-login{}#step-verify{}#step-dashboard{display:none}
.nav{display:flex;gap:8px;margin-bottom:16px}
.nav button{flex:1;padding:10px;background:#fff;border:1px solid #ddd;border-radius:8px;cursor:pointer}
.nav button.active{background:#667eea;color:#fff;border-color:#667eea}
.ticket-card{background:#fff3e0;padding:12px;border-radius:8px;margin-bottom:8px;border-right:4px solid #f57c00}
</style>
</head>
<body>
<div class="container">
  <div class="card" id="step-login">
    <h2>🔐 تسجيل الدخول</h2>
    <p style="margin-bottom:16px;color:#666">أدخل رقم جوالك لاستلام رمز التحقق</p>
    <input type="tel" id="phone" placeholder="05xxxxxxxx" maxlength="10">
    <button class="btn" onclick="requestOtp()">إرسال الرمز</button>
    <div id="otp-section" class="hidden">
      <p style="margin:16px 0 8px">أدخل الرمز المكون من 6 أرقام:</p>
      <input type="text" id="otp-code" placeholder="123456" maxlength="6">
      <button class="btn" onclick="verifyOtp()">تحقق</button>
    </div>
    <div id="login-error" style="color:#c62828;margin-top:12px"></div>
  </div>

  <div id="step-dashboard" class="hidden">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2>👋 مرحباً <span id="customer-name"></span></h2>
        <button class="btn btn-secondary" style="width:auto;padding:8px 16px" onclick="logout()">خروج</button>
      </div>
      <div class="nav">
        <button class="active" onclick="showTab('orders')">طلباتي</button>
        <button onclick="showTab('tickets')">التذاكر</button>
        <button onclick="showTab('new-ticket')">تذكرة جديدة</button>
      </div>
    </div>

    <div id="tab-orders" class="card">
      <h2>📦 طلباتي</h2>
      <div id="orders-list">جاري التحميل...</div>
    </div>

    <div id="tab-tickets" class="card hidden">
      <h2>🎫 تذاكر الدعم</h2>
      <div id="tickets-list">جاري التحميل...</div>
    </div>

    <div id="tab-new-ticket" class="card hidden">
      <h2>✉️ تذكرة جديدة</h2>
      <input type="text" id="ticket-subject" placeholder="الموضوع">
      <textarea id="ticket-message" rows="4" placeholder="وصف المشكلة..."></textarea>
      <button class="btn" onclick="createTicket()">إرسال التذكرة</button>
      <div id="ticket-msg" style="margin-top:12px"></div>
    </div>
  </div>
</div>

<script>
const API_URL = window.location.href.split('?')[0];
let token = localStorage.getItem('portal_token');
let customerId = null;

if (token) loadDashboard();

async function requestOtp() {
  const phone = document.getElementById('phone').value.trim();
  if (!phone.match(/^05\d{8}$/)) {
    document.getElementById('login-error').textContent = 'رقم جوال غير صالح';
    return;
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'portal.requestOtp', phone: phone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    document.getElementById('otp-section').classList.remove('hidden');
    document.getElementById('login-error').textContent = '';
  } catch (e) {
    document.getElementById('login-error').textContent = e.message;
  }
}

async function verifyOtp() {
  const phone = document.getElementById('phone').value.trim();
  const code = document.getElementById('otp-code').value.trim();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'portal.verifyOtp', phone: phone, code: code })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    token = data.data.token;
    localStorage.setItem('portal_token', token);
    loadDashboard();
  } catch (e) {
    document.getElementById('login-error').textContent = e.message;
  }
}

async function loadDashboard() {
  document.getElementById('step-login').classList.add('hidden');
  document.getElementById('step-dashboard').classList.remove('hidden');
  fetchOrders();
}

async function fetchOrders() {
  try {
    const res = await fetch(API_URL + '?action=portal.orders&token=' + encodeURIComponent(token));
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    const list = document.getElementById('orders-list');
    if (!data.data || !data.data.length) {
      list.innerHTML = '<p>لا توجد طلبات</p>';
      return;
    }
    list.innerHTML = data.data.map(o => `
      <div class="order-card">
        <div class="header">
          <span>طلب #${o.id}</span>
          <span class="status-badge status-${o.status.replace(/\s/g,'-')}">${o.status}</span>
        </div>
        <div class="total">${o.totalFormatted}</div>
        <div style="color:#888;font-size:13px">${o.createdAtFormatted}</div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('orders-list').innerHTML = '<p style="color:#c62828">' + e.message + '</p>';
  }
}

async function fetchTickets() {
  try {
    const res = await fetch(API_URL + '?action=portal.tickets&token=' + encodeURIComponent(token));
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    const list = document.getElementById('tickets-list');
    if (!data.data || !data.data.length) {
      list.innerHTML = '<p>لا توجد تذاكر</p>';
      return;
    }
    list.innerHTML = data.data.map(t => `
      <div class="ticket-card">
        <strong>${t.subject}</strong>
        <div style="color:#888;font-size:13px;margin-top:4px">${t.status} — ${t.createdAtFormatted}</div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('tickets-list').innerHTML = '<p style="color:#c62828">' + e.message + '</p>';
  }
}

async function createTicket() {
  const subject = document.getElementById('ticket-subject').value.trim();
  const message = document.getElementById('ticket-message').value.trim();
  if (!subject || !message) {
    document.getElementById('ticket-msg').textContent = 'جميع الحقول مطلوبة';
    return;
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'portal.createTicket', token: token, subject: subject, message: message })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    document.getElementById('ticket-subject').value = '';
    document.getElementById('ticket-message').value = '';
    document.getElementById('ticket-msg').textContent = 'تم إرسال التذكرة بنجاح ✅';
    document.getElementById('ticket-msg').style.color = '#2e7d32';
    showTab('tickets');
    fetchTickets();
  } catch (e) {
    document.getElementById('ticket-msg').textContent = e.message;
    document.getElementById('ticket-msg').style.color = '#c62828';
  }
}

function showTab(tab) {
  ['orders','tickets','new-ticket'].forEach(t => {
    document.getElementById('tab-' + t).classList.add('hidden');
  });
  document.getElementById('tab-' + tab).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (tab === 'tickets') fetchTickets();
}

function logout() {
  fetch(API_URL + '?action=portal.logout&token=' + encodeURIComponent(token));
  localStorage.removeItem('portal_token');
  token = null;
  location.reload();
}
</script>
</body>
</html>`;
  return HtmlService.createHtmlOutput(html).setTitle('بوابة العميل');
}
