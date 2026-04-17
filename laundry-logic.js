
/* ══════════════════════════════════════════════════════════
   LAUNDRY ERP — Data & Logic
   ══════════════════════════════════════════════════════════ */

/* ── ITEM CATALOGUE ── */
const ITEMS = [
  {code:"SEN_M",en:"Single Sheet",gr:"Σεντόνι μονό"},
  {code:"SEN_M_L",en:"Single Sheet (elastic)",gr:"Σεντόνι μονό λάστιχο"},
  {code:"SEN_D",en:"Double Sheet (≤1.60m)",gr:"Σεντόνι διπλό (≤1,60μ)"},
  {code:"SEN_D_L",en:"Double Sheet elastic (≤1.60m)",gr:"Σεντόνι διπλό λάστιχο (≤1,60μ)"},
  {code:"SEN_YD",en:"Super Double Sheet (≥1.80m)",gr:"Σεντόνι υπέρδιπλο (≥1,80μ)"},
  {code:"SEN_YD_L",en:"Super Double Sheet elastic (≥1.80m)",gr:"Σεντόνι υπέρδιπλο λάστιχο (≥1,80μ)"},
  {code:"MAX",en:"Pillowcases",gr:"Μαξιλαροθήκες"},
  {code:"PET_PS",en:"Towels (face/body)",gr:"Πετσέτες (προσώπου/σώματος)"},
  {code:"PET_X",en:"Hand Towels",gr:"Πετσέτες χεριών"},
  {code:"PET_PIS",en:"Pool Towels",gr:"Πετσέτες πισίνας"},
  {code:"PATAK",en:"Floor Mat",gr:"Πατάκι"},
  {code:"BOUR_P",en:"Pique Bathrobe",gr:"Μπουρνούζι πικέ"},
  {code:"BOUR_V",en:"Velvet Bathrobe",gr:"Μπουρνούζι βελούδινο"},
  {code:"KOV_PM",en:"Single Pique Blanket",gr:"Κουβέρτα πικέ μονή"},
  {code:"KOV_PD",en:"Double Pique Blanket",gr:"Κουβέρτα πικέ διπλή"},
  {code:"KOV_KM",en:"Classic Single Blanket",gr:"Κουβέρτα κλασική μονή"},
  {code:"KOV_KD",en:"Classic Double Blanket",gr:"Κουβέρτα κλασική διπλή"},
  {code:"PAP_M",en:"Single Quilt",gr:"Πάπλωμα μονό"},
  {code:"PAP_D",en:"Double Quilt",gr:"Πάπλωμα διπλό"},
  {code:"TRAP_M",en:"Tablecloth",gr:"Τραπεζομαντήλα"},
  {code:"PET_SERV",en:"Serving Napkins",gr:"Πετσετάκια σερβιρίσματος"},
  {code:"PET_KOZ",en:"Kitchen Towels",gr:"Πετσέτες κουζίνας"},
  {code:"YPOST",en:"Substrate",gr:"Υπόστρωμα"},
  {code:"PAP_TH_M",en:"Single Duvet Cover",gr:"Παπλωματοθήκη μονή"},
  {code:"PAP_TH_D",en:"Double Duvet Cover",gr:"Παπλωματοθήκη διπλή"},
  {code:"PAP_TH_YD",en:"Super Double Duvet Cover",gr:"Παπλωματοθήκη υπέρδιπλη"},
  {code:"ROUCH_K",en:"Clothes by the kilo",gr:"Ρούχα με το κιλό"},
  {code:"ROUCH_5",en:"Clothes bag up to 5kg",gr:"Ρούχα σακούλα έως 5κιλά"},
  {code:"PUP_MD",en:"Goose Down Quilt S/D",gr:"Πάπλωμα πουπουλένιο μονό/διπλό"},
  {code:"XALI_K",en:"Carpet Cleaning",gr:"Χαλιά καθαρισμός"},
  {code:"XALI_KF",en:"Carpet Cleaning & Storage",gr:"Χαλιά καθαρισμός και φύλλαξη"},
  {code:"KAL_M",en:"Single Cover",gr:"Κάλυμμα μονό"},
  {code:"KAL_D",en:"Double Cover",gr:"Κάλυμμα διπλό"},
  {code:"SIDER",en:"Ironing Sheets",gr:"Σιδέρωμα σεντόνια"},
  {code:"MAXIL",en:"Pillow",gr:"Μαξιλάρι"},
];

