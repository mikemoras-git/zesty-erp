/**
 * KRE Real Estate ERP — Base Library
 * Include BEFORE page-specific scripts on every page.
 * Auth backed by Supabase email+password (Supabase JS SDK loaded lazily).
 */

const SUPA_URL = 'https://ikcpbnihnzqbgzyozowu.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3BibmlobnpxYmd6eW96b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDIwODEsImV4cCI6MjA5NDAxODA4MX0.LcKm9zk2WR7F5zx7WS0yfsWaECM6CyXdmUiEk-hjX5Y';

/* ── SUPABASE CLIENT (lazy-loaded) ───────────────────────── */
let _sb = null;
let _sbPromise = null;

function getSbClient() {
  if (_sb) return Promise.resolve(_sb);
  if (_sbPromise) return _sbPromise;
  _sbPromise = new Promise((resolve, reject) => {
    if (window.supabase?.createClient) {
      _sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return resolve(_sb);
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.onload = () => {
      _sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      resolve(_sb);
    };
    s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
    document.head.appendChild(s);
  });
  return _sbPromise;
}

/* ── DB LAYER ─────────────────────────────────────────────── */
const DB = {
  _h() {
    return {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    };
  },

  async _req(method, table, body, qs = '') {
    const url = `${SUPA_URL}/rest/v1/${table}${qs}`;
    try {
      const opts = { method, headers: this._h() };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch(url, opts);
      if (!r.ok) {
        const txt = await r.text().catch(() => r.statusText);
        return { ok: false, err: txt };
      }
      let data = null;
      try { data = await r.json(); } catch {}
      return { ok: true, data };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async loadAll(table) {
    const r = await this._req('GET', table, null,
      '?select=id,data,created_at,updated_at&order=created_at.asc&limit=100000');
    if (!r.ok) {
      const notFound = r.err && (r.err.includes('does not exist') || r.err.includes('42P01') || r.err.includes('404'));
      return { ok: notFound, rows: notFound ? [] : null, err: r.err };
    }
    const rows = (r.data || []).map(row => ({
      id: row.id,
      _created: row.created_at,
      _updated: row.updated_at,
      ...(row.data || {})
    }));
    return { ok: true, rows };
  },

  async upsertOne(table, record) {
    const { id, _created, _updated, ...rest } = record;
    const rid = id || ('kre_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    const row = { id: rid, data: rest, updated_at: new Date().toISOString() };
    if (!id) row.created_at = new Date().toISOString();
    const r = await this._req('POST', table, row, '?on_conflict=id');
    if (!r.ok) return { ok: false, id: rid, err: r.err };
    const returned = Array.isArray(r.data) && r.data[0];
    const row2 = returned || { id: rid, data: rest };
    return {
      ok: true,
      id: rid,
      row: { id: row2.id, _created: row2.created_at, _updated: row2.updated_at, ...(row2.data || rest) }
    };
  },

  async deleteOne(table, id) {
    const r = await this._req('DELETE', table, null, `?id=eq.${encodeURIComponent(id)}`);
    return { ok: r.ok, err: r.err };
  },

  async getById(table, id) {
    const r = await this._req('GET', table, null,
      `?id=eq.${encodeURIComponent(id)}&select=id,data,created_at,updated_at&limit=1`);
    if (!r.ok || !r.data || !r.data.length) return { ok: false };
    const row = r.data[0];
    return {
      ok: true,
      row: { id: row.id, _created: row.created_at, _updated: row.updated_at, ...(row.data || {}) },
      // keep old 'record' key for backward compat
      record: { id: row.id, _created: row.created_at, _updated: row.updated_at, ...(row.data || {}) }
    };
  },

  async batchUpsert(table, records) {
    const rows = records.map(rec => {
      const { id, _created, _updated, ...rest } = rec;
      const rid = id || ('kre_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
      return { id: rid, data: rest, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    });
    const CHUNK = 50;
    let ok = true, err = null, inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const r = await this._req('POST', table, rows.slice(i, i + CHUNK), '?on_conflict=id');
      if (!r.ok) { ok = false; err = r.err; }
      else inserted += rows.slice(i, i + CHUNK).length;
    }
    return { ok, err, inserted };
  }
};

/* ── AUTH (Supabase-backed) ──────────────────────────────── */
const AUTH = {
  SESSION_KEY: 'kre_session',

  getSession() {
    try { return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); }
    catch { return null; }
  },
  setSession(user) { localStorage.setItem(this.SESSION_KEY, JSON.stringify(user)); },
  clearSession()   { localStorage.removeItem(this.SESSION_KEY); },

  requireAuth(allowedRoles) {
    const s = this.getSession();
    if (!s) { window.location.href = 'kre-login.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(s.role)) {
      window.location.href = 'kre-login.html'; return null;
    }
    return s;
  },

  canEdit()        { const s = this.getSession(); return s && s.role !== 'collaborator'; },
  canAdmin()       { const s = this.getSession(); return s?.role === 'admin'; },
  isCollaborator() { const s = this.getSession(); return s?.role === 'collaborator'; },

  async login(email, password) {
    try {
      const sb = await getSbClient();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, err: error.message };

      const uid = data.user.id;
      const userEmail = (data.user.email || email).toLowerCase().trim();

      // Look up role in kre_users (by auth_uid or email)
      const r = await DB.loadAll('kre_users');
      const allUsers = r.rows || [];
      let kreUser = allUsers.find(u => u.auth_uid === uid) ||
                    allUsers.find(u => u.email?.toLowerCase() === userEmail);

      if (!kreUser) {
        // First user ever → auto-admin, otherwise employee
        const role = allUsers.length === 0 ? 'admin' : 'employee';
        const cr = await DB.upsertOne('kre_users', {
          auth_uid: uid, email: userEmail,
          full_name: data.user.user_metadata?.full_name || email.split('@')[0],
          role, active: true
        });
        kreUser = { id: cr.id, auth_uid: uid, email: userEmail, role, active: true };
      } else if (!kreUser.auth_uid) {
        await DB.upsertOne('kre_users', { ...kreUser, auth_uid: uid });
      }

      if (kreUser.active === false) return { ok: false, err: 'Account is inactive.' };

      const session = {
        id: kreUser.id,
        supabase_id: uid,
        email: userEmail,
        full_name: kreUser.full_name || email.split('@')[0],
        role: kreUser.role || 'employee'
      };
      this.setSession(session);
      return { ok: true, session };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async signUp(email, password, fullName) {
    try {
      const sb = await getSbClient();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) return { ok: false, err: error.message };
      return { ok: true, needsConfirmation: !data.session };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async forgotPassword(email) {
    try {
      const sb = await getSbClient();
      const redirect = window.location.origin + '/kre/kre-login.html';
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      return error ? { ok: false, err: error.message } : { ok: true };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async signOut() {
    try {
      const sb = await getSbClient();
      await sb.auth.signOut();
    } catch {}
    this.clearSession();
    window.location.href = 'kre-login.html';
  },

  // Create a kre_users role entry (Supabase account is created separately via login page)
  async createUser(fullName, email, role = 'employee') {
    return DB.upsertOne('kre_users', {
      email: email.toLowerCase().trim(),
      full_name: fullName,
      role,
      active: true
    });
  },

  async noUsersExist() {
    const r = await DB.loadAll('kre_users');
    return r.ok && (r.rows || []).length === 0;
  }
};

/* ── DEFAULT SETTINGS ────────────────────────────────────── */
const KRE_DEFAULTS = {
  company_name: 'Kissamos Real Estate',
  company_phone: '', company_email: '', company_website: '',

  locations: ['Afrata','Afterolakos','Agios Georgios','Astrikas','Athanasiana',
    'Azogiras','Chairethiana','Drapanias','Elafonisi','Falasarna','Fournados',
    'Gramvousa','Kalathenes','Kalergianna','Kaliviani','Kaloudiana','Kamara',
    'Kampos','Karefiliana','Kavousi','Koleni','Kounoupitsa','Koutoufiana',
    'Livadia','Livadia Kissamou','Lousakies','Marediana','Metochi','Nio Chorio',
    'Nopigia','Piperiana','Pirgos','Plakalona','Platanos','Polyrinia','Potamida',
    'Sfinari','Trachilas','Vardiana','Viglia'],

  property_types: ['Plot','Investment Plot','House','Old House','New House','Villa','Apartment','Plot + House'],

  checklist_items: ['Topographic Plan','Title Deeds','Building Permit',
    'Energy Certificate (PEA)','Owner ID Copy','Tax Registration (AFM)',
    'No Encumbrances Certificate'],

  budget: {
    transfer_tax_pct: 3.09,
    notary_pct: 1.5,
    lawyer_fee: 1000,
    accountant_fee: 250,
    commission_pct: 2.5,
    commission_min: 1500,
    building_licence_per_sqm: 100,
    construction_cost_per_sqm: 1350,
    pool_cost: 0,
    landscaping_cost: 25000,
    water_drinkable: 500,
    water_irrigation: 500,
    electricity_deposit: 505,
    electricity_connection: 781,
    network_connection: 3040,
    pole_construction: 1500
  },

  client_stages: [
    { id:'new_lead',          label:'New Lead',              color:'#6c757d' },
    { id:'requirements',      label:'Requirements Gathered', color:'#17a2b8' },
    { id:'properties_sent',   label:'Properties Sent',       color:'#007bff' },
    { id:'viewing_scheduled', label:'Viewing Scheduled',     color:'#fd7e14' },
    { id:'viewing_done',      label:'Viewing Done',          color:'#6f42c1' },
    { id:'negotiating',       label:'Negotiating',           color:'#e83e8c' },
    { id:'closed_won',        label:'Closed – Won',          color:'#28a745' },
    { id:'closed_lost',       label:'Closed – Lost',         color:'#dc3545' }
  ],

  deal_stages: [
    { id:'offer_made',       label:'Offer Made',            color:'#fd7e14' },
    { id:'offer_accepted',   label:'Offer Accepted',        color:'#20c997' },
    { id:'pre_agreement',    label:'Pre-Agreement Signed',  color:'#007bff' },
    { id:'deposit_paid',     label:'Deposit Paid',          color:'#6f42c1' },
    { id:'legal_check',      label:'Legal Due Diligence',   color:'#17a2b8' },
    { id:'docs_collection',  label:'Document Collection',   color:'#e83e8c' },
    { id:'notary_scheduled', label:'Notary Scheduled',      color:'#f59f00' },
    { id:'final_contract',   label:'Final Contract',        color:'#28a745' },
    { id:'completed',        label:'Completed',             color:'#1a7a6e' }
  ]
};

/* ── SETTINGS MANAGER ────────────────────────────────────── */
let _settingsCache = null;

// Keys whose values are arrays (lists of tags or stage objects). These must
// always be FRESH copies — never shared references with KRE_DEFAULTS — or
// in-place mutations (push/splice from the Settings page) silently corrupt
// the shared defaults object, which is the root cause of "added items vanish".
const KRE_LIST_KEYS = ['locations', 'property_types', 'checklist_items', 'client_stages', 'deal_stages'];

function kreCloneList(v) {
  if (!Array.isArray(v)) return v;
  return v.map(item => (item && typeof item === 'object') ? { ...item } : item);
}

const SETTINGS = {
  async load() {
    if (_settingsCache) return _settingsCache;
    const r = await DB.getById('kre_settings', 'main');
    if (r.ok) {
      const { id, _created, _updated, ...stored } = r.row || r.record || {};
      _settingsCache = { ...KRE_DEFAULTS, ...stored };
      if (stored.budget) _settingsCache.budget = { ...KRE_DEFAULTS.budget, ...stored.budget };
    } else {
      _settingsCache = { ...KRE_DEFAULTS };
    }
    // Always clone list-type values so nothing aliases KRE_DEFAULTS' arrays.
    KRE_LIST_KEYS.forEach(k => { _settingsCache[k] = kreCloneList(_settingsCache[k]); });
    return _settingsCache;
  },
  get()  { return _settingsCache || KRE_DEFAULTS; },
  async save(data) {
    const { _created, _updated, ...clean } = data;
    const res = await DB.upsertOne('kre_settings', { id: 'main', ...clean });
    // Refresh the cache from the saved payload directly (cloning lists) instead
    // of just nulling it out — avoids a races where a stale read repopulates the
    // cache from the DB before the write is visible, which made new entries
    // ("disappear") on the very next render.
    if (res && res.ok) {
      _settingsCache = { ...KRE_DEFAULTS, ...clean };
      if (clean.budget) _settingsCache.budget = { ...KRE_DEFAULTS.budget, ...clean.budget };
      KRE_LIST_KEYS.forEach(k => { _settingsCache[k] = kreCloneList(_settingsCache[k]); });
    } else {
      _settingsCache = null;
    }
    return res;
  },
  invalidate() { _settingsCache = null; }
};

/* ── PROPERTY–BUYER MATCHER ──────────────────────────────── */
const MATCHER = {
  score(buyer, property) {
    if (buyer.active === false) return { score: 0, reasons: [] };
    let pts = 0, possible = 0;
    const reasons = [];

    // Type match — required
    const prefs = [buyer.pref1, buyer.pref2, buyer.pref3, buyer.pref4].filter(Boolean);
    if (prefs.length) {
      possible += 40;
      const typeMatch = prefs.some(p => p.toLowerCase() === (property.type || '').toLowerCase());
      if (!typeMatch) return { score: 0, reasons: [] };
      pts += 40;
      reasons.push('Type match');
    }

    // Budget vs office price
    const price = parseFloat(property.office_price) || 0;
    const bMax  = parseFloat(buyer.budget_max) || 0;
    const bMin  = parseFloat(buyer.budget_min) || 0;
    if (price && bMax) {
      possible += 30;
      if (price >= bMin * 0.85 && price <= bMax * 1.1)  { pts += 30; reasons.push('Budget fits'); }
      else if (price <= bMax * 1.25) { pts += 15; reasons.push('Budget close'); }
    }

    // Area preference
    if (buyer.area_pref && property.area) {
      possible += 15;
      if (buyer.area_pref === property.area) { pts += 15; reasons.push('Area match'); }
    }

    // Sea view
    if (buyer.needs_sea_view) {
      possible += 10;
      if (property.sea_view) { pts += 10; reasons.push('Sea view'); }
    }

    // Plot size
    if (buyer.min_plot && property.plot) {
      possible += 5;
      if (parseFloat(property.plot) >= parseFloat(buyer.min_plot) * 0.8) { pts += 5; reasons.push('Plot size'); }
    }

    const score = possible > 0 ? Math.round((pts / possible) * 100) : 0;
    return { score, reasons };
  },

  findMatches(property, buyers, minScore = 40) {
    return buyers
      .map(b => { const r = this.score(b, property); return { buyer: b, ...r }; })
      .filter(m => m.score >= minScore)
      .sort((a, b) => b.score - a.score);
  }
};

/* ── TOAST ───────────────────────────────────────────────── */
function toast(msg, type = '', duration = 3500) {
  let wrap = document.getElementById('kre-toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'kre-toasts';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'kre-toast' + (type ? ' ' + type : '');
  const icons = { success:'✓', error:'✕', warning:'⚠' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, duration);
}

/* ── FORMATTERS ──────────────────────────────────────────── */
function fmtEur(n) {
  if (n == null || n === '') return '—';
  return '€' + Number(n).toLocaleString('el-GR', { maximumFractionDigits: 0 });
}
function fmtNum(n, unit = '') {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('el-GR') + (unit ? ' ' + unit : '');
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch { return d; }
}
function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return d; }
}
function fmtRelative(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365)return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
function fmtPct(n) {
  if (n == null) return '—';
  return Number(n).toFixed(1) + '%';
}

/* ── UTILITIES ───────────────────────────────────────────── */
function genId(prefix = 'kre') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function typeBadge(type) {
  const cls = {
    'Plot':'type-Plot','Investment Plot':'type-Investment-Plot',
    'House':'type-House','Old House':'type-Old-House',
    'New House':'type-New-House','Villa':'type-Villa',
    'Apartment':'type-Apartment','Plot + House':'type-House'
  };
  return `<span class="badge ${cls[type] || 'type-Other'}">${type || 'Unknown'}</span>`;
}

function availBadge(a) {
  if (a === true)  return '<span class="badge badge-green">For Sale</span>';
  if (a === false) return '<span class="badge badge-red">Off Market</span>';
  return '<span class="badge badge-gray">Unknown</span>';
}

function roleBadge(role) {
  const map = { admin:'badge-teal', employee:'badge-blue', collaborator:'badge-orange' };
  return `<span class="badge ${map[role] || 'badge-gray'}">${role}</span>`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── TASK COMMENTS — lightweight markdown renderer ───────────────────────────
 * Shared by kre-tasks.html and kre-property-view.html.
 * Syntax: **bold**, *italic*, `code`, [text](url), - bullet list, 1. ordered
 * list, > blockquote, # / ## headings, --- hr. Plain text with no special
 * chars renders as-is (paragraph with <br> line breaks).
 */
function kreInlineMd(s) {
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?;:]|$)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,!?;:]|$)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`\n]+?)`/g, '<code style="background:rgba(0,0,0,.07);padding:1px 4px;border-radius:3px;font-size:.92em">$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--kre-deep);text-decoration:underline">$1</a>');
  return s;
}
window.kreFormatComment = function(text) {
  if (!text || !text.trim()) return '<em style="color:var(--text-muted);font-size:11px">(empty)</em>';
  const lines = text.split('\n');
  const out = [];
  let inUl = false, inOl = false, inQuote = false;
  function closeBlocks() {
    if (inUl)    { out.push('</ul>'); inUl = false; }
    if (inOl)    { out.push('</ol>'); inOl = false; }
    if (inQuote) { out.push('</blockquote>'); inQuote = false; }
  }
  lines.forEach(rawLine => {
    const t = rawLine.trim();
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) { closeBlocks(); out.push('<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">'); return; }
    const h = t.match(/^(#{1,4})\s+(.+)$/);
    if (h) { closeBlocks(); const lvl=h[1].length; out.push(`<b style="font-size:${15-lvl}px;display:block;margin:4px 0 2px">${kreInlineMd(esc(h[2]))}</b>`); return; }
    if (/^>\s+/.test(t)) {
      if (inUl){out.push('</ul>');inUl=false;} if(inOl){out.push('</ol>');inOl=false;}
      if (!inQuote) { out.push('<blockquote style="border-left:3px solid var(--border);margin:0;padding:0 0 0 10px;color:var(--text-muted)">'); inQuote=true; }
      out.push(kreInlineMd(esc(t.replace(/^>\s+/,'')))+'<br>'); return;
    } else if (inQuote) { out.push('</blockquote>'); inQuote=false; }
    const ol = t.match(/^\d+[.)]\s+(.+)$/);
    if (ol) { if(inUl){out.push('</ul>');inUl=false;} if(!inOl){out.push('<ol style="margin:4px 0 4px 18px;padding:0">');inOl=true;} out.push('<li>'+kreInlineMd(esc(ol[1]))+'</li>'); return; }
    const ul = t.match(/^[-*+]\s+(.+)$/);
    if (ul) { if(inOl){out.push('</ol>');inOl=false;} if(!inUl){out.push('<ul style="margin:4px 0 4px 18px;padding:0">');inUl=true;} out.push('<li>'+kreInlineMd(esc(ul[1]))+'</li>'); return; }
    if (t === '') { closeBlocks(); out.push('<div style="height:6px"></div>'); return; }
    closeBlocks(); out.push(kreInlineMd(esc(rawLine))+'<br>');
  });
  closeBlocks();
  while (out.length && out[out.length-1] === '<br>') out.pop();
  return out.join('');
};

/* ── PROPERTY PHOTOS ──────────────────────────────────────
 * Convention: a "photos" folder next to the app, with one
 * sub-folder per property (named with its ID, e.g. prop_0001),
 * containing images named 1.jpg, 2.jpg, 3.jpg … — image "1" is
 * used as the cover/thumbnail. jpg/jpeg/png/webp are all tried.
 * No server listing is possible on a static host, so the gallery
 * simply probes a fixed number of slots and removes any that 404.
 */
const KRE_PHOTO_EXTS = ['jpg','jpeg','png','webp','JPG','JPEG','PNG','WEBP'];
const KRE_PHOTO_MAX  = 30;

function krePhotoUrl(propId, n, ext) { return `photos/${propId}/${n}.${ext}`; }

// Cover thumbnail box — placeholder underneath, image fades in on top once loaded
function kreCoverBox(propId, phHtml, extraCls) {
  const candidates = KRE_PHOTO_EXTS.map(e => krePhotoUrl(propId, 1, e));
  const rest = candidates.slice(1).join('|');
  return `<div class="kre-photo-wrap ${extraCls||''}">
    <div class="kre-photo-ph">${phHtml}</div>
    <img class="kre-photo-img" loading="lazy" alt="" src="${esc(candidates[0])}"
      data-tries="${esc(rest)}"
      onerror="kreImgTryNext(this)"
      onload="this.classList.add('loaded');var w=this.closest('.kre-photo-wrap');if(w){var ph=w.querySelector('.kre-photo-ph');if(ph)ph.style.display='none';}">
  </div>`;
}
window.kreImgTryNext = function (img) {
  const tries = (img.getAttribute('data-tries') || '').split('|').filter(Boolean);
  if (tries.length) {
    const next = tries.shift();
    img.setAttribute('data-tries', tries.join('|'));
    img.src = next;
  } else {
    img.onerror = null;
    img.style.display = 'none';
  }
};

// Gallery grid for the property detail / public pages — probes KRE_PHOTO_MAX slots
function kreGalleryHtml(propId, max) {
  max = max || KRE_PHOTO_MAX;
  let html = '';
  for (let n = 1; n <= max; n++) {
    const candidates = KRE_PHOTO_EXTS.map(e => krePhotoUrl(propId, n, e));
    const rest = candidates.slice(1).join('|');
    html += `<div class="kre-gallery-item">
      <img class="kre-gallery-img" loading="lazy" alt="Photo ${n}" src="${esc(candidates[0])}"
        data-tries="${esc(rest)}"
        onerror="kreGalleryImgFail(this)"
        onload="this.classList.add('loaded')"
        onclick="kreOpenLightbox(this.currentSrc||this.src)">
    </div>`;
  }
  return html;
}
window.kreGalleryImgFail = function (img) {
  const tries = (img.getAttribute('data-tries') || '').split('|').filter(Boolean);
  if (tries.length) {
    const next = tries.shift();
    img.setAttribute('data-tries', tries.join('|'));
    img.src = next;
  } else {
    const item = img.closest('.kre-gallery-item');
    if (item) item.remove();
  }
};

// Returns true once the cover image (slot 1) has confirmed-loaded for a property —
// used to decide whether to show a gallery section at all (avoids an empty card).
function kreHasCover(propId) {
  return new Promise(resolve => {
    let i = 0;
    const tryNext = () => {
      if (i >= KRE_PHOTO_EXTS.length) return resolve(false);
      const img = new Image();
      img.onload  = () => resolve(true);
      img.onerror = () => { i++; tryNext(); };
      img.src = krePhotoUrl(propId, 1, KRE_PHOTO_EXTS[i]);
    };
    tryNext();
  });
}

window.kreOpenLightbox = function (src) {
  let lb = document.getElementById('kre-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'kre-lightbox';
    lb.innerHTML = '<img id="kre-lightbox-img" alt=""><button id="kre-lightbox-close" title="Close">✕</button>';
    lb.addEventListener('click', e => {
      if (e.target === lb || e.target.id === 'kre-lightbox-close') window.kreCloseLightbox();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') window.kreCloseLightbox(); });
    document.body.appendChild(lb);
  }
  document.getElementById('kre-lightbox-img').src = src;
  lb.classList.add('open');
};
window.kreCloseLightbox = function () {
  const lb = document.getElementById('kre-lightbox');
  if (lb) lb.classList.remove('open');
};

/* ── MODAL HELPERS ───────────────────────────────────────── */
function openModal(id)  {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

/* ── SYNC INDICATOR ──────────────────────────────────────── */
function syncStart() {
  const dot = document.getElementById('kre-sync-dot');
  if (dot) dot.classList.add('syncing');
}
function syncDone(ok) {
  const dot = document.getElementById('kre-sync-dot');
  if (dot) {
    dot.classList.remove('syncing');
    dot.classList.toggle('error', !ok);
  }
}
