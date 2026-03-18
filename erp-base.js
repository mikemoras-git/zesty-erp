/**
 * Zesty ERP — Base Library v4
 * Include BEFORE module-specific scripts.
 * <script src="erp-base.js"></script>
 */

/* ── CONFIG ────────────────────────────────────────────────── */
const SUPA_URL = 'https://whuytfjwdjjepayeiohj.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';

/* ── DB LAYER ───────────────────────────────────────────────── */
const DB = {
  _headers() {
    return {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
  },

  async _fetch(method, table, body, qs = '') {
    const url = `${SUPA_URL}/rest/v1/${table}${qs}`;
    try {
      const opts = { method, headers: this._headers() };
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

  /** Load all records from a table (expects {id, data, updated_at} schema) */
  async loadAll(table) {
    const r = await this._fetch('GET', table, null, '?select=id,data,updated_at&order=created_at.asc&limit=100000');
    if (!r.ok) return { ok: false, rows: null, err: r.err };
    const rows = (r.data || []).map(row => ({ id: row.id, ...(row.data || {}) }));
    return { ok: true, rows };
  },

  /** Upsert a single record */
  async upsertOne(table, record) {
    const { id, ...rest } = record;
    const rid = id || ('rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    const row = { id: rid, data: rest, updated_at: new Date().toISOString() };
    const r = await this._fetch('POST', table, row, '?on_conflict=id');
    return { ok: r.ok, id: rid, err: r.err };
  },

  /** Upsert many records in batches of 200 */
  async upsertMany(table, records) {
    if (!records.length) return { ok: true };
    const rows = records.map(({ id, ...rest }) => ({
      id: id || ('rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
      data: rest,
      updated_at: new Date().toISOString()
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const r = await this._fetch('POST', table, rows.slice(i, i + 200), '?on_conflict=id');
      if (!r.ok) return { ok: false, err: r.err };
    }
    return { ok: true };
  },

  /** Delete a record by id */
  async deleteOne(table, id) {
    const r = await this._fetch('DELETE', table, null, '?id=eq.' + encodeURIComponent(id));
    return { ok: r.ok, err: r.err };
  }
};

/* ── SYNC STORE ─────────────────────────────────────────────── */
const SyncStore = {
  _pending: {},

  async load(lsKey, table) {
    const cached = this._local(lsKey);
    setSyncDot('syncing');
    const result = await DB.loadAll(table);
    if (result.ok && result.rows !== null) {
      const pending = this._pending[table] || new Set();
      const rows = result.rows.filter(r => !pending.has(r.id));
      localStorage.setItem(lsKey, JSON.stringify(rows));
      setSyncDot('ok');
      showDbStatus(true);
      return { data: rows, fromCache: false };
    }
    setSyncDot('error');
    showDbStatus(false);
    return { data: cached, fromCache: true };
  },

  async saveOne(lsKey, table, record, all) {
    localStorage.setItem(lsKey, JSON.stringify(all));
    setSyncDot('syncing');
    const r = await DB.upsertOne(table, record);
    if (r.ok) setSyncDot('ok'); else { setSyncDot('error'); showSyncErr(r.err); }
    return r;
  },

  async saveAll(lsKey, table, records) {
    localStorage.setItem(lsKey, JSON.stringify(records));
    setSyncDot('syncing');
    const r = await DB.upsertMany(table, records);
    if (r.ok) setSyncDot('ok'); else { setSyncDot('error'); showSyncErr(r.err); }
    return r.ok;
  },

  async deleteOne(lsKey, table, id, all) {
    if (!this._pending[table]) this._pending[table] = new Set();
    this._pending[table].add(id);
    localStorage.setItem(lsKey, JSON.stringify(all));
    setSyncDot('syncing');
    const r = await DB.deleteOne(table, id);
    if (r.ok) {
      setSyncDot('ok');
      setTimeout(() => this._pending[table]?.delete(id), 120000);
    } else {
      this._pending[table].delete(id);
      setSyncDot('error');
      showSyncErr('Delete failed: ' + r.err);
    }
    return r;
  },

  _local(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]') || []; } catch { return []; }
  }
};

/** Poll table for changes */
function startPoll(table, lsKey, ms, onData) {
  let lastHash = '';
  const poll = async () => {
    const result = await DB.loadAll(table);
    if (!result.ok || !result.rows) return;
    const pending = SyncStore._pending[table] || new Set();
    const rows = result.rows.filter(r => !pending.has(r.id));
    const hash = rows.length + '|' + rows.map(r => r.id).join(',');
    if (hash !== lastHash) { lastHash = hash; localStorage.setItem(lsKey, JSON.stringify(rows)); onData(rows); }
  };
  setInterval(poll, ms);
  return poll;
}

/* ── SYNC DOT ───────────────────────────────────────────────── */
function setSyncDot(state) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.className = 'sync-dot ' + state;
}

/* ── UI HELPERS ─────────────────────────────────────────────── */
function showDbStatus(online) {
  const old = document.getElementById('db-status-bar');
  if (old) old.remove();
  if (online) return;
  const b = document.createElement('div');
  b.id = 'db-status-bar';
  b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#c0392b;color:#fff;text-align:center;padding:8px;font-size:12px;z-index:9998;cursor:pointer;font-family:DM Sans,sans-serif';
  b.textContent = '⚠ Database offline — working in local mode. Click to retry.';
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}

function showSyncErr(err) {
  let b = document.getElementById('sync-err-bar');
  if (!b) {
    b = document.createElement('div');
    b.id = 'sync-err-bar';
    b.style.cssText = 'position:fixed;bottom:60px;right:16px;background:#c0392b;color:#fff;border-radius:8px;padding:9px 14px;font-size:12px;z-index:9999;max-width:340px;font-family:DM Sans,sans-serif';
    document.body.appendChild(b);
  }
  b.textContent = 'Save error: ' + err;
  b.style.display = 'block';
  clearTimeout(b._t);
  b._t = setTimeout(() => (b.style.display = 'none'), 6000);
}

function showToast(msg, type = 'success') {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:80px;right:20px;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:2000;pointer-events:none;transition:all .3s;opacity:0;transform:translateY(10px);font-family:DM Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2)';
    document.body.appendChild(t);
  }
  const colors = { success: ['#0f4a42', '#e8c97a'], error: ['#c0392b', '#fff'], warning: ['#b7770d', '#fff'], info: ['#1a5a8a', '#fff'] };
  const [bg, color] = colors[type] || colors.info;
  t.style.background = bg;
  t.style.color = color;
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 2800);
}

/** Generic confirm modal */
let _confirmCb = null;
function showConfirm(icon, title, msg, btnClass, btnLabel, callback) {
  let m = document.getElementById('_confirm-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = '_confirm-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:28px;max-width:400px;width:90%;font-family:DM Sans,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div id="_confirm-icon" style="font-size:28px;margin-bottom:10px"></div>
      <h3 id="_confirm-title" style="font-size:18px;color:#0f4a42;margin-bottom:8px"></h3>
      <p id="_confirm-msg" style="font-size:13px;color:#6b7e7b;margin-bottom:22px;line-height:1.5"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('_confirm-modal').style.display='none'" style="padding:8px 18px;border-radius:8px;border:1px solid #d4e0de;background:#f0f4f3;color:#6b7e7b;font-size:13px;cursor:pointer;font-family:DM Sans,sans-serif">Cancel</button>
        <button id="_confirm-ok" style="padding:8px 18px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;font-family:DM Sans,sans-serif" onclick="document.getElementById('_confirm-modal').style.display='none';_confirmCb&&_confirmCb()">Confirm</button>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
  document.getElementById('_confirm-icon').textContent = icon;
  document.getElementById('_confirm-title').textContent = title;
  document.getElementById('_confirm-msg').textContent = msg;
  const ok = document.getElementById('_confirm-ok');
  ok.className = '';
  ok.textContent = btnLabel;
  // Set colors based on btnClass
  if (btnClass === 'btn-danger') { ok.style.background = '#c0392b'; ok.style.color = '#fff'; }
  else { ok.style.background = '#c9a84c'; ok.style.color = '#0f4a42'; }
  _confirmCb = callback;
  m.style.display = 'flex';
}

/** Open / close generic modal */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ── FORMAT HELPERS ─────────────────────────────────────────── */
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('el-GR'); } catch { return d; }
}
function fmtNum(n) {
  const v = parseFloat(n);
  return isNaN(v) ? '0.00' : v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtEuro(n) { return '€' + fmtNum(n); }

/** Generate a short readable ID */
function genId(prefix = 'rec') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/* ── CLOSE MODAL ON OVERLAY CLICK ──────────────────────────── */
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});
