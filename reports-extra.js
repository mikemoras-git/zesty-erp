// ── FINALISATION + STATEMENT HISTORY ──
const SB_URL='https://whuytfjwdjjepayeiohj.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';
const SB_H={'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'};

// Show finalise button after report generates
document.addEventListener('DOMContentLoaded', () => {
  const origFn = window.generateReport;
  if (origFn) window.generateReport = function(...args) {
    origFn.apply(this, args);
    setTimeout(() => {
      const btn = document.getElementById('finaliseBtn');
      const out = document.getElementById('rpt-output');
      if (btn) btn.style.display = out && out.innerHTML.trim().length > 100 ? '' : 'none';
    }, 200);
  };
  loadHistoryFilters();
  loadHistory();
});

async function finaliseStatement() {
  const propSel = document.getElementById('s-prop');
  const monthSel = document.getElementById('s-month');
  if (!propSel?.value || !monthSel?.value) { alert('Generate a report first.'); return; }
  const propName = propSel.options[propSel.selectedIndex]?.text || propSel.value;
  const monthVal = monthSel.value;
  const totals = window._lastReportTotals || {};
  const stmt = {
    id: 'stmt_' + Date.now(),
    propertyId: propSel.value,
    propertyName: propName,
    period: monthVal,
    bookingCount: totals.bookingCount || 0,
    tRent: totals.tRent || 0,
    tOTA: totals.tOTA || 0,
    tTaxFees: totals.tTaxFees || 0,
    tZesty: totals.tZesty || 0,
    tNet: totals.tNet || 0,
    finalisedAt: new Date().toISOString(),
    status: 'finalised',
    paid: false
  };

  // Save locally always (Supabase table may not exist yet)
  const all = JSON.parse(localStorage.getItem('zesty_statements') || '[]');
  all.unshift(stmt);
  localStorage.setItem('zesty_statements', JSON.stringify(all));

  // Try Supabase too (owner_statements table)
  try {
    await fetch(SB_URL+'/rest/v1/owner_statements', {
      method:'POST', headers:SB_H,
      body: JSON.stringify({id:stmt.id, data:stmt, updated_at:stmt.finalisedAt})
    });
  } catch {}

  const btn = document.getElementById('finaliseBtn');
  if (btn) { btn.textContent = '\u2713 Finalised'; btn.style.background='#27ae60'; btn.disabled=true; }
  showToastR('Statement recorded', 'success');
  loadHistory();
}

function showToastR(msg, type='') {
  let t = document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.className='toast '+type+' show';
  setTimeout(()=>t.classList.remove('show'),3000);
}

function getAllStatements() {
  return JSON.parse(localStorage.getItem('zesty_statements') || '[]');
}

function loadHistoryFilters() {
  const stmts = getAllStatements();
  const ownerSel = document.getElementById('h-owner');
  const yrSel = document.getElementById('h-year');
  if (ownerSel) {
    const owners = [...new Set(stmts.map(s=>s.propertyName).filter(Boolean))].sort();
    ownerSel.innerHTML = '<option value="">All Properties</option>' + owners.map(o=>`<option>${o}</option>`).join('');
  }
  if (yrSel) {
    const yrs = [...new Set(stmts.map(s=>(s.period||'').substring(0,4)).filter(Boolean))].sort().reverse();
    yrSel.innerHTML = '<option value="">All Years</option>' + yrs.map(y=>`<option>${y}</option>`).join('');
  }
}

