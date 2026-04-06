let properties=[],owners=[],jobs=[],cleanJobs=[];

async function init(){
  const[rp,ro,rj,rc]=await Promise.all([
    SyncStore.load('zesty_properties','properties'),
    SyncStore.load('zesty_owners','owners'),
    SyncStore.load('zesty_jobs','jobs'),
    SyncStore.load('zesty_cleaning_jobs','cleaning_jobs'),
  ]);
  properties=rp.data||[]; owners=ro.data||[]; jobs=rj.data||[]; cleanJobs=rc.data||[];
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
    const roomRates=parseFloat(r.RoomRatesTotal||r.TotalAmount||0);
    const promotions=parseFloat(r.PromotionsTotal||0);
    const rent=parseFloat((roomRates-promotions).toFixed(2));
    // Taxes and Fees = FeesTotal + TaxesTotal
    const taxesFees=parseFloat(((parseFloat(r.FeesTotal||0))+(parseFloat(r.TaxesTotal||0))).toFixed(2));
    // OTA Comm = (Total Rent - Taxes and Fees) * platFeeRate
    const otaBase=Math.max(0,rent-taxesFees);
    const otaRate=getCommRate(prop,r.Source);
    const ota=parseFloat((otaBase*otaRate/100).toFixed(2));
    // Received = Total Rent - Taxes & Fees - OTA Comm (what owner actually receives)
    const rec=parseFloat((rent-taxesFees-ota).toFixed(2));
    // Zesty Comm = Received * mgmt% (commission on received amount)
    const netBase=Math.max(0,rec);
    const zesty=parseFloat((netBase*mgmt/100).toFixed(2));
    // Net Income = Received - Zesty Comm
    const netInc=parseFloat((rec-zesty).toFixed(2));
    const daily=nights>0?rent/nights:0;
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
      <td style="text-align:right;color:var(--danger);font-size:12px">${ota>0?eur(ota):'—'}</td>
      <td style="text-align:right;color:var(--info);font-size:12px">${taxesFees>0?eur(taxesFees):'—'}</td>
      <td style="text-align:right;font-size:12px">${rec>0?eur(rec):'—'}</td>
      <td style="text-align:right;color:var(--text-muted);font-size:12px">${eur(zesty)}</td>
      <td style="text-align:right;font-weight:700;color:var(--teal-dark)">${eur(netInc)}</td>
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
    const cp=(j.propertyName||'').toLowerCase(), ps=(prop.shortName||'').toLowerCase().split(' ')[0];
    return cp.includes(ps)&&(j.date||'').startsWith(month);
  });
  const tCleanH=cleans.reduce((s,j)=>s+(j.hours||0),0);
  const staffC=JSON.parse(localStorage.getItem('zesty_staff')||'[]');
  const cRows=cleans.map(j=>{
    const cls=(j.cleanerIds||[]).map(id=>staffC.find(s=>s.id===id)).filter(Boolean);
    const pay=cls.reduce((s,cl)=>s+(cl.hourlyRate||0)*(j.hours||0)+(cl.hasCar==='Yes'?(j.propertyTransport||0):0),0);
    return`<tr>
      <td style="font-size:12px">${fmtDate(j.date)}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:8px;background:${j.type==='checkout'?'#fdebd0':'#fdf6e3'};color:${j.type==='checkout'?'#a04000':'#8e6b23'}">${j.type==='checkout'?'Checkout':'Mid-Stay'}</span></td>
      <td>${cls.map(cl=>cl.firstName+' '+cl.lastName).join(', ')||'—'}</td>
      <td style="text-align:center">${j.hours||'—'}</td>
      <td style="text-align:right">${pay>0?eur(pay):'—'}</td>
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
          <th>Zesty Comm</th><th>Net Income</th>
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
      <div class="rpt-section-title">Cleaning — ${cleans.length} sessions · ${tCleanH}h total</div>
      <table class="rpt-table">
        <thead><tr><th>Date</th><th>Type</th><th>Cleaner(s)</th><th style="text-align:center">Hours</th><th style="text-align:right">Pay</th></tr></thead>
        <tbody>${cRows}</tbody>
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
          <div class="sum-row payable"><span>DUE TO ZESTY</span><span>${eur(tZesty+tJobs)}</span></div>
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
      <div style="min-height:80px;border:1px dashed #ccc;border-radius:8px;padding:12px;color:var(--text-muted);font-size:12px;line-height:1.6">
        <span style="color:#ccc;font-style:italic">Add notes here...</span>
      </div>
    </div>
  </div>`;
}

/* ═══ OCCUPANCY ═══ */
function generateOccupancy(){
  const from=document.getElementById('occ-from').value, to=document.getElementById('occ-to').value;
  if(!from||!to){showToast('Select date range','error');return;}
  const allB=getCSVBookings();
  const inRange=allB.filter(r=>(r.Status==='Booked'||r.Status==='Open')&&r.DateDeparture>=from&&r.DateArrival<=to);
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
      <div style="min-height:80px;border:1px dashed #ccc;border-radius:8px;padding:12px;color:var(--text-muted);font-size:12px;line-height:1.6">
        <span style="color:#ccc;font-style:italic">Add notes here...</span>
      </div>
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
