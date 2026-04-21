/* CHECKIN-LOGIC v1.0 */
// ═══════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════
let ciJobs = [];
let ciImportPreviewData = [];
let ciCurrentWeekStart = null; // Monday (Date obj)

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
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function ciDayLabel(d) {
  return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
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

// ─── AGENTS ──────────────────────────────────────────────────────
function getCIAgents() {
  try {
    const all = JSON.parse(localStorage.getItem('zesty_staff')||'[]') || [];
    return all.filter(s => s.role === 'checkin' || s.role === 'both');
  } catch { return []; }
}

function getAgentName(id) {
  const agents = getCIAgents();
  const a = agents.find(x => x.id === id);
  return a ? a.firstName + ' ' + a.lastName : '—';
}

function autoAssignAgent(propertyName) {
  const loc = ciGetPropLocation(propertyName).toLowerCase();
  if (!loc) return '';
  const agents = getCIAgents().filter(a => a.status !== 'Inactive');
  const match = agents.find(a => (a.zones||[]).some(z => loc.includes(z.toLowerCase()) || z.toLowerCase().includes(loc)));
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

  // Set default week/month inputs
  const today = ciDateStr(new Date());
  const wm = document.getElementById('ciWeekMonth');
  if (wm) wm.value = today.slice(0,7);

  // Show cached data immediately
  const cached = SyncStore._getLocal('zesty_checkin_jobs');
  if (cached.length) { ciJobs = cached; renderCIAll(); }

  // Load from Supabase
  const result = await SyncStore.load('zesty_checkin_jobs', 'checkin_jobs');
  if (!result.fromCache) {
    ciJobs = result.data || [];
    renderCIAll();
  }
  showDbStatus(result.online !== false);

  // Live poll every 30s
  startPoll('checkin_jobs', 'zesty_checkin_jobs', 30000, rows => {
    ciJobs = rows;
    renderCIAll();
  });

  updateCIStats();
  populateCIAgentDropdowns();
}

function renderCIAll() {
  renderCICalendar();
  renderCIJobs();
  renderCIConfirm();
  updateCIStats();
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════
function updateCIStats() {
  const now = new Date();
  const thisMonth = ciDateStr(now).slice(0,7);
  const monthly = ciJobs.filter(j => (j.date||'').startsWith(thisMonth));
  const checkins  = monthly.filter(j => j.type === 'checkin').length;
  const checkouts = monthly.filter(j => j.type === 'checkout').length;
  const confirmed = monthly.filter(j => j.confirmed === 'done').length;
  const pending   = monthly.filter(j => !j.confirmed).length;
  const revenue   = monthly.filter(j => j.confirmed === 'done').reduce((s,j) => s + ciGetPropCheckinCharge(j.propertyName), 0);

  setText('ci-stat-total',   monthly.length);
  setText('ci-stat-checkin', checkins);
  setText('ci-stat-checkout',checkouts);
  setText('ci-stat-confirmed',confirmed);
  setText('ci-stat-pending', pending);
  setText('ci-stat-revenue', revenue > 0 ? eur(revenue) : '—');
}

function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

// ═══════════════════════════════════════════════════════════════
// SCHEDULE — WEEKLY CALENDAR
// ═══════════════════════════════════════════════════════════════
function prevCIWeek() {
  ciCurrentWeekStart = new Date(ciCurrentWeekStart);
  ciCurrentWeekStart.setDate(ciCurrentWeekStart.getDate() - 7);
  renderCICalendar();
}
function nextCIWeek() {
  ciCurrentWeekStart = new Date(ciCurrentWeekStart);
  ciCurrentWeekStart.setDate(ciCurrentWeekStart.getDate() + 7);
  renderCICalendar();
}
function goToCIToday() {
  ciCurrentWeekStart = ciGetMonday(new Date());
  renderCICalendar();
}

function renderCICalendar() {
  if (!ciCurrentWeekStart) return;
  const monday = new Date(ciCurrentWeekStart);

  // Build 7 days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const end = new Date(monday); end.setDate(end.getDate() + 6);
  setText('ciWeekLabel',
    monday.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) +
    ' – ' + end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}));

  const today = ciDateStr(new Date());

  const grid = document.getElementById('ciCalGrid');
  if (!grid) return;

  grid.innerHTML = days.map(d => {
    const ds = ciDateStr(d);
    const isToday = ds === today;
    const dayJobs = ciJobs
      .filter(j => j.date === ds)
      .sort((a,b) => (a.scheduledTime||'99:99') < (b.scheduledTime||'99:99') ? -1 : 1);

    const cards = dayJobs.map(j => ciJobCard(j)).join('');

    return `<div class="ci-day-col ${isToday ? 'ci-today' : ''}">
      <div class="ci-day-header">
        <div class="ci-day-name">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
        <div class="ci-day-date ${isToday ? 'ci-today-badge' : ''}">${d.getDate()}</div>
        <div class="ci-day-count">${dayJobs.length > 0 ? dayJobs.length + ' job' + (dayJobs.length>1?'s':'') : ''}</div>
      </div>
      <div class="ci-day-jobs">${cards || '<div class="ci-no-jobs">—</div>'}</div>
    </div>`;
  }).join('');
}