function loadHistory() {
  const stmts = getAllStatements();
  const ownerF = document.getElementById('h-owner')?.value || '';
  const yearF = document.getElementById('h-year')?.value || '';
  const filtered = stmts.filter(s =>
    (!ownerF || s.propertyName===ownerF) &&
    (!yearF || (s.period||'').startsWith(yearF))
  );
  const eur = n => '\u20AC'+(parseFloat(n)||0).toFixed(2);
  const totalZ = filtered.reduce((s,st)=>s+(st.tZesty||0),0);
  const paidZ = filtered.filter(s=>s.paid).reduce((s,st)=>s+(st.tZesty||0),0);
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('h-total-stmts', filtered.length);
  setEl('h-zesty-total', eur(totalZ));
  setEl('h-paid-total', eur(paidZ));
  setEl('h-outstanding', eur(totalZ-paidZ));
  loadHistoryFilters();
  const tbody = document.getElementById('h-tbody');
  if (!tbody) return;
  if (!filtered.length) { tbody.innerHTML='<tr class="empty-row"><td colspan="10">No finalised statements yet.</td></tr>'; return; }
  tbody.innerHTML = filtered.map(s=>`
    <tr>
      <td style="font-weight:600">${s.period||'\u2014'}</td>
      <td>${s.propertyName||'\u2014'}</td>
      <td style="text-align:center">${s.bookingCount||0}</td>
      <td style="text-align:right">${eur(s.tRent)}</td>
      <td style="text-align:right;color:var(--danger)">${eur(s.tOTA)}</td>
      <td style="text-align:right;color:var(--teal);font-weight:700">${eur(s.tZesty)}</td>
      <td style="text-align:right">${eur(s.tNet)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${s.finalisedAt?new Date(s.finalisedAt).toLocaleDateString('en-GB'):'\u2014'}</td>
      <td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${s.paid?'#e0f5f1':'#fff3cd'};color:${s.paid?'#115950':'#856404'}">${s.paid?'\u2713 Paid':'Pending'}</span></td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-teal btn-sm" onclick="togglePaid('${s.id}')">${s.paid?'Unpaid':'\u2713 Paid'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStatement('${s.id}')">\u{1F5D1}</button>
      </div></td>
    </tr>`).join('');
}

function togglePaid(id) {
  const all = getAllStatements();
  const s = all.find(x=>x.id===id);
  if (!s) return;
  s.paid = !s.paid;
  localStorage.setItem('zesty_statements', JSON.stringify(all));
  loadHistory();
}

function deleteStatement(id) {
  if (!confirm('Delete this statement record?')) return;
  const all = getAllStatements().filter(x=>x.id!==id);
  localStorage.setItem('zesty_statements', JSON.stringify(all));
  loadHistory();
}



// ── PERIOD REPORT ──
function applyPeriodPreset() {
  const preset = document.getElementById('p-preset')?.value || '';
  const now = new Date();
  const yr = now.getFullYear();
  let from, to;
  switch(preset) {
    case 'ytd':   from=`${yr}-01-01`; to=now.toISOString().slice(0,10); break;
    case 'lastyear': from=`${yr-1}-01-01`; to=`${yr-1}-12-31`; break;
    case 'q1':    from=`${yr}-01-01`; to=`${yr}-03-31`; break;
    case 'q2':    from=`${yr}-04-01`; to=`${yr}-06-30`; break;
    case 'q3':    from=`${yr}-07-01`; to=`${yr}-09-30`; break;
    case 'q4':    from=`${yr}-10-01`; to=`${yr}-12-31`; break;
    case 'summer':from=`${yr}-05-01`; to=`${yr}-10-31`; break;
    case 'last30':{ const d=new Date(); d.setDate(d.getDate()-30); from=d.toISOString().slice(0,10); to=now.toISOString().slice(0,10); break; }
    case 'last90':{ const d=new Date(); d.setDate(d.getDate()-90); from=d.toISOString().slice(0,10); to=now.toISOString().slice(0,10); break; }
    default: return;
  }
  document.getElementById('p-from').value = from;
  document.getElementById('p-to').value = to;
}

