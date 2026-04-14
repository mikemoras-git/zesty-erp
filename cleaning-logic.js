/* CLEANING-LOGIC v2025-FINAL - 102859 bytes */
// ============ DATA ============
let staff = [];
let cleaningJobs = [];
let importHistory = [];
let importPreviewData = [];
let currentCalMonth;
let jobPage = 1;
const JOB_PAGE_SIZE = 20;
let jobSortDir = -1;
let confirmCb = null;

// Cleaner colors
const COLORS = ['#1a7a6e','#c9a84c','#e67e22','#8e44ad','#2471a3','#1e8449','#c0392b','#2c3e50'];


// ── UI helpers (cleaning module — no erp-base.js) ──────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  // Never lock body scroll
  document.body.style.overflow = '';
}
document.addEventListener('click', function(e) {
  if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
    closeModal(e.target.id);
  }
});

function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3500);
}

function showConfirm(icon, title, msg, btnClass, btnLabel, onConfirm) {
  const overlay = document.getElementById('confirmOverlay');
  if (!overlay) { if (confirm(title + '\n' + msg)) onConfirm(); return; }
  overlay.querySelector('#confirmTitle') && (overlay.querySelector('#confirmTitle').textContent = title);
  overlay.querySelector('#confirmMsg')   && (overlay.querySelector('#confirmMsg').textContent = msg);
  const btn = overlay.querySelector('#confirmOkBtn');
  if (btn) { btn.textContent = btnLabel; btn.className = 'btn ' + (btnClass||'btn-primary'); btn.onclick = () => { closeModal('confirmOverlay'); onConfirm(); }; }
  openModal('confirmOverlay');
}

function showDbStatus(online) {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  el.textContent = online ? '● Connected' : '○ Offline';
  el.style.color = online ? 'var(--success, #27ae60)' : '#e74c3c';
}


function getColor(idx) { return COLORS[idx % COLORS.length]; }

function getInitials(f, l) {
  return ((f||'')[0]||'') + ((l||'')[0]||'');
}

// ============ INIT ============
function updateCleanImportStatus() {
  const el = document.getElementById('cleanLastImport');
  if (!el) return;
  try {
    const last = JSON.parse(localStorage.getItem('zesty_last_clean_import') || 'null');
    if (!last) { el.textContent = ''; return; }
    const d = new Date(last.date);
    el.innerHTML = `\u2713 Last import: \u003Cstrong\u003E${last.filename}\u003C/strong\u003E on ${d.toLocaleDateString('el-GR')} \u00B7 ${last.jobs} jobs created`;
  } catch { el.textContent = ''; }
}

async function init() {
  // Clear stale localStorage from old key names
  if (!localStorage.getItem('zesty_clean_v2')) {
    localStorage.removeItem('zesty_cleaning_staff');
    localStorage.setItem('zesty_clean_v2', '1');
  }

  // Show cache instantly
  const _s = SyncStore._getLocal('zesty_staff');
  const _j = SyncStore._getLocal('zesty_cleaning_jobs');
  const _h = JSON.parse(localStorage.getItem('zesty_import_history') || '[]');
  if (_s.length) staff = _s;
  if (_j.length) cleaningJobs = _j;
  if (_h.length) importHistory = _h;

  const now = new Date();
  currentCalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('calMonth').value = formatMonthValue(currentCalMonth);
  document.getElementById('jobMonth').value = formatMonthValue(currentCalMonth);

  renderStaff(); renderCalendar(); renderJobs(); renderImportHistory();
  updateStaffDropdowns(); updateStaffStats(); updateJobStats();
  updateCleanImportStatus();
  const ol = document.getElementById('loadingOverlay');
  if (ol) { ol.style.opacity='0'; ol.style.transition='opacity 0.3s'; setTimeout(()=>ol.remove(),300); }

  // Load from Supabase
  await syncCleaningData();
  showDbStatus(true);
  
  // After loading: show current month. If empty, jump to NEXT upcoming month with jobs.
  const _curMonth = formatMonthValue(currentCalMonth);
  const _hasJobsThisMonth = cleaningJobs.some(j => j.date && j.date.startsWith(_curMonth));
  if (!_hasJobsThisMonth && cleaningJobs.length > 0) {
    const _months = [...new Set(cleaningJobs.map(j => j.date?.substring(0,7)).filter(Boolean))].sort();
    // Find closest upcoming month (>= current), not the latest
    const _nextMonth = _months.find(m => m >= _curMonth) || _months[0];
    if (_nextMonth && _nextMonth !== _curMonth) {
      const [_yr, _mo] = _nextMonth.split('-');
      currentCalMonth = new Date(parseInt(_yr), parseInt(_mo)-1, 1);
      document.getElementById('calMonth').value = _nextMonth;
      document.getElementById('jobMonth').value = _nextMonth;
      // Sync hours tab to same month as calendar
      const hoursEl = document.getElementById('hoursMonth');
      if (hoursEl) hoursEl.value = _nextMonth;
      renderCalendar(); renderJobs();
    }
  } else {
    // Current month has jobs - sync hours tab to current month too
    const hoursEl = document.getElementById('hoursMonth');
    if (hoursEl && !hoursEl.value) hoursEl.value = _curMonth;
  }

  // 30-second poll for all cleaning data
  startPoll('cleaning_jobs', 'zesty_cleaning_jobs', 30000, (rows) => {
    cleaningJobs = rows;
    renderCalendar(); renderJobs(); updateJobStats();
  });
  startPoll('cleaning_staff', 'zesty_staff', 30000, (rows) => {
    staff = rows;
    renderStaff(); updateStaffDropdowns(); updateStaffStats();
  });

  // Refresh property list from Supabase so new properties show in dropdowns
  try {
    const freshProps = await SyncStore.load('zesty_properties', 'properties');
    if (freshProps.data && freshProps.data.length > 0) {
      window._propCache = freshProps.data;
      localStorage.setItem('zesty_properties', JSON.stringify(freshProps.data));
    }
  } catch(e) { /* keep localStorage cache */ }
  checkAutoImport();
}

async function syncCleaningData() {
  const bar = document.getElementById('syncBar');
  if (bar) { bar.textContent = 'Syncing...'; bar.style.display = 'block'; }
  try {
    const [rs, rj] = await Promise.all([
      SyncStore.load('zesty_staff', 'cleaning_staff'),
      SyncStore.load('zesty_cleaning_jobs', 'cleaning_jobs'),
    ]);
    // Fallback: try 'staff' table if cleaning_staff is empty
    if (!rs.fromCache && (!rs.data || rs.data.length === 0)) {
      const rsFallback = await SyncStore.load('zesty_staff', 'staff');
      if (!rsFallback.fromCache && rsFallback.data && rsFallback.data.length > 0) {
        rs.data = rsFallback.data;
        rs.fromCache = false;
      }
    }
    // Import history from localStorage only
    const _ih = JSON.parse(localStorage.getItem('zesty_import_history') || '[]');
    if (_ih.length) importHistory = _ih;
    // API returns {data, fromCache}
    let changed = false;
    // Only update if Supabase returned actual data (not just empty from failed request)
    if (!rs.fromCache && rs.data && rs.data.length > 0) { staff = rs.data; changed = true; }
    else if (!rs.fromCache && rs.data && rs.data.length === 0 && staff.length === 0) { staff = []; }
    if (!rj.fromCache && rj.data) { cleaningJobs = rj.data; changed = true; }
    if (changed) {
      renderStaff(); renderCalendar(); renderJobs(); renderImportHistory();
      updateStaffDropdowns(); updateStaffStats(); updateJobStats();
    }
    if (bar) bar.textContent = rs.online ? 'Synced' : 'Offline - using cache';
  } catch(e) {
    if (bar) bar.textContent = 'Sync error';
  }
  if (bar) setTimeout(() => { bar.style.display = 'none'; }, 3000);
  checkAutoImport();
}

function checkAutoImport() {
  try {
    const rawCSV = JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv') || 'null');
    if (!rawCSV || !rawCSV.text) return;

    const lastImport = JSON.parse(localStorage.getItem('zesty_last_clean_import') || 'null');
    const csvDate = new Date(rawCSV.savedAt);
    const lastDate = lastImport ? new Date(lastImport.date) : new Date(0);
    if (csvDate <= lastDate) return; // No newer data

    // Parse the CSV (same logic as processCSV)
    const lines = rawCSV.text.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(l => {
      const vals = parseCSVLine(l);
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = (vals[i]||'').trim());
      return obj;
    }).filter(r => r.Id && r.DateArrival && r.DateDeparture);

    if (!rows.length) return;

    // Pre-load into importPreviewData so confirmImport works immediately
    importPreviewData = rows;
    const activeRows = rows.filter(r => r.Status === 'Booked'); // Only confirmed bookings

    const banner = document.getElementById('autoImportBanner');
    const msg = document.getElementById('autoImportBannerMsg');
    if (!banner) return;
    const d = new Date(rawCSV.savedAt);
    const dateStr = d.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
    const timeStr = d.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    msg.textContent = `${rawCSV.filename} \u00B7 ${dateStr} ${timeStr} \u00B7 ${activeRows.length} active bookings`;
    banner.style.display = 'flex';
  } catch(e) { console.warn('checkAutoImport error:', e); }
}

function dismissAutoImport() {
  const banner = document.getElementById('autoImportBanner');
  if (banner) banner.style.display = 'none';
  const rawCSV = JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv') || 'null');
  if (rawCSV) {
    // Mark dismissed so it won't show again for this CSV
    localStorage.setItem('zesty_last_clean_import', JSON.stringify({
      date: rawCSV.savedAt, filename: rawCSV.filename, dismissed: true, bookings: 0, jobs: 0, updated: 0
    }));
  }
}

async function runAutoImport() {
  const banner = document.getElementById('autoImportBanner');
  if (banner) banner.style.display = 'none';

  // If we have pre-parsed data, use it directly
  if (importPreviewData && importPreviewData.length) {
    showPage('import');
    await new Promise(r => setTimeout(r, 150));
    const rawCSV = JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv') || 'null');
    showImportResults(rawCSV ? rawCSV.filename : 'Lodgify Import', importPreviewData);
    showToast(`\u{1F4CB} ${importPreviewData.filter(r=>r.Status==='Booked'||r.Status==='Open').length} bookings ready \u2014 review and confirm`, 'success');
    return;
  }

  // Otherwise check if there is a raw CSV saved in localStorage
  const rawCSV = JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv') || 'null');
  if (rawCSV && rawCSV.text) {
    const lines = rawCSV.text.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(l => {
      const vals = parseCSVLine(l);
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = (vals[i]||'').trim());
      return obj;
    }).filter(r => r.Id && r.DateArrival && r.DateDeparture);
    if (rows.length) {
      importPreviewData = rows;
      showPage('import');
      await new Promise(r => setTimeout(r, 150));
      showImportResults(rawCSV.filename || 'Lodgify Import', rows);
      showToast(`\u{1F4CB} ${rows.filter(r=>r.Status==='Booked'||r.Status==='Open').length} bookings ready \u2014 review and confirm`, 'success');
      return;
    }
  }

  // No data anywhere \u2014 go to import tab so user can upload
  showPage('import');
  showToast('Upload your Lodgify CSV file below to generate cleaning jobs', 'info');
}

async function save() {
  // Save staff and jobs to Supabase
  await SyncStore.saveAll('zesty_staff', 'cleaning_staff', staff);
  await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
  // Import history: localStorage only (no dedicated Supabase table needed)
  localStorage.setItem('zesty_import_history', JSON.stringify(importHistory));
}

function formatMonthValue(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function formatDate(d) {
  if (!d) return '\u2014';
  try { return new Date(d).toLocaleDateString('el-GR'); } catch { return d; }
}

// ============ NAVIGATION ============
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  // Mark active tab in sidebar
  document.querySelectorAll('.erp-tab-link').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(name));
  });
  if (event && event.target) event.target.classList.add('active');
  if (name === 'schedule') renderCalendar();
  if (name === 'jobs') renderJobs();
  if (name === 'hours') {
    const hm = document.getElementById('hoursMonth');
    const cm = document.getElementById('calMonth');
    if (hm && cm && !hm.value && cm.value) hm.value = cm.value;
    renderHoursSheet();
  }
}
// Alias so sidebar buttons work
function showTab(name) { showPage(name); }