function ciJobCard(j) {
  const isCI  = j.type === 'checkin';
  const typeColor = isCI ? '#1a7a6e' : '#c0392b';
  const typeBg    = isCI ? '#e8f6f3' : '#fdebd0';
  const typeLabel = isCI ? '🔑 CHECK-IN' : '🚪 CHECK-OUT';
  const agentName = getAgentName(j.agentId);
  const infantFlag = (parseInt(j.infants)||0) > 0;
  const returning  = j.returningGuest;
  const statusDot  = j.confirmed === 'done' ? '🟢' : j.confirmed === 'skipped' ? '🔴' : '🟡';

  const charge = ciGetPropCheckinCharge(j.propertyName);

  return `<div class="ci-card" onclick="editCIJob('${j.id}')">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:${typeBg};color:${typeColor}">${typeLabel}</span>
      <span style="font-size:11px">${statusDot} ${j.scheduledTime||'—'}</span>
    </div>
    <div style="font-weight:600;font-size:12px;margin-bottom:2px">${j.propertyName||'—'}</div>
    <div style="font-size:11px;color:#555">👤 ${j.guestName||'—'}${j.guests?' ('+j.guests+')':''}</div>
    ${infantFlag ? '<div style="font-size:11px;background:#fff3cd;color:#856404;padding:2px 5px;border-radius:4px;margin-top:3px">🚼 Baby cot / High chair!</div>' : ''}
    ${returning  ? '<div style="font-size:11px;color:#c9a84c;margin-top:2px">⭐ Returning guest</div>' : ''}
    <div style="font-size:11px;color:#888;margin-top:3px">👷 ${agentName}</div>
    ${j.moneyToReceive > 0 ? `<div style="font-size:11px;color:#1a7a6e;font-weight:600;margin-top:3px">💶 Collect: ${eur(j.moneyToReceive)}</div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// JOBS LIST
// ═══════════════════════════════════════════════════════════════
function renderCIJobs() {
  const monthF  = document.getElementById('ciJobMonth')?.value || '';
  const propF   = (document.getElementById('ciJobProp')?.value || '').toLowerCase();
  const agentF  = document.getElementById('ciJobAgent')?.value || '';
  const statusF = document.getElementById('ciJobStatus')?.value || '';
  const typeF   = document.getElementById('ciJobType')?.value || '';

  let filtered = ciJobs.filter(j => {
    if (monthF  && !(j.date||'').startsWith(monthF)) return false;
    if (propF   && !(j.propertyName||'').toLowerCase().includes(propF)) return false;
    if (agentF  && j.agentId !== agentF) return false;
    if (statusF === 'done'    && j.confirmed !== 'done')    return false;
    if (statusF === 'skipped' && j.confirmed !== 'skipped') return false;
    if (statusF === 'pending' && j.confirmed) return false;
    if (typeF && j.type !== typeF) return false;
    return true;
  }).sort((a,b) => {
    const da = (a.date||'') + (a.scheduledTime||'');
    const db = (b.date||'') + (b.scheduledTime||'');
    return da < db ? -1 : 1;
  });

  const tbody = document.getElementById('ciJobsTbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#888">No jobs found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(j => {
    const isCI  = j.type === 'checkin';
    const typeColor = isCI ? '#1a7a6e' : '#c0392b';
    const typeBg    = isCI ? '#e8f6f3' : '#fdebd0';
    const typeLabel = isCI ? '🔑 Check-in' : '🚪 Check-out';
    const infantFlag = (parseInt(j.infants)||0) > 0;
    const statusBadge = j.confirmed === 'done'
      ? '<span style="background:#d5f5e3;color:#1e8449;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">✅ Done</span>'
      : j.confirmed === 'skipped'
      ? '<span style="background:#fdebd0;color:#a04000;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">⏭ Skipped</span>'
      : '<span style="background:#fef9e7;color:#9a7d0a;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">🟡 Pending</span>';

    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${ciFormatDate(j.date)}</td>
      <td style="font-size:12px">${j.scheduledTime||'—'}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:6px;background:${typeBg};color:${typeColor}">${typeLabel}</span></td>
      <td style="font-size:12px">
        ${j.propertyName||'—'}
      </td>
      <td style="font-size:12px">
        ${j.guestName||'—'}${j.returningGuest?'  <span style="color:#c9a84c;font-size:10px">⭐ Returning</span>':''}
        ${infantFlag?'<span style="display:block;font-size:10px;color:#856404">🚼 Infant</span>':''}
      </td>
      <td style="text-align:center;font-size:12px">${j.guests||'—'}${j.adults?`<span style="font-size:10px;color:#888;display:block">${j.adults}A ${j.children||0}C ${j.infants||0}I</span>`:''}
      </td>
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
  const monthF  = document.getElementById('ciConfirmMonth')?.value || ciDateStr(new Date()).slice(0,7);
  const pendingOnly = document.getElementById('ciConfirmPendingOnly')?.checked !== false;

  let jobs = ciJobs.filter(j => {
    if (!(j.date||'').startsWith(monthF)) return false;
    if (pendingOnly && j.confirmed) return false;
    return true;
  }).sort((a,b) => ((a.date||'')+(a.scheduledTime||'99:99')) < ((b.date||'')+(b.scheduledTime||'99:99')) ? -1 : 1);

  const tbody = document.getElementById('ciConfirmTbody');
  if (!tbody) return;

  if (!jobs.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#888">
      ${pendingOnly ? 'No pending jobs — all confirmed! 🎉' : 'No jobs for this month'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = jobs.map(j => {
    const isCI  = j.type === 'checkin';
    const typeColor = isCI ? '#1a7a6e' : '#c0392b';
    const typeBg    = isCI ? '#e8f6f3' : '#fdebd0';
    const infantFlag = (parseInt(j.infants)||0) > 0;
    const isDone    = j.confirmed === 'done';
    const isSkipped = j.confirmed === 'skipped';

    return `<tr style="${isDone?'opacity:.6':''}">
      <td style="font-size:12px;white-space:nowrap">${ciFormatDate(j.date)}</td>
      <td style="font-size:12px">${j.scheduledTime||'—'}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:6px;background:${typeBg};color:${typeColor}">${isCI?'🔑 Check-in':'🚪 Check-out'}</span></td>
      <td style="font-size:12px">${j.propertyName||'—'}</td>
      <td style="font-size:12px">${j.guestName||'—'}${infantFlag?' 🚼':''}</td>
      <td style="font-size:12px">${getAgentName(j.agentId)}</td>
      <td>
        ${isDone
          ? `<span style="color:#1e8449;font-size:12px">✅ Done${j.actualDate && j.actualDate!==j.date?' ('+ciFormatDate(j.actualDate)+')':''}</span>
             <button onclick="unconfirmCIJob('${j.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#888;margin-left:6px">↩ Undo</button>`
          : isSkipped
          ? `<span style="color:#a04000;font-size:12px">⏭ Skipped</span>
             <button onclick="unconfirmCIJob('${j.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#888;margin-left:6px">↩ Undo</button>`
          : `<div style="display:flex;gap:4px;flex-wrap:wrap">
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
  const idx = ciJobs.findIndex(j => j.id === id);
  if (idx < 0) return;
  ciJobs[idx] = { ...ciJobs[idx], confirmed: 'done', actualDate: actualDate || ciJobs[idx].date };
  await saveCIData();
  renderCIAll();
  ciShowToast('✅ Marked as done', 'success');
}

async function markCISkipped(id) {
  const idx = ciJobs.findIndex(j => j.id === id);
  if (idx < 0) return;
  ciJobs[idx] = { ...ciJobs[idx], confirmed: 'skipped', actualDate: null };
  await saveCIData();
  renderCIAll();
  ciShowToast('⏭ Marked as skipped', '');
}

async function unconfirmCIJob(id) {
  const idx = ciJobs.findIndex(j => j.id === id);
  if (idx < 0) return;
  ciJobs[idx] = { ...ciJobs[idx], confirmed: null, actualDate: null };
  await saveCIData();
  renderCIAll();
  ciShowToast('↩ Reverted to pending', '');
}

function openCIDatePicker(id) {
  document.getElementById('ciActualDateInput').value = '';
  document.getElementById('ciActualDateJobId').value = id;
  ciOpenModal('ciDatePickerModal');
}

async function confirmCIActualDate() {
  const id = document.getElementById('ciActualDateJobId').value;
  const date = document.getElementById('ciActualDateInput').value;
  if (!date) { ciShowToast('Please select a date', 'error'); return; }
  await markCIDone(id, date);
  ciCloseModal('ciDatePickerModal');
}

// ═══════════════════════════════════════════════════════════════
// AGENTS TAB
// ═══════════════════════════════════════════════════════════════
function renderCIAgents() {
  const agents = getCIAgents();
  const container = document.getElementById('ciAgentsGrid');
  if (!container) return;

  if (!agents.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#888">
      No check-in agents found.<br>
      <small>Go to Cleaning → Staff tab → add a staff member with role "Check-in Agent" or "Both".</small>
    </div>`;
    return;
  }

  const COLORS = ['#1a7a6e','#c9a84c','#e67e22','#8e44ad','#2471a3','#1e8449','#c0392b'];
  container.innerHTML = agents.map((a, i) => {
    const initials = (a.firstName?.[0]||'')+(a.lastName?.[0]||'');
    const color = COLORS[i % COLORS.length];
    const zones = (a.zones||[]).join(' · ') || '—';
    const thisMonth = ciDateStr(new Date()).slice(0,7);
    const myJobs = ciJobs.filter(j => j.agentId === a.id && (j.date||'').startsWith(thisMonth));
    const done   = myJobs.filter(j => j.confirmed === 'done').length;

    return `<div class="ci-agent-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:44px;height:44px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px">${initials}</div>
        <div>
          <div style="font-weight:600;font-size:14px">${a.firstName} ${a.lastName}</div>
          <div style="font-size:11px;color:#888">${a.phone||''}</div>
        </div>
        <span style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:8px;background:${a.status==='Active'?'#d5f5e3':'#fdebd0'};color:${a.status==='Active'?'#1e8449':'#a04000'}">${a.status||'Active'}</span>
      </div>
      <div style="font-size:12px;margin-bottom:4px">📍 <strong>Areas:</strong> ${zones}</div>
      <div style="font-size:12px;margin-bottom:4px">💶 <strong>Fee/visit:</strong> ${a.checkInFee ? eur(a.checkInFee) : '—'}</div>
      <div style="font-size:12px;color:#888">This month: <strong>${myJobs.length} jobs</strong> · <strong>${done} done</strong></div>
    </div>`;
  }).join('');
}

function populateCIAgentDropdowns() {
  const agents = getCIAgents();
  const opts = '<option value="">All Agents</option>' +
    agents.map(a => `<option value="${a.id}">${a.firstName} ${a.lastName}</option>`).join('');
  const jobOpts = '<option value="">Unassigned</option>' +
    agents.map(a => `<option value="${a.id}">${a.firstName} ${a.lastName}</option>`).join('');

  ['ciJobAgent'].forEach(id => {
    const el = document.getElementById(id); if(el) el.innerHTML = opts;
  });
  const editSel = document.getElementById('ciEditAgent');
  if (editSel) editSel.innerHTML = jobOpts;
}

// ═══════════════════════════════════════════════════════════════
// EDIT JOB MODAL
// ═══════════════════════════════════════════════════════════════
function editCIJob(id) {
  const j = ciJobs.find(x => x.id === id);
  if (!j) return;

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
  const agentSel = document.getElementById('ciEditAgent');
  if (agentSel) agentSel.value = j.agentId||'';

  ciOpenModal('ciEditModal');
}

async function saveCIJob() {
  const id = document.getElementById('ciEditId').value;
  if (!id) return;
  const idx = ciJobs.findIndex(j => j.id === id);
  if (idx < 0) return;

  const infants = parseInt(document.getElementById('ciEditInfants').value)||0;

  ciJobs[idx] = {
    ...ciJobs[idx],
    date:           document.getElementById('ciEditDate').value,
    scheduledTime:  document.getElementById('ciEditTime').value,
    type:           document.getElementById('ciEditType').value,
    propertyName:   document.getElementById('ciEditProp').value.trim(),
    guestName:      document.getElementById('ciEditGuest').value.trim(),
    guests:         parseInt(document.getElementById('ciEditGuests').value)||null,
    adults:         parseInt(document.getElementById('ciEditAdults').value)||null,
    children:       parseInt(document.getElementById('ciEditChildren').value)||null,
    infants,
    babyCot:        document.getElementById('ciEditBabyCot').checked || infants > 0,
    returningGuest: document.getElementById('ciEditReturning').checked,
    agentId:        document.getElementById('ciEditAgent').value,
    moneyToReceive: parseFloat(document.getElementById('ciEditMoney').value)||0,
    specialRequests:document.getElementById('ciEditRequests').value.trim(),
    notes:          document.getElementById('ciEditNotes').value.trim(),
  };

  await saveCIData();
  ciCloseModal('ciEditModal');
  renderCIAll();
  ciShowToast('✓ Job saved', 'success');
}

async function deleteCIJob(id) {
  const j = ciJobs.find(x => x.id === id);
  if (!j) return;
  ciShowConfirm('🗑️', 'Delete Job?',
    `Delete ${j.type === 'checkin' ? 'check-in' : 'check-out'} job for ${j.propertyName} on ${ciFormatDate(j.date)}?`,
    'ci-btn-danger', 'Delete', async () => {
      ciJobs = ciJobs.filter(x => x.id !== id);
      const r = await SyncStore.deleteOne('zesty_checkin_jobs', 'checkin_jobs', id, ciJobs);
      if (!r.ok) { ciJobs = (await SyncStore.load('zesty_checkin_jobs','checkin_jobs')).data; }
      renderCIAll();
      ciShowToast('Deleted', 'error');
    }
  );
}

// ═══════════════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════════════
function ciDragOver(e)  { e.preventDefault(); document.getElementById('ciDropZone').classList.add('ci-dragover'); }
function ciDragLeave()  { document.getElementById('ciDropZone').classList.remove('ci-dragover'); }
function ciDropFile(e)  { e.preventDefault(); ciDragLeave(); const f=e.dataTransfer.files[0]; if(f) processCICSV(f); }
function handleCIFile(e){ const f=e.target.files[0]; if(f) processCICSV(f); }

function parseCICSVLine(line) {
  const result=[]; let current=''; let inQuotes=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){if(inQuotes&&line[i+1]==='"'){current+='"';i++;}else inQuotes=!inQuotes;}
    else if(line[i]===','&&!inQuotes){result.push(current);current='';}
    else current+=line[i];
  }
  result.push(current);
  return result;
}

function processCICSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    const headers = parseCICSVLine(lines[0]);
    const rows = lines.slice(1).map(l => {
      const vals = parseCICSVLine(l);
      const obj = {};
      headers.forEach((h,i) => obj[h.trim()] = (vals[i]||'').trim());
      return obj;
    }).filter(r => r.Id && r.DateArrival && r.DateDeparture);

    ciImportPreviewData = rows;
    showCIImportResults(file.name, rows);
  };
  reader.readAsText(file, 'utf-8');
}

function showCIImportResults(filename, rows) {
  const booked   = rows.filter(r => r.Status === 'Booked').length;
  const eligible = rows.filter(r => r.Status === 'Booked' && ciPropertyHasCheckin(r.House_Id||r.HouseName)).length;
  const existingIds = new Set(ciJobs.map(j => j.bookingId).filter(Boolean));
  const newOnes  = rows.filter(r => r.Status === 'Booked' && !existingIds.has(r.Id) && ciPropertyHasCheckin(r.House_Id||r.HouseName)).length;

  const sum = document.getElementById('ciImportSummary');
  if (sum) sum.innerHTML = `
    <div class="ci-import-stat"><div class="num">${rows.length}</div><div class="lbl">Total Rows</div></div>
    <div class="ci-import-stat"><div class="num" style="color:var(--success)">${booked}</div><div class="lbl">Booked</div></div>
    <div class="ci-import-stat"><div class="num" style="color:#1a7a6e">${eligible}</div><div class="lbl">With Check-in Service</div></div>
    <div class="ci-import-stat"><div class="num" style="color:#e67e22">${newOnes}</div><div class="lbl">New (to import)</div></div>`;

  const res = document.getElementById('ciImportResults');
  if (res) res.style.display = 'block';
  renderCIImportPreview();
}

function renderCIImportPreview() {
  const rows = ciImportPreviewData.filter(r => r.Status === 'Booked');
  const existingIds = new Set(ciJobs.map(j => j.bookingId).filter(Boolean));
  const tbody = document.getElementById('ciImportPreview');
  if (!tbody) return;

  tbody.innerHTML = rows.slice(0,100).map(r => {
    const hasSvc = ciPropertyHasCheckin(r.House_Id||r.HouseName);
    const alreadyIn = existingIds.has(r.Id);
    const infants = parseInt(r.Infants||0)||0;
    const returning = isReturningGuest(r.Name, r.Id);
    return `<tr style="${alreadyIn?'opacity:.5':''}">
      <td style="font-size:12px">${r.Name||'—'}</td>
      <td style="font-size:12px">${r.HouseInternalName||r.HouseName||'—'}</td>
      <td style="font-size:12px">${r.DateArrival||'—'}</td>
      <td style="font-size:12px">${r.DateDeparture||'—'}</td>
      <td style="text-align:center">${r.People||r.Guests||'—'}</td>
      <td style="text-align:center">${infants>0?'🚼 '+infants:'—'}</td>
      <td>${hasSvc?'<span style="color:#1a7a6e">✅ Yes</span>':'<span style="color:#888">✗ No</span>'}</td>
      <td>${returning?'<span style="color:#c9a84c">⭐ Yes</span>':'—'}</td>
      <td>${alreadyIn?'<span style="font-size:10px;background:#ecf0f1;padding:1px 5px;border-radius:8px;color:#7f8c8d">in DB</span>':''}</td>
    </tr>`;
  }).join('');
}

async function importCIJobs() {
  const rows = ciImportPreviewData.filter(r => r.Status === 'Booked');
  if (!rows.length) { ciShowToast('No rows to import', 'error'); return; }

  const existingIds = new Set(ciJobs.map(j => j.bookingId).filter(Boolean));
  let created = 0, updated = 0, skipped = 0;

  for (const r of rows) {
    const propName = r.HouseInternalName || r.HouseName || '';
    const propId   = r.House_Id || '';
    if (!ciPropertyHasCheckin(propId || propName)) { skipped++; continue; }

    const guestName  = r.Name || '';
    const guests     = parseInt(r.People||r.Guests||0)||null;
    const adults     = parseInt(r.Adults||0)||null;
    const children   = parseInt(r.Children||0)||null;
    const infants    = parseInt(r.Infants||0)||null;
    const returning  = isReturningGuest(guestName, r.Id);
    const babyCot    = (infants||0) > 0;
    const agentId    = autoAssignAgent(propName);

    const base = { bookingId:r.Id, propertyName:propName, propertyId:propId,
      guestName, guests, adults, children, infants, babyCot, returningGuest:returning,
      agentId, scheduledTime:'', moneyToReceive:0, specialRequests:'', notes:'',
      confirmed:null, actualDate:null };

    // Check-in job (arrival)
    const ciId = `ci_${r.Id}_checkin`;
    const ciExisting = ciJobs.findIndex(j => j.id === ciId);
    const ciJob = { ...base, id: ciId, type: 'checkin', date: r.DateArrival };
    if (ciExisting >= 0) {
      const ex = ciJobs[ciExisting];
      ciJobs[ciExisting] = { ...ex, ...ciJob, agentId: ex.agentId||agentId,
        scheduledTime: ex.scheduledTime||'', moneyToReceive: ex.moneyToReceive||0,
        specialRequests: ex.specialRequests||'', notes: ex.notes||'',
        confirmed: ex.confirmed, actualDate: ex.actualDate };
      updated++;
    } else {
      ciJobs.push(ciJob); created++;
    }

    // Check-out job (departure)
    const coId = `ci_${r.Id}_checkout`;
    const coExisting = ciJobs.findIndex(j => j.id === coId);
    const coJob = { ...base, id: coId, type: 'checkout', date: r.DateDeparture };
    if (coExisting >= 0) {
      const ex = ciJobs[coExisting];
      ciJobs[coExisting] = { ...ex, ...coJob, agentId: ex.agentId||agentId,
        scheduledTime: ex.scheduledTime||'', moneyToReceive: ex.moneyToReceive||0,
        specialRequests: ex.specialRequests||'', notes: ex.notes||'',
        confirmed: ex.confirmed, actualDate: ex.actualDate };
      updated++;
    } else {
      ciJobs.push(coJob); created++;
    }
  }

  await saveCIData();
  clearCIImport();
  renderCIAll();
  ciShowToast(`✓ Created ${created} · Updated ${updated} · Skipped ${skipped}`, 'success');
}

function clearCIImport() {
  ciImportPreviewData = [];
  const res = document.getElementById('ciImportResults');
  if (res) res.style.display = 'none';
  const inp = document.getElementById('ciFileInput');
  if (inp) inp.value = '';
}

// ═══════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════
async function saveCIData() {
  return await SyncStore.saveAll('zesty_checkin_jobs', 'checkin_jobs', ciJobs);
}

// ═══════════════════════════════════════════════════════════════
// PRINT — WEEKLY PLAN
// ═══════════════════════════════════════════════════════════════
function printCIWeekly() {
  if (!ciCurrentWeekStart) return;
  const monday = new Date(ciCurrentWeekStart);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    days.push(d);
  }
  const end = new Date(monday); end.setDate(end.getDate() + 6);
  const weekLabel = monday.toLocaleDateString('en-GB',{day:'numeric',month:'long'}) +
    ' – ' + end.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

  const agentGroups = {};
  for (const d of days) {
    const ds = ciDateStr(d);
    const dayJobs = ciJobs.filter(j => j.date === ds)
      .sort((a,b) => (a.scheduledTime||'99:99') < (b.scheduledTime||'99:99') ? -1 : 1);
    for (const j of dayJobs) {
      const agId = j.agentId || '_unassigned';
      if (!agentGroups[agId]) agentGroups[agId] = {};
      if (!agentGroups[agId][ds]) agentGroups[agId][ds] = [];
      agentGroups[agId][ds].push(j);
    }
  }

  let printHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Check-in Weekly Plan — ${weekLabel}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: 'DM Sans', sans-serif; font-size:12px; color:#1e2a28; background:#fff; padding:20px; }
    h1 { font-size:18px; margin-bottom:4px; color:#115950; }
    h2 { font-size:14px; margin:18px 0 8px; color:#1a7a6e; border-bottom:2px solid #1a7a6e; padding-bottom:4px; }
    h3 { font-size:12px; font-weight:700; color:#333; margin:10px 0 4px; }
    .week-label { color:#888; font-size:12px; margin-bottom:16px; }
    .agent-section { margin-bottom:24px; page-break-inside:avoid; }
    .day-block { margin-bottom:10px; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th { background:#115950; color:#fff; padding:5px 8px; text-align:left; font-size:10px; text-transform:uppercase; }
    td { padding:5px 8px; border-bottom:1px solid #e8eeec; vertical-align:top; }
    .badge-ci  { background:#e8f6f3; color:#1a7a6e; padding:1px 6px; border-radius:4px; font-weight:700; font-size:10px; }
    .badge-co  { background:#fdebd0; color:#c0392b; padding:1px 6px; border-radius:4px; font-weight:700; font-size:10px; }
    .alert     { color:#856404; font-weight:600; }
    .returning { color:#c9a84c; font-weight:600; }
    @media print { body { padding:10px; } }
  </style></head><body>
  <h1>🗝 Check-in Weekly Plan</h1>
  <div class="week-label">${weekLabel}</div>`;

  const agentIds = Object.keys(agentGroups);
  if (!agentIds.length) {
    printHtml += '<p style="color:#888">No jobs scheduled for this week.</p>';
  } else {
    for (const agId of agentIds) {
      const agName = agId === '_unassigned' ? '⚠ Unassigned' : getAgentName(agId);
      printHtml += `<div class="agent-section"><h2>👷 ${agName}</h2>`;

      for (const d of days) {
        const ds = ciDateStr(d);
        const dayJ = agentGroups[agId][ds];
        if (!dayJ || !dayJ.length) continue;
        const dayLabel = d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
        printHtml += `<div class="day-block"><h3>${dayLabel}</h3>
          <table><thead><tr>
            <th>Time</th><th>Type</th><th>Property</th>
            <th>Guest</th><th>Guests</th><th>Notes / Alerts</th><th>Collect</th>
          </tr></thead><tbody>`;

        for (const j of dayJ) {
          const infantFlag = (parseInt(j.infants)||0) > 0;
          const alerts = [
            infantFlag ? `<span class="alert">🚼 Baby cot / High chair</span>` : '',
            j.returningGuest ? `<span class="returning">⭐ Returning guest</span>` : '',
            j.specialRequests ? `📝 ${j.specialRequests}` : '',
            j.notes ? `💬 ${j.notes}` : '',
          ].filter(Boolean).join('<br>');

          printHtml += `<tr>
            <td>${j.scheduledTime||'—'}</td>
            <td><span class="${j.type==='checkin'?'badge-ci':'badge-co'}">${j.type==='checkin'?'CHECK-IN':'CHECK-OUT'}</span></td>
            <td><strong>${j.propertyName||'—'}</strong></td>
            <td>${j.guestName||'—'}</td>
            <td style="text-align:center">${j.guests||'—'}${j.adults?`<br><small>${j.adults}A ${j.children||0}C ${j.infants||0}I</small>`:''}</td>
            <td>${alerts||'—'}</td>
            <td>${j.moneyToReceive>0?eur(j.moneyToReceive):'—'}</td>
          </tr>`;
        }
        printHtml += '</tbody></table></div>';
      }
      printHtml += '</div>';
    }
  }

  printHtml += '</body></html>';
  const w = window.open('','_blank');
  w.document.write(printHtml);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ═══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════
function showCITab(name) {
  document.querySelectorAll('.ci-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ci-tab').forEach(t => t.classList.remove('active'));
  const page = document.getElementById('ci-page-' + name);
  if (page) page.classList.add('active');
  const tab = document.querySelector(`.ci-tab[data-tab="${name}"]`);
  if (tab) tab.classList.add('active');
  if (name === 'agents') renderCIAgents();
  if (name === 'confirm') renderCIConfirm();
}
