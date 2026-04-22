/* CHECKIN-LOGIC v1.1 — fully independent from cleaning */
// ═══════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════
let ciJobs    = [];
let ciAgents  = [];   // independent list — stored in checkin_agents table
let ciImportPreviewData = [];
let ciCurrentWeekStart  = null;

// ─── HELPERS ────────────────────────────────────────────────────
function ciOpenModal(id)  { const el=document.getElementById(id); if(el){el.style.opacity='1';el.style.pointerEvents='auto';} }
function ciCloseModal(id) { const el=document.getElementById(id); if(el){el.style.opacity='0';el.style.pointerEvents='none';} }

function ciShowToast(msg, type) {
  const el = document.getElementById('ci-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'ci-toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'ci-toast'; }, 3500);
}

function ciShowConfirm(icon, title, msg, btnClass, btnLabel, onConfirm) {
  const o = document.getElementById('ciConfirmOverlay');
  if (!o) return;
  o.querySelector('#ciConfirmIcon').textContent  = icon;
  o.querySelector('#ciConfirmTitle').textContent = title;
  o.querySelector('#ciConfirmMsg').textContent   = msg;
  const btn = o.querySelector('#ciConfirmOkBtn');
  btn.textContent = btnLabel;
  btn.className   = 'ci-btn ' + (btnClass || 'ci-btn-primary');
  btn.onclick = () => { ciCloseModal('ciConfirmOverlay'); onConfirm(); };
  ciOpenModal('ciConfirmOverlay');
}

document.addEventListener('click', e => {
  if (e.target && e.target.classList && e.target.classList.contains('ci-modal-overlay'))
    ciCloseModal(e.target.id);
});

function eur(n) { return '€' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function ciFormatDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  if (!y||!m||!day) return d;
  return `${day}/${m}/${y}`;
}

function ciGetMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}

function ciDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

// ─── PROPERTY CACHE ──────────────────────────────────────────────
function _ciGetProps() {
  try { return JSON.parse(localStorage.getItem('zesty_properties')||'[]') || []; } catch { return []; }
}
function _ciFindProp(nameOrId) {
  const props = _ciGetProps();
  return props.find(p =>
    String(p.propertyId) === String(nameOrId) ||
    (p.propertyName||'').toLowerCase() === (nameOrId||'').toLowerCase() ||
    (p.shortName||'').toLowerCase() === (nameOrId||'').toLowerCase()
  );
}
function ciGetPropCheckinCharge(propName) {
  const p = _ciFindProp(propName);
  return p ? (parseFloat(p.checkinCharge)||0) : 0;
}
function ciGetPropLocation(propName) {
  const p = _ciFindProp(propName);
  return p ? (p.location||'') : '';
}
function ciPropertyHasCheckin(propIdOrName) {
  const p = _ciFindProp(propIdOrName);
  return p ? (p.checkin === 'Ναι' || p.checkin === 'Yes') : false;
}

// ─── AGENTS (independent) ─────────────────────────────────────────
function getAgentName(id) {
  const a = ciAgents.find(x => x.id === id);
  return a ? a.firstName + ' ' + a.lastName : '—';
}

function autoAssignAgent(propertyName) {
  const loc = ciGetPropLocation(propertyName).toLowerCase();
  if (!loc) return '';
  const active = ciAgents.filter(a => a.status !== 'Inactive');
  const match = active.find(a =>
    (a.zones||[]).some(z => loc.includes(z.toLowerCase()) || z.toLowerCase().includes(loc))
  );
  return match ? match.id : '';
}

// ─── RETURNING GUEST ─────────────────────────────────────────────
function isReturningGuest(guestName, excludeBookingId) {
  if (!guestName) return false;
  const name = guestName.trim().toLowerCase();
  return ciJobs.some(j =>
    j.bookingId !== excludeBookingId &&
    (j.guestName||'').trim().toLowerCase() === name
  );
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function initCheckin() {
  ciCurrentWeekStart = ciGetMonday(new Date());

  // Set default month inputs
  const _m = ciDateStr(new Date()).slice(0,7);
  ['ciJobMonth','ciConfirmMonth'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = _m;
  });

  // Load from cache first
  const cachedJobs   = SyncStore._getLocal('zesty_checkin_jobs');
  const cachedAgents = SyncStore._getLocal('zesty_checkin_agents');
  if (cachedJobs.length)   ciJobs   = cachedJobs;
  if (cachedAgents.length) ciAgents = cachedAgents;
  if (ciJobs.length || ciAgents.length) renderCIAll();

  // Load from Supabase
  const [rj, ra] = await Promise.all([
    SyncStore.load('zesty_checkin_jobs',   'checkin_jobs'),
    SyncStore.load('zesty_checkin_agents', 'checkin_agents'),
  ]);
  if (!rj.fromCache) ciJobs   = rj.data || [];
  if (!ra.fromCache) ciAgents = ra.data || [];
  renderCIAll();
  showDbStatus(rj.online !== false);

  // Live poll every 30s
  startPoll('checkin_jobs',   'zesty_checkin_jobs',   30000, rows => { ciJobs   = rows; renderCIAll(); });
  startPoll('checkin_agents', 'zesty_checkin_agents', 60000, rows => { ciAgents = rows; renderCIAgents(); populateCIAgentDropdowns(); });

  // Auto-sync from cleaning data silently on every load
  // This ensures any new bookings imported in the Cleaning module appear immediately
  await syncCIFromCleaning(true);
}