// ============ STAFF ============
function renderStaff() {
  const search = document.getElementById('staffSearch').value.toLowerCase();
  const zoneFilter = document.getElementById('staffZoneFilter').value;
  const filtered = staff.filter(s => {
    const matchSearch = !search || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search) || (s.phone||'').includes(search);
    const matchZone = !zoneFilter || (s.zones||[]).includes(zoneFilter);
    return matchSearch && matchZone;
  });

  const tbody = document.getElementById('staffTable');
  if (filtered.length === 0) {
    tbody.innerHTML = `\u003Ctr\u003E\u003Ctd colspan="10"\u003E\u003Cdiv class="empty-state"\u003E\u003Cdiv class="empty-icon"\u003E\u{1F469}\u003C/div\u003E\u003Cp\u003ENo cleaning staff yet. Add your first cleaner.\u003C/p\u003E\u003C/div\u003E\u003C/td\u003E\u003C/tr\u003E`;
  } else {
    const makeRow = (s) => {
      const colorIdx = staff.indexOf(s);
      const zones = (s.zones||[]).map(z => `\u003Cspan class="zone-tag zone-${z.replace(' ','-')}"\u003E${z}\u003C/span\u003E`).join('');
      const statusBadge = `\u003Cspan class="badge badge-${s.status === 'Active' ? 'active' : 'inactive'}"\u003E${s.status||'Active'}\u003C/span\u003E`;
      const roleBadge = s.role === 'both' ? '<span style="background:#fdf6e3;color:#7d6608;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">BOTH</span>' : '';
      return `\u003Ctr\u003E
        \u003Ctd\u003E
          \u003Cdiv style="display:flex;align-items:center;gap:10px"\u003E
            \u003Cdiv class="cleaner-avatar" style="background:${getColor(colorIdx)}"\u003E${getInitials(s.firstName,s.lastName)}\u003C/div\u003E
            \u003Cdiv\u003E
              \u003Cdiv style="font-weight:500"\u003E${s.firstName} ${s.lastName} ${roleBadge}\u003C/div\u003E
              \u003Cdiv style="font-size:11px;color:var(--text-muted)"\u003E${s.email||''}\u003C/div\u003E
            \u003C/div\u003E
          \u003C/div\u003E
        \u003C/td\u003E
        \u003Ctd style="font-size:12px"\u003E${s.phone||'\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${zones||'\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${s.hourlyRate ? '\u20AC'+s.hourlyRate+'/hr' : '\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${s.transportCost ? '\u20AC'+s.transportCost : '\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${s.hasCar === 'Yes' ? '\u{1F697} Yes' : s.hasCar === 'No' ? '\u274C No' : '\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${s.drivingLicense === 'Yes' ? '\u2705' : s.drivingLicense === 'No' ? '\u274C' : '\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${s.insurance === 'Yes' ? `\u2705 ${s.insuranceExpiry ? '(exp: '+formatDate(s.insuranceExpiry)+')' : ''}` : s.insurance === 'No' ? '\u274C' : '\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${statusBadge}\u003C/td\u003E
        \u003Ctd\u003E
          \u003Cdiv style="display:flex;gap:5px"\u003E
            \u003Cbutton class="btn btn-teal btn-sm" onclick="editStaff('${s.id}')"\u003E\u270F\uFE0F\u003C/button\u003E
            \u003Cbutton class="btn btn-danger btn-sm" onclick="deleteStaff('${s.id}')"\u003E\u{1F5D1}\u003C/button\u003E
          \u003C/div\u003E
        \u003C/td\u003E
      \u003C/tr\u003E`;
    };
    
    // Show all active staff as cleaners (no agent role distinction)
    const cleaners = filtered;
    
    // Cleaners table
    const cleanerRows = cleaners.map(makeRow).join('');
    tbody.innerHTML = cleanerRows || `\u003Ctr\u003E\u003Ctd colspan="10" style="color:var(--text-muted);text-align:center;padding:20px"\u003ENo cleaners found.\u003C/td\u003E\u003C/tr\u003E`;
    
      }
  updateStaffStats();
}

