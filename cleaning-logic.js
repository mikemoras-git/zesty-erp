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
    const activeRows = rows.filter(r => r.Status === 'Booked' || r.Status === 'Open');

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
  if (name === 'checkin') {
    const ciM = document.getElementById('ci-month');
    const calM = document.getElementById('calMonth');
    if (ciM && !ciM.value && calM?.value) ciM.value = calM.value;
    if (typeof syncCheckinData === 'function') syncCheckinData().then(()=>renderCheckin());
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
      const roleBadge = s.role === 'checkin_agent' ? '<span style="background:#e8f4f8;color:#1a5276;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">CHECK-IN</span>' :
                        s.role === 'both' ? '<span style="background:#fdf6e3;color:#7d6608;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">BOTH</span>' : '';
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
    
    // Split by role: cleaners vs check-in agents
    const cleaners = filtered.filter(s => !s.role || s.role === 'cleaner' || s.role === 'both');
    const agents = filtered.filter(s => s.role === 'checkin_agent' || s.role === 'both');
    
    // Cleaners table
    const cleanerRows = cleaners.map(makeRow).join('');
    tbody.innerHTML = cleanerRows || `<tr><td colspan="10" style="color:var(--text-muted);text-align:center;padding:20px">No cleaners found.</td></tr>`;
    
    // Check-in agents table (separate section below)
    const agentTbody = document.getElementById('agentTable');
    const agentSection = document.getElementById('agentSection');
    if (agentTbody) {
      agentTbody.innerHTML = agents.map(makeRow).join('') || 
        `<tr><td colspan="10" style="color:var(--text-muted);text-align:center;padding:12px">No check-in agents yet. Add staff with role "Check-In Agent".</td></tr>`;
    }
    if (agentSection) agentSection.style.display = '';
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
  document.getElementById('staffModalTitle').textContent = defaultRole === 'checkin_agent' ? 'Add Check-In Agent' : 'Add Cleaner';
  const roleElNew = document.getElementById('s_role'); if(roleElNew) roleElNew.value = defaultRole || 'cleaner';
  document.getElementById('s_editId').value = '';
  clearStaffForm();
  // Re-set role after clearStaffForm resets it
  const roleElNew2 = document.getElementById('s_role'); if(roleElNew2) roleElNew2.value = defaultRole || 'cleaner';
  openModal('staffModal');
}
// Alias so buttons can call either name
function openStaffModal(defaultRole) { openAddStaff(defaultRole); }