function renderCIAll() {
  renderCICalendar();
  renderCIJobs();
  renderCIConfirm();
  updateCIStats();
  populateCIAgentDropdowns();
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════
function updateCIStats() {
  const thisMonth = ciDateStr(new Date()).slice(0,7);
  const monthly   = ciJobs.filter(j => (j.date||'').startsWith(thisMonth));
  const checkins  = monthly.filter(j => j.type === 'checkin').length;
  const checkouts = monthly.filter(j => j.type === 'checkout').length;
  const confirmed = monthly.filter(j => j.confirmed === 'done').length;
  const pending   = monthly.filter(j => !j.confirmed).length;
  const revenue   = monthly.filter(j => j.confirmed === 'done')
                           .reduce((s,j) => s + ciGetPropCheckinCharge(j.propertyName), 0);
  setText('ci-stat-total',    monthly.length);
  setText('ci-stat-checkin',  checkins);
  setText('ci-stat-checkout', checkouts);
  setText('ci-stat-confirmed',confirmed);
  setText('ci-stat-pending',  pending);
  setText('ci-stat-revenue',  revenue > 0 ? eur(revenue) : '—');
}

function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

// ═══════════════════════════════════════════════════════════════
// SCHEDULE — WEEKLY CALENDAR
// ═══════════════════════════════════════════════════════════════
function prevCIWeek() { ciCurrentWeekStart=new Date(ciCurrentWeekStart); ciCurrentWeekStart.setDate(ciCurrentWeekStart.getDate()-7); renderCICalendar(); }
function nextCIWeek() { ciCurrentWeekStart=new Date(ciCurrentWeekStart); ciCurrentWeekStart.setDate(ciCurrentWeekStart.getDate()+7); renderCICalendar(); }
function goToCIToday() { ciCurrentWeekStart=ciGetMonday(new Date()); renderCICalendar(); }

function renderCICalendar() {
  if (!ciCurrentWeekStart) return;
  const monday = new Date(ciCurrentWeekStart);
  const days = [];
  for (let i=0;i<7;i++) { const d=new Date(monday); d.setDate(d.getDate()+i); days.push(d); }

  const end = new Date(monday); end.setDate(end.getDate()+6);
  setText('ciWeekLabel',
    monday.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' – ' +
    end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}));

  const today = ciDateStr(new Date());
  const grid  = document.getElementById('ciCalGrid');
  if (!grid) return;

  grid.innerHTML = days.map(d => {
    const ds = ciDateStr(d);
    const isToday = ds === today;
    const dayJobs = ciJobs.filter(j => j.date===ds)
      .sort((a,b) => (a.scheduledTime||'99:99') < (b.scheduledTime||'99:99') ? -1 : 1);

    return `<div class="ci-day-col ${isToday?'ci-today':''}">
      <div class="ci-day-header">
        <div class="ci-day-name">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
        <div class="ci-day-date ${isToday?'ci-today-badge':''}">${d.getDate()}</div>
        <div class="ci-day-count">${dayJobs.length>0?dayJobs.length+' job'+(dayJobs.length>1?'s':''):''}</div>
      </div>
      <div class="ci-day-jobs">${dayJobs.map(j=>ciJobCard(j)).join('')||'<div class="ci-no-jobs">—</div>'}</div>
    </div>`;
  }).join('');
}