function updateStaffStats() {
  document.getElementById('s-total').textContent = staff.length;
  document.getElementById('s-active').textContent = staff.filter(s => s.status !== 'Inactive').length;
  const now = new Date();
  const monthJobs = cleaningJobs.filter(j => {
    const d = new Date(j.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  document.getElementById('s-jobs').textContent = monthJobs.length;
  const pay = monthJobs.reduce((sum, j) => {
    if (!(j.cleanerIds||[]).length || !j.hours) return sum;
    return sum + (j.cleanerIds||[]).reduce((s2, cid) => {
      const cl = staff.find(s => s.id === cid);
      return s2 + (cl ? (cl.hourlyRate||0) * j.hours : 0);
    }, 0);
  }, 0);
  document.getElementById('s-pay').textContent = '\u20AC' + pay.toFixed(0);
}

function openAddStaff(defaultRole) {
  document.getElementById('staffModalTitle').textContent = 'Add Cleaner';
  const roleElNew = document.getElementById('s_role'); if(roleElNew) roleElNew.value = defaultRole || 'cleaner';
  document.getElementById('s_editId').value = '';
  clearStaffForm();
  // Re-set role after clearStaffForm resets it
  const roleElNew2 = document.getElementById('s_role'); if(roleElNew2) roleElNew2.value = defaultRole || 'cleaner';
  openModal('staffModal');
}

function editStaff(id) {
  const s = staff.find(x => x.id === id);
  if (!s) return;
  document.getElementById('staffModalTitle').textContent = 'Edit Cleaner';
  document.getElementById('s_editId').value = id;
  document.getElementById('s_firstName').value = s.firstName||'';
  document.getElementById('s_lastName').value = s.lastName||'';
  document.getElementById('s_status').value = s.status||'Active';

  document.getElementById('s_phone').value = s.phone||'';
  document.getElementById('s_email').value = s.email||'';
  document.getElementById('s_birthdate').value = s.birthdate||'';
  document.getElementById('s_address').value = s.address||'';
  document.getElementById('s_hourlyRate').value = s.hourlyRate||'';
  const crEl = document.getElementById('s_chargeRate'); if(crEl) crEl.value = s.chargeRate||'';
  document.getElementById('s_transportCost').value = s.transportCost||'';
  document.getElementById('s_hasCar').value = s.hasCar||'';
  document.getElementById('s_carDetails').value = s.carDetails||'';
  document.getElementById('s_drivingLicense').value = s.drivingLicense||'';
  document.getElementById('s_licenseNumber').value = s.licenseNumber||'';
  document.getElementById('s_insurance').value = s.insurance||'';
  document.getElementById('s_insuranceExpiry').value = s.insuranceExpiry||'';
  document.getElementById('s_iban').value = s.iban||'';
  document.getElementById('s_bank').value = s.bank||'';
  document.getElementById('s_beneficiary').value = s.beneficiary||'';
  document.getElementById('s_notes').value = s.notes||'';
  // Set zones
  document.querySelectorAll('.zone-check').forEach(el => {
    el.classList.toggle('selected', (s.zones||[]).includes(el.dataset.zone));
  });
  openModal('staffModal');
}

function clearStaffForm() {
  ['s_firstName','s_lastName','s_phone','s_email','s_birthdate','s_address','s_hourlyRate',
   's_transportCost','s_carDetails','s_licenseNumber','s_insuranceExpiry','s_iban','s_bank',
   's_beneficiary','s_notes'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.getElementById('s_status').value = 'Active';
  document.getElementById('s_hasCar').value = '';
  document.getElementById('s_drivingLicense').value = '';
  document.getElementById('s_insurance').value = '';
  document.querySelectorAll('.zone-check').forEach(el => el.classList.remove('selected'));
}

function toggleZone(el) { el.classList.toggle('selected'); }

async function saveStaff() {
  const firstName = document.getElementById('s_firstName').value.trim();
  const lastName = document.getElementById('s_lastName').value.trim();
  if (!firstName) { showToast('Please enter a first name.', 'error'); return; }
  const zones = [...document.querySelectorAll('.zone-check.selected')].map(el => el.dataset.zone);
  const data = {
    firstName, lastName,

    status: document.getElementById('s_status').value,
    phone: document.getElementById('s_phone').value.trim(),
    email: document.getElementById('s_email').value.trim(),
    birthdate: document.getElementById('s_birthdate').value,
    address: document.getElementById('s_address').value.trim(),
    zones,
    hourlyRate: parseFloat(document.getElementById('s_hourlyRate').value)||null,
    chargeRate: parseFloat(document.getElementById('s_chargeRate')?.value)||null,
    transportCost: parseFloat(document.getElementById('s_transportCost').value)||null,
    hasCar: document.getElementById('s_hasCar').value,
    carDetails: document.getElementById('s_carDetails').value.trim(),
    drivingLicense: document.getElementById('s_drivingLicense').value,
    licenseNumber: document.getElementById('s_licenseNumber').value.trim(),
    insurance: document.getElementById('s_insurance').value,
    insuranceExpiry: document.getElementById('s_insuranceExpiry').value,
    iban: document.getElementById('s_iban').value.trim(),
    bank: document.getElementById('s_bank').value.trim(),
    beneficiary: document.getElementById('s_beneficiary').value.trim(),
    notes: document.getElementById('s_notes').value.trim(),
  };

  const editId = document.getElementById('s_editId').value;
  if (editId) {
    const idx = staff.findIndex(s => s.id === editId);
    if (idx !== -1) { staff[idx] = {...staff[idx], ...data}; showToast('\u2713 Cleaner updated', 'success'); }
  } else {
    staff.push({ id: 'staff_' + Date.now(), ...data });
    showToast('\u2713 Cleaner added', 'success');
  }
  await save();
  closeModal('staffModal');
  renderStaff();
  updateStaffDropdowns();
}

async function deleteStaff(id) {
  const s = staff.find(x => x.id === id);
  showConfirm('\u{1F5D1}\uFE0F', 'Delete Cleaner?', `Delete ${s.firstName} ${s.lastName}? This cannot be undone.`, 'btn-danger', 'Delete', async () => {
    staff = staff.filter(x => x.id !== id);
    const dr1 = await SyncStore.deleteOne('zesty_staff','cleaning_staff',id,staff);
    if(!dr1.ok){ staff=(await SyncStore.load('zesty_staff','cleaning_staff')).data; }
    renderStaff(); updateStaffDropdowns();
    showToast('Deleted', 'error');
  });
}

function updateStaffDropdowns() {
  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  const opts = `\u003Coption value=""\u003EUnassigned\u003C/option\u003E` + activeStaff.map(s => `\u003Coption value="${s.id}"\u003E${s.firstName} ${s.lastName}\u003C/option\u003E`).join('');
  const filterOpts = `\u003Coption value=""\u003EAll Cleaners\u003C/option\u003E` + staff.map(s => `\u003Coption value="${s.id}"\u003E${s.firstName} ${s.lastName}\u003C/option\u003E`).join('');
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  set('j_cleaner', opts);
  set('calCleaner', filterOpts);
  set('jobCleaner', filterOpts);
}

// ============ IMPORT ============
function dragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('dragover'); }
function dragLeave(e) { document.getElementById('dropZone').classList.remove('dragover'); }
function dropFile(e) { e.preventDefault(); dragLeave(e); const file = e.dataTransfer.files[0]; if (file) processCSV(file); }
function handleFile(e) { const file = e.target.files[0]; if (file) processCSV(file); }

function processCSV(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(l => {
      const vals = parseCSVLine(l);
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = (vals[i]||'').trim());
      return obj;
    }).filter(r => r.Id && r.DateArrival && r.DateDeparture);

    importPreviewData = rows;
    showImportResults(file.name, rows);
  };
  reader.readAsText(file, 'utf-8');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

function showImportResults(filename, rows) {
  const booked = rows.filter(r => r.Status === 'Booked').length;
  const open = rows.filter(r => r.Status === 'Open').length;
  const declined = rows.filter(r => r.Status === 'Declined').length;
  const existingIds = new Set(cleaningJobs.map(j => j.bookingId));
  const newBooked = rows.filter(r => r.Status === 'Booked' && !existingIds.has(r.Id)).length;
  const alreadyImported = rows.filter(r => r.Status === 'Booked' && existingIds.has(r.Id)).length;

  document.getElementById('importSummary').innerHTML = `
    \u003Cdiv class="import-stat"\u003E\u003Cdiv class="num"\u003E${rows.length}\u003C/div\u003E\u003Cdiv class="lbl"\u003ETotal Rows\u003C/div\u003E\u003C/div\u003E
    \u003Cdiv class="import-stat"\u003E\u003Cdiv class="num" style="color:var(--success)"\u003E${booked}\u003C/div\u003E\u003Cdiv class="lbl"\u003EBooked\u003C/div\u003E\u003C/div\u003E
    \u003Cdiv class="import-stat"\u003E\u003Cdiv class="num" style="color:#27ae60"\u003E${newBooked}\u003C/div\u003E\u003Cdiv class="lbl"\u003ENew (to import)\u003C/div\u003E\u003C/div\u003E
    \u003Cdiv class="import-stat"\u003E\u003Cdiv class="num" style="color:#7f8c8d"\u003E${alreadyImported}\u003C/div\u003E\u003Cdiv class="lbl"\u003EAlready in DB\u003C/div\u003E\u003C/div\u003E
    \u003Cdiv class="import-stat"\u003E\u003Cdiv class="num" style="color:var(--danger)"\u003E${declined + open}\u003C/div\u003E\u003Cdiv class="lbl"\u003ESkipped (Declined/Open)\u003C/div\u003E\u003C/div\u003E
  `;

  // Populate property filter
  const props = [...new Set(rows.map(r => r.HouseInternalName || r.HouseName).filter(Boolean))].sort();
  document.getElementById('importPropFilter').innerHTML = `\u003Coption value=""\u003EAll Properties\u003C/option\u003E` + props.map(p => `\u003Coption value="${p}"\u003E${p}\u003C/option\u003E`).join('');

  document.getElementById('importResults').style.display = 'block';
  renderImportPreview();
}

function renderImportPreview() {
  const statusF = document.getElementById('importStatusFilter').value;
  const propF = document.getElementById('importPropFilter').value;

  const existingIds2 = new Set(cleaningJobs.map(j => j.bookingId));
  // Default to showing only Booked rows in the preview
  const filtered = importPreviewData.filter(r => {
    const matchStatus = statusF ? r.Status === statusF : r.Status === 'Booked';
    const matchProp = !propF || r.HouseInternalName === propF || r.HouseName === propF;
    return matchStatus && matchProp;
  });

  const tbody = document.getElementById('importPreview');
  tbody.innerHTML = filtered.slice(0, 100).map(r => {
    const nights = parseInt(r.Nights) || 0;
    const propId = r.House_Id || r.HouseName;
    const cleanType = getPropertyCleanType(propId);
    const hasCleaning = getPropertyHasCleaning(propId);
    const midDays = hasCleaning ? getCleanDays(cleanType, nights) : [];
    const alreadyIn = existingIds2.has(r.Id);
    const statusColor = r.Status === 'Booked' ? 'var(--success)' : r.Status === 'Declined' ? 'var(--danger)' : '#e67e22';
    const rowStyle = alreadyIn ? 'opacity:0.55;' : '';
    return `\u003Ctr style="${rowStyle}"\u003E
      \u003Ctd style="font-size:12px"\u003E${r.Name||'\u2014'}\u003C/td\u003E
      \u003Ctd style="font-size:12px"\u003E${r.HouseInternalName || r.HouseName || '\u2014'}\u003C/td\u003E
      \u003Ctd style="font-size:12px"\u003E${formatDate(r.DateArrival)}\u003C/td\u003E
      \u003Ctd style="font-size:12px"\u003E${formatDate(r.DateDeparture)}\u003C/td\u003E
      \u003Ctd style="text-align:center"\u003E${nights}\u003C/td\u003E
      \u003Ctd style="font-size:11px"\u003E${r.Source||'\u2014'}\u003C/td\u003E
      \u003Ctd\u003E\u003Cspan style="color:${statusColor};font-size:12px;font-weight:500"\u003E${r.Status}\u003C/span\u003E\u003C/td\u003E
      \u003Ctd style="font-size:11px;color:${hasCleaning ? 'var(--teal)' : 'var(--text-muted)'}"\u003E
        ${hasCleaning ? '\u{1F4C5} ' + formatDate(r.DateDeparture) : '\u26D4 No cleaning'}
      \u003C/td\u003E
      \u003Ctd style="font-size:11px;color:var(--text-muted)"\u003E
        ${!hasCleaning ? '\u2014' : midDays.length ? midDays.length + ' mid-stay' : '\u2014'}
        ${alreadyIn ? '<span style="font-size:10px;background:#ecf0f1;padding:1px 5px;border-radius:8px;color:#7f8c8d">already in DB</span>' : ''}
      \u003C/td\u003E
    \u003C/tr\u003E`;
  }).join('');
  if (filtered.length > 100) {
    tbody.innerHTML += `\u003Ctr\u003E\u003Ctd colspan="10" style="text-align:center;padding:12px;color:var(--text-muted);font-size:12px"\u003EShowing first 100 of ${filtered.length} rows\u003C/td\u003E\u003C/tr\u003E`;
  }
}

function getPropertyCleanType(houseIdOrName) {
  try {
    const p = _findProp(houseIdOrName) || _findPropByName(houseIdOrName);
    return p ? (p.cleanType || 'pattern') : 'pattern';
  } catch { return 'pattern'; }
}

function getCleanDays(type, nights) {
  if (!type || type === 'none' || type === 'other' || nights < 4) return [];
  const days = [];
  if (type === 'fourth') {
    for (let d = 4; d < nights; d += 4) days.push(d);
  } else {
    // pattern: alternating 3-4
    let d = 3; let step = 4;
    while (d < nights) { days.push(d); d += step; step = step === 4 ? 3 : 4; }
  }
  return days;
}

// ══ HOURS SHEET ════════════════════════════════════════════════════════════
function renderHoursSheet() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  if (!monthVal) {
    const cm = document.getElementById('calMonth')?.value;
    if (cm) { document.getElementById('hoursMonth').value = cm; renderHoursSheet(); }
    return;
  }
  const [yr, mo] = monthVal.split('-');
  const monthName = new Date(yr, parseInt(mo)-1, 1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const titleEl = document.getElementById('hoursTableTitle');
  if (titleEl) titleEl.textContent = 'Hours Sheet — ' + monthName;

  // Only cleaning jobs (checkout/midstay) for this month
  const monthJobs = cleaningJobs.filter(j =>
    j.date && j.date.startsWith(monthVal) &&
    (j.type === 'checkout' || j.type === 'midstay')
  ).sort((a,b) => (a.date||'') > (b.date||'') ? 1 : -1);

  // Active cleaners only (role=cleaner or both, or no role set)
  const activeStaff = staff.filter(s => s.status !== 'Inactive' &&
    (!s.role || s.role === 'cleaner' || s.role === 'both'));

  // Populate property filter
  const propFilter = document.getElementById('hoursPropFilter');
  if (propFilter) {
    const cur = propFilter.value;
    propFilter.innerHTML = '<option value="">All Properties</option>' +
      [...new Set(monthJobs.map(j=>j.propertyName).filter(Boolean))].sort()
        .map(p=>`\u003Coption value="${p}" ${p===cur?'selected':''}\u003E${p}\u003C/option\u003E`).join('');
  }
  const propF = propFilter?.value || '';
  const filteredJobs = propF ? monthJobs.filter(j=>j.propertyName===propF) : monthJobs;

  // Table header: Date | Property | Type | Guest | [cleaner cols] | Tot.Hrs | Tot.Pay | Notes
  const staffCols = activeStaff.map(s =>
    `\u003Cth style="min-width:80px;text-align:center"\u003E${s.firstName}\u003Cbr\u003E
     \u003Cspan style="font-size:10px;color:var(--text-muted)"\u003E€${s.hourlyRate||0}/h\u003C/span\u003E\u003C/th\u003E`
  ).join('');

  const thead = document.getElementById('hoursHead');
  if (thead) thead.innerHTML = `\u003Ctr\u003E
    \u003Cth style="width:90px"\u003EDate\u003C/th\u003E
    \u003Cth\u003EProperty\u003C/th\u003E
    \u003Cth style="width:80px"\u003EType\u003C/th\u003E
    \u003Cth style="width:130px"\u003EGuest\u003C/th\u003E
    ${staffCols}
    \u003Cth style="text-align:right;width:70px"\u003EHrs\u003C/th\u003E
    \u003Cth style="text-align:right;width:80px"\u003EPay\u003C/th\u003E
    \u003Cth style="text-align:right;width:80px"\u003ECharge\u003C/th\u003E
    \u003Cth style="width:90px"\u003ENotes\u003C/th\u003E
    \u003Cth style="width:40px"\u003E\u003C/th\u003E
  \u003C/tr\u003E`;

  let totalHours=0, totalPay=0, totalCharge=0;
  const staffTotals = {};
  activeStaff.forEach(s => staffTotals[s.id] = {hours:0, pay:0});

  const rows = filteredJobs.map((j) => {
    const assignedIds = j.cleanerIds || [];
    let rowHours=0, rowPay=0;

    const staffCells = activeStaff.map(s => {
      const savedHrs = j.cleanerHours?.[s.id];
      const hrs = savedHrs !== undefined ? savedHrs :
                  (assignedIds.includes(s.id) && j.hours ? j.hours : '');
      const hrsNum = parseFloat(hrs) || 0;
      const pay = hrsNum * (parseFloat(s.hourlyRate)||0);
      if (hrsNum > 0) {
        rowHours += hrsNum; rowPay += pay;
        staffTotals[s.id].hours += hrsNum; staffTotals[s.id].pay += pay;
      }
      return `\u003Ctd style="text-align:center;padding:4px"\u003E
        \u003Cinput type="number" min="0" max="24" step="0.5" value="${hrs}"
          data-jobid="${j.id}" data-staffid="${s.id}"
          onchange="onHoursChange(this)"
          style="width:58px;padding:5px;border:1px solid var(--border);border-radius:6px;
                 text-align:center;font-size:13px;background:${hrsNum>0?'#e0f5f1':'#fff'}"\u003E
      \u003C/td\u003E`;
    }).join('');

    // Property charge from properties module
    const prop = (typeof properties !== 'undefined' ? properties : [])
      .find(p => (p.shortName||p.propertyName||'').toLowerCase().includes((j.propertyName||'').toLowerCase().split(' ')[0]));
    const rowCharge = parseFloat(prop?.cleaningFee||0);
    const margin = rowCharge - rowPay;

    totalHours += rowHours; totalPay += rowPay; totalCharge += rowCharge;

    const typeBadge = j.type==='checkout'
      ? `\u003Cspan style="background:#fdebd0;color:#a04000;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700"\u003ECHECKOUT\u003C/span\u003E`
      : `\u003Cspan style="background:#fdf6e3;color:#8e6b23;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700"\u003EMID-STAY\u003C/span\u003E`;
    const infants = j.infants>0 ? ` \u003Cspan style="background:#ffcccc;color:#c0392b;padding:0 4px;border-radius:5px;font-size:9px"\u003EINF\u003C/span\u003E` : '';

    return `\u003Ctr style="border-bottom:1px solid var(--border)"\u003E
      \u003Ctd style="font-size:12px;white-space:nowrap"\u003E${j.date||'—'}\u003C/td\u003E
      \u003Ctd style="font-size:12px"\u003E${j.propertyName||'—'}\u003C/td\u003E
      \u003Ctd\u003E${typeBadge}\u003C/td\u003E
      \u003Ctd style="font-size:11px;color:var(--text-muted)"\u003E${j.guestName||'—'}${infants}\u003C/td\u003E
      ${staffCells}
      \u003Ctd style="text-align:right;font-weight:700;color:var(--teal)"\u003E${rowHours>0?rowHours+'h':'—'}\u003C/td\u003E
      \u003Ctd style="text-align:right;font-size:12px;color:var(--danger)"\u003E${rowPay>0?'€'+rowPay.toFixed(0):'—'}\u003C/td\u003E
      \u003Ctd style="text-align:right;font-size:12px;font-weight:600;color:${margin>=0?'var(--teal-dark)':'var(--danger)'}"\u003E${rowCharge>0?'€'+rowCharge.toFixed(0):'—'}\u003C/td\u003E
      \u003Ctd style="font-size:11px;color:var(--text-muted)"\u003E${j.notes||''}\u003C/td\u003E
      \u003Ctd style="text-align:center;padding:4px"\u003E
        \u003Cbutton onclick="editManualHoursJob('${j.id}')" title="Edit" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 5px;border-radius:6px" onmouseenter="this.style.background='#f0f0f0'" onmouseleave="this.style.background='none'"\u003E✏️\u003C/button\u003E
      \u003C/td\u003E
    \u003C/tr\u003E`;
  }).join('');

  const tbody = document.getElementById('hoursBody');
  if (tbody) tbody.innerHTML = rows ||
    `\u003Ctr class="empty-row"\u003E\u003Ctd colspan="${4+activeStaff.length+5}"\u003ENo cleaning jobs for this period.\u003C/td\u003E\u003C/tr\u003E`;

  const staffFootCells = activeStaff.map(s => `\u003Ctd style="text-align:center;font-weight:700;color:var(--teal)"\u003E
    ${staffTotals[s.id].hours>0?staffTotals[s.id].hours+'h':'—'}\u003Cbr\u003E
    \u003Cspan style="font-size:11px"\u003E${staffTotals[s.id].pay>0?'€'+staffTotals[s.id].pay.toFixed(0):''}\u003C/span\u003E
  \u003C/td\u003E`).join('');
  const tfoot = document.getElementById('hoursFoot');
  if (tfoot) tfoot.innerHTML = `\u003Ctr style="background:var(--cream);font-weight:700"\u003E
    \u003Ctd colspan="4"\u003ETOTAL\u003C/td\u003E
    ${staffFootCells}
    \u003Ctd style="text-align:right"\u003E${totalHours}h\u003C/td\u003E
    \u003Ctd style="text-align:right;color:var(--danger)"\u003E€${totalPay.toFixed(0)}\u003C/td\u003E
    \u003Ctd style="text-align:right;color:var(--teal-dark)"\u003E€${totalCharge.toFixed(0)}\u003C/td\u003E
    \u003Ctd\u003E\u003C/td\u003E
  \u003C/tr\u003E`;

  const setEl=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('h-total', filteredJobs.length);
  setEl('h-hours', totalHours+'h');
  setEl('h-labour', '€'+totalPay.toFixed(0));
  setEl('h-charge', '€'+totalCharge.toFixed(0));
  setEl('h-margin', '€'+(totalCharge-totalPay).toFixed(0));
  window._currentHoursJobs = filteredJobs;
}

async function onHoursChange(input) {
  const jobId = input.dataset.jobid;
  const staffId = input.dataset.staffid;
  const hrs = parseFloat(input.value) || 0;
  const job = cleaningJobs.find(j => j.id === jobId);
  if (!job) return;
  if (!job.cleanerHours) job.cleanerHours = {};
  if (hrs === 0) delete job.cleanerHours[staffId];
  else job.cleanerHours[staffId] = hrs;
  input.style.background = hrs > 0 ? '#e0f5f1' : '#fff';
  clearTimeout(window._hoursSaveTimer);
  window._hoursSaveTimer = setTimeout(() => saveHoursSheet(), 1500);
}

async function saveHoursSheet() {
  const msg = document.getElementById('hoursSavedMsg');
  if (msg) msg.textContent = 'Saving…';
  await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
  if (msg) {
    msg.textContent = '✓ Saved ' + new Date().toLocaleTimeString('en-GB');
    setTimeout(()=>{ if(msg) msg.textContent=''; }, 3000);
  }
  showToast('✓ Hours saved', 'success');
}

function addManualHoursJob() {
  // Populate property dropdown
  const propSel = document.getElementById('mj-property');
  if (propSel) {
    const propList = (window._propCache || JSON.parse(localStorage.getItem('zesty_properties')||'[]'))
      .filter(p => !p.archived)
      .sort((a,b) => (a.shortName||a.propertyName||'').localeCompare(b.shortName||b.propertyName||''));
    propSel.innerHTML = '<option value="">— Select property —</option>' +
      propList.map(p => '<option value="' + (p.shortName||p.propertyName) + '">' + (p.shortName||p.propertyName) + '</option>').join('');
  }
  // Set default date to first of current hours month
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  const dateEl = document.getElementById('mj-date');
  if (dateEl) dateEl.value = monthVal ? monthVal + '-01' : new Date().toISOString().slice(0,10);
  // Reset fields
  document.getElementById('mj-type').value = 'checkout';
  document.getElementById('mj-guest').value = '';
  document.getElementById('mj-hours').value = '';
  document.getElementById('mj-notes').value = '';
  document.getElementById('mj-id').value = '';
  document.getElementById('mj-modal-title').textContent = 'Add Manual Job';
  openModal('manualJobModal');
}

function editManualHoursJob(id) {
  const j = cleaningJobs.find(x => x.id === id);
  if (!j) return;
  // Populate property dropdown
  const propSel = document.getElementById('mj-property');
  if (propSel) {
    const propList = (window._propCache || JSON.parse(localStorage.getItem('zesty_properties')||'[]'))
      .filter(p => !p.archived)
      .sort((a,b) => (a.shortName||a.propertyName||'').localeCompare(b.shortName||b.propertyName||''));
    propSel.innerHTML = '<option value="">— Select property —</option>' +
      propList.map(p => `\u003Coption value="${p.shortName||p.propertyName}"${(p.shortName||p.propertyName)===j.propertyName?' selected':''}\u003E${p.shortName||p.propertyName}\u003C/option\u003E`).join('');
  }
  document.getElementById('mj-id').value       = j.id;
  document.getElementById('mj-date').value     = j.date || '';
  document.getElementById('mj-type').value     = j.type || 'checkout';
  document.getElementById('mj-guest').value    = j.guestName || '';
  document.getElementById('mj-hours').value    = j.hours || '';
  document.getElementById('mj-notes').value    = j.notes || '';
  document.getElementById('mj-modal-title').textContent = 'Edit Job';
  openModal('manualJobModal');
}

async function saveManualJob() {
  const propName = document.getElementById('mj-property')?.value?.trim();
  const date     = document.getElementById('mj-date')?.value;
  if (!propName || !date) { showToast('Property and date are required', 'error'); return; }

  const existingId = document.getElementById('mj-id')?.value;
  const id = existingId || 'manual_' + Date.now();

  const prop = (window._propCache || JSON.parse(localStorage.getItem('zesty_properties')||'[]'))
    .find(p => (p.shortName||p.propertyName) === propName);

  const job = {
    id, date,
    type:              document.getElementById('mj-type')?.value || 'checkout',
    propertyName:      propName,
    propertyId:        prop?.id || '',
    propertyTransport: parseFloat(prop?.transport || 0),
    guestName:         document.getElementById('mj-guest')?.value || 'Manual entry',
    hours:             parseFloat(document.getElementById('mj-hours')?.value) || 0,
    notes:             document.getElementById('mj-notes')?.value || '',
    cleanerIds:        existingId ? (cleaningJobs.find(j=>j.id===existingId)?.cleanerIds || []) : [],
    cleanerHours:      existingId ? (cleaningJobs.find(j=>j.id===existingId)?.cleanerHours || {}) : {},
    source:            'manual',
  };

  const idx = cleaningJobs.findIndex(j => j.id === id);
  if (idx >= 0) cleaningJobs[idx] = {...cleaningJobs[idx], ...job};
  else cleaningJobs.push(job);

  await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
  closeModal('manualJobModal');
  renderHoursSheet();
  showToast('\u2713 Job saved', 'success');
}

async function deleteManualJob(id) {
  showConfirm('\uD83D\uDDD1', 'Delete Job?', 'Remove this manual job from the hours sheet?',
    'btn-danger', 'Delete', async () => {
      cleaningJobs = cleaningJobs.filter(j => j.id !== id);
      await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
      closeModal('manualJobModal');
      renderHoursSheet();
      showToast('Job removed', 'error');
    }
  );
}


async function confirmImport() {
  // Refresh property cache from Supabase before importing
  // This ensures new properties added since last visit are included
  try {
    const freshProps = await SyncStore.load('zesty_properties', 'properties');
    if (freshProps.data && freshProps.data.length > 0) {
      window._propCache = freshProps.data;
    }
  } catch(e) { /* use existing cache */ }
  
  const activeRows = importPreviewData.filter(r => r.Status === 'Booked');
  // Cancelled bookings that have existing jobs \u2014 remove them
  // All non-Booked statuses: Declined, Cancelled, Open enquiries - remove their jobs
  const cancelledIds = new Set(
    importPreviewData.filter(r => r.Status !== 'Booked')
      .map(r => r.Id)
  );
  const jobsToDelete = cleaningJobs.filter(j => j.bookingId && cancelledIds.has(j.bookingId));
  const existingBookingIds = new Set(cleaningJobs.map(j => j.bookingId));
  const newRows = activeRows.filter(r => !existingBookingIds.has(r.Id));
  const updateRows = activeRows.filter(r => existingBookingIds.has(r.Id));
  const cancelMsg = jobsToDelete.length > 0 ? ` ${jobsToDelete.length} cancelled jobs will be removed.` : '';
  showConfirm('\u{1F4E5}', 'Import Bookings?',
    `${newRows.length} new bookings will get cleaning jobs. ${updateRows.length} existing will be updated.${cancelMsg}`,
    'btn-primary', 'Import',
    async () => {
      let created = 0;
      let updated = 0;
      let deleted = 0;
      // Delete jobs for cancelled bookings (memory + Supabase)
      if (jobsToDelete.length > 0) {
        const delIds = new Set(jobsToDelete.map(j => j.id));
        cleaningJobs = cleaningJobs.filter(j => !delIds.has(j.id));
        deleted = jobsToDelete.length;
        for (const j of jobsToDelete) {
          await SyncStore.deleteOne('zesty_cleaning_jobs','cleaning_jobs',j.id,cleaningJobs);
        }
      }
      // Process all active rows: create for new, update for existing
      const allRows = [...newRows, ...updateRows];
      allRows.forEach(r => {
        const propName = r.HouseInternalName || r.HouseName;
        const propId = r.House_Id;
        // Item 3: ONLY import properties with cleaningFee > 0
        if (!getPropertyHasCleaning(propId || propName)) return;
        const nights = parseInt(r.Nights) || 0;
        const checkoutDate = r.DateDeparture;
        const bookingId = r.Id;
        const cleanType = getPropertyCleanType(propId || propName);
        const zone = getPropertyZone(propId || propName);

        // Checkout clean
        const checkoutJobId = `job_${bookingId}_checkout`;
        const existingCheckout = cleaningJobs.findIndex(j => j.id === checkoutJobId);
        const propTransport = getPropertyTransport(propId || propName);
        const propHasCleaning = getPropertyHasCleaning(propId || propName);
        if (!propHasCleaning) return; // Skip properties not managed for cleaning
        const checkoutJob = { id: checkoutJobId, bookingId, propertyName: propName, propertyId: propId, date: checkoutDate, type: 'checkout', nights, zone, cleanerIds: [], hours: null, propertyTransport: propTransport, notes: '', source: r.Source, guestName: r.Name, guests: parseInt(r.People||r.Guests||0)||null, adults: parseInt(r.Adults||0)||null, children: parseInt(r.Children||0)||null, infants: parseInt(r.Infants||0)||null };
        if (existingCheckout >= 0) {
          // Preserve manually assigned cleaners, hours, and notes \u2014 only update scheduling data
          const existing = cleaningJobs[existingCheckout];
          cleaningJobs[existingCheckout] = {
            ...existing,
            ...checkoutJob,
            cleanerIds: existing.cleanerIds?.length ? existing.cleanerIds : checkoutJob.cleanerIds,
            hours: existing.hours !== null ? existing.hours : checkoutJob.hours,
            notes: existing.notes || checkoutJob.notes,
          };
          updated++;
        }
        else { cleaningJobs.push(checkoutJob); created++; }

        // Mid-stay cleans
        const midDays = getCleanDays(cleanType, nights);
        midDays.forEach((day, idx) => {
          const cleanDate = new Date(r.DateArrival);
          cleanDate.setDate(cleanDate.getDate() + day);
          const midJobId = `job_${bookingId}_mid_${idx}`;
          const existing = cleaningJobs.findIndex(j => j.id === midJobId);
          const midJob = { id: midJobId, bookingId, propertyName: propName, propertyId: propId, date: cleanDate.toISOString().slice(0,10), type: 'midstay', nights, zone, cleanerIds: [], hours: null, propertyTransport: propTransport, notes: '', source: r.Source, guestName: r.Name, midStayDay: day, guests: parseInt(r.People||r.Guests||0)||null, adults: parseInt(r.Adults||0)||null, children: parseInt(r.Children||0)||null, infants: parseInt(r.Infants||0)||null };
          if (existing >= 0) {
            const existingMid = cleaningJobs[existing];
            cleaningJobs[existing] = {
              ...existingMid,
              ...midJob,
              cleanerIds: existingMid.cleanerIds?.length ? existingMid.cleanerIds : midJob.cleanerIds,
              hours: existingMid.hours !== null ? existingMid.hours : midJob.hours,
              notes: existingMid.notes || midJob.notes,
            };
            updated++;
          }
          else { cleaningJobs.push(midJob); created++; }
        });
      });

      // Add to history
      const _rawMeta = JSON.parse(localStorage.getItem('zesty_raw_lodgify_csv') || '{}');
      const importRec = { date: new Date().toISOString(), filename: (typeof file !== 'undefined' && file?.name) || _rawMeta.filename || 'Lodgify Import', bookings: activeRows.length, newBookings: newRows.length, jobs: created, updated };
      importHistory.unshift(importRec);
      localStorage.setItem('zesty_last_clean_import', JSON.stringify(importRec));
      updateCleanImportStatus();
      await save();
      
      renderCalendar();
      renderJobs();
      renderImportHistory();
      updateJobStats();
      clearImport();
      showToast(`\u2713 Created ${created} cleaning \u00B7 ${ciCreated} check-in jobs${deleted?' \u00B7 Removed '+deleted+' cancelled':''}`, 'success');
    }
  );
}

function getPropertyTransport(propIdOrName) {
  try {
    const p = _findProp(propIdOrName) || _findPropByName(propIdOrName);
    return p ? (parseFloat(p.transportCharge) || 0) : 0;
  } catch { return 0; }
}

// ── PROPERTY LOOKUP CACHE ──
// Loaded once per session from localStorage (populated by properties-db.html)
// Falls back to Supabase if localStorage is empty
window._propCache = null;
function _getProps() {
  if (window._propCache) return window._propCache;
  try {
    const raw = JSON.parse(localStorage.getItem('zesty_properties') || '[]');
    if (raw.length > 0) { window._propCache = raw; return raw; }
  } catch {}
  return [];
}
function _findProp(propIdOrName) {
  const props = _getProps();
  // Match by House_Id (string) = propertyId (number) OR by shortName/propertyName
  return props.find(p =>
    (p.propertyId && String(p.propertyId) === String(propIdOrName)) ||
    (p.shortName && p.shortName.toLowerCase() === String(propIdOrName).toLowerCase()) ||
    (p.propertyName && p.propertyName.toLowerCase() === String(propIdOrName).toLowerCase())
  ) || null;
}
// Also try matching CSV HouseInternalName to property shortName
function _findPropByName(csvName) {
  if (!csvName || csvName === 'N/A') return null;
  const props = _getProps();
  const nameLow = csvName.toLowerCase();
  // Exact shortName match first
  let p = props.find(p => p.shortName && p.shortName.toLowerCase() === nameLow);
  if (p) return p;
  // Try propertyId match via House_Id  
  p = props.find(p => p.propertyId && csvName === String(p.propertyId));
  if (p) return p;
  return null;
}

function getPropertyHasCleaning(propIdOrName) {
  try {
    const p = _findProp(propIdOrName) || _findPropByName(propIdOrName);
    if (!p) return false; // not in DB = skip
    // Clean if cleaningFee > 0
    return parseFloat(p.cleaningFee) > 0;
  } catch { return false; }
}

function getPropertyZone(propIdOrName) {
  try {
    const p = _findProp(propIdOrName) || _findPropByName(propIdOrName);
    return p ? (p.location || p.zone || '') : '';
  } catch { return ''; }
}

function clearImport() {
  importPreviewData = [];
  document.getElementById('importResults').style.display = 'none';
  document.getElementById('csvFile').value = '';
}

async function clearAllJobs() {
  showConfirm('\u{1F5D1}\uFE0F', 'Clear All Jobs?', 'This will permanently delete all cleaning jobs. This cannot be undone.', 'btn-danger', 'Delete All', async () => {
    cleaningJobs = [];
    importHistory = [];
    await save(); renderJobs(); renderCalendar(); renderImportHistory(); updateJobStats();
    showToast('All jobs cleared', 'error');
  });
}

function renderImportHistory() {
  const tbody = document.getElementById('importHistory');
  if (importHistory.length === 0) {
    tbody.innerHTML = `\u003Ctr\u003E\u003Ctd colspan="5"\u003E\u003Cdiv class="empty-state" style="padding:20px"\u003E\u003Cp\u003ENo imports yet.\u003C/p\u003E\u003C/div\u003E\u003C/td\u003E\u003C/tr\u003E`;
  } else {
    tbody.innerHTML = importHistory.map(h => `\u003Ctr\u003E
      \u003Ctd style="font-size:12px"\u003E${formatDate(h.date)}\u003C/td\u003E
      \u003Ctd style="font-size:12px"\u003E${h.filename}\u003C/td\u003E
      \u003Ctd style="text-align:center"\u003E${h.bookings}\u003C/td\u003E
      \u003Ctd style="text-align:center"\u003E${h.jobs}\u003C/td\u003E
      \u003Ctd\u003E\u003Cspan class="badge badge-active"\u003EImported\u003C/span\u003E\u003C/td\u003E
    \u003C/tr\u003E`).join('');
  }
}

// ============ CALENDAR ============
function changeMonth(dir) {
  currentCalMonth = new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth() + dir, 1);
  document.getElementById('calMonth').value = formatMonthValue(currentCalMonth);
  renderCalendar();
}

function renderCalendar() {
  const monthVal = document.getElementById('calMonth').value;
  if (monthVal) currentCalMonth = new Date(monthVal + '-01');
  const cleanerFilter = document.getElementById('calCleaner').value;
  const zoneFilter = document.getElementById('calZone').value;
  const typeFilter = document.getElementById('calJobType').value;

  const year = currentCalMonth.getFullYear();
  const month = currentCalMonth.getMonth();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calTitle').textContent = `${monthNames[month]} ${year}`;

  // Filter jobs
  const monthJobs = cleaningJobs.filter(j => {
    const d = new Date(j.date);
    const matchMonth = d.getFullYear() === year && d.getMonth() === month;
    const matchCleaner = !cleanerFilter || (j.cleanerIds||[]).includes(cleanerFilter);
    const matchZone = !zoneFilter || (j.zone||'').toLowerCase().includes(zoneFilter.toLowerCase());
    const matchType = !typeFilter || j.type === typeFilter;
    return matchMonth && matchCleaner && matchZone && matchType;
  });
  document.getElementById('calJobCount').textContent = `${monthJobs.length} jobs this month`;

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday-based: 0=Mon, 6=Sun
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const today = new Date();
  const calBody = document.getElementById('calBody');
  calBody.innerHTML = '';

  // Empty cells before first day
  for (let i = 0; i < startDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    calBody.appendChild(cell);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const cell = document.createElement('div');
    const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
    cell.className = 'cal-day' + (isToday ? ' today' : '');

    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dateEl = document.createElement('div');
    dateEl.className = 'cal-date' + (isToday ? ' is-today' : '');
    dateEl.textContent = d;
    cell.appendChild(dateEl);

    // Jobs for this day
    const dayJobs = monthJobs.filter(j => j.date === dateStr);
    dayJobs.forEach(j => {
      const assignedCleaners = (j.cleanerIds||[]).map(cid => staff.find(s => s.id === cid)).filter(Boolean);
      const cl = assignedCleaners[0] || null;
      const colorIdx = cl ? staff.indexOf(cl) : -1;
      const bg = cl ? getColor(colorIdx) : (j.type === 'checkout' ? '#c0392b' : '#e67e22');
      const jobEl = document.createElement('div');
      jobEl.className = 'cal-job';
      jobEl.style.background = bg + '20';
      jobEl.style.color = bg;
      jobEl.style.border = `1px solid ${bg}40`;
      const initials = assignedCleaners.map(c => getInitials(c.firstName,c.lastName)).join('+') || '?';
      jobEl.textContent = `${j.type === 'checkout' ? '\u{1F3C1}' : '\u{1F504}'} ${j.propertyName || 'Unknown'}`;
      jobEl.title = `${j.propertyName}\n${j.type === 'checkout' ? 'Checkout Clean' : 'Mid-Stay Clean'}\nCleaners: ${assignedCleaners.map(c=>c.firstName+' '+c.lastName).join(', ') || 'Unassigned'}`;
      jobEl.onclick = () => openJobModal(j.id);
      cell.appendChild(jobEl);
    });
    calBody.appendChild(cell);
  }

  // Legend
  const legend = document.getElementById('calLegend');
  const activeCleaners = staff.filter(s => s.status !== 'Inactive');
  legend.innerHTML = [
    `\u003Cdiv style="display:flex;align-items:center;gap:5px;font-size:12px"\u003E\u003Cspan style="width:12px;height:12px;border-radius:3px;background:#c0392b;display:inline-block"\u003E\u003C/span\u003E Checkout (unassigned)\u003C/div\u003E`,
    `\u003Cdiv style="display:flex;align-items:center;gap:5px;font-size:12px"\u003E\u003Cspan style="width:12px;height:12px;border-radius:3px;background:#e67e22;display:inline-block"\u003E\u003C/span\u003E Mid-Stay (unassigned)\u003C/div\u003E`,
    ...activeCleaners.map((cl, i) => `\u003Cdiv style="display:flex;align-items:center;gap:5px;font-size:12px"\u003E\u003Cdiv class="cleaner-avatar" style="background:${getColor(staff.indexOf(cl))};width:16px;height:16px;font-size:9px"\u003E${getInitials(cl.firstName,cl.lastName)}\u003C/div\u003E ${cl.firstName} ${cl.lastName}\u003C/div\u003E`)
  ].join('');
}

// ============ JOBS ============
function updateJobStats() {
  const now = new Date();
  const monthJobs = cleaningJobs.filter(j => {
    const d = new Date(j.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  document.getElementById('j-total').textContent = cleaningJobs.length;
  document.getElementById('j-month').textContent = monthJobs.length;
  document.getElementById('j-checkout').textContent = cleaningJobs.filter(j => j.type === 'checkout').length;
  document.getElementById('j-midstay').textContent = cleaningJobs.filter(j => j.type === 'midstay').length;
  document.getElementById('j-unassigned').textContent = cleaningJobs.filter(j => !(j.cleanerIds||[]).length).length;
}

function renderJobs() {
  const search = (document.getElementById('jobSearch').value||'').toLowerCase();
  const monthVal = document.getElementById('jobMonth').value;
  const zoneFilter = document.getElementById('jobZone').value;
  const typeFilter = document.getElementById('jobType').value;
  const cleanerFilter = document.getElementById('jobCleaner').value;

  let filtered = cleaningJobs.filter(j => {
    const matchSearch = !search || (j.propertyName||'').toLowerCase().includes(search);
    const matchMonth = !monthVal || j.date.startsWith(monthVal);
    const matchZone = !zoneFilter || (j.zone||'').toLowerCase().includes(zoneFilter.toLowerCase());
    const matchType = !typeFilter || j.type === typeFilter;
    const matchCleaner = !cleanerFilter || (j.cleanerIds||[]).includes(cleanerFilter);
    return matchSearch && matchMonth && matchZone && matchType && matchCleaner;
  });

  filtered.sort((a, b) => (a.date > b.date ? 1 : -1) * jobSortDir);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / JOB_PAGE_SIZE));
  if (jobPage > pages) jobPage = 1;
  const start = (jobPage - 1) * JOB_PAGE_SIZE;
  const pageData = filtered.slice(start, start + JOB_PAGE_SIZE);

  const tbody = document.getElementById('jobsTable');
  if (pageData.length === 0) {
    tbody.innerHTML = `\u003Ctr\u003E\u003Ctd colspan="9"\u003E\u003Cdiv class="empty-state"\u003E\u003Cdiv class="empty-icon"\u003E\u{1F9F9}\u003C/div\u003E\u003Cp\u003ENo jobs found. Import bookings to generate cleaning jobs.\u003C/p\u003E\u003C/div\u003E\u003C/td\u003E\u003C/tr\u003E`;
  } else {
    tbody.innerHTML = pageData.map(j => {
      const assignedCls = (j.cleanerIds||[]).map(cid => staff.find(s => s.id === cid)).filter(Boolean);
      const typeBadge = j.type === 'checkout'
        ? `\u003Cspan style="background:#fdebd0;color:#a04000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500"\u003E\u{1F3C1} Checkout\u003C/span\u003E`
        : `\u003Cspan style="background:#fdf6e3;color:#8e6b23;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500"\u003E\u{1F504} Mid-Stay\u003C/span\u003E`;
      const cleanerCell = assignedCls.length
        ? assignedCls.map(cl => `\u003Cdiv style="display:inline-flex;align-items:center;gap:5px;margin-right:6px"\u003E\u003Cdiv class="cleaner-avatar" style="background:${getColor(staff.indexOf(cl))};width:24px;height:24px;font-size:9px"\u003E${getInitials(cl.firstName,cl.lastName)}\u003C/div\u003E\u003Cspan style="font-size:12px"\u003E${cl.firstName}\u003C/span\u003E\u003C/div\u003E`).join('')
        : `\u003Cspan style="color:var(--danger);font-size:12px"\u003E\u26A0 Unassigned\u003C/span\u003E`;
      const totalPay = j.hours ? assignedCls.reduce((sum, cl) => {
        const base = (cl.hourlyRate||0) * j.hours;
        const transport = (cl.hasCar === 'Yes' && j.propertyTransport) ? j.propertyTransport : 0;
        return sum + base + transport;
      }, 0) : 0;
      const pay = totalPay > 0 ? `\u20AC${totalPay.toFixed(0)}` : '\u2014';
      return `\u003Ctr\u003E
        \u003Ctd style="font-size:12px;font-weight:500"\u003E${formatDate(j.date)}\u003C/td\u003E
        \u003Ctd style="font-size:12px"\u003E${j.propertyName||'\u2014'}\u003C/td\u003E
        \u003Ctd\u003E\u003Cspan class="zone-tag zone-${(j.zone||'').replace(' ','-')}"\u003E${j.zone||'\u2014'}\u003C/span\u003E\u003C/td\u003E
        \u003Ctd\u003E${typeBadge}\u003C/td\u003E
        \u003Ctd style="text-align:center;font-size:12px"\u003E${j.nights||'\u2014'}\u003C/td\u003E
        \u003Ctd\u003E${cleanerCell}\u003C/td\u003E
        \u003Ctd style="text-align:center;font-size:12px"\u003E${j.hours ? j.hours+'h' : '\u2014'}\u003C/td\u003E
        \u003Ctd style="text-align:center;font-size:12px;color:var(--teal)"\u003E${j.propertyTransport ? '\u20AC'+j.propertyTransport : '\u2014'}\u003C/td\u003E
        \u003Ctd style="text-align:right;font-size:12px;font-weight:500;color:var(--teal-dark)"\u003E${pay}\u003C/td\u003E
        \u003Ctd\u003E
          \u003Cdiv style="display:flex;gap:4px"\u003E
            \u003Cbutton class="btn btn-teal btn-sm" onclick="openJobModal('${j.id}')"\u003E\u270F\uFE0F\u003C/button\u003E
            \u003Cbutton class="btn btn-danger btn-sm" onclick="deleteJob('${j.id}')"\u003E\u{1F5D1}\u003C/button\u003E
          \u003C/div\u003E
        \u003C/td\u003E
      \u003C/tr\u003E`;
    }).join('');
  }

  document.getElementById('jobPaginationInfo').textContent = `Showing ${Math.min(start+1,total)}\u2013${Math.min(start+JOB_PAGE_SIZE,total)} of ${total} jobs`;
  const btns = document.getElementById('jobPageBtns');
  btns.innerHTML = '';
  for (let i = 1; i <= Math.min(pages, 10); i++) {
    const btn = document.createElement('button');
    btn.style.cssText = `width:28px;height:28px;border:1px solid var(--border);border-radius:5px;background:${i===jobPage?'var(--teal)':'white'};color:${i===jobPage?'white':'var(--text)'};cursor:pointer;font-size:12px`;
    btn.textContent = i;
    btn.onclick = () => { jobPage = i; renderJobs(); };
    btns.appendChild(btn);
  }
  updateJobStats();
}

function sortJobs(field) { jobSortDir *= -1; renderJobs(); }

function openJobModal(id) {
  const j = cleaningJobs.find(x => x.id === id);
  if (!j) return;
  document.getElementById('j_editId').value = id;
  document.getElementById('j_property').value = j.propertyName || '';
  document.getElementById('j_date').value = j.date || '';
  document.getElementById('j_type').value = j.type || 'checkout';
  document.getElementById('j_hours').value = j.hours || '';
  document.getElementById('j_transport').value = j.propertyTransport || '';
  document.getElementById('j_notes').value = j.notes || '';
  // Render cleaner checkboxes
  renderCleanerCheckboxes(j.cleanerIds || [], j.propertyTransport || 0);
  updateCostPreview(j);
  openModal('jobModal');
}

function renderCleanerCheckboxes(selectedIds, transportCharge) {
  const container = document.getElementById('j_cleaners_list');
  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  if (activeStaff.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12px">No active cleaners. Add staff first.</span>';
    return;
  }
  container.innerHTML = activeStaff.map((cl, i) => {
    const idx = staff.indexOf(cl);
    const checked = selectedIds.includes(cl.id);
    const getsTransport = cl.hasCar === 'Yes' && transportCharge > 0;
    return `\u003Clabel data-selected="${checked}" data-staffid="${cl.id}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid ${checked ? 'var(--teal)' : 'var(--border)'};border-radius:20px;cursor:pointer;background:${checked ? '#e0f5f1' : 'var(--cream)'};font-size:12px;font-weight:${checked?'500':'400'};transition:all 0.2s" onclick="toggleCleanerCheck(this,'${cl.id}')"\u003E
      \u003Cdiv class="cleaner-avatar" style="background:${getColor(idx)};width:20px;height:20px;font-size:9px"\u003E${getInitials(cl.firstName,cl.lastName)}\u003C/div\u003E
      ${cl.firstName} ${cl.lastName}
      ${getsTransport ? '<span style="font-size:10px;color:var(--teal);margin-left:3px">\u{1F697}+\u20AC'+transportCharge+'</span>' : ''}
    \u003C/label\u003E`;
  }).join('');
}

function toggleCleanerCheck(el, staffId) {
  const isSelected = el.dataset.selected === 'true';
  el.dataset.selected = isSelected ? 'false' : 'true';
  if (!isSelected) {
    el.style.background = '#e0f5f1';
    el.style.borderColor = 'var(--teal)';
    el.style.fontWeight = '500';
  } else {
    el.style.background = 'var(--cream)';
    el.style.borderColor = 'var(--border)';
    el.style.fontWeight = '400';
  }
  // Update cost preview
  const j = cleaningJobs.find(x => x.id === document.getElementById('j_editId').value);
  updateCostPreview(j);
}

function getSelectedCleanerIds() {
  const container = document.getElementById('j_cleaners_list');
  return [...container.querySelectorAll('label[data-selected="true"]')]
    .map(lbl => lbl.dataset.staffid)
    .filter(Boolean);
}

function updateCostPreview(j) {
  const preview = document.getElementById('j_cost_preview');
  if (!preview) return;
  const hours = parseFloat(document.getElementById('j_hours').value) || 0;
  const transport = parseFloat(document.getElementById('j_transport').value) || 0;
  const selectedIds = getSelectedCleanerIds();
  if (!selectedIds.length || !hours) { preview.style.display = 'none'; return; }
  const lines = selectedIds.map(cid => {
    const cl = staff.find(s => s.id === cid);
    if (!cl) return '';
    const base = (cl.hourlyRate||0) * hours;
    const tr = cl.hasCar === 'Yes' ? transport : 0;
    return `\u003Cspan style="margin-right:16px"\u003E\u003Cstrong\u003E${cl.firstName}\u003C/strong\u003E: \u20AC${base.toFixed(0)} pay${tr > 0 ? ' + \u20AC'+tr+' transport' : ''} = \u20AC${(base+tr).toFixed(0)}\u003C/span\u003E`;
  }).filter(Boolean).join('');
  preview.innerHTML = '\u{1F4B0} Estimated cost: ' + lines;
  preview.style.display = 'block';
}

async function saveJob() {
  const id = document.getElementById('j_editId').value;
  const idx = cleaningJobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  cleaningJobs[idx].date = document.getElementById('j_date').value;
  cleaningJobs[idx].type = document.getElementById('j_type').value;
  cleaningJobs[idx].cleanerIds = getSelectedCleanerIds();
  cleaningJobs[idx].hours = parseFloat(document.getElementById('j_hours').value) || null;
  cleaningJobs[idx].propertyTransport = parseFloat(document.getElementById('j_transport').value) || null;
  cleaningJobs[idx].notes = document.getElementById('j_notes').value.trim();
  await save();
  closeModal('jobModal');
  renderJobs();
  renderCalendar();
  showToast('\u2713 Job updated', 'success');
}

async function deleteJob(id) {
  showConfirm('\u{1F5D1}\uFE0F','Delete Job?','Remove this cleaning job?','btn-danger','Delete', async () => {
    cleaningJobs = cleaningJobs.filter(j => j.id !== id);
    const dr2 = await SyncStore.deleteOne('zesty_cleaning_jobs','cleaning_jobs',id,cleaningJobs);
    if(!dr2.ok){ cleaningJobs=(await SyncStore.load('zesty_cleaning_jobs','cleaning_jobs')).data; }
    renderJobs(); renderCalendar(); updateJobStats();
    showToast('Deleted', 'error');
  });
}

async function autoAssign() {
  const monthVal = document.getElementById('jobMonth')?.value || '';
  // Only assign jobs that are unassigned (no cleanerIds set) - NEVER touch saved jobs
  const jobsToAssign = cleaningJobs.filter(j => {
    if ((j.cleanerIds||[]).length > 0) return false; // already saved/assigned - skip
    if (monthVal && j.date && !j.date.startsWith(monthVal)) return false; // wrong month
    return true;
  });

  if (!jobsToAssign.length) {
    showToast('No unassigned jobs to assign this month', 'info');
    return;
  }

  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  if (!activeStaff.length) { showToast('No active staff found', 'error'); return; }

  // Track hours assigned per staff member in this run (for even spreading)
  const hoursThisRun = {};
  activeStaff.forEach(s => hoursThisRun[s.id] = 0);

  // Also count existing hours this month per staff (from already-saved jobs)
  const existingHours = {};
  activeStaff.forEach(s => {
    existingHours[s.id] = cleaningJobs
      .filter(j => (j.cleanerIds||[]).includes(s.id) && (!monthVal || (j.date||'').startsWith(monthVal)))
      .reduce((sum, j) => sum + (j.hours || 4), 0); // estimate 4h if no hours set
  });

  let assigned = 0;

  // Sort jobs by date for sequential assignment
  const sorted = [...jobsToAssign].sort((a,b) => (a.date||'') > (b.date||'') ? 1 : -1);

  sorted.forEach(j => {
    // Find eligible staff: match job zone to staff zones
    const jobZone = (j.zone || '').toLowerCase();
    const eligible = activeStaff.filter(s => {
      if (!jobZone) return true; // no zone set = any staff
      const staffZones = (s.zones || []).map(z => z.toLowerCase());
      return staffZones.some(z => jobZone.includes(z) || z.includes(jobZone));
    });

    if (!eligible.length) {
      // No zone match - use all active staff as fallback
      eligible.push(...activeStaff);
    }

    if (!eligible.length) return;

    // Pick the staff member with the fewest total hours (existing + this run)
    eligible.sort((a, b) => {
      const totalA = (existingHours[a.id] || 0) + (hoursThisRun[a.id] || 0);
      const totalB = (existingHours[b.id] || 0) + (hoursThisRun[b.id] || 0);
      return totalA - totalB;
    });

    const picked = eligible[0];
    // Find job in cleaningJobs and set cleanerIds
    const idx = cleaningJobs.findIndex(jj => jj.id === j.id);
    if (idx >= 0) {
      cleaningJobs[idx].cleanerIds = [picked.id];
      hoursThisRun[picked.id] += (j.hours || 4); // estimate 4h
      assigned++;
    }
  });

  await save();
  renderJobs();
  renderCalendar();
  showToast(`\u26A1 Auto-assigned ${assigned} jobs (${jobsToAssign.length - assigned} skipped)`, 'success');
}

function exportJobsCSV() {
  const headers = ['Date','Property','Zone','Type','Nights','Cleaners','Hours','Transport \u20AC','Total Pay','Notes'];
  const rows = cleaningJobs.map(j => {
    const cls = (j.cleanerIds||[]).map(cid => staff.find(s => s.id === cid)).filter(Boolean);
    const totalPay = j.hours ? cls.reduce((sum, cl) => {
      const base = (cl.hourlyRate||0) * j.hours;
      const tr = cl.hasCar === 'Yes' ? (j.propertyTransport||0) : 0;
      return sum + base + tr;
    }, 0) : 0;
    return [j.date, j.propertyName, j.zone, j.type, j.nights, cls.map(c=>c.firstName+' '+c.lastName).join(' + '), j.hours||'', j.propertyTransport||'', totalPay > 0 ? totalPay.toFixed(2) : '', j.notes].map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'}));
  a.download = `zesty_cleaning_jobs_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('\u2713 Exported', 'success');
}

function exportScheduleCSV() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal));
  monthJobs.sort((a,b) => a.date > b.date ? 1 : -1);
  const headers = ['Date','Property','Zone','Type','Cleaner','Hours','Pay'];
  const rows = monthJobs.map(j => {
    const cls = (j.cleanerIds||[]).map(cid => staff.find(s => s.id === cid)).filter(Boolean);
    const totalPay = j.hours ? cls.reduce((sum,cl) => sum + (cl.hourlyRate||0)*j.hours + (cl.hasCar==='Yes'?(j.propertyTransport||0):0), 0) : 0;
    return [j.date, j.propertyName, j.zone, j.type === 'checkout' ? 'Checkout' : 'Mid-Stay', cls.map(c=>c.firstName+' '+c.lastName).join(' + ') || 'Unassigned', j.hours||'', totalPay > 0 ? '\u20AC'+totalPay.toFixed(2) : ''].map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'}));
  a.download = `zesty_schedule_${monthVal}.csv`;
  a.click();
  showToast('\u2713 Schedule exported', 'success');
}

function printWeeklySchedule() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  const cleanerFilter = document.getElementById('calCleaner')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }

  const [yr, mo] = monthVal.split('-').map(Number);
  const monthName = new Date(yr, mo-1, 1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  // All jobs for the month
  const monthJobs = cleaningJobs.filter(j =>
    j.date && j.date.startsWith(monthVal) &&
    (!cleanerFilter || (j.cleanerIds||[]).includes(cleanerFilter))
  ).sort((a,b) => a.date > b.date ? 1 : -1);

  // Active cleaners
  const activeCl = cleanerFilter
    ? [staff.find(s=>s.id===cleanerFilter)].filter(Boolean)
    : staff.filter(s=>s.status!=='Inactive'&&(!s.role||s.role==='cleaner'||s.role==='both'));

  // Build weeks: Mon→Sun
  const firstDay = new Date(yr, mo-1, 1);
  const lastDay  = new Date(yr, mo, 0);
  let weekStart  = new Date(firstDay);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() + (dow===0?-6:1-dow));

  const weeks = [];
  while (weekStart <= lastDay) {
    const week = [];
    for (let d=0; d<7; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate()+d);
      week.push(day);
    }
    weeks.push(week);
    weekStart.setDate(weekStart.getDate()+7);
  }

  const DAY_LABELS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dayKey = d => d.toISOString().slice(0,10);
  const fmtFull = d => d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

  let printContent = '';

  weeks.forEach(week => {
    // Skip weeks entirely outside the month with no jobs
    const weekHasJob = week.some(d => monthJobs.some(j=>j.date===dayKey(d)));
    if (!weekHasJob) return;

    const weekLabel = new Date(week[0]).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) +
                      ' \u2013 ' +
                      new Date(week[6]).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

    // Build day columns
    const dayCols = week.map((day, di) => {
      const dk = dayKey(day);
      const inMonth = day.getMonth()===mo-1;
      const dayJobs = monthJobs.filter(j=>j.date===dk);
      const isWeekend = di>=5;
      const dayLabel = DAY_LABELS[di]+' '+day.getDate();

      let dayContent = '';
      if (!dayJobs.length || !inMonth) {
        dayContent = '<div class="wk2-empty">\u2014</div>';
      } else {
        // Group jobs by property
        dayJobs.forEach(j => {
          const assignedCl = (j.cleanerIds||[])
            .map(cid=>activeCl.find(s=>s.id===cid))
            .filter(Boolean)
            .map(s=>s.firstName+' '+s.lastName);
          const depDt = new Date(j.date);
          const arrDt = j.nights ? new Date(new Date(j.date).setDate(depDt.getDate()-j.nights)) : null;
          const arrStr = arrDt ? arrDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
          const depStr = j.type==='checkout' ? depDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
          const babycot = (j.notes||'').toLowerCase().match(/infant|baby|cot/);
          const guestStr = j.adults||j.guests ? (j.adults?j.adults+'A':'')+(j.children?' '+j.children+'C':'')+(j.infants?' '+j.infants+'INF':'') || (j.guests||'') : '';
          const typeColor = j.type==='checkout'?'#a04000':'#8e6b23';
          const typeBg   = j.type==='checkout'?'#fdebd0':'#fdf6e3';

          dayContent += `
          \u003Cdiv class="wk2-job" style="page-break-inside:avoid"\u003E
            \u003Cdiv class="wk2-prop"\u003E${j.propertyName||'\u2014'}\u003C/div\u003E
            \u003Cdiv class="wk2-type" style="background:${typeBg};color:${typeColor}"\u003E${j.type==='checkout'?'Checkout':'Mid-Stay'}\u003C/div\u003E
            ${guestStr?'<div class="wk2-detail">\uD83D\uDC65 '+guestStr+'</div>':''}
            ${arrStr!=='\u2014'?'<div class="wk2-detail">\u2197 Arr: '+arrStr+'</div>':''}
            ${depStr!=='\u2014'?'<div class="wk2-detail">\u2198 Dep: '+depStr+'</div>':''}
            ${j.nights?'<div class="wk2-detail">\uD83C\uDF19 '+j.nights+' nts</div>':''}
            ${assignedCl.length?'<div class="wk2-cleaners">'+assignedCl.map(n=>'<span>'+n+'</span>').join('')+'</div>':'<div class="wk2-detail" style="color:#e74c3c">Unassigned</div>'}
            ${j.hours?'<div class="wk2-detail">\u23F1 '+j.hours+'h</div>':''}
            ${babycot?'<div class="wk2-detail" style="color:#c0392b;font-weight:700">\uD83D\uDECF BABYCOT</div>':''}
            ${j.notes&&!babycot?'<div class="wk2-note">'+j.notes+'</div>':''}
          \u003C/div\u003E`;
        });
      }

      return `\u003Cdiv class="wk2-day${isWeekend?' wk2-weekend':''}${!inMonth?' wk2-outmonth':''}"\u003E
        \u003Cdiv class="wk2-day-hdr${dayJobs.length&&inMonth?' wk2-has-jobs':''}"\u003E${dayLabel}\u003C/div\u003E
        \u003Cdiv class="wk2-day-body"\u003E${dayContent}\u003C/div\u003E
      \u003C/div\u003E`;
    }).join('');

    printContent += `\u003Cdiv class="wk2-page"\u003E
      \u003Cdiv class="wk2-logo"\u003EZesty Rentals \u2014 Weekly Cleaning Schedule \u00B7 ${monthName}\u003C/div\u003E
      \u003Cdiv class="wk2-week-label"\u003E${weekLabel}\u003C/div\u003E
      \u003Cdiv class="wk2-grid"\u003E${dayCols}\u003C/div\u003E
    \u003C/div\u003E`;
  });

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'DM Sans',Arial,sans-serif; font-size:10px; color:#1e2a28; background:#fff; }
    .wk2-page { padding:14px 16px; page-break-after:always; }
    .wk2-page:last-child { page-break-after:avoid; }
    .wk2-logo { font-size:9px; color:#888; text-transform:uppercase; letter-spacing:2px; margin-bottom:8px; }
    .wk2-week-label { font-size:16px; font-weight:700; color:#115950; margin-bottom:10px; padding-bottom:6px; border-bottom:3px solid #115950; }
    .wk2-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; min-height:200px; }
    .wk2-day { border:1px solid #dde; border-radius:5px; overflow:hidden; display:flex; flex-direction:column; }
    .wk2-weekend { background:#fafaf8; }
    .wk2-outmonth { opacity:.3; }
    .wk2-day-hdr { padding:5px 7px; font-size:10px; font-weight:700; color:#555; background:#f5f5f5; border-bottom:1px solid #eee; }
    .wk2-has-jobs { background:#115950; color:#fff; }
    .wk2-day-body { padding:5px; flex:1; overflow:hidden; display:flex; flex-direction:column; gap:5px; }
    .wk2-empty { color:#ccc; text-align:center; padding:10px 0; font-size:11px; }
    .wk2-job { background:#f0faf7; border:1px solid #c0e0d0; border-radius:4px; padding:5px 6px; page-break-inside:avoid; }
    .wk2-prop { font-weight:700; font-size:10px; color:#115950; margin-bottom:3px; }
    .wk2-type { font-size:8px; font-weight:700; padding:1px 6px; border-radius:8px; display:inline-block; margin-bottom:3px; }
    .wk2-detail { font-size:9px; color:#555; line-height:1.6; }
    .wk2-cleaners { display:flex; flex-wrap:wrap; gap:2px; margin-top:3px; }
    .wk2-cleaners span { background:#115950; color:#fff; padding:1px 5px; border-radius:8px; font-size:8px; font-weight:600; }
    .wk2-note { font-size:8px; color:#999; font-style:italic; margin-top:2px; }
    @page { margin:8mm; size:A4 landscape; }
    @media print { .wk2-page { page-break-after:always; } }
  `;

  const _htmlContent = '<html><head><title>Cleaning Schedule '+monthName+'</title><style>'+buildPrintStyles()+'</style></head><body>'+(printContent||'<p style="padding:40px;font-family:Arial">No jobs found.</p>')+'</body></html>';
  const _printWin = window.open('', '_blank');
  if (_printWin) {
    _printWin.document.open();
    _printWin.document.write(_htmlContent);
    _printWin.document.close();
    setTimeout(() => _printWin.print(), 600);
  } else {
    // Fallback: create hidden iframe
    const _ifr = document.createElement('iframe');
    _ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
    document.body.appendChild(_ifr);
    _ifr.contentDocument.open();
    _ifr.contentDocument.write(_htmlContent);
    _ifr.contentDocument.close();
    setTimeout(() => { _ifr.contentWindow.print(); document.body.removeChild(_ifr); }, 600);
  }
}


function printSchedule() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  const cleanerFilter = document.getElementById('calCleaner')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal) &&
    (!cleanerFilter || (j.cleanerIds||[]).includes(cleanerFilter)));
  monthJobs.sort((a,b) => a.date > b.date ? 1 : -1);
  const printCleaners = cleanerFilter
    ? [staff.find(s => s.id === cleanerFilter)].filter(Boolean)
    : staff.filter(s => s.status !== 'Inactive');
  const monthName = new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  let printContent = '';

  printCleaners.forEach(cl => {
    const clJobs = monthJobs.filter(j => (j.cleanerIds||[]).includes(cl.id));
    if (clJobs.length === 0 && !cleanerFilter) return;
    const totalHours = clJobs.reduce((s,j) => s+(j.hours||0), 0);

    // Group jobs by date
    const byDate = {};
    clJobs.forEach(j => { if (!byDate[j.date]) byDate[j.date]=[]; byDate[j.date].push(j); });
    const dates = Object.keys(byDate).sort();

    const dateBlocks = dates.map(date => {
      const dayJobs = byDate[date];
      const dayLabel = new Date(date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});

      const rows = dayJobs.map(j => {
        const coworkers = (j.cleanerIds||[]).filter(cid=>cid!==cl.id)
          .map(cid=>{const c2=staff.find(s=>s.id===cid);return c2?`\u003Cspan class="coworker-tag"\u003E${c2.firstName} ${c2.lastName}\u003C/span\u003E`:''}).join('');
        const depDt = j.date ? new Date(j.date) : null;
        const arrDt = (depDt&&j.nights) ? new Date(new Date(j.date).setDate(new Date(j.date).getDate()-j.nights)) : null;
        const arrStr = arrDt ? arrDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
        const depStr = j.type==='checkout'&&depDt ? depDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
        const babycot = (j.notes||'').toLowerCase().match(/infant|baby|cot/);
        const guestStr = j.adults||j.guests ? (j.adults?j.adults+'A':'')+(j.children?' '+j.children+'C':'')+(j.infants?' '+j.infants+'INF':'') || (j.guests||'\u2014') : '\u2014';
        return `\u003Cdiv class="print-job-row"\u003E
          \u003Cdiv\u003E\u003Cstrong\u003E${j.propertyName}\u003C/strong\u003E${j.zone?'<br><span style="font-size:10px;color:#888">'+j.zone+'</span>':''}\u003C/div\u003E
          \u003Cdiv\u003E\u003Cspan class="type-badge type-${j.type}"\u003E${j.type==='checkout'?'Checkout':'Mid-Stay'}\u003C/span\u003E${babycot?'<br><span style="background:#ffcccc;color:#c0392b;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:700">\uD83D\uDECF BABYCOT</span>':''}\u003C/div\u003E
          \u003Cdiv style="font-size:11px"\u003E${arrStr}\u003C/div\u003E
          \u003Cdiv style="font-size:11px"\u003E${depStr}\u003C/div\u003E
          \u003Cdiv style="text-align:center"\u003E${j.nights||'\u2014'}\u003C/div\u003E
          \u003Cdiv style="font-size:11px;text-align:center"\u003E${guestStr}${j.infants>0?' <span style=\"background:#ffcccc;color:#c0392b;padding:0 4px;border-radius:6px;font-size:9px;font-weight:700\">INF</span>':''}\u003C/div\u003E
          \u003Cdiv\u003E${coworkers||'<span style="color:#ccc;font-size:11px">Solo</span>'}\u003C/div\u003E
          \u003Cdiv style="font-size:11px;color:#666"\u003E${(babycot?'\uD83D\uDECF BABYCOT REQ. ':'')}${j.notes||''}\u003C/div\u003E
        \u003C/div\u003E`;
      }).join('');

      // Each date group stays together — never splits across pages
      return `\u003Cdiv class="date-block"\u003E
        \u003Cdiv class="date-header"\u003E${dayLabel} \u003Cspan style="font-size:11px;color:#888;font-weight:400"\u003E${dayJobs.length} job${dayJobs.length!==1?'s':''}\u003C/span\u003E\u003C/div\u003E
        \u003Cdiv class="col-headers"\u003E
          \u003Cdiv\u003EProperty\u003C/div\u003E\u003Cdiv\u003EType\u003C/div\u003E\u003Cdiv\u003EArrival\u003C/div\u003E\u003Cdiv\u003EDeparture\u003C/div\u003E\u003Cdiv\u003ENts\u003C/div\u003E\u003Cdiv\u003EGuests\u003C/div\u003E\u003Cdiv\u003ECo-workers\u003C/div\u003E\u003Cdiv\u003ENotes\u003C/div\u003E
        \u003C/div\u003E
        ${rows}
      \u003C/div\u003E`;
    }).join('');

    printContent += `\u003Cdiv class="print-page"\u003E
      \u003Cdiv class="print-logo"\u003EZesty Rentals \u2014 Cleaning Schedule\u003C/div\u003E
      \u003Cdiv class="print-header"\u003E
        \u003Cdiv\u003E
          \u003Cdiv class="print-name"\u003E${cl.firstName} ${cl.lastName}\u003C/div\u003E
          \u003Cdiv class="print-sub"\u003E${monthName} \u00B7 ${(cl.zones||[]).join(', ')||'All zones'}${cl.hasCar==='Yes'?' \u00B7 \uD83D\uDE97 Car':''}\u003C/div\u003E
        \u003C/div\u003E
        \u003Cdiv class="print-summary"\u003E
          \u003Cdiv class="big"\u003E${clJobs.length} jobs\u003C/div\u003E
          \u003Cdiv class="small"\u003E${totalHours.toFixed(1)}h total\u003C/div\u003E
        \u003C/div\u003E
      \u003C/div\u003E
      ${clJobs.length===0?'<p style="padding:20px;color:#999">No jobs this month.</p>':dateBlocks}
      \u003Cdiv class="totals-row"\u003E
        \u003Cdiv class="total-item"\u003E\u003Cdiv class="total-label"\u003ETotal Jobs\u003C/div\u003E\u003Cdiv class="total-val"\u003E${clJobs.length}\u003C/div\u003E\u003C/div\u003E
        \u003Cdiv class="total-item"\u003E\u003Cdiv class="total-label"\u003ETotal Hours\u003C/div\u003E\u003Cdiv class="total-val"\u003E${totalHours.toFixed(1)}h\u003C/div\u003E\u003C/div\u003E
      \u003C/div\u003E
    \u003C/div\u003E`;
  });

  const _htmlContent = '<html><head><title>Cleaning Schedule '+monthName+'</title><style>'+buildPrintStyles()+'</style></head><body>'+(printContent||'<p style="padding:40px;font-family:Arial">No jobs found.</p>')+'</body></html>';
  const _printWin = window.open('', '_blank');
  if (_printWin) {
    _printWin.document.open();
    _printWin.document.write(_htmlContent);
    _printWin.document.close();
    setTimeout(() => _printWin.print(), 600);
  } else {
    // Fallback: create hidden iframe
    const _ifr = document.createElement('iframe');
    _ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
    document.body.appendChild(_ifr);
    _ifr.contentDocument.open();
    _ifr.contentDocument.write(_htmlContent);
    _ifr.contentDocument.close();
    setTimeout(() => { _ifr.contentWindow.print(); document.body.removeChild(_ifr); }, 600);
  }
}