function editStaff(id) {
  const s = staff.find(x => x.id === id);
  if (!s) return;
  document.getElementById('staffModalTitle').textContent = 'Edit Cleaner';
  document.getElementById('s_editId').value = id;
  document.getElementById('s_firstName').value = s.firstName||'';
  document.getElementById('s_lastName').value = s.lastName||'';
  document.getElementById('s_status').value = s.status||'Active';
  const _re = document.getElementById('s_role'); if(_re) _re.value = s.role||'cleaner';
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
    role: document.getElementById('s_role')?.value || 'cleaner',
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
  const cancelledIds = new Set(
    importPreviewData.filter(r => r.Status === 'Declined' || r.Status === 'Cancelled')
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
      
      // Also auto-import check-in/out agent jobs from same CSV
      let ciCreated = 0;
      allRows.forEach(r => {
        const propName = r.HouseInternalName || r.HouseName || '';
        const bookingId = r.Id;
        const coId = 'ci_co_' + bookingId;
        const ciId = 'ci_in_' + bookingId;
        if (!checkinJobs.find(x => x.id === coId)) {
          checkinJobs.push({ id: coId, property: propName, date: r.DateDeparture, type: 'checkout',
            guest: r.Name||'', time:'', flight:'', repeat:'unknown', agentId:'', notes:'',
            guests: parseInt(r.People||0)||null, adults: parseInt(r.Adults||0)||null,
            children: parseInt(r.Children||0)||null, infants: parseInt(r.Infants||0)||null,
            nights: parseInt(r.Nights)||0 });
          ciCreated++;
        }
        if (!checkinJobs.find(x => x.id === ciId)) {
          checkinJobs.push({ id: ciId, property: propName, date: r.DateArrival, type: 'checkin',
            guest: r.Name||'', time:'', flight:'', repeat:'unknown', agentId:'', notes:'',
            guests: parseInt(r.People||0)||null, adults: parseInt(r.Adults||0)||null,
            children: parseInt(r.Children||0)||null, infants: parseInt(r.Infants||0)||null,
            nights: parseInt(r.Nights)||0 });
          ciCreated++;
        }
      });
      // Remove check-in jobs for cancelled bookings
      const cancelledIds2 = new Set(
        importPreviewData.filter(r => r.Status === 'Declined' || r.Status === 'Cancelled').map(r => r.Id)
      );
      checkinJobs = checkinJobs.filter(j => {
        const bid = j.id.replace(/^ci_(co|in)_/, '');
        return !cancelledIds2.has(bid);
      });
      saveCheckinLocal();
      
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

function buildPrintStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #1e2a28; background: white; }
    .print-page { page-break-after: always; padding: 28px 32px; }
    .print-page:last-child { page-break-after: avoid; }
    .print-logo { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px; }
    .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; padding-bottom: 14px; border-bottom: 3px solid #115950; }
    .print-name { font-size: 22px; font-weight: 700; color: #115950; }
    .print-sub { font-size: 13px; color: #666; margin-top: 4px; }
    .print-summary { text-align: right; }
    .print-summary .big { font-size: 20px; font-weight: 700; color: #115950; }
    .print-summary .small { font-size: 11px; color: #888; }
    .col-headers { display: grid; grid-template-columns: 80px 1fr 80px 75px 75px 40px 50px 130px 80px; gap: 0; background: #115950; color: white; padding: 7px 10px; border-radius: 6px 6px 0 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0; }
    .print-job-row { display: grid; grid-template-columns: 80px 1fr 80px 75px 75px 40px 50px 130px 80px; gap: 0; padding: 9px 10px; border-bottom: 1px solid #e8f0ef; font-size: 12px; }
    .print-job-row:nth-child(even) { background: #f8f5f0; }
    .type-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    .type-checkout { background: #fdebd0; color: #a04000; }
    .type-midstay { background: #fdf6e3; color: #8e6b23; }
    .coworker-tag { display: inline-block; padding: 1px 6px; background: #e0f5f1; color: #115950; border-radius: 10px; font-size: 10px; font-weight: 500; margin: 1px; }
    .totals-row { display: flex; justify-content: flex-end; gap: 20px; padding: 12px 10px; border-top: 2px solid #115950; margin-top: 2px; }
    .total-item { text-align: right; }
    .total-label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
    .total-val { font-size: 16px; font-weight: 700; color: #115950; }
  `;
}

function printSchedule() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  const cleanerFilter = document.getElementById('calCleaner')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal) && (!cleanerFilter || (j.cleanerIds||[]).includes(cleanerFilter)));
  monthJobs.sort((a,b) => a.date > b.date ? 1 : -1);

  const printCleaners = cleanerFilter ? [staff.find(s => s.id === cleanerFilter)].filter(Boolean) : staff.filter(s => s.status !== 'Inactive');
  const monthName = new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  let printContent = '';

  printCleaners.forEach(cl => {
    const clJobs = monthJobs.filter(j => (j.cleanerIds||[]).includes(cl.id));
    if (clJobs.length === 0 && !cleanerFilter) return;
    const totalHours = clJobs.reduce((sum,j) => sum + (j.hours||0), 0);


    printContent += `
      <div class="print-page">
        <div class="print-logo">Zesty Rentals \u2014 Cleaning Schedule</div>
        <div class="print-header">
          <div>
            <div class="print-name">${cl.firstName} ${cl.lastName}</div>
            <div class="print-sub">${monthName} \u00B7 ${(cl.zones||[]).join(', ') || 'All zones'}${cl.hasCar==='Yes' ? ' \u00B7 \u{1F697} Car' : ''}</div>
          </div>
          <div class="print-summary">
            <div class="big">${clJobs.length} jobs</div>
            <div class="small">${totalHours.toFixed(1)}h total</div>
          </div>
        </div>
        <div class="col-headers">
          <div>Date</div><div>Property</div><div>Type</div><div>Arrival</div><div>Departure</div><div>Nts</div><div>Guests</div><div>Co-workers</div><div>Notes</div>
        </div>
        ${clJobs.length === 0 ? '<p style="padding:20px;color:#999">No jobs assigned this month.</p>' :
          clJobs.map(j => {
            const coworkers = (j.cleanerIds||[]).filter(cid => cid !== cl.id).map(cid => {
              const c2 = staff.find(s => s.id === cid);
              return c2 ? `<span class="coworker-tag">${c2.firstName} ${c2.lastName}</span>` : '';
            }).join('');
            const _depDt = j.date ? new Date(j.date) : null;
            const _arrDt = (_depDt && j.nights) ? new Date(new Date(j.date).setDate(new Date(j.date).getDate()-j.nights)) : null;
            const _arrStr = _arrDt ? _arrDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
            const _depStr = j.type==='checkout' && _depDt ? _depDt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '\u2014';
            const _babycot = (j.notes||'').toLowerCase().match(/infant|baby|cot/);
            return `<div class="print-job-row">
              <div><strong>${formatDate(j.date)}</strong></div>
              <div>${j.propertyName}${j.zone ? '<br><span style="font-size:10px;color:#888">'+j.zone+'</span>' : ''}</div>
              <div><span class="type-badge type-${j.type}">${j.type === 'checkout' ? 'Checkout' : 'Mid-Stay'}</span>${_babycot ? '<br><span style="background:#ffcccc;color:#c0392b;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:700">\u{1F6CF} BABYCOT</span>' : ''}</div>
              <div style="font-size:11px">${_arrStr}</div>
              <div style="font-size:11px">${_depStr}</div>
              <div style="text-align:center">${j.nights||'\u2014'}</div>
              <div style="font-size:11px;text-align:center">${j.adults||j.guests ? (j.adults?j.adults+'A':'')+(j.children?' '+j.children+'C':'')+(j.infants?' '+j.infants+'INF':'') || (j.guests||'—') : '—'}${j.infants>0?' <span style=\"background:#ffcccc;color:#c0392b;padding:0 4px;border-radius:6px;font-size:9px;font-weight:700\">INF</span>':''}</div>
              <div>${coworkers || '<span style="color:#ccc;font-size:11px">Solo</span>'}</div>
              <div style="font-size:11px;color:#666">${(_babycot ? '\u{1F6CF} BABYCOT REQ. ' : '')+( j.notes||'')}</div>
            </div>`;
          }).join('')
        }
        <div class="totals-row">
          <div class="total-item"><div class="total-label">Total Jobs</div><div class="total-val">${clJobs.length}</div></div>
          <div class="total-item"><div class="total-label">Total Hours</div><div class="total-val">${totalHours.toFixed(1)}h</div></div>
        </div>
      </div>`;
  });

  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Cleaning Schedule ${monthName}</title><style>${buildPrintStyles()}</style></head><body>${printContent || '<p style="padding:40px;font-family:Arial">No jobs found for this period.</p>'}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 600);
}



// Remove cleaning jobs for properties that have no cleaning fee set
async function removeNoFeeJobs() {
  // Refresh property cache from Supabase first
  try {
    const freshProps = await SyncStore.load('zesty_properties', 'properties');
    if (freshProps.data && freshProps.data.length > 0) window._propCache = freshProps.data;
  } catch(e) {}

  const toRemove = cleaningJobs.filter(j => {
    if (!j.propertyName && !j.propertyId) return false;
    return !getPropertyHasCleaning(j.propertyId || j.propertyName);
  });

  if (!toRemove.length) {
    showToast('No jobs found for no-fee properties', 'success');
    return;
  }

  // List affected properties
  const propNames = [...new Set(toRemove.map(j => j.propertyName))].sort().join(', ');
  showConfirm('🗑️', 'Remove No-Fee Property Jobs?',
    `Remove ${toRemove.length} jobs for: ${propNames}?`,
    'btn-danger', 'Remove All',
    async () => {
      const removeIds = new Set(toRemove.map(j => j.id));
      cleaningJobs = cleaningJobs.filter(j => !removeIds.has(j.id));
      // Delete from Supabase
      for (const j of toRemove) {
        await SyncStore.deleteOne('zesty_cleaning_jobs', 'cleaning_jobs', j.id, cleaningJobs);
      }
      // Clear localStorage too
      localStorage.setItem('zesty_cleaning_jobs', JSON.stringify(cleaningJobs));
      renderCalendar(); renderJobs(); updateJobStats();
      showToast(`✓ Removed ${toRemove.length} jobs for ${[...new Set(toRemove.map(j=>j.propertyName))].length} properties`, 'success');
    }
  );
}

function exportManagerExcel() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal))
    .sort((a,b) => a.date > b.date ? 1 : -1);
  if (!monthJobs.length) { showToast('No jobs for this month', 'error'); return; }

  const monthName = new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const headers = ['Date','Property','Zone','Type','Guest','Arrival','Departure','Nights',
                   'Adults','Children','Infants','Cleaners','Hours','Notes'];
  
  const rows = monthJobs.map(j => {
    const cls = (j.cleanerIds||[]).map(cid=>{const s=staff.find(x=>x.id===cid);return s?s.firstName+' '+s.lastName:'';}).filter(Boolean).join(' + ');
    const dep = j.date ? new Date(j.date) : null;
    const arr = (dep && j.nights) ? new Date(new Date(j.date).setDate(new Date(j.date).getDate()-j.nights)) : null;
    const arrStr = arr ? arr.toLocaleDateString('en-GB') : '';
    const depStr = j.type==='checkout' && dep ? dep.toLocaleDateString('en-GB') : '';
    return [
      j.date, j.propertyName||'', j.zone||'',
      j.type==='checkout'?'Checkout':'Mid-Stay',
      j.guestName||'', arrStr, depStr, j.nights||'',
      j.adults||'', j.children||'', j.infants||'',
      cls||'Unassigned', j.hours||'', j.notes||''
    ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download = `manager_schedule_${monthVal}.csv`;
  a.click();
  showToast('\u2713 Excel/CSV exported', 'success');
}

function printManagerSummary() {
  const monthVal = document.getElementById('calMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  
  const monthJobs = cleaningJobs.filter(j => j.date && j.date.startsWith(monthVal))
    .sort((a,b) => a.date > b.date ? 1 : a.date < b.date ? -1 : 0);
  
  if (!monthJobs.length) { showToast('No jobs for this month', 'error'); return; }
  
  const monthName = new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  
  // Group by date
  const byDate = {};
  monthJobs.forEach(j => {
    if (!byDate[j.date]) byDate[j.date] = [];
    byDate[j.date].push(j);
  });
  
  const styles = buildPrintStyles() + `
    .day-header { background:#1a7a6e; color:#fff; padding:8px 12px; margin-top:16px; border-radius:6px 6px 0 0; font-weight:700; font-size:13px; }
    .day-table { width:100%; border-collapse:collapse; margin-bottom:4px; font-size:11px; }
    .day-table th { background:#f0faf8; padding:6px 8px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid #1a7a6e; }
    .day-table td { padding:7px 8px; border-bottom:1px solid #e8f0ef; vertical-align:top; }
    .day-table tr:hover td { background:#f8fcfb; }
    .badge-checkout { background:#fdebd0; color:#a04000; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:700; }
    .badge-midstay { background:#fdf6e3; color:#8e6b23; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:700; }
    .badge-babycot { background:#ffcccc; color:#c0392b; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:700; border:1px solid #c0392b; }
    .cleaner-tag { display:inline-block; background:#e0f5f1; color:#115950; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:600; margin:1px; }
    .same-day-alert { background:#fff3cd; color:#856404; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:700; border:1px solid #ffc107; }
    .manager-title { font-family:Arial,sans-serif; }
    @page { size:A4 landscape; margin:8mm; }
    .day-header { page-break-before: always; }
    .day-header:first-child { page-break-before: avoid; }
    tr { page-break-inside: avoid; }
    .day-table { page-break-inside: auto; }
  `;
  
  // Check for same-day check-in/checkout
  const checkoutDates = new Set(monthJobs.filter(j=>j.type==='checkout').map(j=>j.date));
  
  let html = `<div style="font-family:Arial,sans-serif;padding:16px 0">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #1a7a6e">
      <div>
        <div style="font-size:22px;font-weight:700;color:#1a7a6e">Manager Schedule Summary</div>
        <div style="font-size:14px;color:#666;margin-top:4px">${monthName}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#888">
        <div>Zesty Rentals</div>
        <div>Printed: ${new Date().toLocaleDateString('en-GB')}</div>
        <div style="margin-top:4px;font-weight:700;color:#1a7a6e">${monthJobs.length} cleaning jobs</div>
      </div>
    </div>`;
  
  for (const [date, jobs] of Object.entries(byDate).sort()) {
    const dayName = new Date(date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
    // Check if any checkout on this day has a check-in too (same day turnover)
    const hasCheckout = jobs.some(j=>j.type==='checkout');
    
    html += `<div class="day-header">${dayName}
      ${hasCheckout ? '<span style="margin-left:12px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:8px;font-size:11px">' + jobs.filter(j=>j.type==='checkout').length + ' checkout' + (jobs.filter(j=>j.type==='checkout').length>1?'s':'') + '</span>' : ''}
      ${jobs.filter(j=>j.type==='midstay').length>0 ? '<span style="margin-left:6px;background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:8px;font-size:11px">' + jobs.filter(j=>j.type==='midstay').length + ' mid-stay</span>' : ''}
    </div>
    <table class="day-table" style="table-layout:fixed;width:100%">
      <thead><tr>
        <th style="width:22%">Property</th>
        <th style="width:9%">Type</th>
        <th style="width:14%">Guest</th>
        <th style="width:8%">Arrival</th>
        <th style="width:8%">Departure</th>
        <th style="width:5%">Nts</th>
        <th style="width:8%">Guests</th>
        <th style="width:14%">Cleaners</th>
        <th style="width:5%">Hrs</th>
        <th style="width:7%">Notes</th>
      </tr></thead>
      <tbody>`;
    
    for (const j of jobs) {
      const cls = (j.cleanerIds||[]).map(cid => {
        const cl = staff.find(s=>s.id===cid);
        return cl ? `<span class="cleaner-tag">${cl.firstName}</span>` : '';
      }).join('');
      
      // Calculate arrival from departure and nights (for checkout jobs)
      let arrivalDate = '—', departureDate = '—';
      if (j.type === 'checkout' && j.date && j.nights) {
        const dep = new Date(j.date);
        const arr = new Date(dep);
        arr.setDate(arr.getDate() - j.nights);
        arrivalDate = arr.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        departureDate = dep.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
      } else if (j.type === 'midstay' && j.date && j.midStayDay) {
        // midStayDay = days after arrival
        const cleanDate = new Date(j.date);
        const arr = new Date(cleanDate);
        arr.setDate(arr.getDate() - j.midStayDay);
        const dep = new Date(arr);
        dep.setDate(dep.getDate() + (j.nights||0));
        arrivalDate = arr.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        departureDate = dep.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
      }
      
      // Infants check for babycot (we store in guestName if noted, or check via nights < 3 shorthand)
      // Since we don't have infant count in jobs, add babycot column as manual note placeholder
      const hasBabycot = (j.notes||'').toLowerCase().includes('infant') || 
                         (j.notes||'').toLowerCase().includes('baby') ||
                         (j.notes||'').toLowerCase().includes('cot');
      
      // Same day alert: if this is a checkout and there's also a new checkin (another booking arriving same day at same property)
      const sameDayCheckIn = j.type === 'checkout' && cleaningJobs.some(other => 
        other.id !== j.id && other.date === j.date && 
        other.propertyName === j.propertyName && other.type === 'checkout'
      );
      
      // Build guest string
      const guestStr = j.adults||j.guests ? 
        [(j.adults?(j.adults+'A'):''), (j.children&&j.children>0?(j.children+'C'):''), (j.infants&&j.infants>0?('<strong style="color:#c0392b">'+j.infants+'INF</strong>'):'')]
        .filter(Boolean).join(' ') || String(j.guests||'—') : '—';
      html += `<tr style="page-break-inside:avoid">
        <td style="word-wrap:break-word"><strong style="font-size:11px">${j.propertyName||'—'}</strong>${j.zone?`<br><span style="font-size:9px;color:#888">${j.zone}</span>`:''}</td>
        <td>
          <span class="${j.type==='checkout'?'badge-checkout':'badge-midstay'}" style="font-size:9px">${j.type==='checkout'?'OUT':'MID'}</span>
          ${hasBabycot?'<br><span class="badge-babycot" style="font-size:9px">COT</span>':''}
        </td>
        <td style="font-size:10px;word-wrap:break-word">${j.guestName||'—'}</td>
        <td style="font-size:11px;white-space:nowrap">${arrivalDate}</td>
        <td style="font-size:11px;white-space:nowrap">${departureDate}</td>
        <td style="text-align:center;font-size:11px">${j.nights||'—'}</td>
        <td style="font-size:10px;text-align:center">${guestStr}</td>
        <td style="font-size:10px">${cls||'<span style="color:#e74c3c;font-size:9px">\u26A0 Unassigned</span>'}</td>
        <td style="text-align:center;font-weight:700;color:#1a7a6e;font-size:11px">${j.hours?j.hours+'h':'—'}</td>
        <td style="font-size:10px;color:#666;word-wrap:break-word">${j.notes||''}</td>
      </tr>`;
    }
    html += '</tbody></table><div style="page-break-after:always"></div>';
  }
  html += '</div>';
  
  const w = window.open('','_blank');
  w.document.write(`<html><head><title>Manager Schedule - ${monthName}</title><style>${styles}</style></head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

function printAllJobs() {
  const monthVal = document.getElementById('jobMonth').value;
  const zoneFilter = document.getElementById('jobZone').value;
  const typeFilter = document.getElementById('jobType').value;
  const cleanerFilter = document.getElementById('jobCleaner').value;
  const search = (document.getElementById('jobSearch').value||'').toLowerCase();

  let jobs = cleaningJobs.filter(j => {
    return (!monthVal || j.date.startsWith(monthVal)) &&
      (!zoneFilter || (j.zone||'').toLowerCase().includes(zoneFilter.toLowerCase())) &&
      (!typeFilter || j.type === typeFilter) &&
      (!cleanerFilter || (j.cleanerIds||[]).includes(cleanerFilter)) &&
      (!search || (j.propertyName||'').toLowerCase().includes(search));
  });
  jobs.sort((a,b) => a.date > b.date ? 1 : -1);

  const monthName = monthVal ? new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : 'All Time';
  const totalJobs = jobs.length;
  const totalPayAll = jobs.reduce((sum,j) => {
    return sum + (j.cleanerIds||[]).reduce((s2, cid) => {
      const cl = staff.find(s => s.id === cid);
      if (!cl) return s2;
      return s2 + (cl.hourlyRate||0)*(j.hours||0) + (cl.hasCar==='Yes' ? (j.propertyTransport||0) : 0);
    }, 0);
  }, 0);

  const rows = jobs.map(j => {
    const cls = (j.cleanerIds||[]).map(cid => staff.find(s => s.id === cid)).filter(Boolean);
    const totalPay = cls.reduce((sum,cl) => {
      return sum + (cl.hourlyRate||0)*(j.hours||0) + (cl.hasCar==='Yes'?(j.propertyTransport||0):0);
    }, 0);
    return `<div class="print-job-row">
      <div><strong>${formatDate(j.date)}</strong></div>
      <div>${j.propertyName}${j.zone ? '<br><span style="font-size:10px;color:#888">'+j.zone+'</span>' : ''}</div>
      <div><span class="type-badge type-${j.type}">${j.type === 'checkout' ? 'Checkout' : 'Mid-Stay'}</span></div>
      <div>${cls.map(cl=>`<span class="coworker-tag">${cl.firstName} ${cl.lastName}</span>`).join('') || '<span style="color:#e74c3c;font-size:11px">\u26A0 Unassigned</span>'}</div>
      <div>${j.hours ? j.hours+'h' : '\u2014'}</div>
      <div>${j.propertyTransport ? '\u20AC'+j.propertyTransport : '\u2014'}</div>
      <div style="font-weight:600;color:#115950">${totalPay > 0 ? '\u20AC'+totalPay.toFixed(0) : '\u2014'}</div>
      <div style="font-size:11px;color:#666">${j.notes||''}</div>
    </div>`;
  }).join('');

  const printStyles = buildPrintStyles() + `
    .col-headers { grid-template-columns: 85px 1fr 75px 130px 50px 60px 65px 80px; }
    .print-job-row { grid-template-columns: 85px 1fr 75px 130px 50px 60px 65px 80px; }
  `;

  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>All Cleaning Jobs \u2014 ${monthName}</title><style>${printStyles}</style></head><body>
    <div class="print-page">
      <div class="print-logo">Zesty Rentals \u2014 All Cleaning Jobs</div>
      <div class="print-header">
        <div>
          <div class="print-name">Cleaning Jobs Report</div>
          <div class="print-sub">${monthName}${zoneFilter ? ' \u00B7 '+zoneFilter : ''}${typeFilter ? ' \u00B7 '+(typeFilter==='checkout'?'Checkout':'Mid-Stay') : ''}</div>
        </div>
        <div class="print-summary">
          <div class="big">${totalJobs} jobs</div>
          <div class="small">Total cost: \u20AC${totalPayAll.toFixed(2)}</div>
        </div>
      </div>
      <div class="col-headers">
        <div>Date</div><div>Property</div><div>Type</div><div>Cleaners</div><div>Hours</div><div>Transport</div><div>Pay</div><div>Notes</div>
      </div>
      ${rows || '<p style="padding:20px;color:#999">No jobs found.</p>'}
    </div>
<!-- ==================== HOURS PAGE ==================== -->
<div id="page-hours" class="page">
  <div style="display:flex;gap:6px;margin-bottom:22px;flex-wrap:wrap">
    <button onclick="showPage('staff')" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text-muted);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif">\u{1F465} Staff</button>
    <button onclick="showPage('schedule')" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text-muted);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif">\u{1F4C5} Schedule</button>
    <button onclick="showPage('jobs')" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text-muted);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif">\u{1F527} Jobs</button>
    <button onclick="showPage('import')" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text-muted);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif">\u{1F4E5} Import CSV</button>
    <button onclick="showPage('hours')" style="padding:8px 18px;border-radius:8px;border:2px solid var(--teal);background:var(--teal);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">\u23F1 Hours</button>
  </div>

  <div class="toolbar" style="flex-wrap:wrap;gap:10px">
    <input type="month" id="hoursMonth" onchange="renderHoursSheet()">
    <select id="hoursPropFilter" onchange="renderHoursSheet()"><option value="">All Properties</option></select>
    <button class="btn btn-teal btn-sm" onclick="addHoursRow()">+ Add Extra Cleaning</button>
    <button class="btn btn-primary btn-sm" onclick="saveHoursSheet()">\u{1F4BE} Save Sheet</button>
    <button class="btn btn-print btn-sm" onclick="printHoursSheet()">\u{1F5A8} Print</button>
    <button class="btn btn-outline btn-sm" onclick="exportHoursCSV()">\u2B07 Export CSV</button>
    <div style="margin-left:auto;font-size:12px;color:var(--text-muted)" id="hoursSavedMsg"></div>
  </div>

  <!-- Summary -->
  <div class="stats-bar" style="margin-bottom:18px">
    <div class="stat-card"><div class="stat-label">Total Jobs</div><div class="stat-value" id="h-total">0</div></div>
    <div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value" id="h-hours">0</div></div>
    <div class="stat-card"><div class="stat-label">Total Labour Cost</div><div class="stat-value" id="h-labour">\u20AC0</div></div>
    <div class="stat-card"><div class="stat-label">Transport Cost</div><div class="stat-value" id="h-transport">\u20AC0</div></div>
    <div class="stat-card"><div class="stat-label">Total Cost</div><div class="stat-value" id="h-cost">\u20AC0</div></div>
  </div>

  <div class="table-wrap">
    <div class="table-header">
      <h3 id="hoursTableTitle">Hours Sheet</h3>
    </div>
    <div style="overflow-x:auto">
      <table id="hoursTable">
        <thead id="hoursHead"></thead>
        <tbody id="hoursBody"></tbody>
        <tfoot id="hoursFoot"></tfoot>
      </table>
    </div>
  </div>
</div>

  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

// ============ MODALS / CONFIRM / TOAST ============
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showConfirm(icon, title, msg, btnClass, btnText, cb) {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const btn = document.getElementById('confirmBtn');
  btn.className = `btn ${btnClass}`; btn.textContent = btnText;
  confirmCb = cb;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); confirmCb = null; }
function doConfirm() { if (confirmCb) confirmCb(); closeConfirm(); }
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

['staffModal','jobModal','ciModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if(e.target === e.currentTarget) closeModal(id); });
});
document.getElementById('confirmOverlay').addEventListener('click', e => { if(e.target === e.currentTarget) closeConfirm(); });


// \u2500\u2500 SIDEBAR NAVIGATION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function _initSidebar() {
  const sidebar = document.getElementById('erpSidebar');
  const overlay = document.getElementById('erpOverlay');
  const hamburger = document.getElementById('erpHamburger');
  if (!sidebar) return;
  // Hamburger toggle
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });
  }
  // Close on overlay click
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }
  // Inject Azure user badge into sidebar footer
  const origBadge = document.getElementById('_azure_badge');
  const footerUser = document.getElementById('sidebarUser');
  if (origBadge && footerUser) {
    footerUser.innerHTML = origBadge.innerHTML;
    origBadge.remove();
  }
  // Watch for badge to appear
  const obs = new MutationObserver(() => {
    const b = document.getElementById('_azure_badge');
    const fu = document.getElementById('sidebarUser');
    if (b && fu) {
      fu.innerHTML = b.innerHTML;
      b.remove();
      obs.disconnect();
    }
  });
  obs.observe(document.body, {childList:true, subtree:true});
}
document.addEventListener('DOMContentLoaded', _initSidebar);



// ══════════════════════════════════════════
// CHECK-IN AGENT MODULE
// ══════════════════════════════════════════

let checkinJobs = JSON.parse(localStorage.getItem('zesty_checkin_jobs') || '[]');

function saveCheckinLocal() {
  localStorage.setItem('zesty_checkin_jobs', JSON.stringify(checkinJobs));
}

async function saveCheckinSupabase() {
  saveCheckinLocal();
  // Upsert to Supabase cleaning_jobs table with type=checkin/checkout_agent
  const ts = new Date().toISOString();
  const rows = checkinJobs.map(j => ({id: j.id, data: j, updated_at: ts}));
  // Save in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i+50);
    await fetch(DB.url + '/rest/v1/checkin_jobs', {
      method: 'POST',
      headers: {...DB.headers, 'Prefer': 'resolution=merge-duplicates'},
      body: JSON.stringify(batch)
    }).catch(() => {});
  }
}

// ── Render check-in page ──
function renderCheckin() {
  const monthVal = document.getElementById('ci-month')?.value || '';
  const agentF = document.getElementById('ci-agent')?.value || '';

  // Populate property datalist
  const propList = document.getElementById('ci_propList');
  if (propList) {
    const props = [...new Set(cleaningJobs.map(j=>j.propertyName).filter(Boolean))].sort();
    propList.innerHTML = props.map(p=>`<option value="${p}">`).join('');
  }

  // Populate agent filter
  const agentSel = document.getElementById('ci-agent');
  const agentModalSel = document.getElementById('ci_agent_sel');
  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  if (agentSel) {
    const cur = agentSel.value;
    agentSel.innerHTML = '<option value="">All Agents</option>' +
      activeStaff.map(s=>`<option value="${s.id}" ${s.id===cur?'selected':''}>${s.firstName} ${s.lastName}</option>`).join('');
  }
  if (agentModalSel) {
    const cur = agentModalSel.value;
    // Load from HR employees module (zesty_employees key) - all active staff available as agents
    const hrEmployees = JSON.parse(localStorage.getItem('zesty_employees') || '[]')
      .filter(e => (e.status||'Active') === 'Active');
    // Also include cleaning staff with checkin_agent role
    const cleaningAgents = staff.filter(s => s.status !== 'Inactive' && 
      (s.role === 'checkin_agent' || s.role === 'both'));
    // Build combined list - HR employees first, then cleaning agents not already listed
    const agentList = [...hrEmployees.map(e => ({
      id: 'hr_' + (e.id||e.firstName+e.lastName),
      firstName: e.firstName || '', lastName: e.lastName || '',
      dept: e.department || ''
    }))];
    cleaningAgents.forEach(a => {
      if (!agentList.find(x => x.firstName===a.firstName && x.lastName===a.lastName))
        agentList.push({id: a.id, firstName: a.firstName, lastName: a.lastName, dept: 'Cleaning'});
    });
    // If empty, show all cleaning staff as fallback
    if (!agentList.length) {
      staff.filter(s=>s.status!=='Inactive').forEach(s => agentList.push({id:s.id, firstName:s.firstName, lastName:s.lastName, dept:'Cleaning'}));
    }
    agentModalSel.innerHTML = '<option value="">-- Select Agent --</option>' +
      agentList.map(s=>`<option value="${s.id}" ${s.id===cur?'selected':''}>${s.firstName} ${s.lastName}${s.dept?' ('+s.dept+')':''}</option>`).join('');
  }

  let jobs = checkinJobs.filter(j =>
    (!monthVal || (j.date||'').startsWith(monthVal)) &&
    (!agentF || j.agentId === agentF)
  ).sort((a,b) => (a.date||'') > (b.date||'') ? 1 : (a.date||'') < (b.date||'') ? -1 : 0);

  // Detect same-day checkin/checkout from cleaning schedule
  const checkoutDates = new Set(cleaningJobs
    .filter(j => j.type==='checkout' && (!monthVal || j.date.startsWith(monthVal)))
    .map(j => j.date + '|' + j.propertyName));

  let sameDayCount = 0;
  jobs.forEach(j => {
    if (j.type === 'checkin') {
      j._sameDay = checkoutDates.has(j.date + '|' + j.property);
      if (j._sameDay) sameDayCount++;
    }
  });

  // Stats
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('ci-stat-in', jobs.filter(j=>j.type==='checkin').length);
  setEl('ci-stat-out', jobs.filter(j=>j.type==='checkout').length);
  setEl('ci-stat-same', sameDayCount);
  setEl('ci-stat-repeat', jobs.filter(j=>j.repeat==='yes').length);

  const alertEl = document.getElementById('ci-same-day-alert');
  if (alertEl) alertEl.style.display = sameDayCount > 0 ? '' : 'none';

  const monthName = monthVal ? new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : 'All';
  const titleEl = document.getElementById('ci-title');
  if (titleEl) titleEl.textContent = 'Check-In Schedule — ' + monthName;

  const tbody = document.getElementById('ci-tbody');
  if (!tbody) return;

  if (!jobs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No check-in jobs for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = jobs.map(j => {
    const agent = staff.find(s => s.id === j.agentId);
    const agentName = agent ? agent.firstName + ' ' + agent.lastName : '<span style="color:var(--danger)">\u26A0 Unassigned</span>';
    const typeBadge = j.type === 'checkin'
      ? '<span style="background:#e0f5f1;color:#115950;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">CHECK-IN</span>'
      : '<span style="background:#fdebd0;color:#a04000;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">CHECK-OUT</span>';
    const sameDayBadge = j._sameDay ? ' <span style="background:#fff3cd;color:#856404;padding:1px 5px;border-radius:8px;font-size:10px;font-weight:700">\u26A0 SAME DAY CLEAN</span>' : '';
    const repeatBadge = j.repeat === 'yes' ? ' <span style="color:var(--teal);font-size:11px">\u2605 Repeat</span>' : '';
    return `<tr style="${j._sameDay ? 'background:#fffbe6' : ''}">
      <td style="font-weight:600;font-size:12px">${formatDate(j.date)}</td>
      <td style="font-size:12px">${j.property||'\u2014'}</td>
      <td>${typeBadge}${sameDayBadge}</td>
      <td style="font-size:12px">${j.guest||'\u2014'}${repeatBadge}</td>
      <td style="font-size:12px">${j.time||'\u2014'}</td>
      <td style="font-size:12px">${j.flight||'\u2014'}</td>
      <td style="text-align:center">${j.repeat==='yes' ? '\u2605 Yes' : j.repeat==='no' ? 'No' : '?'}</td>
      <td style="font-size:12px">${agentName}</td>
      <td style="font-size:11px;color:var(--text-muted)">${j.notes||''}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-teal btn-sm" onclick="openCheckinModal('${j.id}')">\u270F\uFE0F</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCheckinJob('${j.id}')">\u{1F5D1}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openCheckinModal(id) {
  const j = id ? checkinJobs.find(x=>x.id===id) : null;
  document.getElementById('ci_editId').value = id || '';
  document.getElementById('ci_property').value = j?.property || '';
  document.getElementById('ci_date').value = j?.date || new Date().toISOString().slice(0,10);
  document.getElementById('ci_type').value = j?.type || 'checkin';
  document.getElementById('ci_time').value = j?.time || '';
  document.getElementById('ci_flight').value = j?.flight || '';
  document.getElementById('ci_guest').value = j?.guest || '';
  document.getElementById('ci_repeat').value = j?.repeat || 'no';
  document.getElementById('ci_notes').value = j?.notes || '';
  document.getElementById('ci_agent_sel').value = j?.agentId || '';
  document.getElementById('ci_deleteBtn').style.display = id ? '' : 'none';
  renderCheckin(); // populate agent dropdown
  document.getElementById('ci_agent_sel').value = j?.agentId || '';
  openModal('ciModal');
}

async function saveCheckinJob() {
  const id = document.getElementById('ci_editId').value;
  const job = {
    id: id || 'ci_' + Date.now(),
    property: document.getElementById('ci_property').value.trim(),
    date: document.getElementById('ci_date').value,
    type: document.getElementById('ci_type').value,
    time: document.getElementById('ci_time').value,
    flight: document.getElementById('ci_flight').value.trim(),
    guest: document.getElementById('ci_guest').value.trim(),
    repeat: document.getElementById('ci_repeat').value,
    agentId: document.getElementById('ci_agent_sel').value,
    notes: document.getElementById('ci_notes').value.trim(),
  };
  if (!job.property || !job.date) { showToast('Property and date required', 'error'); return; }
  const idx = checkinJobs.findIndex(x=>x.id===job.id);
  if (idx >= 0) checkinJobs[idx] = job;
  else checkinJobs.push(job);
  saveCheckinLocal();
  closeModal('ciModal');
  renderCheckin();
  showToast('\u2713 Check-in job saved', 'success');
}

function deleteCheckinJob(id) {
  const jobId = id || document.getElementById('ci_editId').value;
  showConfirm('\u{1F5D1}\uFE0F', 'Delete Job?', 'Remove this check-in job?', 'btn-danger', 'Delete', () => {
    checkinJobs = checkinJobs.filter(j=>j.id!==jobId);
    saveCheckinLocal();
    closeModal('ciModal');
    renderCheckin();
    showToast('Deleted', 'error');
  });
}

// ── Import check-in jobs from cleaning schedule ──
// Creates check-in and checkout jobs from cleaning_jobs for the current month
function importCheckinFromSchedule() {
  const monthVal = document.getElementById('ci-month')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  
  const monthCheckouts = cleaningJobs.filter(j => 
    j.type === 'checkout' && j.date && j.date.startsWith(monthVal)
  );
  
  let added = 0;
  monthCheckouts.forEach(cj => {
    // Check-out agent job (on checkout date)
    const coId = 'ci_co_' + cj.id;
    if (!checkinJobs.find(x=>x.id===coId)) {
      checkinJobs.push({
        id: coId, property: cj.propertyName, date: cj.date,
        type: 'checkout', guest: cj.guestName || '', time: '',
        flight: '', repeat: 'unknown', agentId: '', notes: '',
        linkedCleanJobId: cj.id
      });
      added++;
    }
    // Check-in agent job — on same date (turnover day)
    const ciId = 'ci_in_' + cj.id;
    if (!checkinJobs.find(x=>x.id===ciId)) {
      checkinJobs.push({
        id: ciId, property: cj.propertyName, date: cj.date,
        type: 'checkin', guest: '', time: '', flight: '',
        repeat: 'unknown', agentId: '', notes: '',
        linkedCleanJobId: cj.id
      });
      added++;
    }
  });
  saveCheckinLocal();
  renderCheckin();
  showToast('\u26A1 Imported ' + added + ' check-in jobs from schedule', 'success');
}

function exportCheckinCSV() {
  const monthVal = document.getElementById('ci-month')?.value || '';
  const jobs = checkinJobs.filter(j => !monthVal || (j.date||'').startsWith(monthVal))
    .sort((a,b) => (a.date||'')>(b.date||'')?1:-1);
  const headers = ['Date','Property','Type','Guest','Time','Flight','Repeat','Agent','Notes'];
  const rows = jobs.map(j => {
    const agent = staff.find(s=>s.id===j.agentId);
    return [j.date, j.property, j.type, j.guest, j.time, j.flight,
            j.repeat, agent?agent.firstName+' '+agent.lastName:'', j.notes]
      .map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download = 'checkin_schedule_' + (monthVal||'all') + '.csv';
  a.click();
  showToast('\u2713 Exported', 'success');
}

function printCheckinSchedule() {
  const monthVal = document.getElementById('ci-month')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const jobs = checkinJobs.filter(j => j.date && j.date.startsWith(monthVal))
    .sort((a,b) => (a.date||'')>(b.date||'')?1:-1);
  const monthName = new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  const checkoutDates = new Set(cleaningJobs
    .filter(j=>j.type==='checkout'&&j.date&&j.date.startsWith(monthVal))
    .map(j=>j.date+'|'+j.propertyName));

  const rows = jobs.map(j => {
    const agent = staff.find(s=>s.id===j.agentId);
    const agentName = agent ? agent.firstName+' '+agent.lastName : '\u26A0 Unassigned';
    const sameDay = j.type==='checkin' && checkoutDates.has(j.date+'|'+j.property);
    return `<tr style="${sameDay?'background:#fffbe6':''}">
      <td><strong>${formatDate(j.date)}</strong></td>
      <td>${j.property||'\u2014'}</td>
      <td><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${j.type==='checkin'?'#e0f5f1':'#fdebd0'};color:${j.type==='checkin'?'#115950':'#a04000'}">${j.type==='checkin'?'CHECK-IN':'CHECK-OUT'}</span>${sameDay?' <span style="background:#fff3cd;color:#856404;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:700">SAME DAY CLEAN</span>':''}</td>
      <td>${j.guest||'\u2014'}${j.repeat==='yes'?' \u2605':''}</td>
      <td>${j.time||'\u2014'}</td>
      <td>${j.flight||'\u2014'}</td>
      <td>${agentName}</td>
      <td style="font-size:11px;color:#666">${j.notes||''}</td>
    </tr>`;
  }).join('');

  const w = window.open('','_blank');
  w.document.write(`<html><head><title>Check-In Schedule ${monthName}</title><style>
    body{font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#1e2a28;padding:24px}
    h1{color:#115950;font-size:20px;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#115950;color:#fff;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
    td{padding:8px 10px;border-bottom:1px solid #e8f0ef;vertical-align:top}
    tr:nth-child(even) td{background:#f8fcfb}
    @page{size:A4 landscape;margin:8mm}
  </style></head><body>
    <h1>Check-In Agent Schedule</h1>
    <p style="color:#888;margin-bottom:16px">${monthName} &nbsp;&middot;&nbsp; Printed: ${new Date().toLocaleDateString('en-GB')}</p>
    <table>
      <thead><tr><th>Date</th><th>Property</th><th>Type</th><th>Guest</th><th>Time</th><th>Flight</th><th>Agent</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// Show checkin page init
function initCheckinPage() {
  const now = new Date();
  const ciMonthEl = document.getElementById('ci-month');
  if (ciMonthEl && !ciMonthEl.value) {
    ciMonthEl.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  renderCheckin();
}


init().catch(console.error);
showDbStatus(true);

// \u2500\u2500 HOURS SHEET \u2500\u2500
let hoursExtra = []; // extra manual cleaning rows

function renderHoursSheet() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  if (!monthVal) { 
    // Set to current calMonth
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

  // Active cleaners only (role=cleaner or both or no role)
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

  // Build table header: Date | Property | Type | Guest | [cleaner cols] | Total Hrs | Notes
  const staffCols = activeStaff.map(s => {
    const chargeR = s.chargeRate || s.hourlyRate || 0;
    const costR = s.hourlyRate || 0;
    const margin = chargeR - costR;
    return `<th style="min-width:90px;text-align:center">${s.firstName}<br>
      <span style="font-size:9px;color:var(--text-muted)">cost €${costR}/h</span><br>
      <span style="font-size:9px;color:var(--teal)">charge €${chargeR}/h</span>${margin>0?`<br><span style="font-size:9px;color:#27ae60">+€${margin} margin</span>`:''}
    </th>`;
  }).join('');

  const thead = document.getElementById('hoursHead');
  if (thead) thead.innerHTML = `<tr>
    <th style="width:90px">Date</th>
    <th>Property</th>
    <th style="width:80px">Type</th>
    <th style="width:120px">Guest</th>
    ${staffCols}
    <th style="text-align:right;width:70px">Hrs</th>
    <th style="text-align:right;width:70px">Cost</th>
    <th style="text-align:right;width:70px">Charge</th>
    <th style="text-align:right;width:70px;color:#27ae60">Profit</th>
    <th style="width:100px">Notes</th>
  </tr>`;

  // Totals
  let totalHours = 0, totalPay = 0, totalCharge = 0;
  const staffTotals = {};
  activeStaff.forEach(s => staffTotals[s.id] = {hours:0, pay:0});

  const rows = filteredJobs.map((j, jIdx) => {
    const assignedIds = j.cleanerIds || [];
    let rowHours = 0, rowPay = 0, rowCharge = 0;

    const staffCells = activeStaff.map(s => {
      // Get hours: from cleanerHours if set, else if assigned use job hours, else empty
      const savedHrs = j.cleanerHours?.[s.id];
      const hrs = savedHrs !== undefined ? savedHrs : (assignedIds.includes(s.id) && j.hours ? j.hours : '');
      const hrsNum = parseFloat(hrs) || 0;
      const pay = hrsNum * (s.hourlyRate || 0);
      const charge = hrsNum * (s.chargeRate || s.hourlyRate || 0);
      if (hrsNum > 0) {
        rowHours += hrsNum;
        rowPay += pay;
        rowCharge += charge;
        staffTotals[s.id].hours += hrsNum;
        staffTotals[s.id].pay += pay;
        staffTotals[s.id].charge = (staffTotals[s.id].charge||0) + charge;
      }
      return `<td style="text-align:center;padding:4px">
        <input type="number" min="0" max="24" step="0.5" value="${hrs}"
          data-jobid="${j.id}" data-staffid="${s.id}"
          onchange="onHoursChange(this)"
          style="width:58px;padding:5px;border:1px solid var(--border);border-radius:6px;
                 text-align:center;font-size:13px;font-family:'DM Sans',sans-serif;
                 background:${hrsNum>0?'#e0f5f1':'#fff'}">
      </td>`;
    }).join('');

    totalHours += rowHours;
    totalPay += rowPay;
    totalCharge += rowCharge;

    const typeBadge = j.type==='checkout'
      ? `<span style="background:#fdebd0;color:#a04000;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">CHECKOUT</span>`
      : `<span style="background:#fdf6e3;color:#8e6b23;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">MID-STAY</span>`;

    const infants = j.infants > 0 ? ` <span style="background:#ffcccc;color:#c0392b;padding:0 4px;border-radius:5px;font-size:9px">INF</span>` : '';

    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="font-size:12px;white-space:nowrap">${formatDate(j.date)}</td>
      <td style="font-size:12px">${j.propertyName||'—'}</td>
      <td>${typeBadge}</td>
      <td style="font-size:11px;color:var(--text-muted)">${j.guestName||'—'}${infants}</td>
      ${staffCells}
      <td style="text-align:right;font-weight:700;color:var(--teal)">${rowHours>0?rowHours+'h':'—'}</td>
      <td style="text-align:right;font-size:12px;color:var(--teal-dark)">${rowPay>0?'€'+rowPay.toFixed(0):'—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${j.notes||''}</td>
    </tr>`;
  }).join('');

  const tbody = document.getElementById('hoursBody');
  if (tbody) tbody.innerHTML = rows || `<tr class="empty-row"><td colspan="${4+activeStaff.length+3}">No cleaning jobs found for this period.</td></tr>`;

  // Footer totals per staff
  const staffFootCells = activeStaff.map(s => `<td style="text-align:center;font-weight:700;color:var(--teal)">
    ${staffTotals[s.id].hours>0?staffTotals[s.id].hours+'h':'—'}<br>
    <span style="font-size:11px">${staffTotals[s.id].pay>0?'€'+staffTotals[s.id].pay.toFixed(0):''}</span>
  </td>`).join('');
  const tfoot = document.getElementById('hoursFoot');
  if (tfoot) tfoot.innerHTML = `<tr style="background:var(--cream);font-weight:700">
    <td colspan="4">TOTAL</td>
    ${staffFootCells}
    <td style="text-align:right">${totalHours}h</td>
    <td style="text-align:right;color:var(--teal-dark)">€${totalPay.toFixed(0)}</td>
    <td></td>
  </tr>`;

  // Summary stats
  const setEl=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('h-total', filteredJobs.length);
  setEl('h-hours', totalHours+'h');
  setEl('h-labour', '€'+totalPay.toFixed(0));
  setEl('h-transport', '€'+filteredJobs.reduce((s,j)=>{
    const cls=(j.cleanerIds||[]).map(cid=>staff.find(x=>x.id===cid)).filter(Boolean);
    return s+cls.filter(cl=>cl.hasCar==='Yes').length*(j.propertyTransport||0);
  },0).toFixed(0));
  setEl('h-cost', '€'+(totalPay).toFixed(0));

  window._currentHoursJobs = filteredJobs;
}

async function onHoursChange(input) {
  const jobId = input.dataset.jobid;
  const staffId = input.dataset.staffid;
  const hrs = parseFloat(input.value) || 0;
  const job = cleaningJobs.find(j => j.id === jobId);
  if (!job) return;
  if (!job.cleanerHours) job.cleanerHours = {};
  job.cleanerHours[staffId] = hrs || undefined; // remove if 0
  if (hrs === 0) delete job.cleanerHours[staffId];
  // Highlight
  input.style.background = hrs > 0 ? '#e0f5f1' : '#fff';
  // Auto-save after short delay
  clearTimeout(window._hoursSaveTimer);
  window._hoursSaveTimer = setTimeout(() => saveHoursSheet(), 1500);
}

async function saveHoursSheet() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  const msg = document.getElementById('hoursSavedMsg');
  if (msg) msg.textContent = 'Saving…';
  await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
  // Save monthly snapshot
  if (monthVal && window._currentHoursJobs) {
    const snapshot = {
      month: monthVal,
      savedAt: new Date().toISOString(),
      jobs: window._currentHoursJobs.map(j => ({
        id:j.id, date:j.date, propertyName:j.propertyName, type:j.type,
        guestName:j.guestName, cleanerIds:j.cleanerIds, cleanerHours:j.cleanerHours||{},
        hours:j.hours, propertyTransport:j.propertyTransport,
        guests:j.guests, adults:j.adults, children:j.children, infants:j.infants
      }))
    };
    const all = JSON.parse(localStorage.getItem('zesty_hours_snapshots')||'{}');
    all[monthVal] = snapshot;
    localStorage.setItem('zesty_hours_snapshots', JSON.stringify(all));
  }
  if (msg) { msg.textContent = '✓ Saved ' + new Date().toLocaleTimeString('en-GB'); setTimeout(()=>{if(msg)msg.textContent='';},3000); }
  showToast('✓ Hours saved', 'success');
}


function updateExtraJob(jobId, field, value) {
  const idx = cleaningJobs.findIndex(j => j.id === jobId);
  if (idx >= 0) cleaningJobs[idx][field] = value;
}

function removeExtraHoursRow(jobId) {
  cleaningJobs = cleaningJobs.filter(j => j.id !== jobId);
  if (window._hoursExtra) window._hoursExtra = window._hoursExtra.filter(id => id !== jobId);
  renderHoursSheet();
}

function addHoursRow() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const date = monthVal + '-01';
  if (!window._hoursExtra) window._hoursExtra = [];
  const extraJob = {
    id: 'extra_' + Date.now(),
    date, propertyName: '', type: 'checkout',
    guestName: '', cleanerIds: [], cleanerHours: {},
    hours: null, propertyTransport: 0, notes: '',
    _extra: true, _editable: true
  };
  // Add to cleaningJobs temporarily (will save on saveHoursSheet)
  cleaningJobs.push(extraJob);
  window._hoursExtra.push(extraJob.id);
  renderHoursSheet();
  showToast('Extra row added — fill in details and save', 'info');
}


function exportHoursCSV() {
  const monthVal = document.getElementById('hoursMonth').value;
  const jobs = window._currentHoursJobs || [];
  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  const headers = ['Date','Property','Type','Guest',...activeStaff.map(s=>s.firstName+' '+s.lastName),'Total Hours','Transport','Total Pay'];
  const rows = jobs.map(j => {
    const staffHrs = activeStaff.map(s => (j.cleanerHours&&j.cleanerHours[s.id]) || '');
    const totalH = staffHrs.reduce((s,h)=>s+(parseFloat(h)||0),0);
    const totalPay = activeStaff.reduce((sum,s,i) => {
      const h = parseFloat(staffHrs[i])||0;
      return sum + h*(s.hourlyRate||0) + (h>0&&s.hasCar==='Yes'?(j.propertyTransport||0):0);
    }, 0);
    return [j.date,j.propertyName||'',j.type,j.guestName||'',...staffHrs,totalH||'',j.propertyTransport||'',totalPay>0?totalPay.toFixed(2):''];
  });
  const csv = [headers,...rows].map(r=>r.map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download = `hours_${monthVal}.csv`; a.click();
}

function printHoursSheet() {
  const monthVal = document.getElementById('hoursMonth').value;
  const jobs = window._currentHoursJobs || [];
  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  const monthName = monthVal ? new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : '';
  const staffCols = activeStaff.map(s=>`<th style="min-width:70px">${s.firstName}</th>`).join('');
  const rows = jobs.map(j => {
    const staffHrs = activeStaff.map(s => (j.cleanerHours&&j.cleanerHours[s.id]) ? `<strong>${j.cleanerHours[s.id]}h</strong>` : '\u2014');
    const totalH = activeStaff.reduce((s,st) => s+(parseFloat(j.cleanerHours&&j.cleanerHours[st.id])||0),0);
    return `<tr><td>${formatDate(j.date)}</td><td>${j.propertyName||'\u2014'}</td><td>${j.type==='checkout'?'Checkout':'Mid-Stay'}</td>${staffHrs.map(h=>`<td style="text-align:center">${h}</td>`).join('')}<td style="text-align:right;font-weight:700">${totalH||'\u2014'}</td></tr>`;
  }).join('');
  const w = window.open('','_blank');
  w.document.write(`<html><head><title>Hours ${monthName}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#1e2a28}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #d4e0de;text-align:left}
    th{background:#f0faf8;font-weight:700;font-size:11px;text-transform:uppercase}
    h1{font-size:18px;color:#115950;margin-bottom:4px}
    @page{margin:12mm}
  </style></head><body>
    <h1>Cleaning Hours \u2014 ${monthName}</h1>
    <p style="color:#6b7e7b;margin-bottom:14px">Zesty Rentals</p>
    <table><thead><tr><th>Date</th><th>Property</th><th>Type</th>${staffCols}<th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </body></html>`);
  w.document.close(); setTimeout(()=>w.print(),400);
}

// Init hours tab
(function(){
  const now = new Date();
  const el = document.getElementById('hoursMonth');
  if(el) el.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  // Load saved extra rows
  try { hoursExtra = JSON.parse(localStorage.getItem('zesty_hours_extra')||'[]'); } catch { hoursExtra=[]; }
})();



// ══════════════════════════════════════════════════════════
// CHECK-IN AGENT MODULE
// ══════════════════════════════════════════════════════════
// checkinJobs - declared in new module below

// Load/save checkin jobs (localStorage + Supabase via SyncStore)
async function syncCheckinData() {
  const r = await SyncStore.load('zesty_checkin_jobs', 'checkin_jobs');
  if (r.data) checkinJobs = r.data;
}

async function saveCheckin() {
  await SyncStore.saveAll('zesty_checkin_jobs', 'checkin_jobs', checkinJobs);
}

// Populate agent dropdown from staff
function populateCiAgents() {
  const agentSel = document.getElementById('ci_agent_sel');
  const ciAgentFilter = document.getElementById('ci-agent');
  const agents = staff.filter(s => s.status !== 'Inactive');
  const opts = agents.map(s => `<option value="${s.id}">${s.firstName} ${s.lastName}</option>`).join('');
  if (agentSel) agentSel.innerHTML = '<option value="">-- Select Agent --</option>' + opts;
  if (ciAgentFilter) ciAgentFilter.innerHTML = '<option value="">All Agents</option>' + opts;
}

// Populate property datalist
function populateCiProps() {
  const dl = document.getElementById('ci_propList');
  if (!dl) return;
  const props = [...new Set(cleaningJobs.map(j => j.propertyName).filter(Boolean))].sort();
  dl.innerHTML = props.map(p => `<option value="${p}">`).join('');
}

function renderCheckin() {
  populateCiAgents();
  populateCiProps();

  const monthVal = document.getElementById('ci-month')?.value || '';
  const agentF = document.getElementById('ci-agent')?.value || '';

  const monthName = monthVal ? new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : 'All';
  const titleEl = document.getElementById('ci-title');
  if (titleEl) titleEl.textContent = 'Check-In Schedule — ' + monthName;

  let jobs = checkinJobs.filter(j =>
    (!monthVal || (j.date||'').startsWith(monthVal)) &&
    (!agentF || j.agentId === agentF)
  ).sort((a,b) => (a.date||'') > (b.date||'') ? 1 : (a.date||'') < (b.date||'') ? -1 : 0);

  // Detect same-day checkout + checkin for SAME property
  const sameDayMap = {};
  jobs.forEach(j => {
    const key = j.date + '|' + j.propertyName;
    if (!sameDayMap[key]) sameDayMap[key] = [];
    sameDayMap[key].push(j.type);
  });
  // Also check against cleaning checkout jobs
  cleaningJobs.filter(j => j.type==='checkout' && (!monthVal || (j.date||'').startsWith(monthVal))).forEach(cj => {
    const key = cj.date + '|' + cj.propertyName;
    if (!sameDayMap[key]) sameDayMap[key] = [];
    sameDayMap[key].push('cleaning_checkout');
  });

  const sameDayKeys = new Set(Object.keys(sameDayMap).filter(k => {
    const types = sameDayMap[k];
    return types.includes('checkin') && (types.includes('checkout') || types.includes('cleaning_checkout'));
  }));

  // Stats
  const checkins = jobs.filter(j=>j.type==='checkin').length;
  const checkouts = jobs.filter(j=>j.type==='checkout').length;
  const sameDay = sameDayKeys.size;
  const repeats = jobs.filter(j=>j.repeat==='yes').length;
  document.getElementById('ci-stat-in').textContent = checkins;
  document.getElementById('ci-stat-out').textContent = checkouts;
  document.getElementById('ci-stat-same').textContent = sameDay;
  document.getElementById('ci-stat-repeat').textContent = repeats;

  const alertEl = document.getElementById('ci-same-day-alert');
  if (alertEl) alertEl.style.display = sameDay > 0 ? '' : 'none';

  const tbody = document.getElementById('ci-tbody');
  if (!tbody) return;

  if (!jobs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No check-in jobs for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = jobs.map(j => {
    const agent = staff.find(s => s.id === j.agentId);
    const agentName = agent ? agent.firstName + ' ' + agent.lastName : '<span style="color:#e74c3c;font-size:11px">\u26a0 Unassigned</span>';
    const key = j.date + '|' + j.propertyName;
    const isSameDay = sameDayKeys.has(key);
    const isRepeat = j.repeat === 'yes';
    const typeBadge = j.type === 'checkin'
      ? '<span style="background:#d5f5e3;color:#1e8449;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">\u2192 CHECK-IN</span>'
      : '<span style="background:#fdebd0;color:#a04000;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">\u2190 CHECK-OUT</span>';

    return `<tr style="${isSameDay ? 'background:#fffbe6;' : ''}">
      <td style="font-weight:600;font-size:12px">${formatDate(j.date||'')}${isSameDay ? ' <span title="Same-day turnover" style="color:#e67e22;font-size:14px">\u26a0\ufe0f</span>' : ''}</td>
      <td style="font-size:12px">${j.propertyName||'\u2014'}</td>
      <td>${typeBadge}</td>
      <td style="font-size:12px">${j.guestName||'\u2014'}${isRepeat ? ' <span style="color:var(--teal);font-weight:700" title="Repeat guest">\u2605</span>' : ''}</td>
      <td style="font-size:12px;font-weight:600">${j.time||'\u2014'}</td>
      <td style="font-size:12px;color:var(--text-muted)">${j.flight||'\u2014'}</td>
      <td style="text-align:center">${isRepeat ? '<span style="color:var(--teal);font-weight:700">\u2605 Yes</span>' : (j.repeat==='no' ? 'No' : '\u2014')}</td>
      <td style="font-size:12px">${agentName}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:120px">${j.notes||''}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-teal btn-sm" onclick="openCheckinModal('${j.id}')">\u270f\ufe0f</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCheckinJob('${j.id}')">\u{1f5d1}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openCheckinModal(id) {
  populateCiAgents();
  populateCiProps();
  const delBtn = document.getElementById('ci_deleteBtn');

  if (!id) {
    // New job
    document.getElementById('ci_editId').value = '';
    document.getElementById('ci_property').value = '';
    document.getElementById('ci_date').value = document.getElementById('ci-month')?.value
      ? document.getElementById('ci-month').value + '-01' : '';
    document.getElementById('ci_type').value = 'checkin';
    document.getElementById('ci_time').value = '';
    document.getElementById('ci_flight').value = '';
    document.getElementById('ci_guest').value = '';
    document.getElementById('ci_repeat').value = 'no';
    document.getElementById('ci_agent_sel').value = '';
    document.getElementById('ci_notes').value = '';
    if (delBtn) delBtn.style.display = 'none';
  } else {
    const j = checkinJobs.find(x => x.id === id);
    if (!j) return;
    document.getElementById('ci_editId').value = id;
    document.getElementById('ci_property').value = j.propertyName || '';
    document.getElementById('ci_date').value = j.date || '';
    document.getElementById('ci_type').value = j.type || 'checkin';
    document.getElementById('ci_time').value = j.time || '';
    document.getElementById('ci_flight').value = j.flight || '';
    document.getElementById('ci_guest').value = j.guestName || '';
    document.getElementById('ci_repeat').value = j.repeat || 'no';
    document.getElementById('ci_agent_sel').value = j.agentId || '';
    document.getElementById('ci_notes').value = j.notes || '';
    if (delBtn) delBtn.style.display = '';
  }
  openModal('ciModal');
}

async function saveCheckinJob() {
  const id = document.getElementById('ci_editId').value;
  const job = {
    id: id || 'ci_' + Date.now(),
    propertyName: document.getElementById('ci_property').value.trim(),
    date: document.getElementById('ci_date').value,
    type: document.getElementById('ci_type').value,
    time: document.getElementById('ci_time').value,
    flight: document.getElementById('ci_flight').value.trim().toUpperCase(),
    guestName: document.getElementById('ci_guest').value.trim(),
    repeat: document.getElementById('ci_repeat').value,
    agentId: document.getElementById('ci_agent_sel').value,
    notes: document.getElementById('ci_notes').value.trim(),
  };
  if (!job.propertyName || !job.date) { showToast('Property and date required', 'error'); return; }

  if (id) {
    const idx = checkinJobs.findIndex(j => j.id === id);
    if (idx >= 0) checkinJobs[idx] = job;
    else checkinJobs.push(job);
  } else {
    checkinJobs.push(job);
  }

  await saveCheckin();
  closeModal('ciModal');
  renderCheckin();
  showToast('\u2713 Check-in job saved', 'success');
}

async function deleteCheckinJob(id) {
  const jobId = id || document.getElementById('ci_editId').value;
  if (!jobId) return;
  showConfirm('\u{1f5d1}\ufe0f', 'Delete Job?', 'Remove this check-in job?', 'btn-danger', 'Delete', async () => {
    checkinJobs = checkinJobs.filter(j => j.id !== jobId);
    await SyncStore.deleteOne('zesty_checkin_jobs', 'checkin_jobs', jobId, checkinJobs);
    closeModal('ciModal');
    renderCheckin();
    showToast('Deleted', 'error');
  });
}

function printCheckinSchedule() {
  const monthVal = document.getElementById('ci-month')?.value || '';
  if (!monthVal) { showToast('Select a month first', 'error'); return; }
  const monthName = new Date(monthVal+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  const jobs = checkinJobs
    .filter(j => (j.date||'').startsWith(monthVal))
    .sort((a,b) => (a.date+a.time||'') > (b.date+b.time||'') ? 1 : -1);

  // Detect same-day turnovers
  const checkoutDates = new Set(
    cleaningJobs.filter(j=>j.type==='checkout'&&(j.date||'').startsWith(monthVal))
      .map(j=>j.date+'|'+j.propertyName)
  );

  const styles = buildPrintStyles() + `
    .ci-table { width:100%; border-collapse:collapse; font-size:12px; }
    .ci-table th { background:#1a7a6e; color:#fff; padding:7px 10px; text-align:left; font-size:11px; }
    .ci-table td { padding:8px 10px; border-bottom:1px solid #e8f0ef; }
    .ci-table tr:nth-child(even) td { background:#f8f5f0; }
    .same-day-row td { background:#fffbe6 !important; }
    .repeat-star { color:#1a7a6e; font-weight:700; }
    @page { size:A4 landscape; margin:10mm; }
  `;

  const rows = jobs.map(j => {
    const agent = staff.find(s=>s.id===j.agentId);
    const isSame = checkoutDates.has(j.date+'|'+j.propertyName);
    const isRepeat = j.repeat==='yes';
    return `<tr class="${isSame?'same-day-row':''}">
      <td><strong>${formatDate(j.date)}</strong></td>
      <td>${j.time||'\u2014'}</td>
      <td>${j.propertyName||'\u2014'}</td>
      <td>${j.type==='checkin'?'\u2192 Check-In':'\u2190 Check-Out'}</td>
      <td>${j.guestName||'\u2014'}${isRepeat?' <strong class="repeat-star">\u2605 Repeat</strong>':''}</td>
      <td>${j.flight||'\u2014'}</td>
      <td>${agent?agent.firstName+' '+agent.lastName:'\u26a0 Unassigned'}</td>
      <td>${isSame?'<strong style="color:#e67e22">\u26a0 Same-day cleaning</strong>':''}</td>
      <td style="font-size:11px;color:#666">${j.notes||''}</td>
    </tr>`;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;padding:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #1a7a6e">
        <div>
          <div style="font-size:22px;font-weight:700;color:#1a7a6e">Check-In Agent Schedule</div>
          <div style="color:#666;margin-top:4px">${monthName} \u00b7 ${jobs.length} jobs</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#888">
          Zesty Rentals<br>Printed: ${new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
      <table class="ci-table">
        <thead><tr>
          <th>Date</th><th>Time</th><th>Property</th><th>Type</th>
          <th>Guest</th><th>Flight</th><th>Agent</th><th>Alert</th><th>Notes</th>
        </tr></thead>
        <tbody>${rows||'<tr><td colspan="9" style="text-align:center;padding:20px;color:#999">No jobs</td></tr>'}</tbody>
      </table>
    </div>`;

  const w = window.open('','_blank');
  w.document.write(`<html><head><title>Check-In Schedule ${monthName}</title><style>${styles}</style></head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

function exportCheckinCSV() {
  const monthVal = document.getElementById('ci-month')?.value || '';
  const jobs = checkinJobs.filter(j=>!monthVal||(j.date||'').startsWith(monthVal))
    .sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const headers = ['Date','Time','Property','Type','Guest','Flight','Repeat','Agent','Notes'];
  const rows = jobs.map(j=>{
    const agent=staff.find(s=>s.id===j.agentId);
    return [j.date,j.time,j.propertyName,j.type,j.guestName,j.flight,j.repeat,
            agent?agent.firstName+' '+agent.lastName:'Unassigned',j.notes]
      .map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(',');
  });
  const csv='\ufeff'+[headers.join(','),...rows].join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`checkin_schedule_${monthVal||'all'}.csv`;
  a.click();
  showToast('\u2713 Exported', 'success');
}

// Check-in page initialization - called by existing showPage in cleaning-logic.js

