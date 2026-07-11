/**
 * Kaliviani Guest Archive — Base Library
 * Include BEFORE page-specific scripts.
 * Auth backed by Supabase email+password (same zesty-erp Supabase
 * project as the rest of the ERP, kaliviani_* tables only — see
 * kaliviani-setup.sql for schema + RLS).
 */

const SUPA_URL = 'https://whuytfjwdjjepayeiohj.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';

// Where guests are told to write if their access has expired or they
// hit a problem. Change this to whatever address you want guests to
// actually reach.
const OWNER_CONTACT_EMAIL = 'info@zesty.gr';

/* ── BOOK REGISTRY ────────────────────────────────────────────
 * Single source of truth for what's in the archive. The library page
 * (welcome.html) and the reading view (read.html) both read from this
 * — adding book 3's real content later is just filling in its
 * `languages` object, no other code changes needed.
 *
 * `document` is the slug written to kaliviani_reading_sessions /
 * kaliviani_comments / kaliviani_reviews — kept language-agnostic so
 * a guest's engagement with a book is tracked as one thing regardless
 * of which edition they read.
 */
const BOOKS = [
  {
    document: 'kaliviani-history',
    title: 'History of Kaliviani',
    subtitle: 'The chronicle of the parish and its seven villages',
    languages: {
      en: { label: 'English', file: 'content/kaliviani-history-en.md' },
      el: { label: 'Ελληνικά', file: 'content/kaliviani-history-el.md' }
    }
  },
  {
    document: 'gramvousa-history',
    title: 'History of Gramvousa',
    subtitle: 'Myth, the Minoan age, and the northwest cape of Crete',
    languages: {
      el: { label: 'Ελληνικά', file: 'content/gramvousa-history-el.md' }
    }
  },
  {
    document: 'resistance-1941-1945',
    title: 'The Resistance, 1941–1945',
    subtitle: 'Coming soon',
    languages: {}
  }
];

function getBook(document) {
  return BOOKS.find(b => b.document === document) || null;
}

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

