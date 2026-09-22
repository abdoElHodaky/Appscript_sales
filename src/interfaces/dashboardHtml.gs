/**
 * ============================================================
 * Interface Layer — Dashboard HTML Page
 * ============================================================
 */

function renderDashboardPage() {
  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>لوحة التحكم — نظام المبيعات</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#f5f7fa;color:#333;line-height:1.6}
.container{max-width:1200px;margin:0 auto;padding:20px}
header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:30px 20px;border-radius:12px;margin-bottom:24px;box-shadow:0 4px 15px rgba(0,0,0,0.1)}
header h1{font-size:28px;margin-bottom:8px}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.kpi-card{background:#fff;padding:20px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:center;transition:transform 0.2s}
.kpi-card:hover{transform:translateY(-4px)}
.kpi-card .value{font-size:32px;font-weight:700;color:#667eea;margin:8px 0}
.kpi-card .label{font-size:14px;color:#888}
.section{background:#fff;padding:24px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:24px}
.section h2{font-size:20px;margin-bottom:16px;color:#444;border-bottom:2px solid #667eea;padding-bottom:8px;display:inline-block}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{padding:12px;text-align:right;border-bottom:1px solid #eee}
th{background:#f8f9fa;font-weight:600;color:#555}
tr:hover{background:#f8f9fa}
.status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
.status-جديد{background:#e3f2fd;color:#1976d2}
.status-قيد-التنفيذ{background:#fff3e0;color:#f57c00}
.status-تم-الشحن{background:#e8f5e9;color:#388e3c}
.status-مكتمل{background:#e8f5e9;color:#2e7d32}
.status-ملغي{background:#ffebee;color:#c62828}
.btn{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;transition:opacity 0.2s}
.btn:hover{opacity:0.9}
.search-box{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.search-box input,.search-box select{flex:1;min-width:150px;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px}
.pagination{display:flex;justify-content:center;gap:8px;margin-top:16px}
.pagination button{background:#fff;border:1px solid #ddd;padding:8px 16px;border-radius:6px;cursor:pointer}
.pagination button.active{background:#667eea;color:#fff;border-color:#667eea}
.alert-box{background:#fff3e0;border-right:4px solid #f57c00;padding:16px;border-radius:8px;margin-bottom:16px}
.alert-box.critical{background:#ffebee;border-right-color:#c62828}
#loading{text-align:center;padding:40px;color:#888}
.chart-container{height:300px;margin:16px 0}
@media(max-width:768px){.kpi-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>📊 لوحة التحكم</h1>
    <p>نظام إدارة المبيعات — نظرة شاملة على أداء عملك</p>
  </header>

  <div id="kpi-section" class="kpi-grid">
    <div id="loading">جاري التحميل...</div>
  </div>

  <div class="section">
    <h2>🔍 البحث في الطلبات</h2>
    <div class="search-box">
      <input type="text" id="search-text" placeholder="ابحث باسم العميل أو المنتج...">
      <select id="search-status">
        <option value="">كل الحالات</option>
        <option value="جديد">جديد</option>
        <option value="قيد التنفيذ">قيد التنفيذ</option>
        <option value="تم الشحن">تم الشحن</option>
        <option value="مكتمل">مكتمل</option>
        <option value="ملغي">ملغي</option>
      </select>
      <button class="btn" onclick="searchOrders()">بحث</button>
    </div>
    <div id="search-results"></div>
  </div>

  <div class="section">
    <h2>📈 أحدث الطلبات</h2>
    <div id="recent-orders"></div>
  </div>

  <div class="section">
    <h2>⚠️ التنبيهات</h2>
    <div id="alerts-section"></div>
  </div>
</div>

<script>
const API_URL = window.location.href.split('?')[0];
let currentPage = 1;

async function fetchDashboard() {
  try {
    const res = await fetch(API_URL + '?action=dashboard&userRole=ADMIN');
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    renderKPI(data.data.kpi);
    renderRecentOrders(data.data.tables.recentOrders);
    renderAlerts(data.data.alerts);
  } catch (e) {
    document.getElementById('kpi-section').innerHTML = '<div class="alert-box critical">خطأ: ' + e.message + '</div>';
  }
}

function renderKPI(kpi) {
  document.getElementById('kpi-section').innerHTML = `
    <div class="kpi-card"><div class="label">المبيعات</div><div class="value">${kpi.salesFormatted}</div></div>
    <div class="kpi-card"><div class="label">الطلبات</div><div class="value">${kpi.orders}</div></div>
    <div class="kpi-card"><div class="label">متوسط القيمة</div><div class="value">${kpi.aovFormatted}</div></div>
    <div class="kpi-card"><div class="label">نسبة الإنجاز</div><div class="value">${kpi.completionRate}%</div></div>
    <div class="kpi-card"><div class="label">نسبة الإلغاء</div><div class="value">${kpi.cancellationRate}%</div></div>
    <div class="kpi-card"><div class="label">العملاء النشطون</div><div class="value">${kpi.activeCustomers}</div></div>
  `;
}

function renderRecentOrders(orders) {
  if (!orders || !orders.length) {
    document.getElementById('recent-orders').innerHTML = '<p>لا توجد طلبات</p>';
    return;
  }
  const rows = orders.map(o => `
    <tr>
      <td>${o.id}</td>
      <td>${o.customer}</td>
      <td>${o.total}</td>
      <td><span class="status-badge status-${o.status.replace(/\s/g,'-')}">${o.status}</span></td>
      <td>${o.date}</td>
    </tr>
  `).join('');
  document.getElementById('recent-orders').innerHTML = `
    <table><thead><tr><th>الرقم</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead>
    <tbody>${rows}</tbody></table>
  `;
}

function renderAlerts(alerts) {
  const el = document.getElementById('alerts-section');
  if (!alerts || !alerts.recentFirings || !alerts.recentFirings.length) {
    el.innerHTML = '<p>لا توجد تنبيهات حالياً</p>';
    return;
  }
  el.innerHTML = alerts.recentFirings.map(a => `
    <div class="alert-box">${new Date(a.at).toLocaleString('ar-SA')} — ${a.ruleId}</div>
  `).join('');
}

async function searchOrders() {
  const text = document.getElementById('search-text').value;
  const status = document.getElementById('search-status').value;
  try {
    const res = await fetch(API_URL + '?action=search&text=' + encodeURIComponent(text) +
      '&status=' + encodeURIComponent(status) + '&page=' + currentPage);
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    renderSearchResults(data.data);
  } catch (e) {
    document.getElementById('search-results').innerHTML = '<div class="alert-box critical">' + e.message + '</div>';
  }
}

function renderSearchResults(result) {
  if (!result.hits || !result.hits.length) {
    document.getElementById('search-results').innerHTML = '<p>لا توجد نتائج</p>';
    return;
  }
  const rows = result.hits.map(o => `
    <tr>
      <td>${o.id}</td>
      <td>${o.customerName}</td>
      <td>${o.totalFormatted}</td>
      <td><span class="status-badge status-${o.status.replace(/\s/g,'-')}">${o.status}</span></td>
      <td>${o.createdAtFormatted}</td>
    </tr>
  `).join('');
  document.getElementById('search-results').innerHTML = `
    <table><thead><tr><th>الرقم</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="pagination">
      ${Array.from({length:result.pages},(_,i)=>`<button class="${i+1===result.page?'active':''}" onclick="currentPage=${i+1};searchOrders()">${i+1}</button>`).join('')}
    </div>
  `;
}

fetchDashboard();
</script>
</body>
</html>`;
  return HtmlService.createHtmlOutput(html).setTitle('لوحة التحكم');
}