// Populate p-prop on tab switch
function initPeriodTab() {
  const sel = document.getElementById('p-prop');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Properties</option>' +
    properties.filter(p=>!p.archived).sort((a,b)=>(a.shortName||'').localeCompare(b.shortName||''))
    .map(p=>`<option value="${p.id}" ${p.id===cur?'selected':''}>${p.shortName||p.propertyName}</option>`).join('');
  // Default: YTD
  if (!document.getElementById('p-from')?.value) applyPeriodPreset.call({}, 'ytd') || (() => {
    document.getElementById('p-preset').value='ytd'; applyPeriodPreset();
  })();
}

function generatePeriodReport() {
  const fromVal = document.getElementById('p-from')?.value || '';
  const toVal   = document.getElementById('p-to')?.value || '';
  const propId  = document.getElementById('p-prop')?.value || '';
  const out     = document.getElementById('period-out');
  if (!fromVal || !toVal) { showToastR && showToastR('Select a date range first','error'); if(out) out.innerHTML='<p style="color:var(--danger);padding:20px">Please select a date range.</p>'; return; }

  const fromDt = new Date(fromVal);
  const toDt   = new Date(toVal + 'T23:59:59');
  const allB   = getCSVBookings ? getCSVBookings() : [];
  const eur    = n => '\u20AC' + (parseFloat(n)||0).toFixed(2);
  const pct    = n => (parseFloat(n)||0).toFixed(1) + '%';

  // Filter bookings in range (by check-in date), status Booked
  const bookings = allB.filter(r => {
    if (r.Status !== 'Booked') return false;
    const arr = new Date(r.DateArrival);
    if (arr < fromDt || arr > toDt) return false;
    if (propId) {
      const prop = properties.find(p => p.id === propId);
      if (prop && !matchProp(r, prop)) return false;
    }
    return true;
  });

  // Totals by property
  const byProp = {};
  let grandRent=0, grandTax=0, grandOTA=0, grandRec=0, grandZesty=0, grandNet=0, grandNights=0;

  bookings.forEach(r => {
    const prop = properties.find(p => matchProp(r,p));
    const key  = prop?.shortName || prop?.propertyName || r.HouseInternalName || r.HouseName || 'Unknown';
    const mgmt = parseFloat(prop?.maintenance || prop?.ownerCommission || 0);
    const rent     = parseFloat(r.RoomRatesTotal||0) - parseFloat(r.PromotionsTotal||0);
    const taxFees  = parseFloat(r.FeesTotal||0) + parseFloat(r.TaxesTotal||0);
    const otaRate  = getCommRate ? getCommRate(prop, r.Source) : 0;
    const ota      = parseFloat(((rent-taxFees)*otaRate/100).toFixed(2));
    const received = parseFloat((rent-taxFees-ota).toFixed(2));
    const zesty    = parseFloat((Math.max(0,received)*mgmt/100).toFixed(2));
    const net      = parseFloat((received-zesty).toFixed(2));
    const nights   = parseInt(r.Nights)||0;

    if (!byProp[key]) byProp[key] = {bookings:0, nights:0, rent:0, tax:0, ota:0, received:0, zesty:0, net:0};
    byProp[key].bookings++; byProp[key].nights+=nights;
    byProp[key].rent+=rent; byProp[key].tax+=taxFees; byProp[key].ota+=ota;
    byProp[key].received+=received; byProp[key].zesty+=zesty; byProp[key].net+=net;
    grandRent+=rent; grandTax+=taxFees; grandOTA+=ota;
    grandRec+=received; grandZesty+=zesty; grandNet+=net; grandNights+=nights;
  });

  const presetLabel = document.getElementById('p-preset')?.selectedOptions?.[0]?.text || 'Custom Period';
  const totalBookings = bookings.length;

  // Build property rows
  const propRows = Object.entries(byProp).sort((a,b)=>b[1].net-a[1].net).map(([name,d]) => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:9px 12px;font-weight:500">${name}</td>
      <td style="text-align:center;padding:9px 8px">${d.bookings}</td>
      <td style="text-align:center;padding:9px 8px">${d.nights}</td>
      <td style="text-align:right;padding:9px 10px">${eur(d.rent)}</td>
      <td style="text-align:right;padding:9px 10px;color:var(--text-muted)">${eur(d.tax)}</td>
      <td style="text-align:right;padding:9px 10px;color:var(--danger)">${d.ota>0?eur(d.ota):'—'}</td>
      <td style="text-align:right;padding:9px 10px">${eur(d.received)}</td>
      <td style="text-align:right;padding:9px 10px;color:var(--teal)">${eur(d.zesty)}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:var(--teal-dark)">${eur(d.net)}</td>
    </tr>`).join('');

  if (!out) return;
  out.innerHTML = `
    <div class="rpt-wrap" style="padding:24px">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:22px;font-weight:700;color:var(--teal-dark);font-family:'Cormorant Garamond',serif">${presetLabel}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px">${fromVal} → ${toVal} &nbsp;|&nbsp; ${totalBookings} bookings &nbsp;|&nbsp; ${grandNights} nights</div>
        </div>
        <button onclick="window.print()" class="btn btn-print no-print" style="padding:7px 16px">🖨 Print</button>
      </div>

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px">
        ${[
          ['Total Rent','var(--teal-dark)',eur(grandRent)],
          ['Taxes & Fees','var(--text-muted)',eur(grandTax)],
          ['OTA Commissions','var(--danger)',eur(grandOTA)],
          ['Received by Owner','var(--info)',eur(grandRec)],
          ['Zesty Commission','var(--teal)',eur(grandZesty)],
          ['Net to Owners','#1a5276',eur(grandNet)],
        ].map(([label,color,val])=>`
          <div style="background:var(--cream);border:1px solid var(--border);border-radius:10px;padding:12px 16px;text-align:center">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">${label}</div>
            <div style="font-size:20px;font-weight:700;color:${color}">${val}</div>
          </div>`).join('')}
      </div>

      <!-- By property table -->
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--teal-dark);color:#fff">
              <th style="padding:10px 12px;text-align:left">Property</th>
              <th style="padding:10px 8px;text-align:center">Bkgs</th>
              <th style="padding:10px 8px;text-align:center">Nights</th>
              <th style="padding:10px 10px;text-align:right">Total Rent</th>
              <th style="padding:10px 10px;text-align:right">Taxes&amp;Fees</th>
              <th style="padding:10px 10px;text-align:right">OTA Comm</th>
              <th style="padding:10px 10px;text-align:right">Received</th>
              <th style="padding:10px 10px;text-align:right">Zesty Comm</th>
              <th style="padding:10px 10px;text-align:right">Net Income</th>
            </tr>
          </thead>
          <tbody>${propRows || '<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--text-muted)">No bookings found for this period. Upload your Lodgify CSV on the Dashboard first.</td></tr>'}</tbody>
          <tfoot>
            <tr style="background:var(--cream);font-weight:700;border-top:2px solid var(--teal-dark)">
              <td style="padding:10px 12px">TOTAL</td>
              <td style="text-align:center;padding:10px 8px">${totalBookings}</td>
              <td style="text-align:center;padding:10px 8px">${grandNights}</td>
              <td style="text-align:right;padding:10px 10px">${eur(grandRent)}</td>
              <td style="text-align:right;padding:10px 10px;color:var(--text-muted)">${eur(grandTax)}</td>
              <td style="text-align:right;padding:10px 10px;color:var(--danger)">${eur(grandOTA)}</td>
              <td style="text-align:right;padding:10px 10px">${eur(grandRec)}</td>
              <td style="text-align:right;padding:10px 10px;color:var(--teal)">${eur(grandZesty)}</td>
              <td style="text-align:right;padding:10px 10px;color:var(--teal-dark);font-size:15px">${eur(grandNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}


// Patch showTab to init period tab
const _origShowTab = showTab;
window.showTab = function(name, el) {
  _origShowTab(name, el);
  if (name === 'period') initPeriodTab();
  if (name === 'history') { loadHistoryFilters(); loadHistory(); }
};