// ── Add Manual Job (from Jobs tab) ──────────────────────────────────────
function openAddManualJobModal() {
  const propSel = document.getElementById('amj-property');
  if (propSel) {
    const propList = (window._propCache || JSON.parse(localStorage.getItem('zesty_properties')||'[]'))
      .filter(p => !p.archived)
      .sort((a,b) => (a.shortName||a.propertyName||'').localeCompare(b.shortName||b.propertyName||''));
    propSel.innerHTML = '<option value="">— Select property —</option>' +
      propList.map(p => '<option value="' + (p.shortName||p.propertyName) + '">' + (p.shortName||p.propertyName) + '</option>').join('');
  }
  const cleanerSel = document.getElementById('amj-cleaners');
  if (cleanerSel) {
    const active = staff.filter(s => s.status !== 'Inactive' && (!s.role || s.role === 'cleaner' || s.role === 'both'));
    cleanerSel.innerHTML = active.map(s => '<option value="' + s.id + '">' + s.firstName + ' ' + s.lastName + '</option>').join('');
  }
  document.getElementById('amj-date').value    = new Date().toISOString().slice(0,10);
  document.getElementById('amj-type').value    = 'checkout';
  document.getElementById('amj-hours').value   = '';
  document.getElementById('amj-guest').value   = '';
  document.getElementById('amj-notes').value   = '';
  openModal('addManualJobModal');
}

