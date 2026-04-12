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
    el.innerHTML = `\u2713 Last import: <strong>${last.filename}</strong> on ${d.toLocaleDateString('el-GR')} \u00B7 ${last.jobs} jobs created`;
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
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">\u{1F469}</div><p>No cleaning staff yet. Add your first cleaner.</p></div></td></tr>`;
  } else {
    const makeRow = (s) => {
      const colorIdx = staff.indexOf(s);
      const zones = (s.zones||[]).map(z => `<span class="zone-tag zone-${z.replace(' ','-')}">${z}</span>`).join('');
      const statusBadge = `<span class="badge badge-${s.status === 'Active' ? 'active' : 'inactive'}">${s.status||'Active'}</span>`;
      const roleBadge = s.role === 'both' ? '<span style="background:#fdf6e3;color:#7d6608;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">BOTH</span>' : '';
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="cleaner-avatar" style="background:${getColor(colorIdx)}">${getInitials(s.firstName,s.lastName)}</div>
            <div>
              <div style="font-weight:500">${s.firstName} ${s.lastName} ${roleBadge}</div>
              <div style="font-size:11px;color:var(--text-muted)">${s.email||''}</div>
            </div>
          </div>
        </td>
        <td style="font-size:12px">${s.phone||'\u2014'}</td>
        <td>${zones||'\u2014'}</td>
        <td>${s.hourlyRate ? '\u20AC'+s.hourlyRate+'/hr' : '\u2014'}</td>
        <td>${s.transportCost ? '\u20AC'+s.transportCost : '\u2014'}</td>
        <td>${s.hasCar === 'Yes' ? '\u{1F697} Yes' : s.hasCar === 'No' ? '\u274C No' : '\u2014'}</td>
        <td>${s.drivingLicense === 'Yes' ? '\u2705' : s.drivingLicense === 'No' ? '\u274C' : '\u2014'}</td>
        <td>${s.insurance === 'Yes' ? `\u2705 ${s.insuranceExpiry ? '(exp: '+formatDate(s.insuranceExpiry)+')' : ''}` : s.insurance === 'No' ? '\u274C' : '\u2014'}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn btn-teal btn-sm" onclick="editStaff('${s.id}')">\u270F\uFE0F</button>
            <button class="btn btn-danger btn-sm" onclick="deleteStaff('${s.id}')">\u{1F5D1}</button>
          </div>
        </td>
      </tr>`;
    };
    
    // Show all active staff as cleaners (no agent role distinction)
    const cleaners = filtered;
    
    // Cleaners table
    const cleanerRows = cleaners.map(makeRow).join('');
    tbody.innerHTML = cleanerRows || `<tr><td colspan="10" style="color:var(--text-muted);text-align:center;padding:20px">No cleaners found.</td></tr>`;
    
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
  const opts = `<option value="">Unassigned</option>` + activeStaff.map(s => `<option value="${s.id}">${s.firstName} ${s.lastName}</option>`).join('');
  const filterOpts = `<option value="">All Cleaners</option>` + staff.map(s => `<option value="${s.id}">${s.firstName} ${s.lastName}</option>`).join('');
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
    <div class="import-stat"><div class="num">${rows.length}</div><div class="lbl">Total Rows</div></div>
    <div class="import-stat"><div class="num" style="color:var(--success)">${booked}</div><div class="lbl">Booked</div></div>
    <div class="import-stat"><div class="num" style="color:#27ae60">${newBooked}</div><div class="lbl">New (to import)</div></div>
    <div class="import-stat"><div class="num" style="color:#7f8c8d">${alreadyImported}</div><div class="lbl">Already in DB</div></div>
    <div class="import-stat"><div class="num" style="color:var(--danger)">${declined + open}</div><div class="lbl">Skipped (Declined/Open)</div></div>
  `;

  // Populate property filter
  const props = [...new Set(rows.map(r => r.HouseInternalName || r.HouseName).filter(Boolean))].sort();
  document.getElementById('importPropFilter').innerHTML = `<option value="">All Properties</option>` + props.map(p => `<option value="${p}">${p}</option>`).join('');

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
    return `<tr style="${rowStyle}">
      <td style="font-size:12px">${r.Name||'\u2014'}</td>
      <td style="font-size:12px">${r.HouseInternalName || r.HouseName || '\u2014'}</td>
      <td style="font-size:12px">${formatDate(r.DateArrival)}</td>
      <td style="font-size:12px">${formatDate(r.DateDeparture)}</td>
      <td style="text-align:center">${nights}</td>
      <td style="font-size:11px">${r.Source||'\u2014'}</td>
      <td><span style="color:${statusColor};font-size:12px;font-weight:500">${r.Status}</span></td>
      <td style="font-size:11px;color:${hasCleaning ? 'var(--teal)' : 'var(--text-muted)'}">
        ${hasCleaning ? '\u{1F4C5} ' + formatDate(r.DateDeparture) : '\u26D4 No cleaning'}
      </td>
      <td style="font-size:11px;color:var(--text-muted)">
        ${!hasCleaning ? '\u2014' : midDays.length ? midDays.length + ' mid-stay' : '\u2014'}
        ${alreadyIn ? '<span style="font-size:10px;background:#ecf0f1;padding:1px 5px;border-radius:8px;color:#7f8c8d">already in DB</span>' : ''}
      </td>
    </tr>`;
  }).join('');
  if (filtered.length > 100) {
    tbody.innerHTML += `<tr><td colspan="10" style="text-align:center;padding:12px;color:var(--text-muted);font-size:12px">Showing first 100 of ${filtered.length} rows</td></tr>`;
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
        .map(p=>`<option value="${p}" ${p===cur?'selected':''}>${p}</option>`).join('');
  }
  const propF = propFilter?.value || '';
  const filteredJobs = propF ? monthJobs.filter(j=>j.propertyName===propF) : monthJobs;

  // Table header: Date | Property | Type | Guest | [cleaner cols] | Tot.Hrs | Tot.Pay | Notes
  const staffCols = activeStaff.map(s =>
    `<th style="min-width:80px;text-align:center">${s.firstName}<br>
     <span style="font-size:10px;color:var(--text-muted)">€${s.hourlyRate||0}/h</span></th>`
  ).join('');

  const thead = document.getElementById('hoursHead');
  if (thead) thead.innerHTML = `<tr>
    <th style="width:90px">Date</th>
    <th>Property</th>
    <th style="width:80px">Type</th>
    <th style="width:130px">Guest</th>
    ${staffCols}
    <th style="text-align:right;width:70px">Hrs</th>
    <th style="text-align:right;width:80px">Pay</th>
    <th style="text-align:right;width:80px">Charge</th>
    <th style="width:90px">Notes</th>
    <th style="width:40px"></th>
  </tr>`;

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
      return `<td style="text-align:center;padding:4px">
        <input type="number" min="0" max="24" step="0.5" value="${hrs}"
          data-jobid="${j.id}" data-staffid="${s.id}"
          onchange="onHoursChange(this)"
          style="width:58px;padding:5px;border:1px solid var(--border);border-radius:6px;
                 text-align:center;font-size:13px;background:${hrsNum>0?'#e0f5f1':'#fff'}">
      </td>`;
    }).join('');

    // Property charge from properties module
    const prop = (typeof properties !== 'undefined' ? properties : [])
      .find(p => (p.shortName||p.propertyName||'').toLowerCase().includes((j.propertyName||'').toLowerCase().split(' ')[0]));
    const rowCharge = parseFloat(prop?.cleaningFee||0);
    const margin = rowCharge - rowPay;

    totalHours += rowHours; totalPay += rowPay; totalCharge += rowCharge;

    const typeBadge = j.type==='checkout'
      ? `<span style="background:#fdebd0;color:#a04000;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">CHECKOUT</span>`
      : `<span style="background:#fdf6e3;color:#8e6b23;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">MID-STAY</span>`;
    const infants = j.infants>0 ? ` <span style="background:#ffcccc;color:#c0392b;padding:0 4px;border-radius:5px;font-size:9px">INF</span>` : '';

    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="font-size:12px;white-space:nowrap">${j.date||'—'}</td>
      <td style="font-size:12px">${j.propertyName||'—'}</td>
      <td>${typeBadge}</td>
      <td style="font-size:11px;color:var(--text-muted)">${j.guestName||'—'}${infants}</td>
      ${staffCells}
      <td style="text-align:right;font-weight:700;color:var(--teal)">${rowHours>0?rowHours+'h':'—'}</td>
      <td style="text-align:right;font-size:12px;color:var(--danger)">${rowPay>0?'€'+rowPay.toFixed(0):'—'}</td>
      <td style="text-align:right;font-size:12px;font-weight:600;color:${margin>=0?'var(--teal-dark)':'var(--danger)'}">${rowCharge>0?'€'+rowCharge.toFixed(0):'—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${j.notes||''}</td>
      <td style="text-align:center;padding:4px">
        <button onclick="editManualHoursJob('${j.id}')" title="Edit" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 5px;border-radius:6px" onmouseenter="this.style.background='#f0f0f0'" onmouseleave="this.style.background='none'">✏️</button>
      </td>
    </tr>`;
  }).join('');

  const tbody = document.getElementById('hoursBody');
  if (tbody) tbody.innerHTML = rows ||
    `<tr class="empty-row"><td colspan="${4+activeStaff.length+5}">No cleaning jobs for this period.</td></tr>`;

  const staffFootCells = activeStaff.map(s => `<td style="text-align:center;font-weight:700;color:var(--teal)">
    ${staffTotals[s.id].hours>0?staffTotals[s.id].hours+'h':'—'}<br>
    <span style="font-size:11px">${staffTotals[s.id].pay>0?'€'+staffTotals[s.id].pay.toFixed(0):''}</span>
  </td>`).join('');
  const tfoot = document.getElementById('hoursFoot');
  if (tfoot) tfoot.innerHTML = `<tr style="background:var(--cream);font-weight:700">
    <td colspan="4">TOTAL</td>
    ${staffFootCells}
    <td style="text-align:right">${totalHours}h</td>
    <td style="text-align:right;color:var(--danger)">€${totalPay.toFixed(0)}</td>
    <td style="text-align:right;color:var(--teal-dark)">€${totalCharge.toFixed(0)}</td>
    <td></td>
  </tr>`;

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
      propList.map(p => `<option value="${p.shortName||p.propertyName}">${p.shortName||p.propertyName}</option>`).join('');
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
      propList.map(p => `<option value="${p.shortName||p.propertyName}"${(p.shortName||p.propertyName)===j.propertyName?' selected':''}>${p.shortName||p.propertyName}</option>`).join('');
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
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:20px"><p>No imports yet.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = importHistory.map(h => `<tr>
      <td style="font-size:12px">${formatDate(h.date)}</td>
      <td style="font-size:12px">${h.filename}</td>
      <td style="text-align:center">${h.bookings}</td>
      <td style="text-align:center">${h.jobs}</td>
      <td><span class="badge badge-active">Imported</span></td>
    </tr>`).join('');
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
    `<div style="display:flex;align-items:center;gap:5px;font-size:12px"><span style="width:12px;height:12px;border-radius:3px;background:#c0392b;display:inline-block"></span> Checkout (unassigned)</div>`,
    `<div style="display:flex;align-items:center;gap:5px;font-size:12px"><span style="width:12px;height:12px;border-radius:3px;background:#e67e22;display:inline-block"></span> Mid-Stay (unassigned)</div>`,
    ...activeCleaners.map((cl, i) => `<div style="display:flex;align-items:center;gap:5px;font-size:12px"><div class="cleaner-avatar" style="background:${getColor(staff.indexOf(cl))};width:16px;height:16px;font-size:9px">${getInitials(cl.firstName,cl.lastName)}</div> ${cl.firstName} ${cl.lastName}</div>`)
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
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">\u{1F9F9}</div><p>No jobs found. Import bookings to generate cleaning jobs.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = pageData.map(j => {
      const assignedCls = (j.cleanerIds||[]).map(cid => staff.find(s => s.id === cid)).filter(Boolean);
      const typeBadge = j.type === 'checkout'
        ? `<span style="background:#fdebd0;color:#a04000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500">\u{1F3C1} Checkout</span>`
        : `<span style="background:#fdf6e3;color:#8e6b23;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500">\u{1F504} Mid-Stay</span>`;
      const cleanerCell = assignedCls.length
        ? assignedCls.map(cl => `<div style="display:inline-flex;align-items:center;gap:5px;margin-right:6px"><div class="cleaner-avatar" style="background:${getColor(staff.indexOf(cl))};width:24px;height:24px;font-size:9px">${getInitials(cl.firstName,cl.lastName)}</div><span style="font-size:12px">${cl.firstName}</span></div>`).join('')
        : `<span style="color:var(--danger);font-size:12px">\u26A0 Unassigned</span>`;
      const totalPay = j.hours ? assignedCls.reduce((sum, cl) => {
        const base = (cl.hourlyRate||0) * j.hours;
        const transport = (cl.hasCar === 'Yes' && j.propertyTransport) ? j.propertyTransport : 0;
        return sum + base + transport;
      }, 0) : 0;
      const pay = totalPay > 0 ? `\u20AC${totalPay.toFixed(0)}` : '\u2014';
      return `<tr>
        <td style="font-size:12px;font-weight:500">${formatDate(j.date)}</td>
        <td style="font-size:12px">${j.propertyName||'\u2014'}</td>
        <td><span class="zone-tag zone-${(j.zone||'').replace(' ','-')}">${j.zone||'\u2014'}</span></td>
        <td>${typeBadge}</td>
        <td style="text-align:center;font-size:12px">${j.nights||'\u2014'}</td>
        <td>${cleanerCell}</td>
        <td style="text-align:center;font-size:12px">${j.hours ? j.hours+'h' : '\u2014'}</td>
        <td style="text-align:center;font-size:12px;color:var(--teal)">${j.propertyTransport ? '\u20AC'+j.propertyTransport : '\u2014'}</td>
        <td style="text-align:right;font-size:12px;font-weight:500;color:var(--teal-dark)">${pay}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-teal btn-sm" onclick="openJobModal('${j.id}')">\u270F\uFE0F</button>
            <button class="btn btn-danger btn-sm" onclick="deleteJob('${j.id}')">\u{1F5D1}</button>
          </div>
        </td>
      </tr>`;
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
    return `<label data-selected="${checked}" data-staffid="${cl.id}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid ${checked ? 'var(--teal)' : 'var(--border)'};border-radius:20px;cursor:pointer;background:${checked ? '#e0f5f1' : 'var(--cream)'};font-size:12px;font-weight:${checked?'500':'400'};transition:all 0.2s" onclick="toggleCleanerCheck(this,'${cl.id}')">
      <div class="cleaner-avatar" style="background:${getColor(idx)};width:20px;height:20px;font-size:9px">${getInitials(cl.firstName,cl.lastName)}</div>
      ${cl.firstName} ${cl.lastName}
      ${getsTransport ? '<span style="font-size:10px;color:var(--teal);margin-left:3px">\u{1F697}+\u20AC'+transportCharge+'</span>' : ''}
    </label>`;
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
    return `<span style="margin-right:16px"><strong>${cl.firstName}</strong>: \u20AC${base.toFixed(0)} pay${tr > 0 ? ' + \u20AC'+tr+' transport' : ''} = \u20AC${(base+tr).toFixed(0)}</span>`;
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
          <div class="wk2-job" style="page-break-inside:avoid">
            <div class="wk2-prop">${j.propertyName||'\u2014'}</div>
            <div class="wk2-type" style="background:${typeBg};color:${typeColor}">${j.type==='checkout'?'Checkout':'Mid-Stay'}</div>
            ${guestStr?'<div class="wk2-detail">\uD83D\uDC65 '+guestStr+'</div>':''}
            ${arrStr!=='\u2014'?'<div class="wk2-detail">\u2197 Arr: '+arrStr+'</div>':''}
            ${depStr!=='\u2014'?'<div class="wk2-detail">\u2198 Dep: '+depStr+'</div>':''}
            ${j.nights?'<div class="wk2-detail">\uD83C\uDF19 '+j.nights+' nts</div>':''}
            ${assignedCl.length?'<div class="wk2-cleaners">'+assignedCl.map(n=>'<span>'+n+'</span>').join('')+'</div>':'<div class="wk2-detail" style="color:#e74c3c">Unassigned</div>'}
            ${j.hours?'<div class="wk2-detail">\u23F1 '+j.hours+'h</div>':''}
            ${babycot?'<div class="wk2-detail" style="color:#c0392b;font-weight:700">\uD83D\uDECF BABYCOT</div>':''}
            ${j.notes&&!babycot?'<div class="wk2-note">'+j.notes+'</div>':''}
          </div>`;
        });
      }

      return `<div class="wk2-day${isWeekend?' wk2-weekend':''}${!inMonth?' wk2-outmonth':''}">
        <div class="wk2-day-hdr${dayJobs.length&&inMonth?' wk2-has-jobs':''}">${dayLabel}</div>
        <div class="wk2-day-body">${dayContent}</div>
      </div>`;
    }).join('');

    printContent += `<div class="wk2-page">
      <div class="wk2-logo">Zesty Rentals \u2014 Weekly Cleaning Schedule \u00B7 ${monthName}</div>
      <div class="wk2-week-label">${weekLabel}</div>
      <div class="wk2-grid">${dayCols}</div>
    </div>`;
  });

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'DM Sans',Arial,sans-serif; font-size:10px; color:#1e2a28; background:#fff; }
    .wk2-page { padding:14px 16px; page-break-after:always; }
    .wk2-page:last-child { page-break-after:avoid; }
    .wk2-logo { font-size:9px; color:#888; text-transform:uppercase; letter-spacing:2px; margin-bottom:8px; }
    .wk2-week-label { font-size:16px; font-weight:700; color:#115950; margin-bottom:10px; padding-bottom:6px; border-bottom:3px solid #115950; }
    .wk2-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; height:calc(100vh - 80px); }
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

  const w = window.open('', '_blank');
  w.document.write('<html><head><title>Weekly Schedule '+monthName+'</title><style>'+styles+'</style></head><body>'+(printContent||'<p style="padding:40px">No jobs.</p>')+'</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 600);
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
          .map(cid=>{const c2=staff.find(s=>s.id===cid);return c2?`<span class="coworker-tag">${c2.firstName} ${c2.lastName}</span>`:''}).join('');
        const depDt = j.date ? new Date(j.date) : null;
        const arrDt = (depDt&&j.nights) ? new Date(new Date(j.date).setDate(new Date(j.date).getDate()-j.nights)) : null;
        const arrStr = arrDt ? arrDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
        const depStr = j.type==='checkout'&&depDt ? depDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
        const babycot = (j.notes||'').toLowerCase().match(/infant|baby|cot/);
        const guestStr = j.adults||j.guests ? (j.adults?j.adults+'A':'')+(j.children?' '+j.children+'C':'')+(j.infants?' '+j.infants+'INF':'') || (j.guests||'\u2014') : '\u2014';
        return `<div class="print-job-row">
          <div><strong>${j.propertyName}</strong>${j.zone?'<br><span style="font-size:10px;color:#888">'+j.zone+'</span>':''}</div>
          <div><span class="type-badge type-${j.type}">${j.type==='checkout'?'Checkout':'Mid-Stay'}</span>${babycot?'<br><span style="background:#ffcccc;color:#c0392b;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:700">\uD83D\uDECF BABYCOT</span>':''}</div>
          <div style="font-size:11px">${arrStr}</div>
          <div style="font-size:11px">${depStr}</div>
          <div style="text-align:center">${j.nights||'\u2014'}</div>
          <div style="font-size:11px;text-align:center">${guestStr}${j.infants>0?' <span style=\"background:#ffcccc;color:#c0392b;padding:0 4px;border-radius:6px;font-size:9px;font-weight:700\">INF</span>':''}</div>
          <div>${coworkers||'<span style="color:#ccc;font-size:11px">Solo</span>'}</div>
          <div style="font-size:11px;color:#666">${(babycot?'\uD83D\uDECF BABYCOT REQ. ':'')}${j.notes||''}</div>
        </div>`;
      }).join('');

      // Each date group stays together — never splits across pages
      return `<div class="date-block">
        <div class="date-header">${dayLabel} <span style="font-size:11px;color:#888;font-weight:400">${dayJobs.length} job${dayJobs.length!==1?'s':''}</span></div>
        <div class="col-headers">
          <div>Property</div><div>Type</div><div>Arrival</div><div>Departure</div><div>Nts</div><div>Guests</div><div>Co-workers</div><div>Notes</div>
        </div>
        ${rows}
      </div>`;
    }).join('');

    printContent += `<div class="print-page">
      <div class="print-logo">Zesty Rentals \u2014 Cleaning Schedule</div>
      <div class="print-header">
        <div>
          <div class="print-name">${cl.firstName} ${cl.lastName}</div>
          <div class="print-sub">${monthName} \u00B7 ${(cl.zones||[]).join(', ')||'All zones'}${cl.hasCar==='Yes'?' \u00B7 \uD83D\uDE97 Car':''}</div>
        </div>
        <div class="print-summary">
          <div class="big">${clJobs.length} jobs</div>
          <div class="small">${totalHours.toFixed(1)}h total</div>
        </div>
      </div>
      ${clJobs.length===0?'<p style="padding:20px;color:#999">No jobs this month.</p>':dateBlocks}
      <div class="totals-row">
        <div class="total-item"><div class="total-label">Total Jobs</div><div class="total-val">${clJobs.length}</div></div>
        <div class="total-item"><div class="total-label">Total Hours</div><div class="total-val">${totalHours.toFixed(1)}h</div></div>
      </div>
    </div>`;
  });

  const w = window.open('', '_blank');
  w.document.write('<html><head><title>Cleaning Schedule '+monthName+'</title><style>'+buildPrintStyles()+'</style></head><body>'+(printContent||'<p style="padding:40px;font-family:Arial">No jobs found.</p>')+'</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 600);
}

init().catch(console.error);
showDbStatus(true);