function ciJobCard(j) {
  const isCI      = j.type==='checkin';
  const typeColor = isCI?'#1a7a6e':'#c0392b';
  const typeBg    = isCI?'#e8f6f3':'#fdebd0';
  const typeLabel = isCI?'🔑 CHECK-IN':'🚪 CHECK-OUT';
  const infantFlag= (parseInt(j.infants)||0)>0;
  const statusDot = j.confirmed==='done'?'🟢':j.confirmed==='skipped'?'🔴':'🟡';

  return `<div class="ci-card" onclick="editCIJob('${j.id}')">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:${typeBg};color:${typeColor}">${typeLabel}</span>
      <span style="font-size:11px">${statusDot} ${j.scheduledTime||'—'}</span>
    </div>
    <div style="font-weight:600;font-size:12px;margin-bottom:2px">${j.propertyName||'—'}</div>
    <div style="font-size:11px;color:#555">👤 ${j.guestName||'—'}${j.guests?' ('+j.guests+')':''}</div>
    ${infantFlag?'<div style="font-size:11px;background:#fff3cd;color:#856404;padding:2px 5px;border-radius:4px;margin-top:3px">🚼 Baby cot / High chair!</div>':''}
    ${j.returningGuest?'<div style="font-size:11px;color:#c9a84c;margin-top:2px">⭐ Returning guest</div>':''}
    <div style="font-size:11px;color:#888;margin-top:3px">👷 ${getAgentName(j.agentId)}</div>
    ${j.moneyToReceive>0?`<div style="font-size:11px;color:#1a7a6e;font-weight:600;margin-top:3px">💶 Collect: ${eur(j.moneyToReceive)}</div>`:''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// JOBS LIST
// ═══════════════════════════════════════════════════════════════
function renderCIJobs() {
  const monthF  = document.getElementById('ciJobMonth')?.value||'';
  const propF   = (document.getElementById('ciJobProp')?.value||'').toLowerCase();
  const agentF  = document.getElementById('ciJobAgent')?.value||'';
  const statusF = document.getElementById('ciJobStatus')?.value||'';
  const typeF   = document.getElementById('ciJobType')?.value||'';

  const filtered = ciJobs.filter(j => {
    if (monthF  && !(j.date||'').startsWith(monthF)) return false;
    if (propF   && !(j.propertyName||'').toLowerCase().includes(propF)) return false;
    if (agentF  && j.agentId!==agentF) return false;
    if (statusF==='done'    && j.confirmed!=='done')    return false;
    if (statusF==='skipped' && j.confirmed!=='skipped') return false;
    if (statusF==='pending' && j.confirmed)             return false;
    if (typeF   && j.type!==typeF) return false;
    return true;
  }).sort((a,b)=>((a.date||'')+(a.scheduledTime||''))<((b.date||'')+(b.scheduledTime||''))?-1:1);

  const tbody = document.getElementById('ciJobsTbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:24px;color:#888">No jobs found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(j => {
    const isCI = j.type==='checkin';
    const typeBg=isCI?'#e8f6f3':'#fdebd0', typeCol=isCI?'#1a7a6e':'#c0392b';
    const infantFlag=(parseInt(j.infants)||0)>0;
    const statusBadge = j.confirmed==='done'
      ?'<span style="background:#d5f5e3;color:#1e8449;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">✅ Done</span>'
      :j.confirmed==='skipped'
      ?'<span style="background:#fdebd0;color:#a04000;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">⏭ Skipped</span>'
      :'<span style="background:#fef9e7;color:#9a7d0a;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">🟡 Pending</span>';

    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${ciFormatDate(j.date)}</td>
      <td style="font-size:12px">${j.scheduledTime||'—'}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:6px;background:${typeBg};color:${typeCol}">${isCI?'🔑 Check-in':'🚪 Check-out'}</span></td>
      <td style="font-size:12px">${j.propertyName||'—'}</td>
      <td style="font-size:12px">${j.guestName||'—'}${j.returningGuest?' <span style="color:#c9a84c;font-size:10px">⭐</span>':''}${infantFlag?' <span style="font-size:10px;background:#fff3cd;color:#856404;padding:1px 4px;border-radius:4px">🚼</span>':''}</td>
      <td style="text-align:center;font-size:12px">${j.guests||'—'}${j.adults?`<span style="font-size:10px;color:#888;display:block">${j.adults}A ${j.children||0}C ${j.infants||0}I</span>`:''}</td>
      <td style="font-size:12px">${getAgentName(j.agentId)}</td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap">
        <button onclick="editCIJob('${j.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;opacity:.6" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.6">✏️</button>
        <button onclick="deleteCIJob('${j.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;opacity:.6" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.6">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM TAB
// ═══════════════════════════════════════════════════════════════
function renderCIConfirm() {
  const monthF      = document.getElementById('ciConfirmMonth')?.value || ciDateStr(new Date()).slice(0,7);
  const pendingOnly = document.getElementById('ciConfirmPendingOnly')?.checked !== false;

  const jobs = ciJobs.filter(j => {
    if (!(j.date||'').startsWith(monthF)) return false;
    if (pendingOnly && j.confirmed) return false;
    return true;
  }).sort((a,b)=>((a.date||'')+(a.scheduledTime||'99:99'))<((b.date||'')+(b.scheduledTime||'99:99'))?-1:1);

  const tbody = document.getElementById('ciConfirmTbody');
  if (!tbody) return;

  if (!jobs.length) {
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:24px;color:#888">${pendingOnly?'No pending jobs — all confirmed! 🎉':'No jobs for this month'}</td></tr>`;
    return;
  }

  tbody.innerHTML = jobs.map(j => {
    const isCI=j.type==='checkin';
    const typeBg=isCI?'#e8f6f3':'#fdebd0', typeCol=isCI?'#1a7a6e':'#c0392b';
    const infantFlag=(parseInt(j.infants)||0)>0;
    const isDone=j.confirmed==='done', isSkipped=j.confirmed==='skipped';

    return `<tr style="${isDone?'opacity:.65':''}">
      <td style="font-size:12px;white-space:nowrap">${ciFormatDate(j.date)}</td>
      <td style="font-size:12px">${j.scheduledTime||'—'}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:6px;background:${typeBg};color:${typeCol}">${isCI?'🔑 Check-in':'🚪 Check-out'}</span></td>
      <td style="font-size:12px">${j.propertyName||'—'}</td>
      <td style="font-size:12px">${j.guestName||'—'}${infantFlag?' 🚼':''}</td>
      <td style="font-size:12px">${getAgentName(j.agentId)}</td>
      <td>
        ${isDone
          ?`<span style="color:#1e8449;font-size:12px">✅ Done${j.actualDate&&j.actualDate!==j.date?' ('+ciFormatDate(j.actualDate)+')':''}</span>
            <button onclick="unconfirmCIJob('${j.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#888;margin-left:6px">↩ Undo</button>`
          :isSkipped
          ?`<span style="color:#a04000;font-size:12px">⏭ Skipped</span>
            <button onclick="unconfirmCIJob('${j.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#888;margin-left:6px">↩ Undo</button>`
          :`<div style="display:flex;gap:4px;flex-wrap:wrap">
              <button onclick="markCIDone('${j.id}',null)" class="ci-btn ci-btn-sm" style="background:#d5f5e3;color:#1e8449;border:none">✅ Done</button>
              <button onclick="openCIDatePicker('${j.id}')" class="ci-btn ci-btn-sm" style="background:#d6eaf8;color:#1a5276;border:none">📅 Diff. date</button>
              <button onclick="markCISkipped('${j.id}')" class="ci-btn ci-btn-sm" style="background:#fdebd0;color:#a04000;border:none">⏭ Skipped</button>
            </div>`
        }
      </td>
    </tr>`;
  }).join('');
}

