let properties=[],owners=[],jobs=[],cleanJobs=[],checkinJobs=[];
let currentReportNotes='';

async function init(){
  const[rp,ro,rj,rc,rci]=await Promise.all([
    SyncStore.load('zesty_properties','properties'),
    SyncStore.load('zesty_owners','owners'),
    SyncStore.load('zesty_jobs','jobs'),
    SyncStore.load('zesty_cleaning_jobs','cleaning_jobs'),
    SyncStore.load('zesty_checkin_jobs','checkin_jobs'),
  ]);
  properties=rp.data||[]; owners=ro.data||[]; jobs=rj.data||[]; cleanJobs=rc.data||[]; checkinJobs=rci.data||[];
  const sel=document.getElementById('s-prop');
  properties.filter(p=>!p.archived).sort((a,b)=>(a.shortName||'').localeCompare(b.shortName||'')).forEach(p=>{
    const o=document.createElement('option'); o.value=p.id; o.textContent=p.shortName||p.propertyName; sel.appendChild(o);
  });
  const now=new Date();
  document.getElementById('s-month').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const y=now.getFullYear(),m=now.getMonth();
  document.getElementById('occ-from').value=new Date(y,m,1).toISOString().slice(0,10);
  document.getElementById('occ-to').value=new Date(y,m+1,0).toISOString().slice(0,10);
}
init();