const DEFAULT_PL = [
  {id:"PL-001",name:"Βίλες 1",nameEn:"Villas 1",status:"active",prices:{SEN_M:1.2,SEN_M_L:1.35,SEN_D:1.4,SEN_D_L:1.5,SEN_YD:1.6,SEN_YD_L:1.7,MAX:0.8,PET_PS:0.95,PET_X:0.7,PET_PIS:1,PATAK:0.9,BOUR_P:3.5,BOUR_V:4.5,KOV_PM:3.5,KOV_PD:4.5,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.5,PET_KOZ:0.5,YPOST:1,PAP_TH_M:3.5,PAP_TH_D:4.5,PAP_TH_YD:5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
  {id:"PL-002",name:"Ξενοδοχεία 1",nameEn:"Hotels 1",status:"active",prices:{SEN_M:1.1,SEN_M_L:1.3,SEN_D:1.2,SEN_D_L:1.4,SEN_YD:1.35,SEN_YD_L:1.6,MAX:0.7,PET_PS:0.85,PET_X:0.4,PET_PIS:0.9,PATAK:0.8,BOUR_P:3,BOUR_V:4,KOV_PM:3,KOV_PD:4,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.2,PET_KOZ:0.2,YPOST:1,PAP_TH_M:3,PAP_TH_D:4,PAP_TH_YD:4.5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
  {id:"PL-003",name:"Βίλες 2",nameEn:"Villas 2",status:"active",prices:{SEN_M:1.3,SEN_M_L:1.4,SEN_D:1.5,SEN_D_L:1.6,SEN_YD:1.7,SEN_YD_L:1.8,MAX:0.85,PET_PS:1,PET_X:0.75,PET_PIS:1,PATAK:0.9,BOUR_P:3.5,BOUR_V:4.5,KOV_PM:4,KOV_PD:5,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.5,PET_KOZ:0.5,YPOST:1,PAP_TH_M:3.5,PAP_TH_D:4.5,PAP_TH_YD:5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
  {id:"PL-004",name:"Βίλες 3",nameEn:"Villas 3",status:"active",prices:{SEN_M:1.4,SEN_M_L:1.5,SEN_D:1.6,SEN_D_L:1.7,SEN_YD:1.8,SEN_YD_L:1.9,MAX:0.9,PET_PS:1,PET_X:0.75,PET_PIS:1,PATAK:0.9,BOUR_P:3.5,BOUR_V:4.5,KOV_PM:4,KOV_PD:5,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.5,PET_KOZ:0.5,YPOST:1,PAP_TH_M:3.5,PAP_TH_D:4.5,PAP_TH_YD:5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
  {id:"PL-005",name:"Ξενοδοχεία 2",nameEn:"Hotels 2",status:"active",prices:{SEN_M:1,SEN_M_L:1.25,SEN_D:1.1,SEN_D_L:1.35,SEN_YD:1.3,SEN_YD_L:1.5,MAX:0.65,PET_PS:0.8,PET_X:0.35,PET_PIS:0.8,PATAK:0.7,BOUR_P:2.7,BOUR_V:3.6,KOV_PM:2.7,KOV_PD:3.6,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.2,PET_KOZ:0.2,YPOST:1,PAP_TH_M:3,PAP_TH_D:4,PAP_TH_YD:4.5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
  {id:"PL-006",name:"Ξενοδοχείο Tella",nameEn:"Hotel Tella",status:"active",prices:{SEN_M:1.2,SEN_M_L:1.35,SEN_D:1.4,SEN_D_L:1.5,SEN_YD:1.6,SEN_YD_L:1.7,MAX:0.8,PET_PS:1.4,PET_X:0.6,PET_PIS:1.4,PATAK:0.9,BOUR_P:3.5,BOUR_V:4.5,KOV_PM:3.5,KOV_PD:4.5,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.5,PET_KOZ:0.5,YPOST:1,PAP_TH_M:3.5,PAP_TH_D:4.5,PAP_TH_YD:5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
  {id:"PL-007",name:"Εστιατόρια",nameEn:"Restaurants",status:"active",prices:{TRAP_M:1.5,PET_SERV:0.5,PET_KOZ:0.5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7}},
  {id:"PL-008",name:"Ξενοδοχεία 3",nameEn:"Hotels 3",status:"active",prices:{SEN_M:1,SEN_M_L:1.1,SEN_D:1.1,SEN_D_L:1.35,SEN_YD:1.25,SEN_YD_L:1.5,MAX:0.6,PET_PS:0.75,PET_X:0.35,PET_PIS:0.8,PATAK:0.7,BOUR_P:2.7,BOUR_V:3.6,KOV_PM:2.7,KOV_PD:3.6,KOV_KM:13,KOV_KD:15,PAP_M:14,PAP_D:16,TRAP_M:1.5,PET_SERV:0.2,PET_KOZ:0.2,YPOST:1,PAP_TH_M:3,PAP_TH_D:4,PAP_TH_YD:4.5,ROUCH_K:4,ROUCH_5:17,PUP_MD:18,XALI_K:6,XALI_KF:7,KAL_M:5,KAL_D:7,SIDER:0.9,MAXIL:5}},
];

/* ── STATE ── */
let customers = [], orders = [], receipts = [], pricelists = [];
let lang = 'en';
let currentOrderId = null; // id being edited in order modal

/* ── INIT ── */
async function init() {
  // Load all from Supabase (laundry uses its own tables)
  const [cRes, oRes, rRes, plRes] = await Promise.all([
    SyncStore.load('zesty_laundry_customers', 'laundry_customers'),
    SyncStore.load('zesty_laundry_orders', 'laundry_orders'),
    SyncStore.load('zesty_laundry_receipts', 'laundry_receipts'),
    SyncStore.load('zesty_laundry_pricelists', 'laundry_pricelists'),
  ]);
  customers = cRes.data;
  orders = oRes.data;
  fixDuplicateOrderIds();
  receipts = rRes.data;
  pricelists = plRes.data;

  // Seed default pricelists if empty
  if (!pricelists.length) {
    pricelists = DEFAULT_PL.map(pl => ({ ...pl }));
    await SyncStore.saveAll('zesty_laundry_pricelists', 'laundry_pricelists', pricelists);
  }

  populateSelects();
  renderAll();
}
init();

/* ── TAB ── */
function showTab(name) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'dashboard') renderDashboard();
  else if (name === 'customers') renderCustomers();
  else if (name === 'orders') renderOrders();
  else if (name === 'receipts') renderReceipts();
  else if (name === 'pricelists') renderPricelists();
  else if (name === 'reports') populateReportFilter();
}

/* ── LANG ── */
function toggleLang() {
  lang = lang === 'en' ? 'gr' : 'en';
  document.getElementById('langBtn').textContent = lang === 'en' ? '🇬🇷 GR' : '🇬🇧 EN';
  // Refresh order modal items if open
  if (!document.getElementById('orderModal').classList.contains('open')) return;
  renderOrderItems();
}
function iname(item) { return lang === 'en' ? item.en : item.gr; }

/* ── HELPERS ── */
function eur(n) { return '€' + fmtNum(n); }
function today() { return new Date().toISOString().slice(0, 10); }
function nextId(prefix, arr) {
  // Use the display ID field (orderId/receiptId/id) to find max number
  const idField = prefix === 'ORD-' ? 'orderId' : prefix === 'REC-' ? 'receiptId' : 'id';
  const nums = arr.map(x => {
    const val = x[idField] || x.id || '';
    const m = val.match(/(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  return prefix + String(Math.max(0, ...nums) + 1).padStart(3, '0');
}

// Fix existing orders that have duplicate ORD-939 etc
function fixDuplicateOrderIds() {
  const seen = new Set();
  let changed = false;
  orders.sort((a,b)=>(a.date||'').localeCompare(b.date||'') || (a.id||'').localeCompare(b.id||''));
  let counter = 1;
  orders.forEach(o => {
    if (!o.orderId || seen.has(o.orderId)) {
      o.orderId = 'ORD-' + String(counter).padStart(3, '0');
      changed = true;
    }
    seen.add(o.orderId);
    const num = parseInt((o.orderId||'').replace('ORD-','')) || 0;
    if (num >= counter) counter = num + 1;
  });
  if (changed) {
    SyncStore.saveAll('zesty_laundry_orders', 'laundry_orders', orders);
    console.log('Fixed duplicate order IDs');
  }
}
function calcOrderTotal(order) {
  const pl = pricelists.find(p => p.id === order.pricelistId);
  if (!pl || !order.items) return 0;
  return Object.entries(order.items).reduce((s, [code, qty]) => {
    return s + (parseFloat(qty) || 0) * (pl.prices[code] || 0);
  }, 0);
}

/* ── POPULATE SELECTS ── */
function populateSelects() {
  const custOpts = customers.map(c => `\u003Coption value="${c.id}">${c.name}</option>`).join('');
  const plOpts = pricelists.filter(p => p.status === 'active').map(p => `<option value="${p.id}">${p.id} — ${p.name}</option>`).join('');

  ['ord-cust', 'rec-cust', 'rpt-cust'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">All customers</option>' + custOpts;
    el.value = cur;
  });
  ['om-cust', 'rm-cust', 'cm-pricelist', 'prop-client'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'cm-pricelist') { el.innerHTML = '<option value="">— Select —</option>' + plOpts; return; }
    if (id === 'prop-client') { el.innerHTML = '<option value="">— Select —</option>' + custOpts; return; }
    el.innerHTML = '<option value="">— Select —</option>' + custOpts;
  });
  const propPl = document.getElementById('prop-pl');
  if (propPl) propPl.innerHTML = '<option value="">— Select —</option>' + plOpts;
  const omPl = document.getElementById('om-pl');
  if (omPl) { omPl.innerHTML = '<option value="">— Select —</option>' + plOpts; }
}

/* ── RENDER ALL ── */
function renderAll() {
  renderDashboard();
  renderCustomers();
  renderOrders();
  renderReceipts();
  renderPricelists();
}

/* ══ DASHBOARD ══ */
function renderDashboard() {
  const year = new Date().getFullYear();
  const month = new Date().toISOString().slice(0, 7);
  const yearOrders = orders.filter(o => (o.date || '').startsWith(year));
  const totalCharged = yearOrders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalReceived = receipts.filter(r => (r.date || '').startsWith(year)).reduce((s, r) => s + ((r.grossAmount || 0) - (r.charges || 0)), 0);
  const monthOrders = orders.filter(o => (o.date || '').startsWith(month)).length;

  document.getElementById('kpi-charged').textContent = eur(totalCharged);
  document.getElementById('kpi-received').textContent = eur(totalReceived);
  document.getElementById('kpi-outstanding').textContent = eur(Math.max(0, totalCharged - totalReceived));
  document.getElementById('kpi-orders-month').textContent = monthOrders;
  document.getElementById('kpi-customers').textContent = customers.length;
  document.getElementById('kpi-pricelists').textContent = pricelists.filter(p => p.status === 'active').length;

  // Recent orders
  const recent = [...orders].sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1).slice(0, 8);
  const stBadge = s => {
    const map = {Pending:'b-pending',Ready:'b-progress',Delivered:'b-active',Invoiced:'b-company'};
    return `<span class="badge ${map[s]||'b-pending'}">${s||'Pending'}</span>`;
  };
  document.getElementById('dash-orders').innerHTML = recent.length ? recent.map(o => {
    const cust = customers.find(c => c.id === o.customerId);
    return `<tr>
      <td style="font-family:monospace;font-size:12px">${o.orderId || o.id.slice(0,8)}</td>
      <td style="font-size:13px">${cust?.name || '—'}</td>
      <td style="font-size:12px">${fmtDate(o.date)}</td>
      <td style="font-weight:600;color:var(--teal)">${eur(calcOrderTotal(o))}</td>
      <td>${stBadge(o.status)}</td>
    </tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="5">No orders yet</td></tr>';

  // Top customers
  const custTotals = {};
  orders.filter(o => (o.date || '').startsWith(year)).forEach(o => {
    const cust = customers.find(c => c.id === o.customerId);
    const name = cust?.name || 'Unknown';
    custTotals[name] = custTotals[name] || { count: 0, total: 0 };
    custTotals[name].count++;
    custTotals[name].total += calcOrderTotal(o);
  });
  const top = Object.entries(custTotals).sort(([, a], [, b]) => b.total - a.total).slice(0, 8);
  document.getElementById('dash-top-customers').innerHTML = top.length ? top.map(([name, d]) => `<tr>
    <td>${name}</td><td style="text-align:center">${d.count}</td>
    <td style="text-align:right;font-weight:600;color:var(--teal)">${eur(d.total)}</td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="3">No data</td></tr>';
}

/* ══ CUSTOMERS ══ */
function renderCustomers() {
  const q = (document.getElementById('cust-q')?.value || '').toLowerCase();
  const list = customers.filter(c => !q || (c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(q));
  document.getElementById('cust-count').textContent = list.length + ' Customer' + (list.length !== 1 ? 's' : '');
  const tbody = document.getElementById('cust-body');
  if (!list.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-icon">👥</div><p>No customers</p></td></tr>'; return; }
  tbody.innerHTML = list.map(c => {
    const pl = pricelists.find(p => p.id === c.pricelistId);
    const oCount = orders.filter(o => o.customerId === c.id).length;
    return `<tr>
      <td><strong>${c.name}</strong></td>
      <td style="font-size:12px">${c.phone || '—'}</td>
      <td style="font-size:12px">${c.email || '—'}</td>
      <td>${pl ? `<span class="badge b-individual">${pl.id} ${pl.name}</span>` : '—'}</td>
      <td style="font-size:12px">${c.payMethod || '—'}</td>
      <td style="text-align:center">${oCount}</td>
      <td><div class="table-actions">
        <button class="btn btn-outline btn-xs" onclick="viewCustomerLedger('${c.id}')" title="View ledger" style="background:#e8f4f8;color:#1a5276;border-color:#aed6f1">📋 View</button>
        <button class="btn btn-teal btn-xs" onclick="editCustomer('${c.id}')">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="confirmDeleteCustomer('${c.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ══ ORDERS ══ */
function renderOrders() {
  const q = (document.getElementById('ord-q')?.value || '').toLowerCase();
  const fStatus = document.getElementById('ord-status')?.value || '';
  const fCust = document.getElementById('ord-cust')?.value || '';
  const fMonth = document.getElementById('ord-month')?.value || '';

  let list = orders.filter(o => {
    if (fStatus && o.status !== fStatus) return false;
    if (fCust && o.customerId !== fCust) return false;
    if (fMonth && !(o.date || '').startsWith(fMonth)) return false;
    if (q) {
      const cust = customers.find(c => c.id === o.customerId);
      if (!((o.orderId || '') + ' ' + (cust?.name || '')).toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1);

  document.getElementById('ord-count').textContent = list.length + ' Order' + (list.length !== 1 ? 's' : '');
  const statusBadge = s => { const map={Pending:'b-pending',Ready:'b-progress',Delivered:'b-active',Invoiced:'b-company'}; return `<span class="badge ${map[s]||'b-pending'}">${s||'Pending'}</span>`; };

  const tbody = document.getElementById('ord-body');
  if (!list.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-icon">📋</div><p>No orders</p></td></tr>'; return; }
  tbody.innerHTML = list.map(o => {
    const cust = customers.find(c => c.id === o.customerId);
    const pl = pricelists.find(p => p.id === o.pricelistId);
    return `<tr>
      <td style="font-family:monospace;font-size:12px;color:var(--teal)">${o.orderId || o.id.slice(0, 8)}</td>
      <td>${cust?.name || '—'}</td>
      <td style="font-size:12px">${fmtDate(o.date)}</td>
      <td style="font-size:12px">${pl ? pl.name : '—'}</td>
      <td style="font-weight:600">${eur(calcOrderTotal(o))}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${o.notes || ''}</td>
      <td><div class="table-actions">
        <button class="btn btn-teal btn-xs" onclick="editOrder('${o.id}')">✏️</button>
        <button class="btn btn-outline btn-xs" onclick="printOrderById('${o.id}')">🖨</button>
        <button class="btn btn-danger btn-xs" onclick="confirmDeleteOrder('${o.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ══ RECEIPTS ══ */
function renderReceipts() {
  const q = (document.getElementById('rec-q')?.value || '').toLowerCase();
  const fCust = document.getElementById('rec-cust')?.value || '';
  const fMonth = document.getElementById('rec-month')?.value || '';

  let list = receipts.filter(r => {
    if (fCust && r.customerId !== fCust) return false;
    if (fMonth && !(r.date || '').startsWith(fMonth)) return false;
    if (q) {
      const cust = customers.find(c => c.id === r.customerId);
      if (!((r.receiptId || '') + ' ' + (cust?.name || '')).toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1);

  document.getElementById('rec-count').textContent = list.length + ' Receipt' + (list.length !== 1 ? 's' : '');

  const totalGross = list.reduce((s, r) => s + (parseFloat(r.grossAmount) || 0), 0);
  const totalCharges = list.reduce((s, r) => s + (parseFloat(r.charges) || 0), 0);
  const totalNet = totalGross - totalCharges;
  // Forward balance for filtered customer
  const fCustId = document.getElementById('rec-cust')?.value || '';
  const fwdCust = fCustId ? customers.find(c => c.id === fCustId) : null;
  const fwdBalance = fwdCust ? (parseFloat(fwdCust.forwardBalance) || 0) : 0;
  document.getElementById('rec-total-gross').textContent = eur(totalGross);
  document.getElementById('rec-total-charges').textContent = eur(totalCharges);
  document.getElementById('rec-total-net').textContent = eur(totalNet);
  const fwdWrap = document.getElementById('rec-fwd-wrap');
  const totWrap = document.getElementById('rec-total-wrap');
  if (fwdBalance && fwdWrap && totWrap) {
    fwdWrap.style.display = '';
    totWrap.style.display = '';
    document.getElementById('rec-fwd-bal').textContent = eur(fwdBalance);
    document.getElementById('rec-grand').textContent = eur(totalNet + fwdBalance);
  } else if(fwdWrap) { fwdWrap.style.display='none'; if(totWrap)totWrap.style.display='none'; }

  const tbody = document.getElementById('rec-body');
  if (!list.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-icon">💰</div><p>No receipts</p></td></tr>'; return; }
  tbody.innerHTML = list.map(r => {
    const cust = customers.find(c => c.id === r.customerId);
    const gross = parseFloat(r.grossAmount) || 0;
    const charges = parseFloat(r.charges) || 0;
    const net = gross - charges;
    return `<tr>
      <td style="font-family:monospace;font-size:12px;color:var(--teal)">${r.receiptId || r.id.slice(0, 8)}</td>
      <td>${cust?.name || '—'}</td>
      <td style="font-size:12px">${fmtDate(r.date)}</td>
      <td style="text-align:right;font-weight:600">${eur(gross)}</td>
      <td style="text-align:right;color:var(--danger)">${charges > 0 ? eur(charges) : '—'}</td>
      <td style="text-align:right;font-weight:700;color:var(--success)">${eur(net)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${r.notes || ''}</td>
      <td style="font-size:11px">${r.payMethod === 'cash' ? '💵 Cash' : r.payMethod === 'bank_deposit' ? '🏦 Deposit' : r.payMethod === 'bank_check' ? '🖊 Check' : '—'}</td>
      <td><div class="table-actions">
        <button class="btn btn-teal btn-xs" onclick="editReceipt('${r.id}')">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="confirmDeleteReceipt('${r.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ══ PRICELISTS ══ */
function renderPricelists() {
  const grid = document.getElementById('pl-grid');
  grid.innerHTML = pricelists.map(pl => `
    <div class="pl-card">
      <div class="pl-card-id">${pl.id} <span class="badge ${pl.status === 'active' ? 'b-active' : 'b-archive'}" style="margin-left:6px">${pl.status}</span></div>
      <div class="pl-card-name">${pl.name}</div>
      ${pl.nameEn ? `<div style="font-size:12px;color:var(--text-muted)">${pl.nameEn}</div>` : ''}
      <div class="pl-card-actions">
        <button class="btn btn-outline btn-sm" onclick="openPricelistModal('${pl.id}')">✏️ Edit</button>
        <button class="btn btn-sm ${pl.status === 'active' ? 'btn-danger' : 'btn-teal'}" onclick="togglePLStatus('${pl.id}')">${pl.status === 'active' ? 'Archive' : 'Restore'}</button>
      </div>
    </div>`).join('');
}

function showPLCompare() {
  const wrap = document.getElementById('pl-compare-wrap');
  wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
  if (wrap.style.display !== 'none') renderPLCompare();
}

function renderPLCompare() {
  const active = pricelists.filter(p => p.status === 'active');
  const thead = `<thead><tr><th style="position:sticky;left:0;background:var(--cream);min-width:200px">Item</th>${active.map(pl => `<th style="text-align:right;min-width:90px">${pl.id}<br><span style="color:var(--teal);font-size:10px">${pl.name}</span></th>`).join('')}</tr></thead>`;
  const tbody = ITEMS.map(item => {
    const prices = active.map(pl => pl.prices[item.code] || 0);
    const nonZero = prices.filter(p => p > 0);
    const min = nonZero.length ? Math.min(...nonZero) : 0;
    const max = nonZero.length ? Math.max(...nonZero) : 0;
    return `<tr><td style="font-size:12px;position:sticky;left:0;background:#fff">${item.gr}<br><span style="color:var(--text-muted);font-size:10px">${item.en}</span></td>${active.map(pl => {
      const p = pl.prices[item.code] || 0;
      const color = p === 0 ? 'var(--border)' : p === min && min !== max ? 'var(--success)' : p === max && min !== max ? 'var(--danger)' : 'var(--text)';
      return `<td style="text-align:right;color:${color};font-weight:${(p === min || p === max) && min !== max ? 700 : 400}">${p > 0 ? eur(p) : '—'}</td>`;
    }).join('')}</tr>`;
  }).join('');
  document.getElementById('pl-compare-table').innerHTML = thead + '<tbody>' + tbody + '</tbody>';
}

/* ══ CUSTOMER MODAL ══ */
function openCustomerModal() {
  document.getElementById('cust-modal-title').textContent = 'Add Customer';
  document.getElementById('cm-del-btn').style.display = 'none';
  ['cm-id','cm-name','cm-phone','cm-email','cm-contact','cm-address','cm-tax','cm-terms','cm-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('cm-pricelist').value = '';
  openModal('custModal');
}
function editCustomer(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cust-modal-title').textContent = 'Edit Customer';
  document.getElementById('cm-del-btn').style.display = '';
  document.getElementById('cm-del-btn').onclick = () => confirmDeleteCustomer(id);
  ['id','name','phone','email','contact','address','tax','terms','notes'].forEach(f => {
    const el = document.getElementById('cm-' + f); if (el) el.value = c[f] || '';
  });
  document.getElementById('cm-pricelist').value = c.pricelistId || '';
  const pmEl = document.getElementById('cm-payMethod'); if(pmEl) pmEl.value = c.payMethod || '';
  const fbEl = document.getElementById('cm-forwardBalance'); if(fbEl) fbEl.value = c.forwardBalance || '';
  openModal('custModal');
}
async function saveCustomer() {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { showToast('Customer name is required', 'error'); return; }
  const id = document.getElementById('cm-id').value || genId('cust');
  const record = { id };
  ['name','phone','email','contact','address','tax','terms','notes'].forEach(f => {
    record[f] = document.getElementById('cm-' + f)?.value || '';
  });
  record.pricelistId = document.getElementById('cm-pricelist').value;
  record.payMethod = document.getElementById('cm-payMethod')?.value || '';
  record.forwardBalance = parseFloat(document.getElementById('cm-forwardBalance')?.value) || 0;
  const existing = customers.find(c => c.id === id);
  if (existing) Object.assign(existing, record); else customers.push(record);
  closeModal('custModal');
  populateSelects();
  renderCustomers();
  renderDashboard();
  await SyncStore.saveOne('zesty_laundry_customers', 'laundry_customers', record, customers);
  showToast(existing ? '✓ Customer updated' : '✓ Customer added', 'success');
}
function confirmDeleteCustomer(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  showConfirm('🗑️','Delete Customer?',`Delete "${c.name}"?`,'btn-danger','Delete', async () => {
    customers = customers.filter(x => x.id !== id);
    await SyncStore.deleteOne('zesty_laundry_customers', 'laundry_customers', id, customers);
    populateSelects(); renderCustomers(); showToast('Customer deleted','error');
  });
}
function deleteCustomer() {
  const id = document.getElementById('cm-id').value;
  if (!id) return;
  closeModal('custModal');
  confirmDeleteCustomer(id);
}

/* ══ ORDER MODAL ══ */
function openOrderModal() {
  currentOrderId = null;
  document.getElementById('ord-modal-title').textContent = 'New Order';
  document.getElementById('om-del-btn').style.display = 'none';
  document.getElementById('om-id').value = '';
  document.getElementById('om-order-id').value = nextId('ORD-', orders);
  document.getElementById('om-cust').value = '';
  document.getElementById('om-date').value = today();
  document.getElementById('om-pl').value = '';
  document.getElementById('om-status').value = 'Pending';
  document.getElementById('om-notes').value = '';
  renderOrderItems();
  openModal('orderModal');
}
function editOrder(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  currentOrderId = id;
  document.getElementById('ord-modal-title').textContent = 'Edit Order';
  document.getElementById('om-del-btn').style.display = '';
  document.getElementById('om-id').value = id;
  document.getElementById('om-order-id').value = o.orderId || id.slice(0, 8);
  document.getElementById('om-cust').value = o.customerId || '';
  document.getElementById('om-date').value = o.date || today();
  document.getElementById('om-pl').value = o.pricelistId || '';
  document.getElementById('om-status').value = o.status || 'Pending';
  document.getElementById('om-notes').value = o.notes || '';
  renderOrderItems(o.items);
  openModal('orderModal');
}
function onOrderCustChange() {
  const custId = document.getElementById('om-cust').value;
  const cust = customers.find(c => c.id === custId);
  if (cust?.pricelistId && !document.getElementById('om-pl').value) {
    document.getElementById('om-pl').value = cust.pricelistId;
    renderOrderItems();
  }
}
function onOrderDateChange() { /* year auto-changes handled elsewhere */ }
function renderOrderItems(savedItems = {}) {
  const plId = document.getElementById('om-pl').value;
  const pl = pricelists.find(p => p.id === plId);
  const tbody = document.getElementById('om-items-tbody');
  if (!pl) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Select a pricelist to enter items</td></tr>`;
    document.getElementById('om-grand-total').textContent = '€0.00';
    return;
  }
  tbody.innerHTML = ITEMS.map(item => {
    const price = pl.prices[item.code] || 0;
    const savedQty = savedItems[item.code] || '';
    const rowStyle = price > 0 ? '' : 'opacity:.35';
    return `<tr style="${rowStyle}">
      <td>${iname(item)}</td>
      <td style="text-align:center">
        <input type="number" min="0" step="1" value="${savedQty}" data-code="${item.code}" data-price="${price}"
          oninput="updateOrderTotal()" style="width:70px;text-align:center"
          ${price === 0 ? 'disabled' : ''}>
      </td>
      <td style="text-align:right;color:var(--text-muted)">${price > 0 ? eur(price) : '—'}</td>
      <td style="text-align:right;font-weight:600;color:var(--teal)" id="sub-${item.code}">—</td>
    </tr>`;
  }).join('');
  updateOrderTotal();
}
function updateOrderTotal() {
  let grand = 0;
  document.querySelectorAll('#om-items-tbody input[data-code]').forEach(inp => {
    const qty = parseFloat(inp.value) || 0;
    const price = parseFloat(inp.dataset.price) || 0;
    const sub = qty * price;
    grand += sub;
    const subEl = document.getElementById('sub-' + inp.dataset.code);
    if (subEl) subEl.textContent = sub > 0 ? eur(sub) : '—';
  });
  document.getElementById('om-grand-total').textContent = eur(grand);
}
async function saveOrder() {
  const custId = document.getElementById('om-cust').value;
  const date = document.getElementById('om-date').value;
  if (!custId || !date) { showToast('Customer and date are required', 'error'); return; }
  const items = {};
  document.querySelectorAll('#om-items-tbody input[data-code]').forEach(inp => {
    const qty = parseFloat(inp.value) || 0;
    if (qty > 0) items[inp.dataset.code] = qty;
  });
  const id = document.getElementById('om-id').value || genId('ord');
  const record = {
    id,
    orderId: document.getElementById('om-order-id').value,
    customerId: custId,
    date,
    pricelistId: document.getElementById('om-pl').value,
    status: document.getElementById('om-status').value,
    notes: document.getElementById('om-notes').value,
    items
  };
  const existing = orders.find(o => o.id === id);
  if (existing) Object.assign(existing, record); else orders.push(record);
  closeModal('orderModal');
  renderOrders(); renderDashboard();
  await SyncStore.saveOne('zesty_laundry_orders', 'laundry_orders', record, orders);
  showToast(existing ? '✓ Order updated' : '✓ Order saved', 'success');
}
function deleteOrder() {
  const id = document.getElementById('om-id').value;
  if (!id) return;
  closeModal('orderModal');
  confirmDeleteOrder(id);
}
function confirmDeleteOrder(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  showConfirm('🗑️','Delete Order?',`Delete ${o.orderId || id}?`,'btn-danger','Delete', async () => {
    orders = orders.filter(x => x.id !== id);
    await SyncStore.deleteOne('zesty_laundry_orders', 'laundry_orders', id, orders);
    renderOrders(); renderDashboard(); showToast('Order deleted','error');
  });
}
function printOrder() {
  const id = document.getElementById('om-id').value;
  closeModal('orderModal');
  if (id) printOrderById(id);
}

function printOrderById(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const cust = customers.find(c => c.id === o.customerId);
  const pl = pricelists.find(p => p.id === o.pricelistId);
  const total = calcOrderTotal(o);
  const itemRows = pl && o.items ? Object.entries(o.items)
    .filter(([,qty]) => parseFloat(qty) > 0)
    .map(([code, qty]) => {
      const item = ITEMS.find(i => i.code === code);
      const price = pl.prices[code] || 0;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0">${item ? item.en : code}</td>
        <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #f0f0f0">${qty}</td>
        <td style="padding:6px 10px;text-align:right;border-bottom:1px solid #f0f0f0">€${price.toFixed(2)}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0">€${(parseFloat(qty)*price).toFixed(2)}</td>
      </tr>`;
    }).join('') : '';

  const html = `<!DOCTYPE html><html><head><title>Order ${o.orderId||o.id}</title>
  <style>
    body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1e2a28;margin:0;padding:24px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #115950}
    .brand{font-size:22px;font-weight:700;color:#115950}.brand span{color:#c9a84c}
    .order-meta{text-align:right;font-size:12px;color:#666}
    .order-id{font-size:18px;font-weight:700;color:#115950}
    .customer-box{background:#f5f9f8;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#115950;color:#fff}
    th{padding:8px 10px;text-align:left;font-size:12px}
    .total-row td{padding:10px;font-weight:700;font-size:14px;border-top:2px solid #115950}
    @page{margin:15mm}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="header">
    <div><div class="brand">Zesty<span>·</span>ERP</div><div style="font-size:11px;color:#888;margin-top:3px">Laundry Order</div></div>
    <div class="order-meta">
      <div class="order-id">${o.orderId||o.id}</div>
      <div>Date: ${fmtDate(o.date)}</div>
      <div>Status: ${o.status||'Pending'}</div>
    </div>
  </div>
  <div class="customer-box">
    <strong>Customer:</strong> ${cust?.name||'—'}<br>
    <strong>Pricelist:</strong> ${pl?.name||'—'}
    ${o.notes?`<br><strong>Notes:</strong> ${o.notes}`:''}
  </div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${itemRows||'<tr><td colspan="4" style="padding:12px;color:#999;text-align:center">No items</td></tr>'}</tbody>
    <tfoot><tr class="total-row"><td colspan="3" style="text-align:right">TOTAL</td><td style="text-align:right">€${total.toFixed(2)}</td></tr></tfoot>
  </table>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.open(); win.document.write(html); win.document.close();
  } else {
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
    document.body.appendChild(ifr);
    ifr.contentDocument.open(); ifr.contentDocument.write(html); ifr.contentDocument.close();
    setTimeout(() => { ifr.contentWindow.print(); document.body.removeChild(ifr); }, 600);
  }
}

// ── Date formatter ─────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
  } catch { return d; }
}

// ── Edit Receipt ────────────────────────────────────────────────────────
function editReceipt(id) {
  const r = receipts.find(x => x.id === id);
  if (!r) return;
  document.getElementById('rec-modal-title').textContent = 'Edit Receipt';
  const delBtn = document.getElementById('rm-del-btn');
  if (delBtn) delBtn.style.display = '';
  document.getElementById('rm-id').value       = r.id;
  document.getElementById('rm-receipt-id').value = r.receiptId || '';
  document.getElementById('rm-date').value     = r.date || '';
  document.getElementById('rm-gross').value    = r.grossAmount || '';
  document.getElementById('rm-charges').value  = r.charges || '';
  document.getElementById('rm-notes').value    = r.notes || '';
  calcReceiptNet();
  // Set payment method
  const payEl = document.getElementById('rm-pay-method');
  if (payEl) payEl.value = r.payMethod || '';
  // Set customer dropdown
  const custSel = document.getElementById('rm-cust');
  if (custSel) {
    custSel.innerHTML = '<option value="">— Select Customer —</option>' +
      customers.filter(c => c.status !== 'inactive')
        .sort((a,b) => (a.name||'').localeCompare(b.name||''))
        .map(c => `<option value="${c.id}"${c.id===r.customerId?' selected':''}>${c.name}</option>`).join('');
  }
  openModal('receiptModal');
}

// ── Confirm Delete Receipt ──────────────────────────────────────────────
function confirmDeleteReceipt(id) {
  const r = receipts.find(x => x.id === id);
  if (!r) return;
  const cust = customers.find(c => c.id === r.customerId);
  showConfirm('🗑️', 'Delete Receipt?',
    `Delete receipt ${r.receiptId || r.id.slice(0,8)} for ${cust?.name || 'unknown'}? This cannot be undone.`,
    'btn-danger', 'Delete',
    async () => {
      receipts = receipts.filter(x => x.id !== id);
      await SyncStore.saveAll('zesty_laundry_receipts', 'laundry_receipts', receipts);
      renderReceipts();
      renderDashboard();
      showToast('Receipt deleted', 'error');
    }
  );
}

function viewCustomerLedger(custId) {
  const cust = customers.find(c => c.id === custId);
  if (!cust) return;
  const pl = pricelists.find(p => p.id === cust.pricelistId);

  // Helper: calculate order total from items × pricelist
  function calcOrderTotal(o) {
    let total = 0;
    Object.entries(o.items || {}).forEach(([code, qty]) => {
      total += qty * (pl?.prices?.[code] || 0);
    });
    return parseFloat(total.toFixed(2));
  }

  const custOrders   = orders.filter(o => o.customerId === custId).sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const custReceipts = receipts.filter(r => r.customerId === custId).sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);

  // Set header
  document.getElementById('ledger-name').textContent = cust.name;
  document.getElementById('ledger-meta').textContent =
    [cust.phone, cust.email, pl ? pl.nameEn || pl.name : ''].filter(Boolean).join(' · ');

  // Totals
  const totalCharged  = custOrders.reduce((s,o) => s + calcOrderTotal(o), 0);
  const totalReceived = custReceipts.reduce((s,r) => s + (parseFloat(r.grossAmount)||0), 0);
  const balance       = parseFloat((totalCharged - totalReceived).toFixed(2));

  // Units per item
  const unitsByItem = {};
  let totalUnits = 0;
  custOrders.forEach(o => {
    Object.entries(o.items||{}).forEach(([code,qty]) => {
      unitsByItem[code] = (unitsByItem[code]||0) + qty;
      totalUnits += qty;
    });
  });

  // Summary cards
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('ledger-order-count',   custOrders.length);
  setEl('ledger-total-charged', '€' + totalCharged.toFixed(2));
  setEl('ledger-total-received','€' + totalReceived.toFixed(2));
  const balEl = document.getElementById('ledger-balance');
  if (balEl) {
    balEl.textContent = '€' + Math.abs(balance).toFixed(2) + (balance>0?' DR':balance<0?' CR':'');
    balEl.style.color = balance>0?'#c0392b':balance<0?'#27ae60':'#0f4a42';
  }
  setEl('ledger-total-units', totalUnits);

  // Build ledger entries — orders + receipts sorted by date
  const entries = [
    ...custOrders.map(o => {
      const charge = calcOrderTotal(o);
      const units  = Object.values(o.items||{}).reduce((s,v)=>s+v, 0);
      return {date:o.date, type:'order', ref:o.orderId||o.id.substring(0,8),
              desc:'Laundry order', units, charge, receipt:0};
    }),
    ...custReceipts.map(r => ({
      date:r.date, type:'receipt', ref:r.receiptId||r.id.substring(0,8),
      desc:'Receipt' + (r.notes?' — '+r.notes:''),
      units:0, charge:0, receipt:parseFloat(r.grossAmount)||0
    })),
  ].sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);

  // Running balance
  const eur = n => '€' + parseFloat(n).toFixed(2);

  // Brought Forward = customer.forwardBalance (set in Edit Customer modal)
  const bfAmt = parseFloat(cust.forwardBalance) || 0;
  let runBal = bfAmt; // start running balance from brought forward
  const bfColor = bfAmt > 0 ? '#c0392b' : bfAmt < 0 ? '#27ae60' : '#888';
  const bfRow = `<tr style="border-bottom:1px solid #ddd;background:#f8f9fa;font-style:italic">
    <td style="padding:8px 12px;font-size:12px"></td>
    <td style="padding:8px 12px;font-size:11px;color:#888"></td>
    <td style="padding:8px 12px;font-size:12px;color:#666"><strong>Brought Forward</strong></td>
    <td style="text-align:right;padding:8px 10px;font-size:12px">—</td>
    <td style="text-align:right;padding:8px 10px;font-size:12px;color:#ccc">—</td>
    <td style="text-align:right;padding:8px 10px;font-size:12px;color:#ccc">—</td>
    <td style="text-align:right;padding:8px 10px;font-size:13px;font-weight:700;color:${bfColor}">€${Math.abs(bfAmt).toFixed(2)}${bfAmt>0?' DR':bfAmt<0?' CR':''}</td>
  </tr>`;

  const rows = entries.map(e => {
    runBal = parseFloat((runBal + e.charge - e.receipt).toFixed(2));
    const isReceipt = e.type === 'receipt';
    return `<tr style="border-bottom:1px solid #eee;${isReceipt?'background:#f0fff8':''}">
      <td style="padding:8px 12px;font-size:12px;white-space:nowrap">${e.date||'—'}</td>
      <td style="padding:8px 12px;font-size:11px;color:#888">${e.ref}</td>
      <td style="padding:8px 12px;font-size:12px">${e.desc}</td>
      <td style="text-align:right;padding:8px 10px;font-size:12px">${e.units||'—'}</td>
      <td style="text-align:right;padding:8px 10px;font-size:12px;font-weight:${e.charge?'600':'400'};color:${e.charge?'inherit':'#ccc'}">${e.charge?eur(e.charge):'—'}</td>
      <td style="text-align:right;padding:8px 10px;font-size:12px;color:${e.receipt?'#27ae60':'#ccc'};font-weight:${e.receipt?'600':'400'}">${e.receipt?eur(e.receipt):'—'}</td>
      <td style="text-align:right;padding:8px 10px;font-size:12px;font-weight:600;color:${runBal>0?'#c0392b':runBal<0?'#27ae60':'#888'}">${eur(Math.abs(runBal))}${runBal>0?' DR':runBal<0?' CR':''}</td>
    </tr>`;
  }).join('');

  const tbody = document.getElementById('ledger-tbody');
  const tfoot = document.getElementById('ledger-tfoot');
  if (tbody) tbody.innerHTML = bfRow + (rows || '<tr><td colspan="7" style="padding:20px;text-align:center;color:#aaa">No transactions yet</td></tr>');
  if (tfoot) tfoot.innerHTML = `<tr style="background:#0f4a42;color:#fff;font-weight:700">
    <td colspan="3" style="padding:10px 12px">TOTAL</td>
    <td style="text-align:right;padding:10px">${totalUnits}</td>
    <td style="text-align:right;padding:10px">${eur(totalCharged)}</td>
    <td style="text-align:right;padding:10px">${eur(totalReceived)}</td>
    <td style="text-align:right;padding:10px">${eur(Math.abs(balance))}${balance>0?' DR':balance<0?' CR':''}</td>
  </tr>`;

  // Units breakdown
  const breakdownEl = document.getElementById('ledger-units-breakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = Object.entries(unitsByItem)
      .sort((a,b)=>b[1]-a[1])
      .map(([code,qty])=>`<div style="background:#f5f0f9;border:1px solid #c9b0e0;border-radius:8px;padding:5px 12px;font-size:13px">
        <strong>${qty}</strong> × <span style="color:#6c3483">${code}</span>
      </div>`).join('') || '<span style="color:#aaa;font-size:12px">No items</span>';
  }

  document.getElementById('ledger-overlay').style.display = 'block';
  window._currentLedgerCustId = custId;
}


function printLedger() {
  window.print();
}

// ══ RECEIPT FUNCTIONS ══════════════════════════════════════════════════

function editReceipt(id) {
  openReceiptModal(id);
}

function confirmDeleteReceipt(id) {
  const r = receipts.find(x => x.id === id);
  const label = r ? (r.receiptId || id) + ' — €' + (r.grossAmount || 0) : id;
  showConfirm('\uD83D\uDDD1', 'Delete Receipt?',
    'Delete ' + label + '? This cannot be undone.',
    'btn-danger', 'Delete',
    async () => {
      receipts = receipts.filter(x => x.id !== id);
      await SyncStore.saveAll('zesty_laundry_receipts', 'laundry_receipts', receipts);
      closeModal('receiptModal');
      renderReceipts();
      renderDashboard();
      showToast('Receipt deleted', 'error');
    }
  );
}

function openReceiptModal(id) {
  const isEdit = !!id;
  document.getElementById('rec-modal-title').textContent = isEdit ? 'Edit Receipt' : 'Add Receipt';
  const delBtn = document.getElementById('rm-del-btn');
  if (delBtn) {
    delBtn.style.display = isEdit ? '' : 'none';
    delBtn.onclick = isEdit ? () => confirmDeleteReceipt(id) : null;
  }

  if (isEdit) {
    const r = receipts.find(x => x.id === id);
    if (!r) return;
    document.getElementById('rm-id').value = r.id;
    document.getElementById('rm-receipt-id').value = r.receiptId || '';
    document.getElementById('rm-cust').value = r.customerId || '';
    document.getElementById('rm-date').value = r.date || '';
    document.getElementById('rm-gross').value = r.grossAmount || '';
    document.getElementById('rm-charges').value = r.charges || '';
    document.getElementById('rm-notes').value = r.notes || '';
    const pmEl = document.getElementById('rm-payMethod'); if(pmEl) pmEl.value = r.payMethod || '';
    calcReceiptNet();
  } else {
    document.getElementById('rm-id').value = '';
    document.getElementById('rm-receipt-id').value = nextId('REC-', receipts);
    document.getElementById('rm-cust').value = '';
    document.getElementById('rm-date').value = today();
    document.getElementById('rm-gross').value = '';
    document.getElementById('rm-charges').value = '';
    document.getElementById('rm-notes').value = '';
    const pmElNew = document.getElementById('rm-payMethod'); if(pmElNew) pmElNew.value = '';
    const netEl = document.getElementById('rm-net');
    if (netEl) netEl.value = '';
  }

  // Populate customer dropdown
  const custSel = document.getElementById('rm-cust');
  if (custSel) {
    custSel.innerHTML = '<option value="">— Select Customer —</option>' +
      customers.filter(c => c.status !== 'inactive').sort((a,b)=>(a.name||'').localeCompare(b.name||''))
        .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (isEdit) custSel.value = receipts.find(x => x.id === id)?.customerId || '';
  }

  openModal('receiptModal');
}

function calcReceiptNet() {
  const gross = parseFloat(document.getElementById('rm-gross')?.value) || 0;
  const charges = parseFloat(document.getElementById('rm-charges')?.value) || 0;
  const netEl = document.getElementById('rm-net');
  if (netEl) netEl.value = (gross - charges).toFixed(2);
}

async function saveReceipt() {
  const custId = document.getElementById('rm-cust')?.value;
  const date   = document.getElementById('rm-date')?.value;
  const gross  = parseFloat(document.getElementById('rm-gross')?.value);
  if (!custId || !date || isNaN(gross)) {
    showToast('Customer, date and amount are required', 'error');
    return;
  }
  const id = document.getElementById('rm-id')?.value || nextId('REC-', receipts);
  const record = {
    id,
    receiptId: document.getElementById('rm-receipt-id')?.value || nextId('REC-', receipts),
    customerId: custId,
    date,
    grossAmount: gross,
    charges: parseFloat(document.getElementById('rm-charges')?.value) || 0,
    notes: document.getElementById('rm-notes')?.value || '',
    payMethod: document.getElementById('rm-payMethod')?.value || '',
  };
  const existing = receipts.find(r => r.id === id);
  if (existing) Object.assign(existing, record);
  else receipts.push(record);
  await SyncStore.saveAll('zesty_laundry_receipts', 'laundry_receipts', receipts);
  closeModal('receiptModal');
  renderReceipts();
  renderDashboard();
  showToast('\u2713 Receipt saved', 'success');
}

async function deleteReceipt() {
  const id = document.getElementById('rm-id')?.value;
  if (!id) return;
  showConfirm('\uD83D\uDDD1', 'Delete Receipt?', 'This cannot be undone.', 'btn-danger', 'Delete', async () => {
    receipts = receipts.filter(r => r.id !== id);
    await SyncStore.deleteOne('zesty_laundry_receipts', 'laundry_receipts', id, receipts);
    closeModal('receiptModal');
    renderReceipts();
    renderDashboard();
    showToast('Receipt deleted', 'error');
  });
}

// ══ PRICELIST FUNCTIONS ═════════════════════════════════════════════════
function openPricelistModal(id) {
  const isEdit = !!id;
  document.getElementById('pl-modal-title').textContent = isEdit ? 'Edit Pricelist' : 'New Pricelist';
  if (isEdit) {
    const pl = pricelists.find(p => p.id === id);
    if (!pl) return;
    document.getElementById('pl-id').value = pl.id;
    document.getElementById('pl-name-gr').value = pl.name || '';
    document.getElementById('pl-name-en').value = pl.nameEn || '';
  } else {
    document.getElementById('pl-id').value = nextId('PL-', pricelists);
    document.getElementById('pl-name-gr').value = '';
    document.getElementById('pl-name-en').value = '';
  }
  // Render price inputs
  const tbody = document.getElementById('pl-items-tbody');
  if (tbody) {
    const pl = isEdit ? pricelists.find(p => p.id === id) : null;
    const allCodes = pricelists.length ? Object.keys(pricelists[0].prices || {}) : [];
    tbody.innerHTML = allCodes.map(code => `<tr>
      <td style="padding:4px 8px;font-size:12px;font-weight:500">${code}</td>
      <td style="padding:4px 8px">
        <input type="number" step="0.01" min="0" data-code="${code}" value="${pl?.prices?.[code] || ''}"
          style="width:80px;padding:4px;border:1px solid #ddd;border-radius:5px;text-align:right">
      </td>
    </tr>`).join('');
  }
  openModal('plModal');
}

async function savePricelist() {
  const id   = document.getElementById('pl-id')?.value;
  const name = document.getElementById('pl-name-gr')?.value?.trim();
  const nameEn = document.getElementById('pl-name-en')?.value?.trim();
  if (!id || !name) { showToast('ID and name are required', 'error'); return; }
  const prices = {};
  document.querySelectorAll('#pl-items-tbody input[data-code]').forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v)) prices[inp.dataset.code] = v;
  });
  const record = { id, name, nameEn, prices, status: 'active' };
  const existing = pricelists.find(p => p.id === id);
  if (existing) Object.assign(existing, record);
  else pricelists.push(record);
  await SyncStore.saveAll('zesty_laundry_pricelists', 'laundry_pricelists', pricelists);
  closeModal('plModal');
  renderPricelists();
  showToast('\u2713 Pricelist saved', 'success');
}

// ══ REPORT / PROPOSAL STUBS ════════════════════════════════════════════
function openProposalModal() {
  showToast('Proposal module coming soon', 'info');
}
function generateProposal() {
  showToast('Proposal module coming soon', 'info');
}
function openExportHistory() {
  showToast('Export history coming soon', 'info');
}
function generateReport() {
  const fCustId = document.getElementById('rpt-cust')?.value || '';
  const from = document.getElementById('rpt-from')?.value || '';
  const to   = document.getElementById('rpt-to')?.value   || '';
  const out  = document.getElementById('report-output') || document.getElementById('rpt-output');
  if (!out) return;

  const filteredOrders   = orders.filter(o => (!fCustId || o.customerId === fCustId) && (!from || (o.date||'') >= from) && (!to || (o.date||'') <= to));
  const filteredReceipts = receipts.filter(r => (!fCustId || r.customerId === fCustId) && (!from || (r.date||'') >= from) && (!to || (r.date||'') <= to));

  // Build per-customer rows
  const custSet = fCustId ? customers.filter(c => c.id === fCustId) : customers;
  const rows = [];
  custSet.forEach(c => {
    const cOrds = filteredOrders.filter(o => o.customerId === c.id);
    const cRecs = filteredReceipts.filter(r => r.customerId === c.id);
    if (!cOrds.length && !cRecs.length) return;
    const charged  = cOrds.reduce((s, o) => s + calcOrderTotal(o), 0);
    const received = cRecs.reduce((s, r) => s + (parseFloat(r.grossAmount) || 0), 0);
    const bal = charged - received;

    // Aging: oldest order not fully covered by receipts
    let agingDate = '';
    if (bal > 0) {
      const sortedOrds = [...cOrds].sort((a, b) => (a.date||'') < (b.date||'') ? -1 : 1);
      let covered = received;
      for (const o of sortedOrds) {
        const amt = calcOrderTotal(o);
        if (covered <= 0) { agingDate = o.date || ''; break; }
        covered -= amt;
        if (covered < 0) { agingDate = o.date || ''; break; }
      }
      if (!agingDate && sortedOrds.length) agingDate = sortedOrds[0].date || '';
    }

    const agingDays = agingDate ? Math.floor((Date.now() - new Date(agingDate)) / 86400000) : 0;
    rows.push({ name: c.name, orders: cOrds.length, charged, received, bal, agingDate, agingDays });
  });

  // Sort by balance descending (highest first)
  rows.sort((a, b) => b.bal - a.bal);

  let html = `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#0f4a42;color:#fff">
      <th style="padding:8px;text-align:left">Customer</th>
      <th style="text-align:right;padding:8px">Orders</th>
      <th style="text-align:right;padding:8px">Charged</th>
      <th style="text-align:right;padding:8px">Received</th>
      <th style="text-align:right;padding:8px">Balance</th>
      <th style="text-align:right;padding:8px">Oldest Unpaid</th>
      <th style="text-align:right;padding:8px">Aging (days)</th>
    </tr></thead><tbody>`;

  rows.forEach(r => {
    const agingColor = r.agingDays > 90 ? '#c0392b' : r.agingDays > 30 ? '#e67e22' : '#27ae60';
    html += `<tr style="border-bottom:1px solid #eee">
      <td style="padding:7px;font-weight:500">${r.name}</td>
      <td style="text-align:right;padding:7px">${r.orders}</td>
      <td style="text-align:right;padding:7px">€${r.charged.toFixed(2)}</td>
      <td style="text-align:right;padding:7px;color:#27ae60">€${r.received.toFixed(2)}</td>
      <td style="text-align:right;padding:7px;font-weight:700;color:${r.bal>0?'#c0392b':r.bal<0?'#27ae60':'#666'}">€${Math.abs(r.bal).toFixed(2)}${r.bal>0?' DR':r.bal<0?' CR':''}</td>
      <td style="text-align:right;padding:7px;font-size:12px;color:#666">${r.agingDate||'—'}</td>
      <td style="text-align:right;padding:7px;font-weight:600;color:${r.bal>0?agingColor:'#666'}">${r.bal>0?r.agingDays+'d':'—'}</td>
    </tr>`;
  });

  if (!rows.length) html += '<tr><td colspan="7" style="padding:20px;text-align:center;color:#999">No data for selected period.</td></tr>';

  const totCharged  = rows.reduce((s, r) => s + r.charged, 0);
  const totReceived = rows.reduce((s, r) => s + r.received, 0);
  const totBal      = rows.reduce((s, r) => s + r.bal, 0);
  html += `<tr style="background:#f5f9f8;font-weight:700;border-top:2px solid #0f4a42">
    <td style="padding:8px">TOTAL</td>
    <td style="text-align:right;padding:8px">${rows.reduce((s,r)=>s+r.orders,0)}</td>
    <td style="text-align:right;padding:8px">€${totCharged.toFixed(2)}</td>
    <td style="text-align:right;padding:8px;color:#27ae60">€${totReceived.toFixed(2)}</td>
    <td style="text-align:right;padding:8px;color:${totBal>0?'#c0392b':'#27ae60'}">€${Math.abs(totBal).toFixed(2)}${totBal>0?' DR':totBal<0?' CR':''}</td>
    <td colspan="2"></td>
  </tr>`;
  html += '</tbody></table>';
  out.innerHTML = html;
}
