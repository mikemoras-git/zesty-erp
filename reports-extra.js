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
  const eur    = n => '\u20AC' + (parseFloat(n)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const fmtD   = d => {
    if (!d) return '\u2014';
    try { return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
    catch { return d; }
  };
  const srcCls = s => {
    const sl = (s||'').toLowerCase();
    return sl.includes('airbnb') ? 'src-airbnb' :
           sl.includes('booking') ? 'src-booking' :
           sl.includes('vrbo') || sl.includes('homeaway') ? 'src-vrbo' :
           sl.includes('manual') || sl.includes('direct') ? 'src-direct' : 'src-other';
  };

  // Check if jobs and cleanJobs are loaded (from init() in reports-main.js)
  const jobsData = typeof jobs !== 'undefined' ? jobs : JSON.parse(localStorage.getItem('zesty_jobs')||'[]');
  const cleanData = typeof cleanJobs !== 'undefined' ? cleanJobs : JSON.parse(localStorage.getItem('zesty_cleaning_jobs')||'[]');
  const staffC = JSON.parse(localStorage.getItem('zesty_staff')||'[]');

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

  // Get unique properties that have bookings in this period
  const propsInPeriod = propId
    ? [properties.find(p => p.id === propId)].filter(Boolean)
    : properties.filter(p => !p.archived && filteredBookings.some(r => matchProp(r, p)));

  // Grand totals
  let grandRent=0, grandTax=0, grandOTA=0, grandRec=0, grandZesty=0, grandNet=0, grandNights=0;
  let grandCleanCost=0, grandJobCost=0, grandCleanSessions=0, grandJobCount=0;

  const presetLabel = document.getElementById('p-preset')?.selectedOptions?.[0]?.text || 'Custom Period';

  const sections = propsInPeriod.map(prop => {
    const mgmt = parseFloat(prop?.maintenance || prop?.ownerCommission || 0);

    // Bookings for this property, sorted by arrival
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

    // ── Cleaning sessions for this property in period ──
    const propNameKey = (prop.shortName || '').toLowerCase().split(' ')[0];
    const cleans = cleanData.filter(j => {
      const cp = (j.propertyName||'').toLowerCase();
      const d  = new Date(j.date||'');
      return cp.includes(propNameKey) && d >= fromDt && d <= toDt &&
             (j.type === 'checkout' || j.type === 'midstay');
    });
    const tCleanH = cleans.reduce((s,j) => s + (j.hours||0), 0);
    // Cost = sum of cleaner hours × their rate
    const cleanCost = cleans.reduce((s,j) => {
      const cls = (j.cleanerIds||[]).map(id => staffC.find(st => st.id === id)).filter(Boolean);
      return s + cls.reduce((cs, cl) => cs + (j.hours||0) * (parseFloat(cl.hourlyRate)||0), 0) +
             (cls.filter(cl => cl.hasCar === 'Yes').length > 0 ? (parseFloat(j.propertyTransport)||0) : 0);
    }, 0);
    grandCleanCost += cleanCost;
    grandCleanSessions += cleans.length;

    // ── Job orders for this property in period ──
    const propJobs = jobsData.filter(j => {
      if (j.status !== 'Completed' && j.status !== 'Paid') return false;
      const matchesProp =
        (prop.id && String(j.propertyId) === String(prop.id)) ||
        (j.propertyName||'').toLowerCase().includes(propNameKey);
      if (!matchesProp) return false;
      const d = new Date(j.dateCompleted || j.dateStarted || '');
      return d >= fromDt && d <= toDt;
    });
    const jobCostFn = typeof calcJobCharge === 'function' ? calcJobCharge :
      j => (j.lineItems||[]).reduce((s,li) => s + (parseFloat(li.chargeAmount)||0), 0) + (parseFloat(j.zestyFee)||0) || parseFloat(j.finalCharge||0);
    const jobCost = propJobs.reduce((s,j) => s + jobCostFn(j), 0);
    grandJobCost  += jobCost;
    grandJobCount += propJobs.length;

    const owner = owners?.find(o => o.id === prop.owner);

    return `
    <div class="rpt-section" style="margin-bottom:28px;page-break-inside:avoid">
      <!-- Property header (same style as owner statement) -->
      <div style="background:linear-gradient(135deg,var(--teal-dark),var(--teal));color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:17px;font-weight:700;font-family:'Cormorant Garamond',serif">${prop.shortName||prop.propertyName}</div>
          <div style="font-size:12px;opacity:.8;margin-top:2px">${owner ? (owner.firstName||'')+' '+(owner.lastName||owner.companyName||'') : ''}${mgmt?' \u00B7 Mgmt '+mgmt+'%':''}</div>
        </div>
        <div style="text-align:right;font-size:13px;opacity:.9">
          ${propBookings.length} booking${propBookings.length!==1?'s':''} \u00B7 ${tNights} nights
        </div>
      </div>

      <!-- Bookings table (identical to owner statement) -->
      <div style="overflow-x:auto">
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

      <!-- Cleaning & Job Orders — total cost only, no detail -->
      ${(cleans.length > 0 || propJobs.length > 0) ? `
      <div style="margin-top:0;border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;padding:10px 16px;background:#fafafa">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Expenses</div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
          ${cleans.length > 0 ? `
          <div style="font-size:13px">
            🧹 <strong>Cleaning</strong> — ${cleans.length} session${cleans.length!==1?'s':''}${tCleanH>0?' ('+tCleanH+'h)':''}
            <span style="margin-left:8px;font-weight:700;color:var(--danger)">${eur(cleanCost)}</span>
          </div>` : ''}
          ${propJobs.length > 0 ? `
          <div style="font-size:13px">
            🔧 <strong>Job Orders</strong> — ${propJobs.length} order${propJobs.length!==1?'s':''}
            <span style="margin-left:8px;font-weight:700;color:var(--danger)">${eur(jobCost)}</span>
          </div>` : ''}
          ${(cleans.length > 0 && propJobs.length > 0) ? `
          <div style="margin-left:auto;font-size:13px;font-weight:700">
            Total Expenses: <span style="color:var(--danger)">${eur(cleanCost + jobCost)}</span>
          </div>` : ''}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  // ── Grand summary ──
  const grandExpenses = grandCleanCost + grandJobCost;
  const summaryCards = [
    ['Total Rent',       'var(--teal-dark)', eur(grandRent)],
    ['Taxes & Fees',     'var(--info)',       eur(grandTax)],
    ['OTA Commissions',  'var(--danger)',     eur(grandOTA)],
    ['Received',         'inherit',           eur(grandRec)],
    ['Zesty Commission', 'var(--teal)',        eur(grandZesty)],
    ['Net to Owners',    '#1a5276',           eur(grandNet)],
    ['🧹 Cleaning ('+ grandCleanSessions +')', 'var(--danger)', eur(grandCleanCost)],
    ['🔧 Job Orders ('+grandJobCount+')', 'var(--danger)', eur(grandJobCost)],
  ].map(([label,color,val]) => `
    <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:3px">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${color}">${val}</div>
    </div>`).join('');

  if (!out) return;
  out.innerHTML = `
    <div class="rpt-section" style="background:var(--cream);margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--teal-dark);font-family:'Cormorant Garamond',serif">${presetLabel}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${fromVal} \u2192 ${toVal} &nbsp;\u00B7&nbsp; ${filteredBookings.length} bookings &nbsp;\u00B7&nbsp; ${grandNights} nights &nbsp;\u00B7&nbsp; ${propsInPeriod.length} propert${propsInPeriod.length!==1?'ies':'y'}</div>
        </div>
        <button onclick="window.print()" class="btn btn-print no-print" style="padding:7px 16px;font-size:12px">\uD83D\uDDA8 Print</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
        ${summaryCards}
      </div>
    </div>
    <div class="rpt-wrap">
      ${sections || '<p style="padding:20px;color:var(--text-muted)">No bookings found for this period. Upload your Lodgify CSV on the Dashboard first.</p>'}
    </div>`;
}


// Patch showTab to init period tab
const _origShowTab = showTab;
window.showTab = function(name, el) {
  _origShowTab(name, el);
  if (name === 'period') initPeriodTab();
};
