/**
 * ============================================================
 * Interface Layer — Customer Portal Page (HTML)
 * ------------------------------------------------------------
 * Password-less customer portal:
 *   1) phone → OTP   2) OTP → session token
 *   3) orders list   4) support tickets + create
 * RTL, responsive, dark mode, XSS-safe (textContent only).
 * ============================================================
 */

/**
 * @return {HtmlOutput} The rendered portal page.
 */
function renderPortalPage() {
  return HtmlService.createHtmlOutput(PORTAL_HTML_)
    .setTitle('بوابة العملاء')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** @private page markup (constant — no template evaluation). */
const PORTAL_HTML_ = '<!DOCTYPE html>' +
'<html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
'<style>' +
':root{--bg:#f4f6fb;--card:#fff;--text:#1a1f36;--muted:#6b7280;--accent:#059669;--border:#e5e7eb}' +
'body.dark{--bg:#0f172a;--card:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--border:#334155}' +
'*{box-sizing:border-box;margin:0;padding:0;font-family:Tahoma,Arial,sans-serif}' +
'body{background:var(--bg);color:var(--text);min-height:100vh;padding:16px}' +
'.wrap{max-width:760px;margin:0 auto}' +
'.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:14px}' +
'h1{font-size:20px;margin-bottom:14px}' +
'h2{font-size:15px;margin-bottom:10px;color:var(--muted)}' +
'input,textarea,button{width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:10px;background:var(--card);color:var(--text)}' +
'button{background:var(--accent);color:#fff;border-color:var(--accent);cursor:pointer;font-weight:bold}' +
'button.link{background:none;color:var(--accent);border:none;width:auto;padding:4px}' +
'.row{display:flex;justify-content:space-between;align-items:center}' +
'.msg{font-size:13px;margin-bottom:10px;min-height:18px}' +
'.msg.err{color:#dc2626}.msg.ok{color:#059669}' +
'table{width:100%;border-collapse:collapse;font-size:13px}' +
'th,td{padding:8px;border-bottom:1px solid var(--border);text-align:right}' +
'th{color:var(--muted);font-weight:normal}' +
'.hidden{display:none}' +
'.pill{padding:2px 10px;border-radius:12px;font-size:11px;background:#d1fae5;color:#065f46}' +
'</style></head><body><div class="wrap">' +
'<div class="row"><h1>🛍️ بوابة العملاء</h1><button class="link" onclick="document.body.classList.toggle(\'dark\')">🌙</button></div>' +

/* ---------- step 1: phone ---------- */
'<div class="card" id="stepPhone">' +
'<h2>تسجيل الدخول برقم الجوال</h2>' +
'<div class="msg" id="msgPhone"></div>' +
'<input id="phone" type="tel" placeholder="05xxxxxxxx" dir="ltr">' +
'<button onclick="requestOtp()">إرسال رمز التحقق</button>' +
'</div>' +

/* ---------- step 2: otp ---------- */
'<div class="card hidden" id="stepOtp">' +
'<h2>أدخل رمز التحقق (6 أرقام)</h2>' +
'<div class="msg" id="msgOtp"></div>' +
'<input id="code" type="text" inputmode="numeric" maxlength="6" placeholder="______" dir="ltr">' +
'<button onclick="verifyOtp()">تأكيد الدخول</button>' +
'</div>' +

/* ---------- step 3: account ---------- */
'<div id="account" class="hidden">' +
'<div class="card"><div class="row"><h2 id="welcome"></h2><button class="link" onclick="logout()">خروج</button></div></div>' +
'<div class="card"><h2>📦 طلباتي</h2><table id="orders"></table></div>' +
'<div class="card"><h2>🎫 تذاكر الدعم</h2><table id="tickets"></table>' +
'<h2 style="margin-top:14px">فتح تذكرة جديدة</h2>' +
'<div class="msg" id="msgTicket"></div>' +
'<input id="tSubject" placeholder="الموضوع (5 أحرف على الأقل)">' +
'<textarea id="tMessage" rows="3" placeholder="اشرح المشكلة..."></textarea>' +
'<button onclick="createTicket()">إرسال التذكرة</button></div>' +
'</div>' +

'</div>' +
'<script>' +
'var token=localStorage.getItem("portal_token")||"";' +
'var phone="";' +
'function el(t,x){var e=document.createElement(t);e.textContent=x==null?"":x;return e;}' +
'function show(id){document.getElementById(id).classList.remove("hidden");}' +
'function hide(id){document.getElementById(id).classList.add("hidden");}' +
'function msg(id,text,ok){var m=document.getElementById(id);m.textContent=text;m.className="msg "+(ok?"ok":"err");}' +
'function post(body,cb){' +
' var x=new XMLHttpRequest();x.open("POST",location.pathname,true);' +
' x.setRequestHeader("Content-Type","text/plain;charset=utf-8");' +
' x.onreadystatechange=function(){if(x.readyState===4){try{cb(JSON.parse(x.responseText));}catch(e){cb({success:false,error:{message:"خطأ في الاتصال"}});}}};' +
' x.send(JSON.stringify(body));' +
'}' +
'function requestOtp(){' +
' phone=document.getElementById("phone").value.trim();' +
' msg("msgPhone","جارٍ الإرسال...",true);' +
' post({action:"portal.requestOtp",phone:phone},function(res){' +
'  if(!res.success){msg("msgPhone",res.error.message);return;}' +
'  msg("msgPhone","تم إرسال الرمز",true);show("stepOtp");' +
'  if(res.data.devCode)msg("msgPhone","وضع التطوير — الرمز: "+res.data.devCode,true);' +
' });' +
'}' +
'function verifyOtp(){' +
' post({action:"portal.verifyOtp",phone:phone,code:document.getElementById("code").value.trim()},function(res){' +
'  if(!res.success){msg("msgOtp",res.error.message);return;}' +
'  token=res.data.token;localStorage.setItem("portal_token",token);' +
'  enterAccount(res.data.customer);' +
' });' +
'}' +
'function enterAccount(c){' +
' hide("stepPhone");hide("stepOtp");show("account");' +
' document.getElementById("welcome").textContent="مرحباً "+c.name;' +
' loadOrders();loadTickets();' +
'}' +
'function loadOrders(){' +
' post({action:"portal.orders",token:token},function(res){' +
'  var t=document.getElementById("orders");t.innerHTML="";' +
'  var h=document.createElement("tr");["الطلب","الإجمالي","الحالة","التاريخ"].forEach(function(x){h.appendChild(el("th",x));});t.appendChild(h);' +
'  if(!res.success)return;' +
'  res.data.forEach(function(o){var tr=document.createElement("tr");' +
'   [o.id,o.totalFormatted,o.status,o.createdAtFormatted].forEach(function(v){tr.appendChild(el("td",v));});' +
'   t.appendChild(tr);});' +
' });' +
'}' +
'function loadTickets(){' +
' post({action:"portal.tickets",token:token},function(res){' +
'  var t=document.getElementById("tickets");t.innerHTML="";' +
'  var h=document.createElement("tr");["الموضوع","الحالة","التاريخ"].forEach(function(x){h.appendChild(el("th",x));});t.appendChild(h);' +
'  if(!res.success)return;' +
'  res.data.forEach(function(k){var tr=document.createElement("tr");' +
'   [k.subject,k.status,k.createdAtFormatted].forEach(function(v){tr.appendChild(el("td",v));});' +
'   t.appendChild(tr);});' +
' });' +
'}' +
'function createTicket(){' +
' post({action:"portal.createTicket",token:token,' +
'  subject:document.getElementById("tSubject").value,' +
'  message:document.getElementById("tMessage").value},function(res){' +
'  if(!res.success){msg("msgTicket",res.error.message);return;}' +
'  msg("msgTicket","تم فتح التذكرة "+res.data.id,true);' +
'  document.getElementById("tSubject").value="";document.getElementById("tMessage").value="";' +
'  loadTickets();' +
' });' +
'}' +
'function logout(){' +
' post({action:"portal.logout",token:token},function(){' +
'  localStorage.removeItem("portal_token");location.reload();' +
' });' +
'}' +
'if(token){post({action:"portal.orders",token:token},function(res){' +
' if(res.success){enterAccount({name:"عميلنا الكريم"});}else{localStorage.removeItem("portal_token");}' +
'});}' +
'<\/script></body></html>';