async function markCIDone(id, actualDate) {
  const idx=ciJobs.findIndex(j=>j.id===id); if(idx<0) return;
  ciJobs[idx]={...ciJobs[idx], confirmed:'done', actualDate:actualDate||ciJobs[idx].date};
  await saveCIData(); renderCIAll(); ciShowToast('✅ Marked as done','success');
}
async function markCISkipped(id) {
  const idx=ciJobs.findIndex(j=>j.id===id); if(idx<0) return;
  ciJobs[idx]={...ciJobs[idx], confirmed:'skipped', actualDate:null};
  await saveCIData(); renderCIAll(); ciShowToast('⏭ Marked as skipped','');
}
async function unconfirmCIJob(id) {
  const idx=ciJobs.findIndex(j=>j.id===id); if(idx<0) return;
  ciJobs[idx]={...ciJobs[idx], confirmed:null, actualDate:null};
  await saveCIData(); renderCIAll(); ciShowToast('↩ Reverted to pending','');
}
function openCIDatePicker(id) {
  document.getElementById('ciActualDateInput').value='';
  document.getElementById('ciActualDateJobId').value=id;
  ciOpenModal('ciDatePickerModal');
}
async function confirmCIActualDate() {
  const id=document.getElementById('ciActualDateJobId').value;
  const date=document.getElementById('ciActualDateInput').value;
  if(!date){ciShowToast('Please select a date','error');return;}
  await markCIDone(id,date); ciCloseModal('ciDatePickerModal');
}

// ═══════════════════════════════════════════════════════════════
// AGENTS TAB — independent CRUD
// ═══════════════════════════════════════════════════════════════
const CI_ZONES = ['Kissamos','Kaliviani','Falasarna','Agia Marina','Chania'];
const CI_COLORS = ['#1a7a6e','#c9a84c','#e67e22','#8e44ad','#2471a3','#1e8449','#c0392b','#2c3e50'];