function showTab(name,btn){
  document.querySelectorAll('.report-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.report-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  btn.classList.add('active');
}

function eur(n){return '€'+(parseFloat(n)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function pct(n){return (parseFloat(n)||0).toFixed(1)+'%';}
function srcClass(s){
  if(!s)return'src-other';const l=s.toLowerCase();
  if(l.includes('airbnb'))return'src-airbnb';
  if(l.includes('booking'))return'src-booking';
  if(l.includes('zesty'))return'src-zesty';
  if(l.includes('vrbo')||l.includes('homeaway'))return'src-vrbo';
  if(l.includes('direct')||l.includes('manual'))return'src-direct';
  return'src-other';
}
function getCommRate(prop,src){
  if(!prop||!src)return 0; const s=src.toLowerCase();
  // Use PLATFORM FEES (what the host pays to OTA) not guest-side commissions
  if(s.includes('airbnb'))return parseFloat(prop.platFeeAirbnb)||parseFloat(prop.commAirbnb)||0;
  if(s.includes('booking'))return parseFloat(prop.platFeeBooking)||parseFloat(prop.commBooking)||0;
  if(s.includes('vrbo')||s.includes('homeaway'))return parseFloat(prop.platFeeVrbo)||parseFloat(prop.commVrbo)||0;
  if(s.includes('manual')||s.includes('direct'))return 0; // direct bookings: no OTA fee
  return 0;
}
function calcJobCharge(j){
  if(j.lineItems&&j.lineItems.length) return (j.lineItems||[]).reduce((s,li)=>s+(parseFloat(li.chargeAmount)||0),0)+(parseFloat(j.zestyFee)||0);
  return parseFloat(j.finalCharge||j.totalCharge||0);
}
function onPropChange(){
  const p=properties.find(x=>x.id===document.getElementById('s-prop').value);
  if(!p){document.getElementById('s-owner-lbl').textContent='';return;}
  const o=owners.find(x=>x.id===p.owner||x.id===p.ownerId);
  const name=o?((o.repFirst||'')+' '+(o.repLast||'')).trim()||o.companyName:'—';
  document.getElementById('s-owner-lbl').textContent='Owner: '+name+' · Mgmt: '+pct(p.maintenance||p.ownerCommission);
}

function parseCSVLine(line){
  const r=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(line[i]===','&&!inQ){r.push(cur);cur='';}else cur+=line[i];
  }
  r.push(cur);return r;
}
function parseCSV(text){
  const lines=text.split('\n').filter(l=>l.trim());
  if(!lines.length)return[];
  const headers=parseCSVLine(lines[0]);
  return lines.slice(1).map(l=>{const vals=parseCSVLine(l),obj={};headers.forEach((h,i)=>obj[h.trim()]=(vals[i]||'').trim());return obj;})
    .filter(r=>r.Id&&(r.DateArrival||r.DateDeparture));
}
function getCSVBookings(){
  const raw=JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv')||'null');
  return raw&&raw.text?parseCSV(raw.text):[];
}
function matchProp(r,prop){
  // PRIMARY: match by Lodgify House_Id = property propertyId (most reliable)
  if(prop.propertyId && r.House_Id && String(r.House_Id)===String(prop.propertyId)) return true;
  // SECONDARY: exact HouseInternalName match (case-insensitive)
  const internalName=(r.HouseInternalName||'').trim();
  const shortName=(prop.shortName||prop.propertyName||'').trim();
  if(internalName && internalName!=='N/A' && shortName &&
     internalName.toLowerCase()===shortName.toLowerCase()) return true;
  return false;
}

/* ═══ OWNER STATEMENT ═══ */
function generateOwner(){
  // Preserve any typed notes across regenerations (e.g. after editing a booking row)
  const _existingNotes = document.getElementById('rpt-section-notes');
  if (_existingNotes) currentReportNotes = _existingNotes.value;
  const propId=document.getElementById('s-prop').value;
  const month=document.getElementById('s-month').value;
  if(!propId||!month){showToast('Select property and month','error');return;}
  // Check CSV data exists
  const rawCSV = JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv')||'null');
  if(!rawCSV||!rawCSV.text){
    document.getElementById('owner-out').innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-muted)">
      <div style="font-size:36px;margin-bottom:12px">&#128196;</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">No booking data found</div>
      <div style="font-size:13px">Upload your Lodgify CSV on the <a href="index.html" style="color:var(--teal)">Dashboard</a> first, then return here to generate reports.</div>
    </div>`;
    return;
  }
  const prop=properties.find(p=>p.id===propId);
  if(!prop)return;
  const owner=owners.find(o=>o.id===prop.owner||o.id===prop.ownerId);
  const ownerName=owner?(((owner.repFirst||'')+' '+(owner.repLast||'')).trim()||owner.companyName||'—'):'—';
  const mgmt=parseFloat(prop.maintenance||prop.ownerCommission)||0;
  const[yr,mo]=month.split('-');
  const mStart=new Date(yr,parseInt(mo)-1,1), mEnd=new Date(yr,parseInt(mo),0);
  const monthName=mStart.toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  // Bookings
  const allB=getCSVBookings();
  const bookings=allB.filter(r=>{
    // Only confirmed bookings (Status=Booked). Skip Open enquiries, Declined, Cancelled.
    if(r.Status!=='Booked') return false;
    if(!matchProp(r,prop))return false;
    return new Date(r.DateArrival)<=mEnd&&new Date(r.DateDeparture)>=mStart;
  });

  let tRent=0,tOTA=0,tTaxFees=0,tRec=0,tZesty=0,tNet=0;
  const bySource={};
  const bRows=bookings.map((r,i)=>{
    const nights=parseInt(r.Nights)||0;
    const guests=parseInt(r.People||r.Guests||0);
    // Lodgify CSV columns per spec:
    // Total Rent = RoomRatesTotal - PromotionsTotal
    // Use manual overrides if set, else calculate from CSV
    let rent,taxesFees,ota,rec,zesty,netInc;
    if(r._override){
      rent=parseFloat(r._rent)||0;taxesFees=parseFloat(r._taxFees)||0;ota=parseFloat(r._ota)||0;
      rec=parseFloat((rent-taxesFees-ota).toFixed(2));
      zesty=parseFloat(r._zesty)||parseFloat((Math.max(0,rec)*mgmt/100).toFixed(2));
      netInc=parseFloat((rec-zesty).toFixed(2));
    } else {
      const roomRates=parseFloat(r.RoomRatesTotal||r.TotalAmount||0);
      const promotions=parseFloat(r.PromotionsTotal||0);
      rent=parseFloat((roomRates-promotions).toFixed(2));
      taxesFees=parseFloat(((parseFloat(r.FeesTotal||0))+(parseFloat(r.TaxesTotal||0))).toFixed(2));
      const otaBase=Math.max(0,rent-taxesFees);const otaRate=getCommRate(prop,r.Source);
      ota=parseFloat((otaBase*otaRate/100).toFixed(2));
      rec=parseFloat((rent-taxesFees-ota).toFixed(2));
      zesty=parseFloat((Math.max(0,rec)*mgmt/100).toFixed(2));
      netInc=parseFloat((rec-zesty).toFixed(2));
    }
    const daily=nights>0?rent/nights:0;
    r._rent=rent;r._taxFees=taxesFees;r._ota=ota;r._zesty=zesty;
    tRent+=rent;tOTA+=ota;tTaxFees+=taxesFees;tRec+=rec;tZesty+=zesty;tNet+=netInc;
    bySource[r.Source||'Other']=(bySource[r.Source||'Other']||0)+rent;
    return`<tr>
      <td style="color:var(--text-muted);font-size:11px">${i+1}</td>
      <td><strong>${r.Name||'—'}</strong>${r.CountryName||r.Origin?`<br><small style="color:var(--text-muted)">${r.CountryName||r.Origin}</small>`:''}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.DateCreated||r.BookingDate||'—'}</td>
      <td style="font-size:12px">${fmtDate(r.DateArrival)}</td>
      <td style="font-size:12px">${fmtDate(r.DateDeparture)}</td>
      <td style="text-align:center">${nights}</td>
      <td style="text-align:center">${guests||'—'}</td>
      <td><span class="src-badge ${srcClass(r.Source)}">${r.Source||'—'}</span></td>
      <td style="text-align:right;font-size:12px">${daily>0?eur(daily):'—'}</td>
      <td style="text-align:right;font-weight:600">${eur(rent)}</td>
      <td style="text-align:right;color:var(--info);font-size:12px">${taxesFees>0?eur(taxesFees):'—'}</td>
      <td style="text-align:right;color:var(--danger);font-size:12px">${ota>0?eur(ota):'—'}</td>
      <td style="text-align:right;font-size:12px">${rec>0?eur(rec):'—'}</td>
      <td style="text-align:right;color:var(--text-muted);font-size:12px">${eur(zesty)}</td>
      <td style="text-align:right;font-weight:700;color:var(--teal-dark)">${eur(netInc)}</td>
      <td style="padding:4px;white-space:nowrap">
        <button onclick="editBookingRow(${i})" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:.6" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.6">✏️</button>${r._manual?'<button onclick="deleteManualRow('+i+')" style="background:none;border:none;cursor:pointer;font-size:12px;opacity:.5" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.5">🗑</button>':''}
      </td>
    </tr>`;
  }).join('');

  // Jobs
  const propJobs=jobs.filter(j=>{
    // Only completed jobs
    if(j.status!=='Completed'&&j.status!=='Paid') return false;
    // Match by property: try propertyId first, then name
    const matchesProp = (prop.propertyId && String(j.propertyId)===String(prop.propertyId)) ||
      (j.propertyName||'').toLowerCase().includes((prop.shortName||'').toLowerCase().split(' ')[0]);
    if(!matchesProp) return false;
    // Match by month: check completed date or started date
    const d=j.dateCompleted||j.dateStarted||j.dateInvoiced||'';
    return d.startsWith(month);
  });
  const tJobs=propJobs.reduce((s,j)=>s+calcJobCharge(j),0);
  const jRows=propJobs.map(j=>`<tr>
    <td style="font-family:monospace;font-size:11px;color:var(--teal)">${j.jobId||'—'}</td>
    <td>${j.title||'—'}</td>
    <td style="font-size:12px">${fmtDate(j.dateStarted)}</td>
    <td style="text-align:right;font-weight:600">${eur(calcJobCharge(j))}</td>
    <td style="font-size:12px;color:var(--text-muted)">${j.notes||''}</td>
  </tr>`).join('');

  // Cleaning
  const cleans=cleanJobs.filter(j=>{
    const cp=(j.propertyName||'').toLowerCase(), ps=(prop.shortName||prop.propertyName||'').toLowerCase().split(' ')[0];
    return cp.includes(ps)&&(j.date||'').startsWith(month);
  });
  const staffC=JSON.parse(localStorage.getItem('zesty_staff')||'[]');
  const cleaningFeeRate=parseFloat(prop.cleaningFee||0); // fee per hour charged to owner
  // prop.transportCharge is the per-trip transport fee defined in the property settings
  const propTransportRate=parseFloat(prop.transportCharge||0);

  // Helper: resolve transport fee for a job (stored on job; fall back to property)
  const jobTransportRate = j => parseFloat(j.propertyTransport||0) || propTransportRate;

  // Helper: count cleaners with transport ticked for a job
  // If j.cleanerTransport exists use it; otherwise count assigned cleaners who have a car
  const tickedTransportCount = j => {
    const fee = jobTransportRate(j);
    if(!fee) return 0;
    if(j.cleanerTransport){
      const n=Object.values(j.cleanerTransport).filter(v=>v===true).length;
      return n>0?n:0;
    }
    // No explicit ticking data — count assigned cleaners with hasCar='Yes' (same default as cleaning module)
    const ids=(j.cleanerIds||[]);
    if(!ids.length) return 1; // at least 1 if property has transport and job has no cleaner data
    const n=ids.filter(id=>{const st=staffC.find(s=>s.id===id);return st&&st.hasCar==='Yes';}).length;
    return n>0?n:1;
  };

  // Total actual hours: sum j.cleanerHours (actual from Hours module); fall back to j.hours
  const tCleanH=cleans.reduce((s,j)=>{
    const actualH=j.cleanerHours?Object.values(j.cleanerHours).reduce((s2,h)=>s2+(parseFloat(h)||0),0):(j.hours||0);
    return s+actualH;
  },0);
  // Separate hour-cost and transport totals for footer display
  let tCleanHoursCost=0, tCleanTransportCharge=0;
  const tCleanCharge=cleans.reduce((s,j)=>{
    const actualH=j.cleanerHours?Object.values(j.cleanerHours).reduce((s2,h)=>s2+(parseFloat(h)||0),0):(j.hours||0);
    const tFee=jobTransportRate(j);
    const tCount=tickedTransportCount(j);
    const hourCost=cleaningFeeRate*actualH;
    const transCost=tFee*tCount;
    tCleanHoursCost+=hourCost;
    tCleanTransportCharge+=transCost;
    return s+hourCost+transCost;
  },0);
  const cRows=cleans.map(j=>{
    const cls=(j.cleanerIds||[]).map(id=>staffC.find(s=>s.id===id)).filter(Boolean);
    // Use actual per-cleaner hours from j.cleanerHours (Hours module); fall back to j.hours
    const actualJobHours=j.cleanerHours?Object.values(j.cleanerHours).reduce((s2,h)=>s2+(parseFloat(h)||0),0):(j.hours||0);
    // Transport charge TO OWNER: fee × number of ticked cleaners
    const tFee=jobTransportRate(j);
    const tCount=tickedTransportCount(j);
    const transportOwnerCharge=tFee*tCount;
    const cleaningCost=cleaningFeeRate*actualJobHours;
    const rowTotal=cleaningCost+transportOwnerCharge;
    const typeColors={checkout:['#fdebd0','#a04000'],deep:['#e8d5f5','#6c3483']};
    const [tbg,tcol]=typeColors[j.type]||['#fdf6e3','#8e6b23'];
    const tLabel=j.type==='checkout'?'Checkout':j.type==='deep'?'Deep Clean':'Mid-Stay';
    const cleanerNames=cls.length?cls.map(c=>c.firstName||c.name||'?').join(', '):'—';
    return`<tr>
      <td style="font-size:12px">${fmtDate(j.date)}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:8px;background:${tbg};color:${tcol}">${tLabel}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${cleanerNames}</td>
      <td style="text-align:center">${actualJobHours||'—'}</td>
      <td style="text-align:right;color:var(--teal-dark)">${cleaningCost>0?eur(cleaningCost):'—'}</td>
      <td style="text-align:right;color:var(--teal-dark)">${transportOwnerCharge>0?eur(transportOwnerCharge):'—'}</td>
      <td style="text-align:right;font-weight:600;color:var(--teal-dark)">${rowTotal>0?eur(rowTotal):'—'}</td>
    </tr>`;
  }).join('');

  // Check-in jobs for this property+month (show all, charge only confirmed=done)
  const propNameKey=(prop.shortName||prop.propertyName||'').toLowerCase().split(' ')[0];
  const ciJobsMonth=checkinJobs.filter(j=>{
    const cp=(j.propertyName||'').toLowerCase();
    return cp.includes(propNameKey)&&(j.date||'').startsWith(month);
  });
  const ciCharge=parseFloat(prop.checkinCharge||0);
  const tCICharge=ciJobsMonth.filter(j=>j.confirmed==='done').length*ciCharge;
  const ciRows=ciJobsMonth.sort((a,b)=>((a.date||'')+(a.scheduledTime||''))<((b.date||'')+(b.scheduledTime||''))?-1:1).map(j=>{
    const isCI=j.type==='checkin';
    const [tbg,tcol]=isCI?['#e8f6f3','#1a7a6e']:['#fdebd0','#a04000'];
    const tLabel=isCI?'Check-in':'Check-out';
    const infantFlag=(parseInt(j.infants)||0)>0;
    const isDone=j.confirmed==='done', isSkipped=j.confirmed==='skipped';
    const statusBadge=isDone
      ?'<span style="font-size:10px;background:#d5f5e3;color:#1e8449;padding:1px 5px;border-radius:6px">✅</span>'
      :isSkipped
      ?'<span style="font-size:10px;background:#fdebd0;color:#a04000;padding:1px 5px;border-radius:6px">⏭</span>'
      :'<span style="font-size:10px;background:#fef9e7;color:#9a7d0a;padding:1px 5px;border-radius:6px">🟡 Pending</span>';
    return`<tr style="${isSkipped?'opacity:.5':''}">
      <td style="font-size:12px">${fmtDate(j.actualDate||j.date)}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:8px;background:${tbg};color:${tcol}">${tLabel}</span></td>
      <td style="font-size:12px">${j.guestName||'—'}${infantFlag?' <span style="font-size:10px;background:#fff3cd;color:#856404;padding:1px 4px;border-radius:4px">🚼</span>':''}</td>
      <td style="text-align:center">${j.guests||'—'}</td>
      <td style="font-size:11px">${j.scheduledTime||'—'}</td>
      <td style="text-align:center">${statusBadge}</td>
      <td style="text-align:right;font-weight:600;color:var(--teal-dark)">${isDone&&ciCharge>0?eur(ciCharge):'—'}</td>
    </tr>`;
  }).join('');

  // Occupancy
  const booked=bookings.reduce((s,r)=>s+(parseInt(r.Nights)||0),0);
  const daysM=mEnd.getDate(), occ=daysM>0?Math.round(booked/daysM*100):0;
  const firstD=bookings.length?bookings.reduce((a,b)=>a.DateArrival<b.DateArrival?a:b).DateArrival:'—';
  const lastD=bookings.length?bookings.reduce((a,b)=>a.DateDeparture>b.DateDeparture?a:b).DateDeparture:'—';

  // Channel bars
  const maxS=Math.max(...Object.values(bySource),1);
  const COLS={'Airbnb':'#FFD700','Booking.com':'#003580','Zesty.gr':'#23a090','Vrbo':'#1B468F','Manual':'#27ae60'};
  const chanBars=Object.entries(bySource).sort(([,a],[,b])=>b-a).map(([src,amt])=>`
    <div class="channel-row">
      <span class="src-badge ${srcClass(src)}" style="width:100px;text-align:center">${src}</span>
      <div class="channel-track"><div class="channel-fill" style="width:${Math.round(amt/maxS*100)}%;background:${COLS[src]||'#95a5a6'}"></div></div>
      <span style="font-size:12px;font-weight:600;min-width:80px;text-align:right">${eur(amt)}</span>
    </div>`).join('');

  const payable=tNet-tJobs;

  // Store totals for Finalise button
  window._lastReportTotals = {tRent,tOTA,tTaxFees,tRec,tZesty,tNet,bookingCount:bookings.length};
  // Show finalise button
  const _fb = document.getElementById('finaliseBtn');
  if (_fb) { _fb.style.display=''; _fb.textContent='\u2713 Finalise & Record'; _fb.style.background=''; _fb.disabled=false; }
    currentStatementData={
    id:currentStatementData?.id||null,
    propId,month,bookings,tRent,tTaxFees,tOTA,tRec,tZesty,tNet,tJobs,tCleanH,tCleanCharge,tCICharge,mgmt,
    ownerName,
    propName: prop.shortName||prop.propertyName||''
  };
  document.getElementById('owner-out').innerHTML=`
  <div class="rpt-wrap">
    <div class="rpt-section" style="background:linear-gradient(135deg,var(--teal-dark),var(--teal));color:#fff;padding:26px 28px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;align-items:flex-start">
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400">Monthly Statement</div>
          <div style="font-size:15px;opacity:.9;margin-top:5px">Rental: <strong>${prop.shortName||prop.propertyName}</strong></div>
          <div style="font-size:13px;opacity:.7;margin-top:3px">Period: <strong>${monthName}</strong> &nbsp;|&nbsp; Issued: ${new Date().toLocaleDateString('en-GB')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;opacity:.65">Owner</div>
          <div style="font-size:20px;font-weight:600">${ownerName}</div>
          <div style="font-size:12px;opacity:.65;margin-top:4px">Management Fee: <strong>${pct(mgmt)}</strong></div>
        </div>
      </div>
    </div>

    <div class="rpt-section">
      <div class="rpt-section-title">Bookings</div>
      ${bookings.length===0?`<div style="background:#fff8e0;border:1px solid #f0d060;border-radius:8px;padding:12px 16px;font-size:13px;color:#8e6b23">
        ⚠ No bookings found. Upload your Lodgify CSV on the <a href="index.html">Dashboard</a> first, or check the property name matches the CSV.
      </div>`:`
      <div style="overflow-x:auto" class="rpt-scroll-wrap"><table class="rpt-table">
        <thead><tr><th>#</th><th>Guest</th><th>Booked</th><th>Check-in</th><th>Check-out</th>
          <th>Nts</th><th>Gst</th><th>Source</th><th>Daily Avg</th><th>Total Rent</th>
          <th>Taxes&amp;Fees</th><th>OTA Comm</th><th>Received</th>
          <th>Zesty Comm</th><th>Net Income</th><th style="width:44px"></th>
        </tr></thead>
        <tbody>${bRows}</tbody>
        <tfoot><tr><td colspan="9" style="text-align:right">TOTAL</td>
          <td style="text-align:right">${eur(tRent)}</td>
          <td style="text-align:right;color:var(--text-muted)">${eur(tTaxFees)}</td>
          <td style="text-align:right;color:var(--danger)">${eur(tOTA)}</td>
          <td style="text-align:right;color:var(--info)">${eur(tRec)}</td>
          <td style="text-align:right">${eur(tZesty)}</td>
          <td style="text-align:right;color:var(--teal-dark);font-size:14px">${eur(tNet)}</td>
        </tr></tfoot>
      </table></div>`}
    </div>

    ${propJobs.length>0?`<div class="rpt-section">
      <div class="rpt-section-title">Maintenance & Job Orders</div>
      <table class="rpt-table">
        <thead><tr><th>Job ID</th><th>Description</th><th>Date</th><th style="text-align:right">Charge</th><th>Notes</th></tr></thead>
        <tbody>${jRows}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right">TOTAL</td><td style="text-align:right">${eur(tJobs)}</td><td></td></tr></tfoot>
      </table>
    </div>`:''}

    ${cleans.length>0?`<div class="rpt-section">
      <div class="rpt-section-title">Cleaning — ${cleans.length} session${cleans.length!==1?'s':''} · ${tCleanH}h total · ${eur(tCleanCharge)} charged</div>
      <table class="rpt-table">
        <thead><tr><th>Date</th><th>Type</th><th>Cleaners</th><th style="text-align:center">Hours</th><th style="text-align:right">Cleaning Cost</th><th style="text-align:right">Transport</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${cRows}</tbody>
        <tfoot><tr>
          <td colspan="3" style="text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">TOTAL</td>
          <td style="text-align:center;font-weight:700">${tCleanH}h</td>
          <td style="text-align:right;font-weight:700">${tCleanHoursCost>0?eur(tCleanHoursCost):'—'}</td>
          <td style="text-align:right;font-weight:700">${tCleanTransportCharge>0?eur(tCleanTransportCharge):'—'}</td>
          <td style="text-align:right;font-weight:700;color:var(--teal-dark)">${eur(tCleanCharge)}</td>
        </tr></tfoot>
      </table>
    </div>`:''}

    ${ciJobsMonth.length>0?`<div class="rpt-section">
      <div class="rpt-section-title">Check-in / Check-out — ${ciJobsMonth.length} visit${ciJobsMonth.length>1?'s':''}${tCICharge>0?' · '+eur(tCICharge)+' charged':' · confirm jobs to charge'}</div>
      <table class="rpt-table">
        <thead><tr><th>Date</th><th>Type</th><th>Guest</th><th style="text-align:center">Guests</th><th style="text-align:center">Time</th><th style="text-align:center">Status</th><th style="text-align:right">Charge</th></tr></thead>
        <tbody>${ciRows}</tbody>
        ${tCICharge>0?`<tfoot><tr><td colspan="6" style="text-align:right">TOTAL CHECK-IN CHARGE</td><td style="text-align:right;font-weight:700">${eur(tCICharge)}</td></tr></tfoot>`:''}
      </table>
    </div>`:''}

    <div class="rpt-section">
      <div class="rpt-section-title">Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <div class="sum-row"><span class="sum-label">Total Rent</span><span class="sum-val">${eur(tRent)}</span></div>
          <div class="sum-row"><span class="sum-label">Taxes &amp; Fees</span><span class="sum-val" style="color:var(--text-muted)">− ${eur(tTaxFees)}</span></div>
          <div class="sum-row"><span class="sum-label">OTA Commissions</span><span class="sum-val" style="color:var(--danger)">− ${eur(tOTA)}</span></div>
          <div class="sum-row"><span class="sum-label">Net (after OTA &amp; Fees)</span><span class="sum-val">${eur(tRent-tOTA-tTaxFees)}</span></div>
          <div class="sum-row"><span class="sum-label">Zesty Management (${pct(mgmt)})</span><span class="sum-val" style="color:var(--teal)">+ ${eur(tZesty)}</span></div>
          <div class="sum-row subtotal"><span>Net Income (owner keeps)</span><span style="color:var(--success)">${eur(tNet)}</span></div>
          ${propJobs.length>0?`<div class="sum-row"><span class="sum-label">Job Orders (charged)</span><span class="sum-val" style="color:var(--teal)">+ ${eur(tJobs)}</span></div>`:''}
          ${tCleanCharge>0?`<div class="sum-row"><span class="sum-label">Cleaning (${cleans.length} sessions)</span><span class="sum-val" style="color:var(--teal)">+ ${eur(tCleanCharge)}</span></div>`:''}
          ${tCICharge>0?`<div class="sum-row"><span class="sum-label">Check-in / Check-out (${ciJobsMonth.length} visits)</span><span class="sum-val" style="color:var(--teal)">+ ${eur(tCICharge)}</span></div>`:''}
          <div class="sum-row payable"><span>DUE TO ZESTY</span><span>${eur(tZesty+tJobs+tCleanCharge+tCICharge)}</span></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:12px">Revenue by Channel</div>
          ${chanBars||'<div style="color:var(--text-muted);font-size:13px">No data</div>'}
          <div style="margin-top:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:10px">Occupancy</div>
          <div style="font-size:13px">
            <div class="sum-row"><span class="sum-label">Booked Nights</span><strong>${booked}</strong></div>
            <div class="sum-row"><span class="sum-label">Days in Month</span><strong>${daysM}</strong></div>
            <div class="sum-row"><span class="sum-label">Occupancy</span><strong style="color:var(--teal)">${occ}%</strong></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Notes section -->
    <div class="rpt-section">
      <div class="rpt-section-title" style="margin-bottom:8px">Notes</div>
      <textarea id="rpt-section-notes" rows="4"
        style="width:100%;border:1px solid #d4e0de;border-radius:8px;padding:12px;font-size:13px;font-family:'DM Sans',sans-serif;line-height:1.6;resize:vertical;outline:none;color:var(--text);"
        placeholder="Add notes for this statement (saved with the report)..."
        oninput="currentReportNotes=this.value">${currentReportNotes}</textarea>
    </div>
  </div>
    <div class="no-print" style="margin-top:20px;padding:16px 20px;background:var(--cream);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:600;color:var(--teal-dark);white-space:nowrap">Save Statement</div>
      <span id="stmt-status-badge" style="background:#999;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">📝 Unsaved</span>
      <input id="stmt-notes" type="text" placeholder="Notes (optional)..." style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;font-size:13px;font-family:'DM Sans',sans-serif">
      <button onclick="addManualBooking()" class="btn btn-outline btn-sm" style="font-size:12px">➕ Add Row</button>
      <button onclick="saveStatement('draft')" class="btn btn-sm" style="background:#f0f0f0;color:#333;font-size:12px">📝 Draft</button>
      <button onclick="saveStatement('review')" class="btn btn-sm" style="background:#e67e22;color:#fff;font-size:12px">🔍 Under Review</button>
      <button onclick="saveStatement('sent')" class="btn btn-sm" style="background:#27ae60;color:#fff;font-size:12px">✅ Sent to Client</button>
    </div>`;
}

/* ═══ OCCUPANCY ═══ */
function generateOccupancy(){
  const from=document.getElementById('occ-from').value, to=document.getElementById('occ-to').value;
  if(!from||!to){showToast('Select date range','error');return;}
  const allB=getCSVBookings();
  const inRange=allB.filter(r=>r.Status==='Booked'&&r.DateDeparture>=from&&r.DateArrival<=to); // Booked only
  const byProp={};
  inRange.forEach(r=>{
    const name=r.HouseInternalName||r.HouseName||'Unknown';
    if(!byProp[name])byProp[name]={nights:0,bookings:0,revenue:0,src:{}};
    byProp[name].nights+=parseInt(r.Nights)||0;
    byProp[name].bookings++;
    byProp[name].revenue+=parseFloat(r.TotalAmount||r.TotalRent||0);
    const s=r.Source||'Other';byProp[name].src[s]=(byProp[name].src[s]||0)+1;
  });
  const totalDays=Math.round((new Date(to)-new Date(from))/86400000)+1;
  const rows=Object.entries(byProp).sort(([,a],[,b])=>b.nights-a.nights).map(([name,d])=>{
    const occ=totalDays>0?Math.round(d.nights/totalDays*100):0;
    const ms=Object.entries(d.src).sort(([,a],[,b])=>b-a)[0];
    return`<tr>
      <td><strong>${name}</strong></td>
      <td style="text-align:center">${d.bookings}</td>
      <td style="text-align:center">${d.nights}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;background:var(--cream-dark);border-radius:4px;overflow:hidden">
            <div style="width:${occ}%;height:100%;background:var(--teal);border-radius:4px"></div>
          </div>
          <span style="font-weight:600;color:var(--teal);min-width:36px">${occ}%</span>
        </div>
      </td>
      <td style="text-align:right;font-weight:600">${eur(d.revenue)}</td>
      <td style="text-align:right">${d.nights>0?eur(d.revenue/d.nights):'—'}</td>
      <td>${ms?`<span class="src-badge ${srcClass(ms[0])}">${ms[0]}</span>`:'—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('occ-out').innerHTML=`<div class="rpt-wrap">
    <div class="rpt-section" style="background:linear-gradient(135deg,var(--teal-dark),var(--teal));color:#fff;padding:20px 24px">
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px">Occupancy Report</div>
      <div style="font-size:13px;opacity:.8;margin-top:4px">${fmtDate(from)} → ${fmtDate(to)} · ${totalDays} days window</div>
    </div>
    <div class="rpt-section">
      ${inRange.length===0?`<div style="text-align:center;padding:40px;color:var(--text-muted)">No bookings found. Upload Lodgify CSV on Dashboard first.</div>`:`
      <table class="rpt-table">
        <thead><tr><th>Property</th><th style="text-align:center">Bookings</th><th style="text-align:center">Nights</th>
          <th>Occupancy</th><th style="text-align:right">Revenue</th><th style="text-align:right">Avg/Night</th><th>Top Channel</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>
    
    <!-- Notes section -->
    <div class="rpt-section">
      <div class="rpt-section-title" style="margin-bottom:8px">Notes</div>
      <textarea rows="4" style="width:100%;border:1px solid #d4e0de;border-radius:8px;padding:12px;font-size:13px;font-family:'DM Sans',sans-serif;line-height:1.6;resize:vertical;outline:none;color:var(--text);" placeholder="Add notes for this occupancy report..."></textarea>
    </div>
  </div>`;
}

function fmtDate(s) {
  if (!s || s === '—') return '—';
  try {
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
  } catch { return s; }
}


function showToast(msg, type) {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id = '_toast'; t.style.cssText='position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:13px;z-index:9999;color:#fff;font-family:DM Sans,sans-serif;transition:all .3s;opacity:0;transform:translateY(20px)'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.background = type === 'error' ? '#c0392b' : '#1a7a6e';
  t.style.opacity = '1'; t.style.transform = 'translateY(0)';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; }, 3000);
}


// ══════════════════════════════════════════════
// STATEMENT MANAGEMENT
// ══════════════════════════════════════════════
let currentStatementData = null;

const SUPA_S = 'https://whuytfjwdjjepayeiohj.supabase.co';
const KEY_S  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';

async function supaStmt(path, method='GET', body=null) {
  const opts = {method, headers:{'apikey':KEY_S,'Authorization':'Bearer '+KEY_S,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(SUPA_S+'/rest/v1/'+path, opts);
  if (!r.ok) { const t=await r.text(); throw new Error(t||('HTTP '+r.status)); }
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}

function updateStatementStatusBadge(status) {
  const badge = document.getElementById('stmt-status-badge');
  if (!badge) return;
  const colors = {draft:'#888',review:'#e67e22',sent:'#27ae60'};
  const labels = {draft:'\uD83D\uDCDD Draft',review:'\uD83D\uDD0D Under Review',sent:'\u2705 Sent to Client'};
  badge.textContent = labels[status]||status;
  badge.style.background = colors[status]||'#888';
}

async function saveStatement(status) {
  if (!currentStatementData) {showToast('Generate a report first','error');return;}
  const prop  = properties.find(p=>p.id===currentStatementData.propId);
  const owner = owners.find(o=>o.id===prop?.owner);
  const isNew = !currentStatementData.id;
  const id    = currentStatementData.id || ('stmt_'+Date.now());
  const notes = document.getElementById('rpt-section-notes')?.value
             || document.getElementById('stmt-notes')?.value
             || currentReportNotes || '';
  try {
    if (isNew) {
      // INSERT new statement
      const record = {
        id,
        property_id:   currentStatementData.propId||'',
        property_name: prop?.shortName||prop?.propertyName||'',
        owner_id:      prop?.owner||'',
        // owner_name is embedded inside data.ownerName (column may not exist in older DB installs)
        month:         currentStatementData.month||'',
        status,
        data:          currentStatementData,
        notes,
        created_at:    new Date().toISOString(),
        updated_at:    new Date().toISOString(),
        sent_at:       status==='sent'?new Date().toISOString():null,
      };
      await supaStmt('zesty_statements', 'POST', record);
    } else {
      // PATCH existing statement
      const patch = {
        status,
        data:       currentStatementData,
        notes,
        updated_at: new Date().toISOString(),
        sent_at:    status==='sent'?new Date().toISOString():null,
      };
      const r = await fetch(SUPA_S+'/rest/v1/zesty_statements?id=eq.'+id, {
        method: 'PATCH',
        headers: {'apikey':KEY_S,'Authorization':'Bearer '+KEY_S,'Content-Type':'application/json','Prefer':'return=minimal'},
        body: JSON.stringify(patch),
      });
      if (!r.ok) { const t=await r.text(); throw new Error(t||'HTTP '+r.status); }
    }
    currentStatementData.id = id;
    updateStatementStatusBadge(status);
    showToast('\u2713 Saved as '+status.toUpperCase(),'success');
  } catch(e) { showToast('Save error: '+e.message,'error'); }
}

async function loadHistory() {
  const ownerF = document.getElementById('h-owner')?.value||'';
  const yearF  = document.getElementById('h-year')?.value||'';
  const listEl = document.getElementById('h-list');
  if (listEl) listEl.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading\u2026</div>';
  try {
    let stmts = await supaStmt('zesty_statements?order=updated_at.desc&limit=300');

    // Populate owner dropdown once (before filtering)
    const ownerSel = document.getElementById('h-owner');
    if (ownerSel && ownerSel.options.length<=1) {
      owners.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||'')).forEach(o=>{
        const opt=document.createElement('option');
        opt.value=o.id;
        opt.textContent=(o.firstName||'')+' '+(o.lastName||o.companyName||'');
        ownerSel.appendChild(opt);
      });
    }
    // Populate year dropdown once (from actual data, before filtering)
    const yearSel = document.getElementById('h-year');
    if (yearSel && yearSel.options.length<=1) {
      const years=[...new Set(stmts.map(s=>(s.month||'').substring(0,4)).filter(Boolean))].sort().reverse();
      years.forEach(y=>{const opt=document.createElement('option');opt.value=y;opt.textContent=y;yearSel.appendChild(opt);});
    }

    // Apply filters
    if (ownerF) stmts = stmts.filter(s=>s.owner_id===ownerF);
    if (yearF)  stmts = stmts.filter(s=>(s.month||'').startsWith(yearF));

    // "Due to Zesty" = mgmt commission + job orders + cleaning + check-in charges
    const dueToZesty = d => (parseFloat(d?.tZesty)||0)+(parseFloat(d?.tJobs)||0)+(parseFloat(d?.tCleanCharge)||0)+(parseFloat(d?.tCICharge)||0);

    // Aggregate totals across filtered statements
    const totRent  = stmts.reduce((s,x)=>s+(parseFloat(x.data?.tRent)||0),0);
    const totNet   = stmts.reduce((s,x)=>s+(parseFloat(x.data?.tNet)||0),0);
    const totZesty = stmts.reduce((s,x)=>s+dueToZesty(x.data),0);

    // Summary line
    const sumEl=document.getElementById('h-summary-line');
    if (sumEl) sumEl.textContent=stmts.length+' statement'+(stmts.length!==1?'s':'')+' \u00B7 Total rent: '+eur(totRent);

    // Status pill counts
    const counts={draft:0,review:0,sent:0};
    stmts.forEach(s=>{if(counts[s.status]!==undefined)counts[s.status]++;});
    ['draft','review','sent'].forEach(st=>{const e=document.getElementById('h-count-'+st);if(e)e.textContent=counts[st];});

    // Stats cards
    const statsEl=document.getElementById('h-stats-cards');
    if (statsEl) statsEl.innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:18px">
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 18px;border-left:4px solid var(--teal)">
          <div style="font-size:22px;font-weight:700;color:var(--teal)">${stmts.length}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Statements</div>
        </div>
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 18px;border-left:4px solid var(--teal)">
          <div style="font-size:22px;font-weight:700;color:var(--teal)">${eur(totRent)}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Total Rent</div>
        </div>
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 18px;border-left:4px solid var(--gold)">
          <div style="font-size:22px;font-weight:700;color:var(--teal-dark)">${eur(totZesty)}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Due to Zesty</div>
        </div>
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 18px;border-left:4px solid var(--success)">
          <div style="font-size:22px;font-weight:700;color:var(--success)">${eur(totNet)}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Net to Owners</div>
        </div>
      </div>`;

    if (!listEl) return;
    if (!stmts.length){listEl.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-muted)">No saved statements yet. Generate a report and click Draft / Under Review / Sent to Client.</div>';return;}
    const sColors={draft:'#888',review:'#e67e22',sent:'#27ae60'};
    const sLabels={draft:'\uD83D\uDCDD Draft',review:'\uD83D\uDD0D Review',sent:'\u2705 Sent'};
    listEl.innerHTML=stmts.map(s=>{
      const d=s.data||{};
      const dtz=dueToZesty(d);
      const netInc=parseFloat(d.tNet)||0;
      return `
      <div style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-weight:600;font-size:14px">${s.property_name||'Unknown'}</div>
          <div style="font-size:12px;color:var(--text-muted)">${d.ownerName||s.owner_name||''} &middot; ${s.month||''}</div>
          ${s.notes?'<div style="font-size:11px;color:#999;margin-top:2px">'+String(s.notes||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>':''}
        </div>
        <div style="text-align:right;min-width:140px">
          <div style="font-size:15px;font-weight:700;color:var(--teal-dark)">${eur(dtz)}</div>
          <div style="font-size:11px;color:var(--text-muted)">Due to Zesty</div>
          ${netInc>0?`<div style="font-size:11px;color:var(--success);margin-top:1px">${eur(netInc)} net to owner</div>`:''}
        </div>
        <span style="background:${sColors[s.status]||'#888'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">${sLabels[s.status]||s.status}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button onclick="openStatement('${s.id}')" class="btn btn-sm btn-outline" style="font-size:12px">&#128196; Open</button>
          <select onchange="changeStatementStatus('${s.id}',this.value)" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff">
            <option value="">Change\u2026</option>
            <option value="draft">&#128221; Draft</option>
            <option value="review">&#128269; Under Review</option>
            <option value="sent">&#9989; Sent</option>
          </select>
          <button onclick="deleteStatement('${s.id}')" class="btn btn-sm" style="background:#fdf0ef;color:var(--danger);border:1px solid var(--danger);font-size:12px">&#128465;</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    if(listEl) listEl.innerHTML='<div style="padding:20px;color:var(--danger)">Error: '+e.message+'</div>';
  }
}

async function openStatement(id) {
  try {
    const [stmt] = await supaStmt('zesty_statements?id=eq.'+id);
    if (!stmt) return;
    currentStatementData = stmt.data;
    currentStatementData.id = stmt.id;
    const propSel = document.getElementById('s-prop');
    const monthSel = document.getElementById('s-month');
    if (propSel) propSel.value = stmt.property_id||'';
    if (monthSel) monthSel.value = stmt.month||'';
    showTab('owner', document.querySelector('.report-tab.active')||document.querySelector('.report-tab'));
    generateOwner();
    updateStatementStatusBadge(stmt.status);
    const notesEl = document.getElementById('stmt-notes');
    if (notesEl) notesEl.value = stmt.notes||'';
    currentReportNotes = stmt.notes||'';
  } catch(e) { showToast('Open error: '+e.message,'error'); }
}

async function changeStatementStatus(id, status) {
  if (!status) return;
  try {
    const patch={status,updated_at:new Date().toISOString()};
    if(status==='sent') patch.sent_at=new Date().toISOString();
    await fetch(SUPA_S+'/rest/v1/zesty_statements?id=eq.'+id,{
      method:'PATCH',
      headers:{'apikey':KEY_S,'Authorization':'Bearer '+KEY_S,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(patch)
    });
    showToast('\u2713 Status updated','success');
    loadHistory();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

async function deleteStatement(id) {
  if(!confirm('Delete this statement? This cannot be undone.')) return;
  await fetch(SUPA_S+'/rest/v1/zesty_statements?id=eq.'+id,{
    method:'DELETE',headers:{'apikey':KEY_S,'Authorization':'Bearer '+KEY_S}
  });
  showToast('Statement deleted','error');
  loadHistory();
}

// ── Edit booking row ─────────────────────────────────────────────────
function editBookingRow(idx) {
  if(!currentStatementData?.bookings) return;
  const b = currentStatementData.bookings[idx];
  if(!b) return;
  const m = document.getElementById('editBookingModal');
  if(!m) return;
  m.querySelector('h2').textContent = b._manual ? 'Edit Manual Entry' : 'Edit Booking';
  document.getElementById('eb-idx').value      = idx;
  document.getElementById('eb-guest').value    = b.Name||'';
  document.getElementById('eb-checkin').value  = b.DateArrival||'';
  document.getElementById('eb-checkout').value = b.DateDeparture||'';
  document.getElementById('eb-nights').value   = b.Nights||'';
  document.getElementById('eb-source').value   = b.Source||'';
  document.getElementById('eb-rent').value     = b._rent||'';
  document.getElementById('eb-taxfees').value  = b._taxFees||'0';
  document.getElementById('eb-ota').value      = b._ota||'0';
  document.getElementById('eb-zesty').value    = b._zesty||'';
  document.getElementById('eb-note').value     = b._note||'';
  document.getElementById('eb-del-btn').style.display = b._manual ? '' : 'none';
  openModal('editBookingModal');
}

function saveBookingEdit() {
  const idx = parseInt(document.getElementById('eb-idx').value);
  if(!currentStatementData?.bookings || isNaN(idx)) return;
  const b = currentStatementData.bookings[idx];
  b._override  = true;
  b.Name           = document.getElementById('eb-guest').value;
  b.DateArrival    = document.getElementById('eb-checkin').value;
  b.DateDeparture  = document.getElementById('eb-checkout').value;
  b.Nights         = document.getElementById('eb-nights').value;
  b.Source         = document.getElementById('eb-source').value;
  b._rent          = parseFloat(document.getElementById('eb-rent').value)||0;
  b._taxFees       = parseFloat(document.getElementById('eb-taxfees').value)||0;
  b._ota           = parseFloat(document.getElementById('eb-ota').value)||0;
  b._zesty         = parseFloat(document.getElementById('eb-zesty').value)||0;
  b._note          = document.getElementById('eb-note').value;
  closeModal('editBookingModal');
  generateOwner();
  showToast('\u2713 Row updated','success');
}

function addManualBooking() {
  if(!currentStatementData){showToast('Generate a report first','error');return;}
  const m = document.getElementById('editBookingModal');
  if(m) m.querySelector('h2').textContent = 'Add Manual Entry';
  document.getElementById('eb-idx').value      = -1;
  document.getElementById('eb-guest').value    = '';
  document.getElementById('eb-checkin').value  = (currentStatementData.month||'')+'-01';
  document.getElementById('eb-checkout').value = '';
  document.getElementById('eb-nights').value   = '1';
  document.getElementById('eb-source').value   = 'Manual';
  document.getElementById('eb-rent').value     = '';
  document.getElementById('eb-taxfees').value  = '0';
  document.getElementById('eb-ota').value      = '0';
  document.getElementById('eb-zesty').value    = '';
  document.getElementById('eb-note').value     = '';
  document.getElementById('eb-del-btn').style.display = 'none';
  openModal('editBookingModal');
}

function saveManualBooking() {
  const idx = parseInt(document.getElementById('eb-idx').value);
  if(idx >= 0){ saveBookingEdit(); return; }
  if(!currentStatementData) return;
  const manual = {
    _manual:true, _override:true, Status:'Booked',
    Name:          document.getElementById('eb-guest').value||'Manual Entry',
    DateArrival:   document.getElementById('eb-checkin').value,
    DateDeparture: document.getElementById('eb-checkout').value,
    Nights:        document.getElementById('eb-nights').value||'1',
    Source:        document.getElementById('eb-source').value||'Manual',
    _rent:parseFloat(document.getElementById('eb-rent').value)||0,
    _taxFees:parseFloat(document.getElementById('eb-taxfees').value)||0,
    _ota:parseFloat(document.getElementById('eb-ota').value)||0,
    _zesty:parseFloat(document.getElementById('eb-zesty').value)||0,
    _note:document.getElementById('eb-note').value,
  };
  if(!currentStatementData.bookings) currentStatementData.bookings=[];
  currentStatementData.bookings.push(manual);
  closeModal('editBookingModal');
  generateOwner();
  showToast('\u2713 Manual entry added','success');
}

function deleteManualRow(idx) {
  if(!currentStatementData?.bookings) return;
  currentStatementData.bookings.splice(idx,1);
  generateOwner();
  showToast('Row removed','error');
}
