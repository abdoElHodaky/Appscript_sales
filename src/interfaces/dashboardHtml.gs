/**
 * ============================================================
 * Interface Layer — Dashboard Page (HTML)
 * ------------------------------------------------------------
 * Self-contained admin dashboard served by HtmlService:
 *   - 6 KPI cards, 6 charts (Chart.js CDN), 4 tables
 *   - Auto-refresh every 30s, dark mode, RTL Arabic
 *   - All dynamic strings rendered via textContent (no innerHTML
 *     with user data) → XSS-safe by construction
 * ============================================================
 */

/**
 * @return {HtmlOutput} The rendered dashboard page.
 */
function renderDashboardPage() {
  return HtmlService.createHtmlOutput(DASHBOARD_HTML_)
    .setTitle('لوحة تحكم المبيعات')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * The page markup. Kept as a constant so Apps Script serves it
 * without template evaluation (faster, no injection surface).
 * @private
 */
const DASHBOARD_HTML_ = '<!DOCTYPE html>' +
'<html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
'<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>' +
'<style>' +
':root{--bg:#f4f6fb;--card:#fff;--text:#1a1f36;--muted:#6b7280;--accent:#4f46e5;--border:#e5e7eb}' +
'body.dark{--bg:#0f172a;--card:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--border:#334155}' +
'*{box-sizing:border-box;margin:0;padding:0;font-family:Tahoma,Arial,sans-serif}' +
'body{background:var(--bg);color:var(--text);padding:16px;transition:background .3s}' +
'header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px}' +
'h1{font-size:20px}' +
'.filters{display:flex;gap:8px;flex-wrap:wrap}' +
'select,button{padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);cursor:pointer;font-size:13px}' +
'button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}' +
'.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}' +
'.kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px}' +
'.kpi .label{color:var(--muted);font-size:12px;margin-bottom:6px}' +
'.kpi .value{font-size:22px;font-weight:bold}' +
'.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-bottom:16px}' +
'.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px}' +
'.card h3{font-size:14px;margin-bottom:10px;color:var(--muted)}' +
'table{width:100%;border-collapse:collapse;font-size:12px}' +
'th,td{padding:8px;border-bottom:1px solid var(--border);text-align:right}' +
'th{color:var(--muted);font-weight:normal}' +
'.status{padding:2px 8px;border-radius:12px;font-size:11px;background:#e0e7ff;color:#3730a3}' +
'#lastUpdated{color:var(--muted);font-size:11px;margin-top:8px}' +
'@media(max-width:600px){.kpi .value{font-size:18px}}' +
'</style></head><body>' +
'<header><h1>📊 لوحة تحكم المبيعات <span id="lastUpdated"></span></h1>' +
'<div class="filters">' +
'<select id="range"><option value="TODAY">اليوم</option><option value="THIS_WEEK">هذا الأسبوع</option>' +
'<option value="THIS_MONTH" selected>هذا الشهر</option><option value="THIS_YEAR">هذه السنة</option></select>' +
'<button class="primary" onclick="loadAll()">تحديث</button>' +
'<button onclick="toggleDark()">🌙</button>' +
'<a href="?page=portal" target="_blank"><button>بوابة العملاء</button></a>' +
'</div></header>' +
'<div class="kpis" id="kpis"></div>' +
'<div class="grid">' +
'<div class="card"><h3>الاتجاه اليومي للمبيعات</h3><canvas id="c1"></canvas></div>' +
'<div class="card"><h3>توزيع الحالات</h3><canvas id="c2"></canvas></div>' +
'<div class="card"><h3>أفضل المنتجات</h3><canvas id="c3"></canvas></div>' +
'<div class="card"><h3>التوزيع بالساعات</h3><canvas id="c4"></canvas></div>' +
'<div class="card"><h3>التوزيع بالمدن</h3><canvas id="c5"></canvas></div>' +
'<div class="card"><h3>نمو العملاء</h3><canvas id="c6"></canvas></div>' +
'</div>' +
'<div class="grid">' +
'<div class="card"><h3>أحدث الطلبات</h3><table id="tRecent"></table></div>' +
'<div class="card"><h3>أفضل العملاء</h3><table id="tTop"></table></div>' +
'<div class="card"><h3>طلبات معلقة</h3><table id="tPending"></table></div>' +
'<div class="card"><h3>مخزون منخفض</h3><table id="tLow"></table></div>' +
'</div>' +
'<script>' +
'var charts={};' +
'function toggleDark(){document.body.classList.toggle("dark");}' +
'function api(action,params,cb){' +
' var url="?action="+action+"&dateRange="+document.getElementById("range").value;' +
' google.script.run;' + // placeholder removed below
' fetchJson(url,cb);' +
'}' +
'function fetchJson(url,cb){' +
' var x=new XMLHttpRequest();x.open("GET",url,true);' +
' x.onreadystatechange=function(){if(x.readyState===4){try{cb(JSON.parse(x.responseText));}catch(e){console.error(e);}}};' +
' x.send();' +
'}' +
'function el(tag,text){var e=document.createElement(tag);e.textContent=text==null?"":text;return e;}' +
'function renderKpis(k){' +
' var box=document.getElementById("kpis");box.innerHTML="";' +
' var defs=[["المبيعات",k.salesFormatted],["الطلبات",k.orders],["متوسط الطلب",k.aovFormatted],' +
'  ["معدل الإكمال",k.completionRate+"%"],["معدل الإلغاء",k.cancellationRate+"%"],["عملاء نشطون",k.activeCustomers]];' +
' defs.forEach(function(d){var c=document.createElement("div");c.className="kpi";' +
'  var l=document.createElement("div");l.className="label";l.textContent=d[0];' +
'  var v=document.createElement("div");v.className="value";v.textContent=d[1];' +
'  c.appendChild(l);c.appendChild(v);box.appendChild(c);});' +
'}' +
'function renderChart(id,cfg){' +
' if(charts[id])charts[id].destroy();' +
' charts[id]=new Chart(document.getElementById(id).getContext("2d"),cfg);' +
'}' +
'function renderTable(id,cols,rows){' +
' var t=document.getElementById(id);t.innerHTML="";' +
' var head=document.createElement("tr");' +
' cols.forEach(function(c){head.appendChild(el("th",c.label));});t.appendChild(head);' +
' rows.forEach(function(r){var tr=document.createElement("tr");' +
'  cols.forEach(function(c){tr.appendChild(el("td",r[c.key]));});t.appendChild(tr);});' +
'}' +
'function loadAll(){' +
' fetchJson("?action=dashboard&dateRange="+document.getElementById("range").value,function(res){' +
'  if(!res.success){console.error(res.error);return;}' +
'  var d=res.data;' +
'  renderKpis(d.kpi);' +
'  renderChart("c1",{type:"line",data:{labels:d.charts.salesTrend.labels,datasets:[{label:"المبيعات",data:d.charts.salesTrend.data,borderColor:"#4f46e5",tension:.3}]}});' +
'  renderChart("c2",{type:"doughnut",data:{labels:d.charts.statusDist.labels,datasets:[{data:d.charts.statusDist.data,backgroundColor:["#6366f1","#f59e0b","#10b981","#22c55e","#ef4444"]}]}});' +
'  renderChart("c3",{type:"bar",data:{labels:d.charts.topProducts.labels,datasets:[{data:d.charts.topProducts.data,backgroundColor:"#8b5cf6"}]}});' +
'  renderChart("c4",{type:"bar",data:{labels:d.charts.hourlyDist.labels,datasets:[{data:d.charts.hourlyDist.data,backgroundColor:"#06b6d4"}]}});' +
'  renderChart("c5",{type:"bar",options:{indexAxis:"y"},data:{labels:d.charts.cityDist.labels,datasets:[{data:d.charts.cityDist.data,backgroundColor:"#f97316"}]}});' +
'  renderChart("c6",{type:"line",data:{labels:d.charts.customerGrowth.labels,datasets:[{data:d.charts.customerGrowth.data,borderColor:"#10b981",fill:true,backgroundColor:"rgba(16,185,129,.1)"}]}});' +
'  renderTable("tRecent",[{key:"id",label:"الطلب"},{key:"customer",label:"العميل"},{key:"total",label:"الإجمالي"},{key:"status",label:"الحالة"}],d.tables.recentOrders);' +
'  renderTable("tTop",[{key:"name",label:"الاسم"},{key:"city",label:"المدينة"},{key:"spent",label:"الإنفاق"}],d.tables.topCustomers);' +
'  renderTable("tPending",[{key:"id",label:"الطلب"},{key:"customer",label:"العميل"},{key:"date",label:"التاريخ"}],d.tables.pendingOrders);' +
'  renderTable("tLow",[{key:"name",label:"المنتج"},{key:"stock",label:"المخزون"},{key:"sku",label:"SKU"}],d.tables.lowStock);' +
'  document.getElementById("lastUpdated").textContent="آخر تحديث: "+new Date().toLocaleTimeString("ar");' +
' });' +
'}' +
'loadAll();setInterval(loadAll,30000);' +
'<\/script></body></html>';