function renderCIAgents() {
  const container = document.getElementById('ciAgentsGrid');
  if (!container) return;

  const active = ciAgents.filter(a => a.status!=='Inactive');
  const inactive = ciAgents.filter(a => a.status==='Inactive');
  const all = [...active, ...inactive];

  if (!all.length) {
    container.innerHTML=`<div style="text-align:center;padding:40px;color:#888;grid-column:span 3">
      No check-in agents yet. Click <strong>+ Add Agent</strong> to get started.
    </div>`;
    return;
  }

  container.innerHTML = all.map((a,i) => {
    const initials=(a.firstName?.[0]||'')+(a.lastName?.[0]||'');
    const color=CI_COLORS[i%CI_COLORS.length];
    const zones=(a.zones||[]).join(' · ')||'—';
    const thisMonth=ciDateStr(new Date()).slice(0,7);
    const myJobs=ciJobs.filter(j=>j.agentId===a.id&&(j.date||'').startsWith(thisMonth));
    const done=myJobs.filter(j=>j.confirmed==='done').length;
    const isInactive=a.status==='Inactive';

    return `<div class="ci-agent-card" style="${isInactive?'opacity:.6':''}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:44px;height:44px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${a.firstName} ${a.lastName}</div>
          <div style="font-size:11px;color:#888">${a.phone||''}</div>
        </div>
        <span style="font-size:11px;padding:2px 8px;border-radius:8px;background:${isInactive?'#fdebd0':'#d5f5e3'};color:${isInactive?'#a04000':'#1e8449'};white-space:nowrap">${a.status||'Active'}</span>
      </div>
      <div style="font-size:12px;margin-bottom:4px">📍 <strong>Areas:</strong> ${zones}</div>
      <div style="font-size:12px;margin-bottom:4px">💶 <strong>Fee/visit:</strong> ${a.checkInFee?eur(a.checkInFee):'—'}</div>
      ${a.email?`<div style="font-size:12px;margin-bottom:4px">✉️ ${a.email}</div>`:''}
      <div style="font-size:12px;color:#888;margin-bottom:12px">This month: <strong>${myJobs.length} jobs</strong> · <strong>${done} done</strong></div>
      <div style="display:flex;gap:8px">
        <button onclick="openEditCIAgent('${a.id}')" class="ci-btn ci-btn-outline ci-btn-sm">✏️ Edit</button>
        <button onclick="deleteCIAgent('${a.id}')" class="ci-btn ci-btn-danger ci-btn-sm">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function openAddCIAgent() {
  document.getElementById('ciAgentModalTitle').textContent = 'Add Agent';
  document.getElementById('ciAgentEditId').value = '';
  clearCIAgentForm();
  ciOpenModal('ciAgentModal');
}

function openEditCIAgent(id) {
  const a = ciAgents.find(x=>x.id===id);
  if (!a) return;
  document.getElementById('ciAgentModalTitle').textContent = 'Edit Agent';
  document.getElementById('ciAgentEditId').value  = id;
  document.getElementById('ca_firstName').value   = a.firstName||'';
  document.getElementById('ca_lastName').value    = a.lastName||'';
  document.getElementById('ca_status').value      = a.status||'Active';
  document.getElementById('ca_phone').value       = a.phone||'';
  document.getElementById('ca_email').value       = a.email||'';
  document.getElementById('ca_checkInFee').value  = a.checkInFee||'';
  document.getElementById('ca_notes').value       = a.notes||'';
  document.querySelectorAll('.ci-zone-check').forEach(el =>
    el.classList.toggle('selected', (a.zones||[]).includes(el.dataset.zone))
  );
  ciOpenModal('ciAgentModal');
}

function clearCIAgentForm() {
  ['ca_firstName','ca_lastName','ca_phone','ca_email','ca_checkInFee','ca_notes']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('ca_status').value='Active';
  document.querySelectorAll('.ci-zone-check').forEach(el=>el.classList.remove('selected'));
}

function toggleCIZone(el) { el.classList.toggle('selected'); }

async function saveCIAgent() {
  const firstName = document.getElementById('ca_firstName').value.trim();
  const lastName  = document.getElementById('ca_lastName').value.trim();
  if (!firstName) { ciShowToast('Please enter a first name','error'); return; }

  const zones = [...document.querySelectorAll('.ci-zone-check.selected')].map(el=>el.dataset.zone);
  const data = {
    firstName, lastName,
    status:     document.getElementById('ca_status').value,
    phone:      document.getElementById('ca_phone').value.trim(),
    email:      document.getElementById('ca_email').value.trim(),
    checkInFee: parseFloat(document.getElementById('ca_checkInFee').value)||null,
    zones,
    notes:      document.getElementById('ca_notes').value.trim(),
  };

  const editId = document.getElementById('ciAgentEditId').value;
  if (editId) {
    const idx = ciAgents.findIndex(a=>a.id===editId);
    if (idx>=0) { ciAgents[idx]={...ciAgents[idx],...data}; ciShowToast('✓ Agent updated','success'); }
  } else {
    ciAgents.push({id:'agent_'+Date.now(), ...data});
    ciShowToast('✓ Agent added','success');
  }

  await SyncStore.saveAll('zesty_checkin_agents','checkin_agents',ciAgents);
  ciCloseModal('ciAgentModal');
  renderCIAgents();
  populateCIAgentDropdowns();
}

async function deleteCIAgent(id) {
  const a = ciAgents.find(x=>x.id===id);
  if (!a) return;
  ciShowConfirm('🗑️','Delete Agent?',
    `Delete ${a.firstName} ${a.lastName}? This cannot be undone.`,
    'ci-btn-danger','Delete', async () => {
      ciAgents = ciAgents.filter(x=>x.id!==id);
      const r = await SyncStore.deleteOne('zesty_checkin_agents','checkin_agents',id,ciAgents);
      if (!r.ok) { ciAgents=(await SyncStore.load('zesty_checkin_agents','checkin_agents')).data; }
      renderCIAgents(); populateCIAgentDropdowns();
      ciShowToast('Deleted','error');
    }
  );
}

function populateCIAgentDropdowns() {
  const active = ciAgents.filter(a=>a.status!=='Inactive');
  const filterOpts = '<option value="">All Agents</option>' +
    active.map(a=>`<option value="${a.id}">${a.firstName} ${a.lastName}</option>`).join('');
  const editOpts = '<option value="">Unassigned</option>' +
    active.map(a=>`<option value="${a.id}">${a.firstName} ${a.lastName}</option>`).join('');
  const el1=document.getElementById('ciJobAgent'); if(el1) el1.innerHTML=filterOpts;
  const el2=document.getElementById('ciEditAgent'); if(el2) el2.innerHTML=editOpts;
}

// ═══════════════════════════════════════════════════════════════
// EDIT JOB MODAL
// ═══════════════════════════════════════════════════════════════
function editCIJob(id) {
  const j = ciJobs.find(x=>x.id===id); if(!j) return;
  document.getElementById('ciEditId').value           = id;
  document.getElementById('ciEditDate').value         = j.date||'';
  document.getElementById('ciEditTime').value         = j.scheduledTime||'';
  document.getElementById('ciEditType').value         = j.type||'checkin';
  document.getElementById('ciEditProp').value         = j.propertyName||'';
  document.getElementById('ciEditGuest').value        = j.guestName||'';
  document.getElementById('ciEditGuests').value       = j.guests||'';
  document.getElementById('ciEditAdults').value       = j.adults||'';
  document.getElementById('ciEditChildren').value     = j.children||'';
  document.getElementById('ciEditInfants').value      = j.infants||'';
  document.getElementById('ciEditBabyCot').checked    = !!j.babyCot;
  document.getElementById('ciEditReturning').checked  = !!j.returningGuest;
  document.getElementById('ciEditMoney').value        = j.moneyToReceive||'';
  document.getElementById('ciEditRequests').value     = j.specialRequests||'';
  document.getElementById('ciEditNotes').value        = j.notes||'';
  populateCIAgentDropdowns();
  const agentSel=document.getElementById('ciEditAgent'); if(agentSel) agentSel.value=j.agentId||'';
  ciOpenModal('ciEditModal');
}

async function saveCIJob() {
  const id=document.getElementById('ciEditId').value; if(!id) return;
  const idx=ciJobs.findIndex(j=>j.id===id); if(idx<0) return;
  const infants=parseInt(document.getElementById('ciEditInfants').value)||0;
  ciJobs[idx]={...ciJobs[idx],
    date:           document.getElementById('ciEditDate').value,
    scheduledTime:  document.getElementById('ciEditTime').value,
    type:           document.getElementById('ciEditType').value,
    propertyName:   document.getElementById('ciEditProp').value.trim(),
    guestName:      document.getElementById('ciEditGuest').value.trim(),
    guests:         parseInt(document.getElementById('ciEditGuests').value)||null,
    adults:         parseInt(document.getElementById('ciEditAdults').value)||null,
    children:       parseInt(document.getElementById('ciEditChildren').value)||null,
    infants,
    babyCot:        document.getElementById('ciEditBabyCot').checked||infants>0,
    returningGuest: document.getElementById('ciEditReturning').checked,
    agentId:        document.getElementById('ciEditAgent').value,
    moneyToReceive: parseFloat(document.getElementById('ciEditMoney').value)||0,
    specialRequests:document.getElementById('ciEditRequests').value.trim(),
    notes:          document.getElementById('ciEditNotes').value.trim(),
  };
  await saveCIData(); ciCloseModal('ciEditModal'); renderCIAll(); ciShowToast('✓ Job saved','success');
}

async function deleteCIJob(id) {
  const j=ciJobs.find(x=>x.id===id); if(!j) return;
  ciShowConfirm('🗑️','Delete Job?',
    `Delete ${j.type==='checkin'?'check-in':'check-out'} job for ${j.propertyName} on ${ciFormatDate(j.date)}?`,
    'ci-btn-danger','Delete', async ()=>{
      ciJobs=ciJobs.filter(x=>x.id!==id);
      const r=await SyncStore.deleteOne('zesty_checkin_jobs','checkin_jobs',id,ciJobs);
      if(!r.ok){ciJobs=(await SyncStore.load('zesty_checkin_jobs','checkin_jobs')).data;}
      renderCIAll(); ciShowToast('Deleted','error');
    }
  );
}

// ═══════════════════════════════════════════════════════════════
// SYNC FROM CLEANING DATA
// Reads cleaning jobs already imported via the Cleaning module.
// No separate CSV needed — works from the same data.
// ═══════════════════════════════════════════════════════════════
async function syncCIFromCleaning(silent=false) {
  const btn = document.getElementById('ciSyncBtn');
  if (!silent && btn) { btn.disabled=true; btn.textContent='⏳ Syncing...'; }

  // Read cleaning jobs from localStorage (populated by cleaning module import)
  const cleaningJobs = SyncStore._getLocal('zesty_cleaning_jobs');

  // Only checkout-type jobs have the departure date + nights we need
  const checkoutJobs = cleaningJobs.filter(j => j.type === 'checkout' && j.bookingId);

  if (!checkoutJobs.length) {
    if (!silent) ciShowToast('No cleaning data found. Import CSV in the Cleaning module first.', 'error');
    if (!silent && btn) { btn.disabled=false; btn.textContent='🔄 Sync from Cleaning'; }
    return;
  }

  let created=0, updated=0, skipped=0;

  for (const cj of checkoutJobs) {
    const propName = cj.propertyName || '';
    const propId   = cj.propertyId   || '';

    // Only properties with check-in service enabled
    if (!ciPropertyHasCheckin(propId || propName)) { skipped++; continue; }

    const bookingId  = cj.bookingId;
    const guestName  = cj.guestName  || '';
    const guests     = cj.guests     || null;
    const adults     = cj.adults     || null;
    const children   = cj.children   || null;
    const infants    = cj.infants    || null;
    const babyCot    = (infants||0) > 0;
    const returning  = isReturningGuest(guestName, bookingId);
    const agentId    = autoAssignAgent(propName);

    // Departure date is the checkout job's date
    const departureDate = cj.date || '';

    // Arrival date = departure minus nights
    let arrivalDate = '';
    if (departureDate && cj.nights) {
      const d = new Date(departureDate);
      d.setDate(d.getDate() - parseInt(cj.nights));
      arrivalDate = ciDateStr(d);
    }

    const base = {
      bookingId, propertyName:propName, propertyId:propId,
      guestName, guests, adults, children, infants, babyCot,
      returningGuest:returning, agentId,
      scheduledTime:'', moneyToReceive:0, specialRequests:'', notes:'',
      confirmed:null, actualDate:null
    };

    // Check-in job (arrival day)
    if (arrivalDate) {
      const ciId  = `ci_${bookingId}_checkin`;
      const ciIdx = ciJobs.findIndex(j => j.id === ciId);
      const ciJob = { ...base, id:ciId, type:'checkin', date:arrivalDate };
      if (ciIdx >= 0) {
        const ex = ciJobs[ciIdx];
        ciJobs[ciIdx] = { ...ex, ...ciJob,
          agentId:        ex.agentId        || agentId,
          scheduledTime:  ex.scheduledTime  || '',
          moneyToReceive: ex.moneyToReceive || 0,
          specialRequests:ex.specialRequests|| '',
          notes:          ex.notes          || '',
          confirmed:      ex.confirmed,
          actualDate:     ex.actualDate };
        updated++;
      } else { ciJobs.push(ciJob); created++; }
    }

    // Check-out job (departure day)
    if (departureDate) {
      const coId  = `ci_${bookingId}_checkout`;
      const coIdx = ciJobs.findIndex(j => j.id === coId);
      const coJob = { ...base, id:coId, type:'checkout', date:departureDate };
      if (coIdx >= 0) {
        const ex = ciJobs[coIdx];
        ciJobs[coIdx] = { ...ex, ...coJob,
          agentId:        ex.agentId        || agentId,
          scheduledTime:  ex.scheduledTime  || '',
          moneyToReceive: ex.moneyToReceive || 0,
          specialRequests:ex.specialRequests|| '',
          notes:          ex.notes          || '',
          confirmed:      ex.confirmed,
          actualDate:     ex.actualDate };
        updated++;
      } else { ciJobs.push(coJob); created++; }
    }
  }

  await saveCIData();
  renderCIAll();
  renderCISyncStatus();
  if (!silent && btn) { btn.disabled=false; btn.textContent='🔄 Sync from Cleaning'; }
  if (!silent) ciShowToast(`✓ Created ${created} · Updated ${updated} · Skipped ${skipped} (no check-in service)`, 'success');
}

function renderCISyncStatus() {
  const cleaningJobs  = SyncStore._getLocal('zesty_cleaning_jobs');
  const checkoutCount = cleaningJobs.filter(j => j.type==='checkout' && j.bookingId).length;
  const eligibleCount = cleaningJobs.filter(j =>
    j.type==='checkout' && j.bookingId && ciPropertyHasCheckin(j.propertyId||j.propertyName)
  ).length;
  const existingCI    = ciJobs.length;

  const el = document.getElementById('ciSyncStatus');
  if (!el) return;
  el.innerHTML = `
    <div class="ci-import-stat"><div class="num">${checkoutCount}</div><div class="lbl">Bookings in Cleaning</div></div>
    <div class="ci-import-stat"><div class="num" style="color:#1a7a6e">${eligibleCount}</div><div class="lbl">With Check-in Service</div></div>
    <div class="ci-import-stat"><div class="num" style="color:#e67e22">${existingCI}</div><div class="lbl">Check-in Jobs Created</div></div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════
async function saveCIData() {
  return await SyncStore.saveAll('zesty_checkin_jobs','checkin_jobs',ciJobs);
}

// ═══════════════════════════════════════════════════════════════
// PRINT — WEEKLY PLAN
// ═══════════════════════════════════════════════════════════════
function printCIWeekly() {
  if(!ciCurrentWeekStart) return;
  const monday=new Date(ciCurrentWeekStart);
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(d.getDate()+i);days.push(d);}
  const end=new Date(monday);end.setDate(end.getDate()+6);
  const weekLabel=monday.toLocaleDateString('en-GB',{day:'numeric',month:'long'})+' – '+
    end.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

  // Group by agent then by day
  const agentGroups={};
  for(const d of days){
    const ds=ciDateStr(d);
    const dayJobs=ciJobs.filter(j=>j.date===ds)
      .sort((a,b)=>(a.scheduledTime||'99:99')<(b.scheduledTime||'99:99')?-1:1);
    for(const j of dayJobs){
      const agId=j.agentId||'_unassigned';
      if(!agentGroups[agId]) agentGroups[agId]={};
      if(!agentGroups[agId][ds]) agentGroups[agId][ds]=[];
      agentGroups[agId][ds].push(j);
    }
  }

  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Check-in Weekly Plan — ${weekLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:12px;color:#1e2a28;padding:20px;}
    h1{font-size:18px;margin-bottom:4px;color:#115950;}
    .sub{color:#888;font-size:12px;margin-bottom:20px;}
    h2{font-size:13px;margin:18px 0 8px;color:#1a7a6e;border-bottom:2px solid #1a7a6e;padding-bottom:4px;}
    h3{font-size:11px;font-weight:700;color:#333;margin:10px 0 4px;background:#f5f5f5;padding:4px 8px;border-radius:4px;}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;}
    th{background:#115950;color:#fff;padding:5px 8px;text-align:left;font-size:10px;text-transform:uppercase;}
    td{padding:5px 8px;border-bottom:1px solid #e0e0e0;vertical-align:top;}
    .ci{background:#e8f6f3;color:#1a7a6e;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;}
    .co{background:#fdebd0;color:#c0392b;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;}
    .alert{color:#856404;font-weight:600;}
    .ret{color:#c9a84c;font-weight:600;}
    @media print{body{padding:8px;}}
  </style></head><body>
  <h1>🗝 Check-in Weekly Plan</h1>
  <div class="sub">${weekLabel}</div>`;

  const agentIds=Object.keys(agentGroups);
  if(!agentIds.length){
    html+='<p style="color:#888;margin-top:20px">No jobs scheduled for this week.</p>';
  } else {
    for(const agId of agentIds){
      const agName=agId==='_unassigned'?'⚠ Unassigned':getAgentName(agId);
      html+=`<h2>👷 ${agName}</h2>`;
      for(const d of days){
        const ds=ciDateStr(d);
        const dayJ=agentGroups[agId][ds]; if(!dayJ||!dayJ.length) continue;
        const dayLabel=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
        html+=`<h3>${dayLabel}</h3><table><thead><tr>
          <th>Time</th><th>Type</th><th>Property</th><th>Guest</th>
          <th>Guests</th><th>Alerts / Notes</th><th>Collect</th>
        </tr></thead><tbody>`;
        for(const j of dayJ){
          const infantFlag=(parseInt(j.infants)||0)>0;
          const alerts=[
            infantFlag?'<span class="alert">🚼 Baby cot / High chair</span>':'',
            j.returningGuest?'<span class="ret">⭐ Returning guest</span>':'',
            j.specialRequests?'📝 '+j.specialRequests:'',
            j.notes?'💬 '+j.notes:'',
          ].filter(Boolean).join('<br>');
          html+=`<tr>
            <td>${j.scheduledTime||'—'}</td>
            <td><span class="${j.type==='checkin'?'ci':'co'}">${j.type==='checkin'?'CHECK-IN':'CHECK-OUT'}</span></td>
            <td><strong>${j.propertyName||'—'}</strong></td>
            <td>${j.guestName||'—'}</td>
            <td style="text-align:center">${j.guests||'—'}${j.adults?`<br><small>${j.adults}A ${j.children||0}C ${j.infants||0}I</small>`:''}</td>
            <td>${alerts||'—'}</td>
            <td>${j.moneyToReceive>0?eur(j.moneyToReceive):'—'}</td>
          </tr>`;
        }
        html+='</tbody></table>';
      }
    }
  }
  html+='</body></html>';
  const w=window.open('','_blank');
  w.document.write(html); w.document.close();
  setTimeout(()=>w.print(),400);
}

// ═══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════
function showCITab(name) {
  document.querySelectorAll('.ci-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ci-tab').forEach(t=>t.classList.remove('active'));
  const page=document.getElementById('ci-page-'+name); if(page) page.classList.add('active');
  const tab=document.querySelector(`.ci-tab[data-tab="${name}"]`); if(tab) tab.classList.add('active');
  if(name==='agents')  renderCIAgents();
  if(name==='confirm') renderCIConfirm();
  if(name==='import')  renderCISyncStatus();
}