/* ── AUTH ─────────────────────────────────────────────────── */
const AUTH = {
  SESSION_KEY: 'kaliviani_session',

  getSession() {
    try { return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); }
    catch { return null; }
  },
  setSession(guest) { localStorage.setItem(this.SESSION_KEY, JSON.stringify(guest)); },
  clearSession()    { localStorage.removeItem(this.SESSION_KEY); },

  isExpired(session) {
    if (!session?.expires_at) return true;
    return new Date(session.expires_at).getTime() < Date.now();
  },

  requireAuth() {
    const s = this.getSession();
    if (!s) { window.location.href = 'index.html'; return null; }
    return s;
  },

  // Step 1 of registration: create the real Supabase Auth account.
  // Confirm-email is OFF for this project, so a session comes back
  // immediately — the guest is logged in right after this call.
  async signUpAccount(email, password, fullName) {
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

  // Step 2 of registration: claim an access code. Runs as the guest
  // (already authenticated from step 1) — the kaliviani_guests_before_insert
  // trigger validates the code server-side and computes expires_at;
  // it can be retried on its own if the code was wrong the first time,
  // since the auth account from step 1 already exists.
  async claimAccessCode(name, email, accessCode) {
    try {
      const sb = await getSbClient();
      const { data, error } = await sb
        .from('kaliviani_guests')
        .insert({ name, email, access_code: accessCode })
        .select()
        .single();
      if (error) {
        const msg = /invalid access code/i.test(error.message) ? 'That access code was not recognized.'
                  : /no longer active/i.test(error.message)   ? 'That access code is no longer active.'
                  : /duplicate key/i.test(error.message)      ? 'This account is already registered — please sign in instead.'
                  : error.message;
        return { ok: false, err: msg };
      }
      return { ok: true, guest: data };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async login(email, password) {
    try {
      const sb = await getSbClient();
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
      if (signInErr) return { ok: false, err: signInErr.message };

      const { data: guest, error: guestErr } = await sb
        .from('kaliviani_guests')
        .select('*')
        .single();
      if (guestErr || !guest) {
        return { ok: false, err: 'No guest record found for this account. Please contact ' + OWNER_CONTACT_EMAIL + '.' };
      }
      this.setSession(guest);
      return { ok: true, guest };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async forgotPassword(email) {
    try {
      const sb = await getSbClient();
      const redirect = window.location.origin + window.location.pathname.replace(/[^/]+$/, 'index.html');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      return error ? { ok: false, err: error.message } : { ok: true };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  },

  async logout() {
    try {
      const sb = await getSbClient();
      await sb.auth.signOut();
    } catch {}
    this.clearSession();
    window.location.href = 'index.html';
  }
};

/* ── HELPERS ──────────────────────────────────────────────── */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }); }
  catch { return d; }
}

/* ── MANUSCRIPT RENDERER ──────────────────────────────────────
 * Turns a source .md file (one heading/paragraph per line — the
 * format all three books are translated in) into styled reading-view
 * HTML. Shared across books: only the source file changes per page.
 * Each paragraph gets a data-para anchor for the Step 4 comment flow.
 */
const MS_DIVIDER_SVG = `<svg viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 20 Q 25 2, 50 20 T 98 20" stroke="currentColor" stroke-width="1.4"/>
  <ellipse cx="18" cy="14" rx="5" ry="2.6" transform="rotate(-25 18 14)" fill="currentColor" opacity=".8"/>
  <ellipse cx="34" cy="8" rx="5" ry="2.6" transform="rotate(-15 34 8)" fill="currentColor" opacity=".8"/>
  <ellipse cx="66" cy="8" rx="5" ry="2.6" transform="rotate(15 66 8)" fill="currentColor" opacity=".8"/>
  <ellipse cx="82" cy="14" rx="5" ry="2.6" transform="rotate(25 82 14)" fill="currentColor" opacity=".8"/>
  <circle cx="50" cy="24" r="2.4" fill="currentColor"/>
</svg>`;

/**
 * Splits the manuscript into leaves (one per original handwritten page).
 * %%page:N%% markers — recovered from the manuscript's own page
 * numbering — start a new leaf with folio N. Content before the first
 * marker becomes the title/front leaf (folio null). A Σημειώσεις/Notes
 * heading inside a leaf switches the rest of that leaf into its notes
 * area, mirroring the original, where the author kept notes on the back
 * or lower part of each page.
 * Returns [{ folio, html, paraCount }].
 */
function renderBookLeaves(md) {
  const lines = md.split('\n').map(l => l.trim());
  const leaves = [];
  let pIdx = 0;
  let justHeaded = false;
  let inVerse = false;
  let cur = null;

  function buildLeaf(l) {
    let html = '<div class="leaf-body">' + l.body.join('\n') + '</div>';
    if (l.notes.length) html += '<div class="leaf-notes">' + l.notes.join('\n') + '</div>';
    return { folio: l.folio, html, paraCount: l.paraCount };
  }
  function finishLeaf() {
    if (cur && (cur.body.length || cur.notes.length)) leaves.push(buildLeaf(cur));
    cur = null;
  }
  function newLeaf(folio) {
    finishLeaf();
    cur = { folio, body: [], notes: [], inNotes: false, paraCount: 0 };
  }
  function push(html, isPara) {
    (cur.inNotes ? cur.notes : cur.body).push(html);
    if (isPara) cur.paraCount++;
  }

  newLeaf(null);

  for (const line of lines) {
    let m;
    if ((m = line.match(/^%%page:(\d+)%%$/))) { newLeaf(parseInt(m[1], 10)); justHeaded = false; continue; }
    if (line === '%%verse%%') { inVerse = true; continue; }
    if (!line) {
      // Inside verse, a blank source line is a real stanza break — keep it.
      if (inVerse && cur) {
        const arr = cur.inNotes ? cur.notes : cur.body;
        if (arr.length && !arr[arr.length - 1].startsWith('<div class="ms-stanza-break"')) {
          arr.push('<div class="ms-stanza-break"></div>');
        }
      }
      continue;
    }
    if (line === '---') continue;
    if ((m = line.match(/^#\s+(.+)$/))) {
      push(`<h1 class="ms-title">${esc(m[1])}</h1>`, false);
      justHeaded = true;
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      push(`<div class="ms-divider ms-divider-major">${MS_DIVIDER_SVG}</div><h2 class="ms-h2">${esc(m[1])}</h2>`, false);
      justHeaded = true;
    } else if ((m = line.match(/^###\s+(.+)$/))) {
      const nm = m[1].match(/^(Σημειώσεις|Notes)\.?\s*(?:—\s*(.+))?$/);
      if (nm) {
        cur.inNotes = true;
        let label = `<div class="leaf-notes-label">${esc(nm[1])}</div>`;
        if (nm[2]) label += `<div class="leaf-notes-sub">${esc(nm[2])}</div>`;
        cur.notes.push(label);
      } else {
        push(`<div class="ms-divider ms-divider-minor"></div><h3 class="ms-h3">${esc(m[1])}</h3>`, false);
      }
      justHeaded = true;
    } else if ((m = line.match(/^\*(.+)\*$/))) {
      const cls = m[1].length > 80 ? 'ms-translator-note' : 'ms-byline';
      push(`<p class="${cls}" data-para="p${++pIdx}">${esc(m[1])}</p>`, true);
      justHeaded = false;
    } else if (inVerse) {
      push(`<p class="ms-verse" data-para="p${++pIdx}">${esc(line)}</p>`, true);
      justHeaded = false;
    } else {
      const cls = justHeaded ? ' class="ms-lead"' : '';
      push(`<p${cls} data-para="p${++pIdx}">${esc(line)}</p>`, true);
      justHeaded = false;
    }
  }
  finishLeaf();
  return leaves;
}

/* ── WATERMARK ─────────────────────────────────────────────
 * A faint, tiled, per-guest watermark (name + email + timestamp) so
 * a screenshot of the reading view is traceable to the account that
 * produced it. Not a copy blocker — a deterrent + accountability
 * trail, per the brief.
 */
function buildWatermarkDataUri(text) {
  const t = esc(text);
  // Deliberately near-invisible at normal reading contrast (0.035 alpha) —
  // still present in the pixel data, so a screenshot survives a
  // brightness/contrast boost even though nobody notices it while reading.
  // Do not raise this back toward opaque without good reason: the whole
  // point is it shouldn't compete with the text for attention.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260">
    <text x="-40" y="70" font-family="Georgia, serif" font-size="13" fill="rgba(58,42,26,0.035)" transform="rotate(-30 240 130)">${t}</text>
    <text x="-40" y="210" font-family="Georgia, serif" font-size="13" fill="rgba(58,42,26,0.035)" transform="rotate(-30 240 130)">${t}</text>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;
}

/* ── TOAST ───────────────────────────────────────────────── */
function toast(msg) {
  let wrap = document.getElementById('kv-toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'kv-toasts';
    wrap.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'background:#3a2a1a;color:#f2e6c9;padding:10px 18px;border-radius:6px;font-family:"Crimson Pro",serif;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);opacity:0;transition:opacity .25s;max-width:320px;text-align:center;';
  wrap.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}
