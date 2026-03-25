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
  
  // After loading: if current month has no jobs, jump to most recent month that does
  const _curMonth = formatMonthValue(currentCalMonth);
  const _hasJobsThisMonth = cleaningJobs.some(j => j.date && j.date.startsWith(_curMonth));
  if (!_hasJobsThisMonth && cleaningJobs.length > 0) {
    const _months = [...new Set(cleaningJobs.map(j => j.date?.substring(0,7)).filter(Boolean))].sort();
    const _latestMonth = _months[_months.length - 1];
    if (_latestMonth) {
      const [_yr, _mo] = _latestMonth.split('-');
      currentCalMonth = new Date(parseInt(_yr), parseInt(_mo)-1, 1);
      document.getElementById('calMonth').value = _latestMonth;
      document.getElementById('jobMonth').value = _latestMonth;
      renderCalendar(); renderJobs();
    }
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
  if (name === 'hours') renderHoursSheet();
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
    tbody.innerHTML = filtered.map((s, i) => {
      const colorIdx = staff.indexOf(s);
      const zones = (s.zones||[]).map(z => `<span class="zone-tag zone-${z.replace(' ','-')}">${z}</span>`).join('');
      const statusBadge = `<span class="badge badge-${s.status === 'Active' ? 'active' : 'inactive'}">${s.status||'Active'}</span>`;
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="cleaner-avatar" style="background:${getColor(colorIdx)}">${getInitials(s.firstName,s.lastName)}</div>
            <div>
              <div style="font-weight:500">${s.firstName} ${s.lastName}</div>
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
    }).join('');
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

function openAddStaff() {
  document.getElementById('staffModalTitle').textContent = 'Add Cleaner';
  document.getElementById('s_editId').value = '';
  clearStaffForm();
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
  // Try to find in properties database
  try {
    const props = JSON.parse(localStorage.getItem('zesty_properties') || '[]');
    const p = props.find(p => String(p.propertyId) === String(houseIdOrName) || p.shortName === houseIdOrName || p.propertyName === houseIdOrName);
    return p ? p.cleanType : 'pattern';
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
      // Delete jobs for cancelled bookings
      if (jobsToDelete.length > 0) {
        const delIds = new Set(jobsToDelete.map(j => j.id));
        cleaningJobs = cleaningJobs.filter(j => !delIds.has(j.id));
        deleted = jobsToDelete.length;
      }
      // Process all active rows: create for new, update for existing
      const allRows = [...newRows, ...updateRows];
      allRows.forEach(r => {
        const nights = parseInt(r.Nights) || 0;
        const checkoutDate = r.DateDeparture;
        const bookingId = r.Id;
        const propName = r.HouseInternalName || r.HouseName;
        const propId = r.House_Id;
        const cleanType = getPropertyCleanType(propId || propName);
        const zone = getPropertyZone(propId || propName);

        // Checkout clean
        const checkoutJobId = `job_${bookingId}_checkout`;
        const existingCheckout = cleaningJobs.findIndex(j => j.id === checkoutJobId);
        const propTransport = getPropertyTransport(propId || propName);
        const propHasCleaning = getPropertyHasCleaning(propId || propName);
        if (!propHasCleaning) return; // Skip properties not managed for cleaning
        const checkoutJob = { id: checkoutJobId, bookingId, propertyName: propName, propertyId: propId, date: checkoutDate, type: 'checkout', nights, zone, cleanerIds: [], hours: null, propertyTransport: propTransport, notes: '', source: r.Source, guestName: r.Name };
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
          const midJob = { id: midJobId, bookingId, propertyName: propName, propertyId: propId, date: cleanDate.toISOString().slice(0,10), type: 'midstay', nights, zone, cleanerIds: [], hours: null, propertyTransport: propTransport, notes: '', source: r.Source, guestName: r.Name, midStayDay: day };
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
      showToast(`\u2713 Created ${created} \u00B7 Updated ${updated}${deleted?' \u00B7 Removed '+deleted+' cancelled':''}`, 'success');
    }
  );
}

function getPropertyTransport(propIdOrName) {
  try {
    const props = JSON.parse(localStorage.getItem('zesty_properties') || '[]');
    const p = props.find(p => String(p.propertyId) === String(propIdOrName) || p.shortName === propIdOrName || p.propertyName === propIdOrName);
    return p ? (parseFloat(p.transportCharge) || 0) : 0;
  } catch { return 0; }
}

function getPropertyHasCleaning(propIdOrName) {
  try {
    const props = JSON.parse(localStorage.getItem('zesty_properties') || '[]');
    const p = props.find(p => String(p.propertyId) === String(propIdOrName) || p.shortName === propIdOrName || p.propertyName === propIdOrName);
    if (!p) return false; // not in properties DB = not a cleaning property
    // We do cleaning if: cleaningFee > 0 (we charge for cleaning)
    return parseFloat(p.cleaningFee) > 0;
  } catch { return true; }
}

function getPropertyZone(propIdOrName) {
  try {
    const props = JSON.parse(localStorage.getItem('zesty_properties') || '[]');
    const p = props.find(p => String(p.propertyId) === String(propIdOrName) || p.shortName === propIdOrName || p.propertyName === propIdOrName);
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
    .col-headers { display: grid; grid-template-columns: 90px 1fr 80px 50px 60px 130px 90px; gap: 0; background: #115950; color: white; padding: 7px 10px; border-radius: 6px 6px 0 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0; }
    .print-job-row { display: grid; grid-template-columns: 90px 1fr 80px 50px 60px 130px 90px; gap: 0; padding: 9px 10px; border-bottom: 1px solid #e8f0ef; font-size: 12px; }
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
    const totalPay = clJobs.reduce((sum,j) => {
      const base = (cl.hourlyRate||0) * (j.hours||0);
      const tr = cl.hasCar === 'Yes' ? (j.propertyTransport||0) : 0;
      return sum + base + tr;
    }, 0);
    const totalTransport = cl.hasCar === 'Yes' ? clJobs.reduce((sum,j) => sum + (j.propertyTransport||0), 0) : 0;

    printContent += `
      <div class="print-page">
        <div class="print-logo">Zesty Rentals \u2014 Cleaning Schedule</div>
        <div class="print-header">
          <div>
            <div class="print-name">${cl.firstName} ${cl.lastName}</div>
            <div class="print-sub">${monthName} \u00B7 ${(cl.zones||[]).join(', ') || 'All zones'} \u00B7 \u20AC${cl.hourlyRate||0}/hr${cl.hasCar==='Yes' ? ' \u00B7 \u{1F697} Car' : ''}</div>
          </div>
          <div class="print-summary">
            <div class="big">${clJobs.length} jobs</div>
            <div class="small">${totalHours.toFixed(1)}h \u00B7 \u20AC${totalPay.toFixed(2)} total${totalTransport > 0 ? ' (incl. \u20AC'+totalTransport.toFixed(2)+' transport)' : ''}</div>
          </div>
        </div>
        <div class="col-headers">
          <div>Date</div><div>Property</div><div>Type</div><div>Hours</div><div>Pay</div><div>Co-workers</div><div>Notes</div>
        </div>
        ${clJobs.length === 0 ? '<p style="padding:20px;color:#999">No jobs assigned this month.</p>' :
          clJobs.map(j => {
            const base = (cl.hourlyRate||0) * (j.hours||0);
            const tr = cl.hasCar === 'Yes' ? (j.propertyTransport||0) : 0;
            const jobPay = base + tr;
            const coworkers = (j.cleanerIds||[]).filter(cid => cid !== cl.id).map(cid => {
              const c2 = staff.find(s => s.id === cid);
              return c2 ? `<span class="coworker-tag">${c2.firstName} ${c2.lastName}</span>` : '';
            }).join('');
            return `<div class="print-job-row">
              <div><strong>${formatDate(j.date)}</strong></div>
              <div>${j.propertyName}${j.zone ? '<br><span style="font-size:10px;color:#888">'+j.zone+'</span>' : ''}</div>
              <div><span class="type-badge type-${j.type}">${j.type === 'checkout' ? 'Checkout' : 'Mid-Stay'}</span></div>
              <div>${j.hours ? j.hours+'h' : '\u2014'}</div>
              <div style="font-weight:600;color:#115950">${jobPay > 0 ? '\u20AC'+jobPay.toFixed(0) : '\u2014'}${tr > 0 ? '<br><span style="font-size:10px;color:#888">+\u20AC'+tr+' \u{1F697}</span>' : ''}</div>
              <div>${coworkers || '<span style="color:#ccc;font-size:11px">Solo</span>'}</div>
              <div style="font-size:11px;color:#666">${j.notes||''}</div>
            </div>`;
          }).join('')
        }
        <div class="totals-row">
          ${totalTransport > 0 ? `<div class="total-item"><div class="total-label">Transport</div><div class="total-val">\u20AC${totalTransport.toFixed(2)}</div></div>` : ''}
          <div class="total-item"><div class="total-label">Hours Pay</div><div class="total-val">\u20AC${(totalPay - totalTransport).toFixed(2)}</div></div>
          <div class="total-item"><div class="total-label">Total</div><div class="total-val">\u20AC${totalPay.toFixed(2)}</div></div>
        </div>
      </div>`;
  });

  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Cleaning Schedule ${monthName}</title><style>${buildPrintStyles()}</style></head><body>${printContent || '<p style="padding:40px;font-family:Arial">No jobs found for this period.</p>'}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 600);
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

['staffModal','jobModal'].forEach(id => {
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


init().catch(console.error);
showDbStatus(true);

// \u2500\u2500 HOURS SHEET \u2500\u2500
let hoursExtra = []; // extra manual cleaning rows

function renderHoursSheet() {
  const monthVal = document.getElementById('hoursMonth').value;
  if (!monthVal) return;
  const [yr, mo] = monthVal.split('-');
  const monthName = new Date(yr, parseInt(mo)-1, 1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  document.getElementById('hoursTableTitle').textContent = 'Hours Sheet \u2014 ' + monthName;
  document.getElementById('hoursPropFilter').innerHTML = '<option value="">All Properties</option>' +
    [...new Set(cleaningJobs.filter(j=>j.date.startsWith(monthVal)).map(j=>j.propertyName).filter(Boolean))].sort()
    .map(p=>`<option value="${p}">${p}</option>`).join('');

  const propF = document.getElementById('hoursPropFilter').value;
  const monthJobs = [
    // Only cleaning-type jobs (checkout/midstay), not maintenance jobs
    ...cleaningJobs.filter(j => 
      j.date && j.date.startsWith(monthVal) && 
      (j.type === 'checkout' || j.type === 'midstay') &&
      (!propF || j.propertyName===propF)
    ),
    ...hoursExtra.filter(j => (j.date||'').startsWith(monthVal) && (!propF || j.propertyName===propF))
  ].sort((a,b) => (a.date||'') > (b.date||'') ? 1 : -1);

  const activeStaff = staff.filter(s => s.status !== 'Inactive');
  if (!activeStaff.length) {
    document.getElementById('hoursBody').innerHTML = '<tr class="empty-row"><td colspan="10">No active staff found.</td></tr>';
    return;
  }

  // Header: Date | Property | Type | Guest | [cleaner cols...] | Total Hours | Transport | Total Pay
  const staffCols = activeStaff.map(s => `<th style="min-width:80px;text-align:center">${s.firstName}<br><span style="font-size:10px;color:var(--text-muted)">${s.hourlyRate?'\u20AC'+s.hourlyRate+'/h':''}</span></th>`).join('');
  document.getElementById('hoursHead').innerHTML = `<tr>
    <th onclick="sortHours('date')">Date \u2195</th><th>Property</th><th>Type</th><th>Guest</th>
    ${staffCols}
    <th style="text-align:right">Hours</th><th style="text-align:right">Transport</th><th style="text-align:right">Total Pay</th><th></th>
  </tr>`;

  let totalHours=0, totalLabour=0, totalTransport=0, staffTotals={};
  activeStaff.forEach(s => staffTotals[s.id] = {hours:0, pay:0});

  const rows = monthJobs.map((j, idx) => {
    const assignedIds = j.cleanerIds || [];
    let rowHours = 0, rowPay = 0, rowTransport = j.propertyTransport||0;
    const staffInputs = activeStaff.map(s => {
      const isAssigned = assignedIds.includes(s.id);
      const hrs = j.cleanerHours ? (j.cleanerHours[s.id] || '') : (isAssigned && j.hours ? j.hours : '');
      const pay = hrs ? (parseFloat(hrs)*(s.hourlyRate||0) + (s.hasCar==='Yes'?rowTransport:0)) : 0;
      if (hrs) { rowHours += parseFloat(hrs)||0; rowPay += pay; staffTotals[s.id].hours += parseFloat(hrs)||0; staffTotals[s.id].pay += pay; }
      return `<td style="text-align:center;padding:4px 6px">
        <input type="number" step="0.5" min="0" max="24" value="${hrs}" data-job="${idx}" data-staff="${s.id}"
          oninput="onHoursInput(this)" style="width:60px;padding:5px;border:1px solid var(--border);border-radius:5px;text-align:center;font-size:13px;font-family:'DM Sans',sans-serif">
      </td>`;
    }).join('');
    totalHours += rowHours; totalLabour += rowPay; totalTransport += rowTransport;
    const isExtra = j._extra;
    return `<tr data-idx="${idx}" style="${isExtra?'background:#fffbe6':''}">
      <td style="font-size:12px">${formatDate(j.date)}</td>
      <td>${j.propertyName||'\u2014'}${isExtra?'<span style="font-size:10px;margin-left:4px;color:var(--gold-dim)">+extra</span>':''}</td>
      <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:8px;background:${j.type==='checkout'?'#fdebd0':'#fdf6e3'};color:${j.type==='checkout'?'#a04000':'#8e6b23'}">${j.type==='checkout'?'Checkout':'Mid-Stay'}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${j.guestName||'\u2014'}</td>
      ${staffInputs}
      <td style="text-align:right;font-weight:600" id="row-hrs-${idx}">${rowHours||'\u2014'}</td>
      <td style="text-align:right;font-size:12px;color:var(--text-muted)">${rowTransport>0?'\u20AC'+rowTransport:'-'}</td>
      <td style="text-align:right;font-weight:600;color:var(--teal)">${rowPay>0?'\u20AC'+rowPay.toFixed(0):'-'}</td>
      <td>${isExtra?`<button onclick="removeExtra(${idx})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px">\u2715</button>`:''}</td>
    </tr>`;
  }).join('');

  // Staff totals footer
  const staffFooter = activeStaff.map(s => `<td style="text-align:center;font-weight:700;color:var(--teal)">
    ${staffTotals[s.id].hours>0?staffTotals[s.id].hours+'h':'\u2014'}<br>
    <span style="font-size:11px;color:var(--text-muted)">${staffTotals[s.id].pay>0?'\u20AC'+staffTotals[s.id].pay.toFixed(0):''}</span>
  </td>`).join('');

  document.getElementById('hoursBody').innerHTML = rows || '<tr class="empty-row"><td colspan="20">No cleaning jobs for this period</td></tr>';
  document.getElementById('hoursFoot').innerHTML = `<tr style="background:var(--cream);font-weight:700">
    <td colspan="4">TOTAL</td>${staffFooter}
    <td style="text-align:right">${totalHours}h</td>
    <td style="text-align:right">\u20AC${totalTransport.toFixed(0)}</td>
    <td style="text-align:right;color:var(--teal-dark)">\u20AC${(totalLabour).toFixed(0)}</td>
    <td></td>
  </tr>`;

  // Stats
  document.getElementById('h-total').textContent = monthJobs.length;
  document.getElementById('h-hours').textContent = totalHours + 'h';
  document.getElementById('h-labour').textContent = '\u20AC' + totalLabour.toFixed(0);
  document.getElementById('h-transport').textContent = '\u20AC' + totalTransport.toFixed(0);
  document.getElementById('h-cost').textContent = '\u20AC' + (totalLabour + totalTransport).toFixed(0);

  // Store current job list for saving
  window._currentHoursJobs = monthJobs;
}

function onHoursInput(input) {
  const idx = parseInt(input.dataset.job);
  const staffId = input.dataset.staff;
  const hrs = parseFloat(input.value) || 0;
  const job = window._currentHoursJobs[idx];
  if (!job) return;
  if (!job.cleanerHours) job.cleanerHours = {};
  job.cleanerHours[staffId] = hrs;
  // Update the job in cleaningJobs or hoursExtra
  const cjIdx = cleaningJobs.findIndex(j => j.id === job.id);
  if (cjIdx >= 0) cleaningJobs[cjIdx].cleanerHours = job.cleanerHours;
  // Recalculate row totals live
  renderHoursSheet();
}

function addHoursRow() {
  const monthVal = document.getElementById('hoursMonth').value;
  const date = monthVal ? monthVal + '-01' : new Date().toISOString().slice(0,10);
  hoursExtra.push({ id: 'extra_' + Date.now(), date, propertyName: '', type: 'checkout', guestName: '', cleanerIds: [], cleanerHours: {}, propertyTransport: 0, _extra: true });
  renderHoursSheet();
}

function removeExtra(idx) {
  const job = window._currentHoursJobs[idx];
  if (job && job._extra) {
    hoursExtra = hoursExtra.filter(j => j.id !== job.id);
    renderHoursSheet();
  }
}

async function saveHoursSheet() {
  const monthVal = document.getElementById('hoursMonth')?.value || '';
  const msg = document.getElementById('hoursSavedMsg');
  if (msg) { msg.textContent = 'Saving\u2026'; }
  
  // Save cleanerHours back to cleaningJobs in Supabase
  await SyncStore.saveAll('zesty_cleaning_jobs', 'cleaning_jobs', cleaningJobs);
  
  // Save extra rows to localStorage
  localStorage.setItem('zesty_hours_extra', JSON.stringify(hoursExtra));
  
  // Save a monthly snapshot to localStorage (one per month, updatable)
  if (monthVal && window._currentHoursJobs) {
    const snapshot = {
      month: monthVal,
      savedAt: new Date().toISOString(),
      jobs: window._currentHoursJobs.map(j => ({
        id: j.id, date: j.date, propertyName: j.propertyName, type: j.type,
        guestName: j.guestName, cleanerIds: j.cleanerIds, cleanerHours: j.cleanerHours,
        hours: j.hours, propertyTransport: j.propertyTransport
      }))
    };
    const allSnapshots = JSON.parse(localStorage.getItem('zesty_hours_snapshots') || '{}');
    allSnapshots[monthVal] = snapshot; // overwrite same month
    localStorage.setItem('zesty_hours_snapshots', JSON.stringify(allSnapshots));
  }

  if (msg) { msg.textContent = '\u2713 Saved ' + new Date().toLocaleTimeString('en-GB'); }
  setTimeout(() => { if(msg) msg.textContent = ''; }, 3000);
  showToast('\u2713 Hours sheet saved', 'success');
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