async function saveManualJobFromModal() {
  const propName = document.getElementById('amj-property')?.value?.trim();
  const date     = document.getElementById('amj-date')?.value;
  if (!propName || !date) { showToast('Property and date are required', 'error'); return; }
  const prop = (window._propCache || []).find(p => (p.shortName||p.propertyName) === propName);
  const cleanerSel = document.getElementById('amj-cleaners');
  const selectedCleaners = Array.from(cleanerSel?.selectedOptions||[]).map(o => o.value);
  const job = {
    id:                'manual_job_' + Date.now(),
    date,
    type:              document.getElementById('amj-type')?.value || 'checkout',
    propertyName:      propName,
    propertyId:        prop?.id || '',
    propertyTransport: parseFloat(prop?.transport||0),
    guestName:         document.getElementById('amj-guest')?.value || 'Manual job',
    hours:             parseFloat(document.getElementById('amj-hours')?.value) || null,
    notes:             document.getElementById('amj-notes')?.value || '',
    cleanerIds:        selectedCleaners,
    cleanerHours:      {},
    source:            'manual',
    zone:              prop?.zone || '',
  };
  cleaningJobs.push(job);
  await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
  closeModal('addManualJobModal');
  renderJobs();
  renderCalendar();
  updateJobStats();
  showToast('\u2713 Manual job added', 'success');
}

