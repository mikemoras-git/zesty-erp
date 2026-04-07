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
  if (!fromVal || !toVal) {
    if (out) out.innerHTML = '<p style="color:var(--danger);padding:20px">Please select a date range.</p>';
    return;
  }

  const fromDt = new Date(fromVal);
  const toDt   = new Date(toVal + 'T23:59:59');
  const allB   = getCSVBookings ? getCSVBookings() : [];
  const eur    = n => '\u20AC' + (parseFloat(n)||0).toFixed(2);
  const fmtD   = d => { if(!d) return '\u2014'; try { return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); } catch { return d; } };
  const srcCls = s => { const sl=(s||'').toLowerCase(); return sl.includes('airbnb')?'src-airbnb':sl.includes('booking')?'src-booking':sl.includes('vrbo')||sl.includes('homeaway')?'src-vrbo':sl.includes('manual')||sl.includes('direct')?'src-direct':'src-other'; };

  // Filter bookings in range by check-in date, status Booked
  const allBookings = allB.filter(r => {
    if (r.Status !== 'Booked') return false;
    const arr = new Date(r.DateArrival);
    return arr >= fromDt && arr <= toDt;
  });

  // Filter by property if selected
  const filteredBookings = propId
    ? allBookings.filter(r => { const p = properties.find(x => x.id === propId); return p && matchProp(r, p); })
    : allBookings;

  // Get cleaning jobs for period
  const cleaningJobs = JSON.parse(localStorage.getItem('zesty_cleaning_jobs') || '[]');
  const periodCleanJobs = cleaningJobs.filter(j => {
    const d = new Date(j.date||'');
    return d >= fromDt && d <= toDt && (j.type === 'checkout' || j.type === 'midstay');
  });

  // Get job orders for period (from Supabase if available, else localStorage)
  const jobOrders = JSON.parse(localStorage.getItem('zesty_jobs') || '[]');
  const periodJobs = jobOrders.filter(j => {
    const d = new Date(j.dateDue || j.dateCreated || '');
    return d >= fromDt && d <= toDt && j.status === 'Completed';
  });

  // Get unique properties in the bookings
  const propsInPeriod = propId
    ? [properties.find(p => p.id === propId)].filter(Boolean)
    : properties.filter(p => filteredBookings.some(r => matchProp(r, p)));

  // Grand totals
  let grandRent=0, grandTax=0, grandOTA=0, grandRec=0, grandZesty=0, grandNet=0, grandNights=0;
  let grandCleanCost=0, grandJobCost=0;

  const presetLabel = document.getElementById('p-preset')?.selectedOptions?.[0]?.text || 'Custom Period';
  const sections = propsInPeriod.map(prop => {
    const mgmt = parseFloat(prop?.maintenance || prop?.ownerCommission || 0);
    const propBookings = filteredBookings.filter(r => matchProp(r, prop))
      .sort((a,b) => (a.DateArrival||'') > (b.DateArrival||'') ? 1 : -1);

    if (!propBookings.length) return '';

    let tRent=0, tTax=0, tOTA=0, tRec=0, tZesty=0, tNet=0, tNights=0;

    const bRows = propBookings.map((r, i) => {
      const nights    = parseInt(r.Nights)||0;
      const guests    = parseInt(r.People||r.Guests||0);
      const roomRates = parseFloat(r.RoomRatesTotal||r.TotalAmount||0);
      const promos    = parseFloat(r.PromotionsTotal||0);
      const rent      = parseFloat((roomRates - promos).toFixed(2));
      const taxesFees = parseFloat(((parseFloat(r.FeesTotal||0))+(parseFloat(r.TaxesTotal||0))).toFixed(2));
      const otaBase   = Math.max(0, rent - taxesFees);
      const otaRate   = getCommRate ? getCommRate(prop, r.Source) : 0;
      const ota       = parseFloat((otaBase * otaRate / 100).toFixed(2));
      const rec       = parseFloat((rent - taxesFees - ota).toFixed(2));
      const zesty     = parseFloat((Math.max(0, rec) * mgmt / 100).toFixed(2));
      const netInc    = parseFloat((rec - zesty).toFixed(2));
      const daily     = nights > 0 ? rent / nights : 0;

      tRent+=rent; tTax+=taxesFees; tOTA+=ota; tRec+=rec; tZesty+=zesty; tNet+=netInc; tNights+=nights;
      grandRent+=rent; grandTax+=taxesFees; grandOTA+=ota; grandRec+=rec; grandZesty+=zesty; grandNet+=netInc; grandNights+=nights;

      return `<tr>
        <td style="color:var(--text-muted);font-size:11px">${i+1}</td>
        <td><strong>${r.Name||'\u2014'}</strong>${r.CountryName||r.Origin?`<br><small style="color:var(--text-muted)">${r.CountryName||r.Origin}</small>`:''}</td>
        <td style="font-size:11px;color:var(--text-muted)">${r.DateCreated||r.BookingDate||'\u2014'}</td>
        <td style="font-size:12px">${fmtD(r.DateArrival)}</td>
        <td style="font-size:12px">${fmtD(r.DateDeparture)}</td>
        <td style="text-align:center">${nights}</td>
        <td style="text-align:center">${guests||'\u2014'}</td>
        <td><span class="src-badge ${srcCls(r.Source)}">${r.Source||'\u2014'}</span></td>
        <td style="text-align:right;font-size:12px">${daily>0?eur(daily):'\u2014'}</td>
        <td style="text-align:right;font-weight:600">${eur(rent)}</td>
        <td style="text-align:right;color:var(--info);font-size:12px">${taxesFees>0?eur(taxesFees):'\u2014'}</td>
        <td style="text-align:right;color:var(--danger);font-size:12px">${ota>0?eur(ota):'\u2014'}</td>
        <td style="text-align:right;font-size:12px">${rec>0?eur(rec):'\u2014'}</td>
        <td style="text-align:right;color:var(--text-muted);font-size:12px">${eur(zesty)}</td>
        <td style="text-align:right;font-weight:700;color:var(--teal-dark)">${eur(netInc)}</td>
      </tr>`;
    }).join('');

    // Cleaning cost for this property in period
    const propCleanJobs = periodCleanJobs.filter(j => j.propertyName === (prop.shortName || prop.propertyName));
    const cleanCost = propCleanJobs.reduce((s,j) => s + (parseFloat(j.cleaningFee) || parseFloat(prop.cleaningFee) || 0), 0);
    grandCleanCost += cleanCost;

    // Job orders cost for this property
    const propJobs = periodJobs.filter(j => j.propertyName === (prop.shortName || prop.propertyName));
    const jobCost  = propJobs.reduce((s,j) => s + (parseFloat(j.finalCharge||j.estimatedCost||0)), 0);
    grandJobCost  += jobCost;

    const owner = owners?.find(o => o.id === prop.owner);

    return `
    <div class="rpt-section" style="margin-bottom:28px">
      <!-- Property header -->
      <div style="background:linear-gradient(135deg,var(--teal-dark),var(--teal));color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:17px;font-weight:700;font-family:'Cormorant Garamond',serif">${prop.shortName||prop.propertyName}</div>
          <div style="font-size:12px;opacity:.8;margin-top:2px">${owner?(owner.firstName||'')+' '+(owner.lastName||owner.companyName||''):''}${mgmt?' \u00B7 Management '+mgmt+'%':''}</div>
        </div>
        <div style="text-align:right;font-size:13px">
          <div>${propBookings.length} booking${propBookings.length!==1?'s':''} \u00B7 ${tNights} nights</div>
        </div>
      </div>

      <!-- Bookings table -->
      <div class="rpt-scroll-wrap" style="overflow-x:auto">
        <table class="rpt-table">
          <thead><tr>
            <th>#</th><th>Guest</th><th>Booked</th><th>Check-in</th><th>Check-out</th>
            <th>Nts</th><th>Gst</th><th>Source</th><th>Daily Avg</th><th>Total Rent</th>
            <th>Taxes&amp;Fees</th><th>OTA Comm</th><th>Received</th>
            <th>Zesty Comm</th><th>Net Income</th>
          </tr></thead>
          <tbody>${bRows}</tbody>
          <tfoot><tr>
            <td colspan="9" style="text-align:right;font-weight:700">TOTAL</td>
            <td style="text-align:right;font-weight:700">${eur(tRent)}</td>
            <td style="text-align:right;color:var(--info)">${eur(tTax)}</td>
            <td style="text-align:right;color:var(--danger)">${eur(tOTA)}</td>
            <td style="text-align:right">${eur(tRec)}</td>
            <td style="text-align:right;color:var(--text-muted)">${eur(tZesty)}</td>
            <td style="text-align:right;font-weight:700;color:var(--teal-dark);font-size:14px">${eur(tNet)}</td>
          </tr></tfoot>
        </table>
      </div>

      <!-- Expenses summary (cleaning + jobs — totals only) -->
      ${(cleanCost > 0 || jobCost > 0) ? `
      <div style="margin-top:8px;padding:10px 16px;background:#fafafa;border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;display:flex;gap:24px;flex-wrap:wrap">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);align-self:center">EXPENSES</div>
        ${cleanCost>0?`<div style="font-size:12px">🧹 Cleaning (${propCleanJobs.length} sessions): <strong style="color:var(--danger)">${eur(cleanCost)}</strong></div>`:''}
        ${jobCost>0?`<div style="font-size:12px">🔧 Job Orders (${propJobs.length}): <strong style="color:var(--danger)">${eur(jobCost)}</strong></div>`:''}
        <div style="font-size:12px;margin-left:auto">Total Expenses: <strong style="color:var(--danger)">${eur(cleanCost+jobCost)}</strong></div>
      </div>` : ''}
    </div>`;
  }).join('');

  // Grand summary
  const grandExpenses = grandCleanCost + grandJobCost;
  const summaryHTML = `
    <div class="rpt-section" style="background:var(--cream);margin-bottom:20px">
      <div style="font-size:16px;font-weight:700;color:var(--teal-dark);font-family:'Cormorant Garamond',serif;margin-bottom:12px">
        ${presetLabel} &nbsp;\u00B7&nbsp; <span style="font-size:13px;font-weight:400;color:var(--text-muted)">${fromVal} \u2192 ${toVal}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
        ${[
          ['Total Rent','var(--teal-dark)',eur(grandRent)],
          ['Taxes & Fees','var(--info)',eur(grandTax)],
          ['OTA Commissions','var(--danger)',eur(grandOTA)],
          ['Received','inherit',eur(grandRec)],
          ['Zesty Commission','var(--teal)',eur(grandZesty)],
          ['Net to Owners','#1a5276',eur(grandNet)],
          ['🧹 Cleaning','var(--danger)',eur(grandCleanCost)],
          ['🔧 Job Orders','var(--danger)',eur(grandJobCost)],
        ].map(([label,color,val])=>`
          <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:3px">${label}</div>
            <div style="font-size:18px;font-weight:700;color:${color}">${val}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:10px;padding:8px 14px;background:#fff;border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;font-weight:600">${filteredBookings.length} bookings \u00B7 ${grandNights} nights \u00B7 ${propsInPeriod.length} propert${propsInPeriod.length!==1?'ies':'y'}</div>
        <button onclick="window.print()" class="btn btn-print no-print" style="padding:6px 14px;font-size:12px">\uD83D\uDDA8 Print</button>
      </div>
    </div>`;

  if (!out) return;
  out.innerHTML = summaryHTML + `<div class="rpt-wrap">${sections || '<p style="padding:20px;color:var(--text-muted)">No bookings found. Upload your Lodgify CSV on the Dashboard first.</p>'}</div>`;
}


// Patch showTab to init period tab
const _origShowTab = showTab;
window.showTab = function(name, el) {
  _origShowTab(name, el);
  if (name === 'period') initPeriodTab();
  if (name === 'history') { loadHistoryFilters(); loadHistory(); }
};