// ── Print All Jobs as PDF ────────────────────────────────────────────────
function printAllJobs() {
  const monthVal    = document.getElementById('jobMonth')?.value || '';
  const zoneFilter  = document.getElementById('jobZone')?.value || '';
  const typeFilter  = document.getElementById('jobType')?.value || '';
  const searchVal   = (document.getElementById('jobSearch')?.value||'').toLowerCase();

  let filtered = cleaningJobs.filter(j => {
    if (monthVal && !(j.date||'').startsWith(monthVal)) return false;
    if (zoneFilter && j.zone !== zoneFilter) return false;
    if (typeFilter && j.type !== typeFilter) return false;
    if (searchVal) {
      const hay = ((j.propertyName||'')+' '+(j.guestName||'')).toLowerCase();
      if (!hay.includes(searchVal)) return false;
    }
    return true;
  }).sort((a,b) => (b.date||'') > (a.date||'') ? 1 : -1);

  const monthLabel = monthVal ? new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : 'All';

  const rows = filtered.map(j => {
    const assignedNames = (j.cleanerIds||[]).map(id => {
      const s = staff.find(x=>x.id===id);
      return s ? s.firstName+' '+s.lastName : '';
    }).filter(Boolean).join(', ') || '—';
    const transport = parseFloat(j.propertyTransport||0);
    return `\u003Ctr\u003E
      \u003Ctd\u003E${j.date||'—'}\u003C/td\u003E
      \u003Ctd\u003E${j.propertyName||'—'}\u003C/td\u003E
      \u003Ctd\u003E${j.zone||'—'}\u003C/td\u003E
      \u003Ctd\u003E\u003Cspan style="background:${j.type==='checkout'?'#fdebd0':'#fdf6e3'};color:${j.type==='checkout'?'#a04000':'#8e6b23'};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700"\u003E${j.type==='checkout'?'Checkout':'Mid-Stay'}\u003C/span\u003E\u003C/td\u003E
      \u003Ctd style="text-align:center"\u003E${j.nights||'—'}\u003C/td\u003E
      \u003Ctd\u003E${assignedNames}\u003C/td\u003E
      \u003Ctd style="text-align:center"\u003E${j.hours||'—'}\u003C/td\u003E
      \u003Ctd style="text-align:right"\u003E${transport>0?'\u20AC'+transport.toFixed(1):'—'}\u003C/td\u003E
      \u003Ctd style="font-size:11px;color:#666"\u003E${j.notes||''}\u003C/td\u003E
    \u003C/tr\u003E`;
  }).join('');

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'DM Sans',Arial,sans-serif; font-size:11px; color:#1e2a28; }
    h1 { font-size:18px; color:#115950; margin-bottom:4px; }
    .sub { font-size:11px; color:#888; margin-bottom:16px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#115950; color:#fff; padding:6px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.5px; }
    td { padding:6px 8px; border-bottom:1px solid #eee; vertical-align:top; }
    tr:nth-child(even) td { background:#f9f9f9; }
    @page { margin:10mm; size:A4 landscape; }
  `;

  const html = '<html><head><title>Jobs '+monthLabel+'</title><style>'+styles+'</style><\/head><body>'+
    '<h1>Cleaning Jobs</h1><div class="sub">'+monthLabel+' \u00B7 '+filtered.length+' jobs</div>'+
    '<table><thead><tr><th>Date</th><th>Property</th><th>Zone</th><th>Type</th><th>Nts</th><th>Assigned To</th><th>Hours</th><th>Transport</th><th>Notes</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table><\/body><\/html>';
  const _htmlContent = html;
  const _printWin = window.open('', '_blank');
  if (_printWin) {
    _printWin.document.open();
    _printWin.document.write(_htmlContent);
    _printWin.document.close();
    setTimeout(() => _printWin.print(), 600);
  } else {
    // Fallback: create hidden iframe
    const _ifr = document.createElement('iframe');
    _ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
    document.body.appendChild(_ifr);
    _ifr.contentDocument.open();
    _ifr.contentDocument.write(_htmlContent);
    _ifr.contentDocument.close();
    setTimeout(() => { _ifr.contentWindow.print(); document.body.removeChild(_ifr); }, 600);
  }
}


// ── Staff Modal ──────────────────────────────────────────────────────────
function openStaffModal(defaultRole) {
  defaultRole = defaultRole || 'cleaner';
  document.getElementById('staffModalTitle').textContent = 'Add Cleaner';
  const roleEl = document.getElementById('s_role');
  if (roleEl) roleEl.value = defaultRole;
  ['s_firstName','s_lastName','s_phone','s_email','s_hourlyRate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('s_editId').value = '';
  document.getElementById('s_status').value = 'Active';
  const hasCar = document.getElementById('s_hasCar'); if (hasCar) hasCar.value = 'No';
  // Clear zone checkboxes
  document.querySelectorAll('#staffZonesContainer input[type=checkbox]').forEach(cb => cb.checked = false);
  openModal('staffModal');
}

function openAddStaff() { openStaffModal('cleaner'); }

// ── Confirm dialog ────────────────────────────────────────────────────────
function closeConfirm() { closeModal('confirmOverlay'); }
function doConfirm() {
  const btn = document.getElementById('confirmBtn');
  if (btn && btn._cb) { btn._cb(); }
  closeConfirm();
}

// Override showConfirm to use the HTML confirmOverlay properly
function showConfirm(icon, title, msg, btnClass, btnLabel, onConfirm) {
  const overlay = document.getElementById('confirmOverlay');
  if (!overlay) { if (confirm(title + '\n' + msg)) onConfirm(); return; }
  const iconEl  = document.getElementById('confirmIcon');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl   = document.getElementById('confirmMsg');
  const btn     = document.getElementById('confirmBtn');
  if (iconEl)  iconEl.textContent  = icon || '⚠️';
  if (titleEl) titleEl.textContent = title || 'Are you sure?';
  if (msgEl)   msgEl.textContent   = msg || '';
  if (btn) {
    btn.textContent = btnLabel || 'Confirm';
    btn.className   = 'btn ' + (btnClass || 'btn-primary');
    btn._cb         = onConfirm;
  }
  openModal('confirmOverlay');
}

// ── Remove no-fee jobs ────────────────────────────────────────────────────
async function removeNoFeeJobs() {
  try {
    const freshProps = await SyncStore.load('zesty_properties', 'properties');
    if (freshProps.data && freshProps.data.length > 0) window._propCache = freshProps.data;
  } catch(e) {}
  const toRemove = cleaningJobs.filter(j => {
    if (!j.propertyName && !j.propertyId) return false;
    return !getPropertyHasCleaning(j.propertyId || j.propertyName);
  });
  if (!toRemove.length) { showToast('No jobs found for no-fee properties', 'success'); return; }
  const propNames = [...new Set(toRemove.map(j => j.propertyName))].sort().join(', ');
  showConfirm('🗑️', 'Remove No-Fee Property Jobs?',
    'Remove ' + toRemove.length + ' jobs for: ' + propNames + '?',
    'btn-danger', 'Remove All',
    async () => {
      const removeIds = new Set(toRemove.map(j => j.id));
      cleaningJobs = cleaningJobs.filter(j => !removeIds.has(j.id));
      for (const j of toRemove) {
        await SyncStore.deleteOne('zesty_cleaning_jobs', 'cleaning_jobs', j.id, cleaningJobs);
      }
      localStorage.setItem('zesty_cleaning_jobs', JSON.stringify(cleaningJobs));
      renderCalendar(); renderJobs(); updateJobStats();
      showToast('✓ Removed ' + toRemove.length + ' jobs', 'success');
    }
  );
}

// ── Hours print & export ──────────────────────────────────────────────────
function printHoursSheet() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const tableEl = document.getElementById('hoursTableWrap') || document.getElementById('hoursSheet');
  const hoursHtml = tableEl ? tableEl.outerHTML : '<p>No hours data</p>';
  const _doc = '<html><head><style>body{font-family:Arial,sans-serif;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:4px 6px}th{background:#115950;color:#fff}@page{size:A4 landscape;margin:10mm}</style></head><body>' + hoursHtml + '</body></html>';
  const _w = window.open('', '_blank');
  if (_w) { _w.document.open(); _w.document.write(_doc); _w.document.close(); setTimeout(()=>_w.print(),500); return; }
  const _ifr = document.createElement('iframe');
  _ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
  document.body.appendChild(_ifr);
  _ifr.contentDocument.open(); _ifr.contentDocument.write(_doc); _ifr.contentDocument.close();
  setTimeout(()=>{ _ifr.contentWindow.print(); document.body.removeChild(_ifr); }, 500);
}

function exportHoursCSV() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const [yr, mo] = monthVal.split('-').map(Number);
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal) &&
    (j.type === 'checkout' || j.type === 'midstay'));
  const activeStaff = staff.filter(s => s.status !== 'Inactive' && (!s.role || s.role === 'cleaner' || s.role === 'both'));
  const headers = ['Date','Property','Type','Guest','Hours',...activeStaff.map(s=>s.firstName+' '+s.lastName),'Total Hours','Notes'];
  const rows = monthJobs.sort((a,b)=>a.date>b.date?1:-1).map(j => {
    const staffHrs = activeStaff.map(s => {
      const h = j.cleanerHours?.[s.id];
      return h !== undefined ? h : ((j.cleanerIds||[]).includes(s.id) && j.hours ? j.hours : '');
    });
    return [j.date, j.propertyName||'', j.type, j.guestName||'', j.hours||'', ...staffHrs, j.hours||'', j.notes||'']
      .map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',');
  });
  const csv = '\ufeff' + [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = 'hours_' + monthVal + '.csv';
  a.click();
  showToast('✓ Hours CSV exported', 'success');
}

// ── Manager Excel export ──────────────────────────────────────────────────
function exportManagerExcel() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal))
    .sort((a,b) => a.date > b.date ? 1 : -1);
  if (!monthJobs.length) { showToast('No jobs for this month', 'error'); return; }
  const headers = ['Date','Property','Zone','Type','Guest','Arrival','Departure','Nights',
                   'Adults','Children','Infants','Cleaners','Hours','Transport','Notes'];
  const rows = monthJobs.map(j => {
    const cls = (j.cleanerIds||[]).map(cid => {
      const s = staff.find(x=>x.id===cid);
      return s ? s.firstName+' '+s.lastName : '';
    }).filter(Boolean).join(' + ');
    const dep = j.date ? new Date(j.date) : null;
    const arr = (dep && j.nights) ? new Date(new Date(j.date).setDate(new Date(j.date).getDate()-j.nights)) : null;
    return [
      j.date, j.propertyName||'', j.zone||'',
      j.type==='checkout'?'Checkout':'Mid-Stay',
      j.guestName||'',
      arr ? arr.toLocaleDateString('en-GB') : '',
      j.type==='checkout' && dep ? dep.toLocaleDateString('en-GB') : '',
      j.nights||'', j.adults||'', j.children||'', j.infants||'',
      cls||'Unassigned', j.hours||'',
      j.propertyTransport>0?j.propertyTransport:'',
      j.notes||''
    ].map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',');
  });
  const csv = '\ufeff' + [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = 'manager_schedule_' + monthVal + '.csv';
  a.click();
  showToast('✓ Manager Excel exported', 'success');
}

// printManagerSummary = Manager PDF (alias for printSchedule)
function printManagerSummary() {
  // Use the per-cleaner printSchedule output
  printSchedule();
}



function buildPrintStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #1e2a28; background: white; }
    .print-page { padding: 28px 32px; }
    .print-page + .print-page { page-break-before: always; }
    .print-page:last-child { page-break-after: avoid; }
    .print-logo { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px; }
    .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; padding-bottom: 14px; border-bottom: 3px solid #115950; }
    .print-name { font-size: 22px; font-weight: 700; color: #115950; }
    .print-sub { font-size: 13px; color: #666; margin-top: 4px; }
    .print-summary { text-align: right; }
    .print-summary .big { font-size: 20px; font-weight: 700; color: #115950; }
    .print-summary .small { font-size: 11px; color: #888; }
    .date-block { page-break-inside: avoid; margin-top: 14px; }
    .date-header { font-size: 13px; font-weight: 700; color: #115950; background: #f0faf7; padding: 6px 10px; border-left: 4px solid #115950; margin-bottom: 0; }
    .col-headers { display: grid; grid-template-columns: 2fr 1fr 0.8fr 0.8fr 0.5fr 0.7fr 1.2fr 1.5fr; background: #e8f4f0; padding: 5px 10px; font-size: 10px; font-weight: 600; color: #115950; text-transform: uppercase; letter-spacing: 0.5px; }
    .print-job-row { display: grid; grid-template-columns: 2fr 1fr 0.8fr 0.8fr 0.5fr 0.7fr 1.2fr 1.5fr; padding: 9px 10px; border-bottom: 1px solid #e8f0ef; font-size: 12px; }
    .print-job-row:nth-child(even) { background: #f8f5f0; }
    .type-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    .type-checkout { background: #fdebd0; color: #a04000; }
    .type-midstay { background: #fdf6e3; color: #8e6b23; }
    .coworker-tag { display: inline-block; background: #e8f4f0; color: #115950; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; margin: 1px 2px; }
    .totals-row { display: flex; gap: 24px; padding: 12px 10px; background: #f0faf7; border-top: 2px solid #115950; margin-top: 8px; }
    .total-item { text-align: center; }
    .total-label { font-size: 10px; color: #888; text-transform: uppercase; }
    .total-val { font-size: 18px; font-weight: 700; color: #115950; }
    @page { margin: 10mm; size: A4 portrait; }
    @media print { .date-block { page-break-inside: avoid; } }
  `;
}

init().catch(console.error);
showDbStatus(true);
