/**
 * Care Log — base library
 * ------------------------------------------------------------------
 * A local-first tracker for a patient's treatment, tests and daily metrics.
 *
 * PRIVACY BY DESIGN: every byte stays in this browser. Structured records live
 * in localStorage; scanned documents live in IndexedDB. Nothing is sent to a
 * server, and this file deliberately shares no code with the ERP's Supabase
 * layer — that project's API key is public, so medical data must never go near it.
 *
 * The flip side of local-only storage is that clearing the browser wipes it.
 * Settings › Backup writes a single portable .json (documents included) and the
 * dashboard nags when the last backup is more than BACKUP_NAG_DAYS old.
 */

/* ══ STORAGE KEYS ═══════════════════════════════════════════════ */
const HK = {
  profile:  'carelog_profile',
  vitals:   'carelog_vitals',
  events:   'carelog_events',
  records:  'carelog_records',
  labs:     'carelog_labs',
  meds:     'carelog_meds',
  meta:     'carelog_meta'
};

const BACKUP_NAG_DAYS = 14;

/* ══ REFERENCE DATA ═════════════════════════════════════════════
 * Each entry carries its English `label` and Greek `el`; L() picks one.
 * ═════════════════════════════════════════════════════════════ */

/* Event types. Colour groups the *kind* of appointment; the icon and label
   always travel with it, so colour is never the only channel. */
const EVENT_TYPES = {
  chemo:      { label: 'Chemotherapy',    el: 'Χημειοθεραπεία',      icon: '💧', group: 'treatment'  },
  radio:      { label: 'Radiotherapy',    el: 'Ακτινοθεραπεία',      icon: '☢',  group: 'treatment'  },
  immuno:     { label: 'Immunotherapy',   el: 'Ανοσοθεραπεία',       icon: '🧬', group: 'treatment'  },
  surgery:    { label: 'Surgery',         el: 'Χειρουργείο',         icon: '🔪', group: 'treatment'  },
  exam:       { label: 'Examination',     el: 'Εξέταση',             icon: '🩺', group: 'diagnostic' },
  imaging:    { label: 'Imaging / Scan',  el: 'Απεικόνιση / Σάρωση', icon: '📷', group: 'diagnostic' },
  bloodtest:  { label: 'Blood test',      el: 'Αιματολογική',        icon: '🩸', group: 'diagnostic' },
  consult:    { label: 'Doctor visit',    el: 'Επίσκεψη σε γιατρό',  icon: '👨‍⚕️', group: 'care'      },
  admission:  { label: 'Hospital stay',   el: 'Νοσηλεία',            icon: '🏥', group: 'care'       },
  medication: { label: 'Medication',      el: 'Φαρμακευτική αγωγή',  icon: '💊', group: 'care'       },
  symptom:    { label: 'Symptom / event', el: 'Σύμπτωμα / συμβάν',   icon: '⚠',  group: 'other'      },
  other:      { label: 'Other',           el: 'Άλλο',                icon: '○',  group: 'other'      }
};

const EVENT_GROUPS = {
  treatment:  { label: 'Treatment',  el: 'Θεραπεία',    color: '#eb6834' },
  diagnostic: { label: 'Diagnostic', el: 'Διαγνωστικά', color: '#2a78d6' },
  care:       { label: 'Care',       el: 'Φροντίδα',    color: '#1baf7a' },
  other:      { label: 'Other',      el: 'Άλλα',        color: '#6b7e7b' }
};

function eventColor(type) {
  const t = EVENT_TYPES[type] || EVENT_TYPES.other;
  return (EVENT_GROUPS[t.group] || EVENT_GROUPS.other).color;
}
function eventIcon(type)  { return (EVENT_TYPES[type] || EVENT_TYPES.other).icon; }
function eventLabel(type) { return L(EVENT_TYPES[type] || EVENT_TYPES.other); }

/* Daily metrics. `higherIsBetter` drives the direction of the delta arrow;
   null means a change has no inherent good/bad reading. */
const METRICS = {
  weight:    { label: 'Weight',        el: 'Βάρος',              unit: 'kg',    dec: 1, min: 20,  max: 250, higherIsBetter: null,  chart: true },
  glucose:   { label: 'Blood sugar',   el: 'Σάκχαρο',            unit: 'mg/dL', dec: 0, min: 20,  max: 600, higherIsBetter: null,  chart: true },
  systolic:  { label: 'Systolic BP',   el: 'Συστολική πίεση',    unit: 'mmHg',  dec: 0, min: 50,  max: 260, higherIsBetter: null,  chart: true },
  diastolic: { label: 'Diastolic BP',  el: 'Διαστολική πίεση',   unit: 'mmHg',  dec: 0, min: 30,  max: 160, higherIsBetter: null,  chart: true },
  pulse:     { label: 'Pulse',         el: 'Σφυγμός',            unit: 'bpm',   dec: 0, min: 30,  max: 220, higherIsBetter: null,  chart: true },
  temp:      { label: 'Temperature',   el: 'Θερμοκρασία',        unit: '°C',    dec: 1, min: 33,  max: 43,  higherIsBetter: null,  chart: true },
  spo2:      { label: 'Oxygen (SpO₂)', el: 'Οξυγόνο (SpO₂)',     unit: '%',     dec: 0, min: 50,  max: 100, higherIsBetter: true,  chart: true },
  pain:      { label: 'Pain',          el: 'Πόνος',              unit: '/10',   dec: 0, min: 0,   max: 10,  higherIsBetter: false, chart: true },
  nausea:    { label: 'Nausea',        el: 'Ναυτία',             unit: '/10',   dec: 0, min: 0,   max: 10,  higherIsBetter: false, chart: true },
  fatigue:   { label: 'Fatigue',       el: 'Κόπωση',             unit: '/10',   dec: 0, min: 0,   max: 10,  higherIsBetter: false, chart: true },
  appetite:  { label: 'Appetite',      el: 'Όρεξη',              unit: '/10',   dec: 0, min: 0,   max: 10,  higherIsBetter: true,  chart: true },
  mood:      { label: 'Mood',          el: 'Διάθεση',            unit: '/10',   dec: 0, min: 0,   max: 10,  higherIsBetter: true,  chart: true }
};

/* Blood-sugar reading context — a fasting 140 and a post-meal 140 mean
   different things, so the context rides along with every glucose value. */
const GLUCOSE_CONTEXTS = {
  fasting:  { label: 'Fasting',         el: 'Νηστείας',           low: 70, high: 100 },
  premeal:  { label: 'Before meal',     el: 'Πριν το φαγητό',     low: 70, high: 130 },
  postmeal: { label: 'After meal (2h)', el: 'Μετά το φαγητό (2ω)',low: 70, high: 180 },
  bedtime:  { label: 'Bedtime',         el: 'Πριν τον ύπνο',      low: 90, high: 150 },
  random:   { label: 'Random',          el: 'Τυχαία ώρα',         low: 70, high: 180 }
};

/* Lab analytes. Ranges are typical adult values — every lab prints its own,
   and any result can override low/high when it is entered. */
const LAB_PANELS = [
  { key: 'cbc', label: 'Blood count (CBC)', el: 'Γενική αίματος', tests: [
    { key: 'wbc',   label: 'White cells (WBC)',   el: 'Λευκά αιμοσφαίρια (WBC)', unit: '10³/µL', low: 4.0,  high: 11.0, dec: 1 },
    { key: 'neut',  label: 'Neutrophils (ANC)',   el: 'Ουδετερόφιλα (ANC)',      unit: '10³/µL', low: 1.8,  high: 7.7,  dec: 2 },
    { key: 'lymph', label: 'Lymphocytes',         el: 'Λεμφοκύτταρα',            unit: '10³/µL', low: 1.0,  high: 4.8,  dec: 2 },
    { key: 'hgb',   label: 'Haemoglobin',         el: 'Αιμοσφαιρίνη',            unit: 'g/dL',   low: 12.0, high: 15.5, dec: 1 },
    { key: 'hct',   label: 'Haematocrit',         el: 'Αιματοκρίτης',            unit: '%',      low: 36,   high: 46,   dec: 1 },
    { key: 'plt',   label: 'Platelets',           el: 'Αιμοπετάλια',             unit: '10³/µL', low: 150,  high: 400,  dec: 0 }
  ]},
  { key: 'chem', label: 'Chemistry', el: 'Βιοχημικές', tests: [
    { key: 'glu',   label: 'Glucose (fasting)',   el: 'Γλυκόζη (νηστείας)',      unit: 'mg/dL',  low: 70,   high: 99,   dec: 0 },
    { key: 'hba1c', label: 'HbA1c',               el: 'Γλυκοζυλιωμένη (HbA1c)',  unit: '%',      low: 4.0,  high: 5.6,  dec: 1 },
    { key: 'crea',  label: 'Creatinine',          el: 'Κρεατινίνη',              unit: 'mg/dL',  low: 0.5,  high: 1.1,  dec: 2 },
    { key: 'urea',  label: 'Urea',                el: 'Ουρία',                   unit: 'mg/dL',  low: 15,   high: 45,   dec: 0 },
    { key: 'na',    label: 'Sodium',              el: 'Νάτριο',                  unit: 'mmol/L', low: 135,  high: 145,  dec: 0 },
    { key: 'k',     label: 'Potassium',           el: 'Κάλιο',                   unit: 'mmol/L', low: 3.5,  high: 5.1,  dec: 1 },
    { key: 'ca',    label: 'Calcium',             el: 'Ασβέστιο',                unit: 'mg/dL',  low: 8.6,  high: 10.2, dec: 1 },
    { key: 'mg',    label: 'Magnesium',           el: 'Μαγνήσιο',                unit: 'mg/dL',  low: 1.7,  high: 2.2,  dec: 1 },
    { key: 'alb',   label: 'Albumin',             el: 'Λευκωματίνη',             unit: 'g/dL',   low: 3.5,  high: 5.2,  dec: 1 },
    { key: 'tp',    label: 'Total protein',       el: 'Ολικές πρωτεΐνες',        unit: 'g/dL',   low: 6.4,  high: 8.3,  dec: 1 }
  ]},
  { key: 'liver', label: 'Liver', el: 'Ήπαρ', tests: [
    { key: 'alt',   label: 'ALT (SGPT)',          el: 'SGPT (ALT)',              unit: 'U/L',    low: 0,    high: 33,   dec: 0 },
    { key: 'ast',   label: 'AST (SGOT)',          el: 'SGOT (AST)',              unit: 'U/L',    low: 0,    high: 32,   dec: 0 },
    { key: 'alp',   label: 'ALP',                 el: 'Αλκαλική φωσφατάση',      unit: 'U/L',    low: 35,   high: 104,  dec: 0 },
    { key: 'ggt',   label: 'γ-GT',                el: 'γ-GT',                    unit: 'U/L',    low: 0,    high: 40,   dec: 0 },
    { key: 'tbil',  label: 'Bilirubin (total)',   el: 'Χολερυθρίνη (ολική)',     unit: 'mg/dL',  low: 0.3,  high: 1.2,  dec: 2 },
    { key: 'ldh',   label: 'LDH',                 el: 'LDH',                     unit: 'U/L',    low: 135,  high: 214,  dec: 0 }
  ]},
  { key: 'inflam', label: 'Inflammation', el: 'Φλεγμονή', tests: [
    { key: 'crp',   label: 'CRP',                 el: 'CRP',                     unit: 'mg/L',   low: 0,    high: 5,    dec: 1 },
    { key: 'esr',   label: 'ESR',                 el: 'ΤΚΕ',                     unit: 'mm/h',   low: 0,    high: 20,   dec: 0 }
  ]},
  { key: 'markers', label: 'Tumour markers', el: 'Καρκινικοί δείκτες', tests: [
    { key: 'cea',   label: 'CEA',                 el: 'CEA',                     unit: 'ng/mL',  low: 0,    high: 5,    dec: 1 },
    { key: 'ca153', label: 'CA 15-3',             el: 'CA 15-3',                 unit: 'U/mL',   low: 0,    high: 30,   dec: 1 },
    { key: 'ca125', label: 'CA 125',              el: 'CA 125',                  unit: 'U/mL',   low: 0,    high: 35,   dec: 1 },
    { key: 'ca199', label: 'CA 19-9',             el: 'CA 19-9',                 unit: 'U/mL',   low: 0,    high: 37,   dec: 1 },
    { key: 'afp',   label: 'AFP',                 el: 'AFP',                     unit: 'ng/mL',  low: 0,    high: 10,   dec: 1 }
  ]},
  { key: 'other', label: 'Thyroid, iron & vitamins', el: 'Θυρεοειδής, σίδηρος & βιταμίνες', tests: [
    { key: 'tsh',   label: 'TSH',                 el: 'TSH',                     unit: 'µIU/mL', low: 0.4,  high: 4.0,  dec: 2 },
    { key: 'vitd',  label: 'Vitamin D (25-OH)',   el: 'Βιταμίνη D (25-OH)',      unit: 'ng/mL',  low: 30,   high: 100,  dec: 1 },
    { key: 'b12',   label: 'Vitamin B12',         el: 'Βιταμίνη B12',            unit: 'pg/mL',  low: 200,  high: 900,  dec: 0 },
    { key: 'fe',    label: 'Iron',                el: 'Σίδηρος',                 unit: 'µg/dL',  low: 50,   high: 170,  dec: 0 },
    { key: 'ferr',  label: 'Ferritin',            el: 'Φερριτίνη',               unit: 'ng/mL',  low: 15,   high: 150,  dec: 0 }
  ]}
];

/** Flat lookup: test key → definition (with its panel attached). */
const LAB_TESTS = (() => {
  const map = {};
  LAB_PANELS.forEach(p => p.tests.forEach(t => {
    map[t.key] = { ...t, panel: p.key, panelLabel: p.label, panelEl: p.el };
  }));
  return map;
})();

/** A lab panel's name in the active language. */
function panelLabel(def) {
  if (!def) return '';
  return L({ label: def.panelLabel, el: def.panelEl });
}

/* Document categories for the filing cabinet. */
const RECORD_CATEGORIES = {
  lab:          { label: 'Lab report',         el: 'Φύλλο εξετάσεων',              icon: '🧪' },
  imaging:      { label: 'Imaging / Scan',     el: 'Απεικόνιση / Σάρωση',          icon: '📷' },
  pathology:    { label: 'Pathology / Biopsy', el: 'Παθολογοανατομική / Βιοψία',   icon: '🔬' },
  surgery:      { label: 'Surgical note',      el: 'Χειρουργικό σημείωμα',         icon: '🔪' },
  oncology:     { label: 'Oncology note',      el: 'Ογκολογικό σημείωμα',          icon: '📋' },
  discharge:    { label: 'Discharge summary',  el: 'Εξιτήριο',                     icon: '🏥' },
  prescription: { label: 'Prescription',       el: 'Συνταγή',                      icon: '💊' },
  referral:     { label: 'Referral',           el: 'Παραπεμπτικό',                 icon: '➡' },
  insurance:    { label: 'Insurance / Admin',  el: 'Ασφάλεια / Διοικητικά',        icon: '📁' },
  receipt:      { label: 'Receipt / Invoice',  el: 'Απόδειξη / Τιμολόγιο',         icon: '🧾' },
  consent:      { label: 'Consent form',       el: 'Έντυπο συγκατάθεσης',          icon: '✍' },
  other:        { label: 'Other',              el: 'Άλλο',                         icon: '📄' }
};

/* Reminder lead times offered per event, in minutes before the start. */
const REMINDERS = [
  { v: 0,     key: 'rm.remindNone' },
  { v: 60,    key: 'rm.remind1h' },
  { v: 180,   key: 'rm.remind3h' },
  { v: 1440,  key: 'rm.remind1d' },
  { v: 2880,  key: 'rm.remind2d' },
  { v: 10080, key: 'rm.remind1w' }
];

/* ══ STORE ══════════════════════════════════════════════════════ */
const Store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },

  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
      toast(full ? t('common.storageFull') : t('common.saveError', { msg: e.message }), 'error');
      return false;
    }
  },

  list(key)          { const v = this.read(key, []); return Array.isArray(v) ? v : []; },
  saveList(key, arr) { return this.write(key, arr); },

  /** Insert or update by id; returns the saved record. */
  upsert(key, record) {
    const all = this.list(key);
    const now = new Date().toISOString();
    if (!record.id) {
      record.id = uid();
      record.createdAt = now;
    }
    record.updatedAt = now;
    const i = all.findIndex(r => r.id === record.id);
    if (i >= 0) all[i] = record; else all.push(record);
    this.saveList(key, all);
    return record;
  },

  remove(key, id) {
    this.saveList(key, this.list(key).filter(r => r.id !== id));
  },

  find(key, id) { return this.list(key).find(r => r.id === id) || null; }
};

/* Profile + targets. */
const DEFAULT_PROFILE = {
  name: '', dob: '', sex: '', heightCm: '',
  diagnosis: '', stage: '', diagnosedOn: '',
  oncologist: '', hospital: '', phone: '', bloodType: '',
  allergies: '', notes: '',
  targets: { weightLow: '', weightHigh: '', glucoseLow: 70, glucoseHigh: 180 }
};

function getProfile() {
  const p = Store.read(HK.profile, null);
  if (!p) return { ...DEFAULT_PROFILE, targets: { ...DEFAULT_PROFILE.targets } };
  return { ...DEFAULT_PROFILE, ...p, targets: { ...DEFAULT_PROFILE.targets, ...(p.targets || {}) } };
}
function saveProfile(p) { Store.write(HK.profile, p); }

function getMeta()      { return Store.read(HK.meta, { lastBackup: null, created: new Date().toISOString() }); }
function setMeta(patch) { Store.write(HK.meta, { ...getMeta(), ...patch }); }

/* ══ DOCUMENT BLOB STORE (IndexedDB) ════════════════════════════ */
const Files = {
  _db: null,

  async open() {
    if (this._db) return this._db;
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('carelog_files', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('blobs')) req.result.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return this._db;
  },

  async _tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', mode);
      const req = fn(tx.objectStore('blobs'));
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  /** Store a File/Blob, returns the generated attachment id. */
  async put(file) {
    const id = uid('file');
    await this._tx('readwrite', s => s.put(file, id));
    return id;
  },
  async get(id)    { return this._tx('readonly',  s => s.get(id)); },
  async del(id)    { return this._tx('readwrite', s => s.delete(id)); },
  async keys()     { return this._tx('readonly',  s => s.getAllKeys()); },

  /** Open an attachment in a new tab. */
  async open_(att) {
    const blob = await this.get(att.id);
    if (!blob) { toast(t('dc.missing'), 'error'); return; }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  /** Download an attachment to disk. */
  async download(att) {
    const blob = await this.get(att.id);
    if (!blob) { toast(t('dc.missing'), 'error'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = att.name || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  /** Total bytes held, for the storage readout in Settings. */
  async totalBytes() {
    const ids = await this.keys();
    let total = 0;
    for (const id of ids) {
      const b = await this.get(id);
      if (b && typeof b.size === 'number') total += b.size;
    }
    return total;
  }
};

/* ══ UTILITIES ══════════════════════════════════════════════════ */
function uid(prefix = 'r') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/** Today as YYYY-MM-DD in the *local* timezone (never toISOString — it shifts). */
function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function nowHM() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}
/** Parse YYYY-MM-DD into a local-midnight Date. */
function parseISO(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function addDays(iso, n) {
  const d = parseISO(iso); if (!d) return iso;
  d.setDate(d.getDate() + n);
  return todayISO(d);
}
function daysBetween(a, b) {
  const da = parseISO(a), db = parseISO(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}
/* Numeric DD/MM/YYYY in both languages — unambiguous on a printed report. */
function fmtDate(iso) {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}
function fmtDateLong(iso) {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString(localeTag(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function fmtDateShort(iso) {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' }) : '—';
}
function fmtMonthYear(date) {
  return date.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
}
/** Short weekday names starting Monday, in the active language. */
function weekdayNames() {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 1 + i);           // 1 Jan 2024 was a Monday
    out.push(d.toLocaleDateString(localeTag(), { weekday: 'short' }));
  }
  return out;
}
/** "in 3 days" / "5 days ago" / "today". */
function relDays(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === null) return '';
  if (n === 0)  return t('common.today');
  if (n === 1)  return t('common.tomorrow');
  if (n === -1) return t('common.yesterday');
  return n > 0 ? t('common.inDays', { n }) : t('common.daysAgo', { n: -n });
}
function fmtNum(v, dec = 1) {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : n.toFixed(dec);
}
function fmtBytes(b) {
  if (!b) return '0 KB';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Numeric input → number, or null when blank. Never coerces '' to 0. */
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Classify a value against a reference range → status token. */
function rangeStatus(value, low, high) {
  const v = num(value);
  if (v === null) return null;
  const lo = num(low), hi = num(high);
  if (lo === null && hi === null) return null;
  if (hi !== null && v > hi) {
    const over = lo !== null && hi > lo ? (v - hi) / (hi - lo) : (v - hi) / (hi || 1);
    return over > 0.5 ? 'critical' : 'warning';
  }
  if (lo !== null && v < lo) {
    const under = hi !== null && hi > lo ? (lo - v) / (hi - lo) : (lo - v) / (lo || 1);
    return under > 0.5 ? 'critical' : 'warning';
  }
  return 'good';
}
const STATUS_ICON = { good: '✓', warning: '▲', serious: '▲', critical: '●' };
function statusBadge(status, text) {
  if (!status) return '';
  return `<span class="badge badge-${status}">${STATUS_ICON[status] || ''} ${esc(text)}</span>`;
}

/* ══ TOAST & CONFIRM ════════════════════════════════════════════ */
function toast(msg, type = 'success') {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:20px;padding:11px 20px;border-radius:10px;' +
      'font-size:13px;font-weight:500;z-index:3000;pointer-events:none;transition:all .3s;opacity:0;' +
      'transform:translateY(10px);font-family:DM Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.22);max-width:min(92vw,420px)';
    document.body.appendChild(t);
  }
  const colors = { success: ['#0f4a42', '#e8c97a'], error: ['#d03b3b', '#fff'], warning: ['#8a5d00', '#fff'], info: ['#1a5a8a', '#fff'] };
  const [bg, fg] = colors[type] || colors.info;
  t.style.background = bg; t.style.color = fg; t.textContent = msg;
  t.style.opacity = '1'; t.style.transform = 'translateY(0)';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 3000);
}

let _confirmCb = null;
function confirmAction(title, msg, btnLabel, cb, danger = true) {
  let m = document.getElementById('_confirm');
  if (!m) {
    m = document.createElement('div');
    m.id = '_confirm';
    m.className = 'modal-overlay';
    m.innerHTML =
      '<div class="modal" style="max-width:410px">' +
        '<h2 id="_cf-title"></h2>' +
        '<p id="_cf-msg" style="font-size:13px;color:var(--text-muted);line-height:1.55;margin:8px 0 4px"></p>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-outline" id="_cf-cancel"></button>' +
          '<button class="btn" id="_cf-ok"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#_cf-cancel').textContent = t('common.cancel');
    m.querySelector('#_cf-cancel').onclick = () => m.classList.remove('open');
    m.querySelector('#_cf-ok').onclick = () => { m.classList.remove('open'); if (_confirmCb) _confirmCb(); };
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  }
  m.querySelector('#_cf-title').textContent = title;
  m.querySelector('#_cf-msg').textContent = msg;
  const ok = m.querySelector('#_cf-ok');
  ok.textContent = btnLabel;
  ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-teal');
  _confirmCb = cb;
  m.classList.add('open');
}

function openModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

/* ══ CHARTS ═════════════════════════════════════════════════════
 * Dependency-free SVG. Thin marks, hairline grid, one y-axis (never two),
 * crosshair + tooltip on hover, the last point of each series direct-labelled,
 * and a table view under every chart so no value is reachable by colour alone.
 * ═════════════════════════════════════════════════════════════ */

const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const CHART_INK   = { grid: '#e8eeed', axis: '#c3c2b7', muted: '#898781', text: '#52514e' };

/** Round a numeric domain out to human-readable tick stops. */
function niceScale(min, max, target = 5) {
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  if (min === max) { const pad = Math.abs(min || 1) * 0.1; min -= pad; max += pad; }
  const rawStep = (max - min) / target;
  const mag  = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
  return { ticks, min: lo, max: hi };
}

/**
 * Draw a time-series line chart into `el`.
 * opts.series: [{ key, label, color, points:[{x:'YYYY-MM-DD', y:Number, note}] }]
 * opts.band:   { low, high, label }  — a reference/target range drawn behind the lines
 * opts.markers:[{ x, label, icon, color }] — treatment dates, ticked on the x-axis
 */
function renderLineChart(el, opts) {
  if (!el) return;
  el._chartOpts = opts;

  const series = (opts.series || [])
    .map((s, i) => ({
      ...s,
      color: s.color || SERIES_COLORS[i % SERIES_COLORS.length],
      points: (s.points || []).filter(p => p && p.x && num(p.y) !== null)
        .map(p => ({ ...p, y: num(p.y), t: parseISO(p.x).getTime() }))
        .sort((a, b) => a.t - b.t)
    }))
    .filter(s => s.points.length);

  const dec  = opts.dec == null ? 1 : opts.dec;
  const unit = opts.unit || '';

  if (!series.length) {
    el.innerHTML = `<div class="empty" style="padding:34px 16px">
      <div class="empty-icon">📉</div>${esc(opts.emptyMsg || t('common.noReadings'))}</div>`;
    return;
  }

  /* ── Geometry ── */
  const W = Math.max(el.clientWidth || el.parentElement.clientWidth || 640, 280);
  const H = opts.height || 250;
  const M = { top: 14, right: 60, bottom: 34, left: 46 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  /* ── Scales (one y-axis, always) ── */
  const allT = series.flatMap(s => s.points.map(p => p.t));
  let t0 = Math.min(...allT), t1 = Math.max(...allT);
  if (t0 === t1) { t0 -= 86400000; t1 += 86400000; }

  const allY = series.flatMap(s => s.points.map(p => p.y));
  let yLo = Math.min(...allY), yHi = Math.max(...allY);
  const band = opts.band && (num(opts.band.low) !== null || num(opts.band.high) !== null) ? opts.band : null;
  if (band) {
    if (num(band.low)  !== null) yLo = Math.min(yLo, num(band.low));
    if (num(band.high) !== null) yHi = Math.max(yHi, num(band.high));
  }
  /* yMin/yMax are hard bounds, not hints: a 0–10 symptom score must never
     grow an axis that runs from -3 to 13 just because of the padding. */
  const hardMin = opts.yMin, hardMax = opts.yMax;
  let scale;
  if (hardMin !== undefined && hardMax !== undefined) {
    scale = niceScale(hardMin, hardMax, 5);
    scale.min = hardMin; scale.max = hardMax;
    scale.ticks = scale.ticks.filter(t => t >= hardMin && t <= hardMax);
  } else {
    const pad = (yHi - yLo) * 0.12 || Math.abs(yHi * 0.1) || 1;
    let lo = yLo - pad, hi = yHi + pad;
    if (hardMin !== undefined) lo = Math.max(lo, hardMin);
    if (hardMax !== undefined) hi = Math.min(hi, hardMax);
    scale = niceScale(lo, hi, 5);
    if (hardMin !== undefined && scale.min < hardMin) { scale.min = hardMin; scale.ticks = scale.ticks.filter(t => t >= hardMin); }
    if (hardMax !== undefined && scale.max > hardMax) { scale.max = hardMax; scale.ticks = scale.ticks.filter(t => t <= hardMax); }
  }

  const X = t => M.left + ((t - t0) / (t1 - t0)) * pw;
  const Y = v => M.top + ph - ((v - scale.min) / (scale.max - scale.min)) * ph;

  /* ── Build SVG ── */
  const svg = [];
  svg.push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'chart')}">`);

  /* Reference band — behind everything, tinted so it recedes */
  if (band) {
    const bTop = Y(num(band.high) !== null ? num(band.high) : scale.max);
    const bBot = Y(num(band.low)  !== null ? num(band.low)  : scale.min);
    svg.push(`<rect x="${M.left}" y="${bTop.toFixed(1)}" width="${pw}" height="${Math.max(bBot - bTop, 0).toFixed(1)}" fill="#1baf7a" opacity="0.07"/>`);
    if (band.label) {
      svg.push(`<text x="${M.left + pw - 4}" y="${(bTop + 12).toFixed(1)}" text-anchor="end" font-size="10" fill="${CHART_INK.muted}">${esc(band.label)}</text>`);
    }
  }

  /* Horizontal grid — solid hairlines, one shade off the surface */
  scale.ticks.forEach(v => {
    const y = Y(v);
    if (y < M.top - 1 || y > M.top + ph + 1) return;
    svg.push(`<line x1="${M.left}" y1="${y.toFixed(1)}" x2="${M.left + pw}" y2="${y.toFixed(1)}" stroke="${CHART_INK.grid}" stroke-width="1"/>`);
    svg.push(`<text x="${M.left - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${CHART_INK.muted}" style="font-variant-numeric:tabular-nums">${fmtNum(v, v % 1 === 0 ? 0 : dec)}</text>`);
  });

  /* Baseline */
  svg.push(`<line x1="${M.left}" y1="${M.top + ph}" x2="${M.left + pw}" y2="${M.top + ph}" stroke="${CHART_INK.axis}" stroke-width="1"/>`);

  /* X ticks — evenly spaced dates across the domain */
  const nTicks = Math.max(2, Math.min(6, Math.floor(pw / 90)));
  for (let i = 0; i <= nTicks; i++) {
    const t = t0 + ((t1 - t0) * i) / nTicks;
    const x = X(t);
    const anchor = i === 0 ? 'start' : i === nTicks ? 'end' : 'middle';
    svg.push(`<text x="${x.toFixed(1)}" y="${M.top + ph + 16}" text-anchor="${anchor}" font-size="10" fill="${CHART_INK.muted}">${esc(fmtDateShort(todayISO(new Date(t))))}</text>`);
  }

  /* Event markers — a tick on the axis plus its icon; label lives in the tooltip */
  (opts.markers || []).forEach(mk => {
    const t = parseISO(mk.x); if (!t) return;
    const ms = t.getTime();
    if (ms < t0 || ms > t1) return;
    const x = X(ms);
    svg.push(`<line x1="${x.toFixed(1)}" y1="${M.top + ph}" x2="${x.toFixed(1)}" y2="${M.top + ph + 6}" stroke="${mk.color || CHART_INK.axis}" stroke-width="2"/>`);
    if (mk.icon) svg.push(`<text x="${x.toFixed(1)}" y="${M.top + ph - 3}" text-anchor="middle" font-size="10">${esc(mk.icon)}</text>`);
  });

  /* Series lines */
  series.forEach(s => {
    const d = s.points.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    svg.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  });

  /* Dots — 2px surface ring keeps overlapping marks readable. Hidden when dense. */
  const dense = series.reduce((n, s) => n + s.points.length, 0) > 70;
  if (!dense) {
    series.forEach(s => s.points.forEach(p => {
      svg.push(`<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="${s.color}" stroke="#fff" stroke-width="2"/>`);
    }));
  }

  /* Direct label on the last point of each series (never a label on every
     point). Labels are nudged apart vertically so four close series don't
     stack their numbers on top of each other. */
  const labels = series.map(s => {
    const p = s.points[s.points.length - 1];
    return { x: X(p.t) + 8, y: Y(p.y), text: fmtNum(p.y, dec) + (unit ? ' ' + unit : '') };
  }).sort((a, b) => a.y - b.y);
  const GAP = 13;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < GAP) labels[i].y = labels[i - 1].y + GAP;
  }
  const overflow = labels.length ? labels[labels.length - 1].y - (M.top + ph) : 0;
  if (overflow > 0) labels.forEach(l => { l.y -= overflow; });
  labels.forEach(l => {
    svg.push(`<text x="${l.x.toFixed(1)}" y="${(Math.max(l.y, M.top + 4) + 3.5).toFixed(1)}" font-size="11" font-weight="600" fill="${CHART_INK.text}" style="font-variant-numeric:tabular-nums">${esc(l.text)}</text>`);
  });

  /* Hover layer: crosshair, highlight rings, and the interaction target */
  svg.push(`<g class="ch-hover" style="display:none">
    <line class="ch-cross" y1="${M.top}" y2="${M.top + ph}" stroke="${CHART_INK.axis}" stroke-width="1"/>
    ${series.map(s => `<circle class="ch-hi" r="5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join('')}
  </g>`);
  svg.push(`<rect class="ch-catch" x="${M.left}" y="${M.top}" width="${pw}" height="${ph}" fill="transparent" style="cursor:crosshair"/>`);
  svg.push('</svg>');

  /* ── Legend (always present for 2+ series; a single series is named by the title) ── */
  const legend = series.length > 1
    ? `<div class="chart-legend">${series.map(s =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('')}</div>`
    : '';

  /* ── Table view — the relief for low-contrast hues and for screen readers ── */
  const xs = [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort();
  const tableRows = xs.map(x => {
    const cells = series.map(s => {
      const p = s.points.find(pt => pt.x === x);
      return `<td class="num">${p ? fmtNum(p.y, dec) : '—'}</td>`;
    }).join('');
    return `<tr><td>${esc(fmtDate(x))}</td>${cells}</tr>`;
  }).join('');
  const table = `<details class="chart-table no-print"><summary style="cursor:pointer;font-size:11.5px;color:var(--text-muted);padding:4px 0">${esc(t('common.showNumbers', { n: xs.length }))}</summary>
    <div class="table-wrap" style="max-height:260px;overflow-y:auto;margin-top:6px"><table class="data">
    <thead><tr><th>Date</th>${series.map(s => `<th class="num">${esc(s.label)}${unit ? ' (' + esc(unit) + ')' : ''}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody></table></div></details>`;

  el.innerHTML = legend +
    `<div class="chart-body">${svg.join('')}<div class="chart-tip"></div></div>` +
    `<div class="chart-foot">${table}</div>`;

  /* ── Interaction ── */
  const body  = el.querySelector('.chart-body');
  const svgEl = body.querySelector('svg');
  const tip   = body.querySelector('.chart-tip');
  const hover = svgEl.querySelector('.ch-hover');
  const cross = svgEl.querySelector('.ch-cross');
  const rings = [...svgEl.querySelectorAll('.ch-hi')];
  const catcher = svgEl.querySelector('.ch-catch');

  const markerAt = {};
  (opts.markers || []).forEach(mk => { (markerAt[mk.x] = markerAt[mk.x] || []).push(mk); });

  function showAt(clientX) {
    const rect = svgEl.getBoundingClientRect();
    const sx = (clientX - rect.left) * (W / rect.width);
    const t  = t0 + ((sx - M.left) / pw) * (t1 - t0);

    /* Nearest shared x position */
    let best = null, bestD = Infinity;
    xs.forEach(x => {
      const d = Math.abs(parseISO(x).getTime() - t);
      if (d < bestD) { bestD = d; best = x; }
    });
    if (!best) return;

    const bt = parseISO(best).getTime();
    const px = X(bt);
    hover.style.display = '';
    cross.setAttribute('x1', px.toFixed(1));
    cross.setAttribute('x2', px.toFixed(1));

    const rows = [];
    series.forEach((s, i) => {
      const p = s.points.find(pt => pt.x === best);
      const ring = rings[i];
      if (p) {
        ring.setAttribute('cx', px.toFixed(1));
        ring.setAttribute('cy', Y(p.y).toFixed(1));
        ring.style.display = '';
        rows.push(`<div class="tip-row"><span class="tip-dot" style="background:${s.color}"></span>${esc(s.label)}<span class="tip-val">${fmtNum(p.y, dec)}${unit ? ' ' + esc(unit) : ''}</span></div>`);
      } else {
        ring.style.display = 'none';
      }
    });
    (markerAt[best] || []).forEach(mk => {
      rows.push(`<div class="tip-row" style="opacity:.85">${esc(mk.icon || '•')} ${esc(mk.label)}</div>`);
    });

    tip.innerHTML = `<div class="tip-date">${esc(fmtDateLong(best))}</div>${rows.join('')}`;
    tip.classList.add('on');
    const bw = body.clientWidth, tw = tip.offsetWidth;
    const left = Math.min(Math.max(px * (body.clientWidth / W) - tw / 2, 2), Math.max(bw - tw - 2, 2));
    tip.style.left = left + 'px';
    tip.style.top  = '4px';
  }

  function hide() { hover.style.display = 'none'; tip.classList.remove('on'); }

  catcher.addEventListener('mousemove', e => showAt(e.clientX));
  catcher.addEventListener('mouseleave', hide);
  catcher.addEventListener('touchstart', e => { if (e.touches[0]) showAt(e.touches[0].clientX); }, { passive: true });
  catcher.addEventListener('touchmove',  e => { if (e.touches[0]) showAt(e.touches[0].clientX); }, { passive: true });
  catcher.addEventListener('touchend', hide);
}

/** Tiny inline trend line for stat tiles — no axes, no interaction. */
function renderSparkline(el, values, color = SERIES_COLORS[0], height = 30) {
  if (!el) return;
  const vals = (values || []).map(num).filter(v => v !== null);
  if (vals.length < 2) { el.innerHTML = ''; return; }
  const W = Math.max(el.clientWidth || 120, 40), H = height, p = 3;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const X = i => p + (i / (vals.length - 1)) * (W - p * 2);
  const Y = v => H - p - ((v - lo) / span) * (H - p * 2);
  const d = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const lastX = X(vals.length - 1), lastY = Y(vals[vals.length - 1]);
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

/** Re-render every chart on the page when the layout width changes. */
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    document.querySelectorAll('.chart-host').forEach(el => {
      if (el._chartOpts) renderLineChart(el, el._chartOpts);
    });
  }, 180);
});

/* ══ QUERIES ════════════════════════════════════════════════════ */

/** All daily readings, oldest first. */
function getVitals()  { return Store.list(HK.vitals).slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }
/** All calendar events, oldest first. */
function getEvents()  { return Store.list(HK.events).slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }
/** Filed documents, newest first. */
function getRecords() { return Store.list(HK.records).slice().sort((a, b) => b.date.localeCompare(a.date)); }
/** Lab result sets, newest first. */
function getLabs()    { return Store.list(HK.labs).slice().sort((a, b) => b.date.localeCompare(a.date)); }
function getMeds()    { return Store.list(HK.meds); }

function inRange(iso, from, to) {
  if (from && iso < from) return false;
  if (to   && iso > to)   return false;
  return true;
}

/** Chart-ready points for one daily metric. */
function vitalSeries(metric, from, to) {
  return getVitals()
    .filter(v => num(v[metric]) !== null && inRange(v.date, from, to))
    .map(v => ({ x: v.date, y: num(v[metric]), note: v.notes }));
}

/** Blood sugar split by reading context, so fasting and post-meal never mix. */
function glucoseSeriesByContext(from, to) {
  const buckets = {};
  getVitals().forEach(v => {
    if (num(v.glucose) === null || !inRange(v.date, from, to)) return;
    const ctx = v.glucoseContext || 'random';
    (buckets[ctx] = buckets[ctx] || []).push({ x: v.date, y: num(v.glucose) });
  });
  return buckets;
}

/** The most recent non-empty reading of a metric. */
function latestVital(metric) {
  const all = getVitals().filter(v => num(v[metric]) !== null);
  return all.length ? all[all.length - 1] : null;
}

/** Change between the last reading and the one closest to `days` ago. */
function metricDelta(metric, days = 30) {
  const all = getVitals().filter(v => num(v[metric]) !== null);
  if (all.length < 2) return null;
  const last = all[all.length - 1];
  const cutoff = addDays(last.date, -days);
  const prior = all.slice(0, -1).filter(v => v.date >= cutoff);
  const ref = (prior.length ? prior[0] : all[0]);
  if (ref.id === last.id) return null;
  return { from: num(ref[metric]), to: num(last[metric]), diff: num(last[metric]) - num(ref[metric]), fromDate: ref.date, toDate: last.date };
}

/** Chart-ready points for one lab analyte across every filed result set. */
function labSeries(testKey, from, to) {
  const pts = [];
  getLabs().forEach(l => {
    if (!inRange(l.date, from, to)) return;
    const hit = (l.values || []).find(v => v.key === testKey);
    if (hit && num(hit.value) !== null) pts.push({ x: l.date, y: num(hit.value), low: hit.low, high: hit.high });
  });
  return pts.sort((a, b) => a.x.localeCompare(b.x));
}

/** Every analyte that has at least `min` recorded results. */
function labTestsWithData(min = 1) {
  const counts = {};
  getLabs().forEach(l => (l.values || []).forEach(v => {
    if (num(v.value) !== null) counts[v.key] = (counts[v.key] || 0) + 1;
  }));
  return Object.keys(counts).filter(k => counts[k] >= min)
    .sort((a, b) => (LAB_TESTS[a]?.label || a).localeCompare(LAB_TESTS[b]?.label || b));
}

/** Events on or after today, soonest first. */
function upcomingEvents(limit = 0) {
  const today = todayISO();
  const list = getEvents().filter(e => e.date >= today && e.status !== 'cancelled');
  return limit ? list.slice(0, limit) : list;
}
/** Events before today, most recent first. */
function pastEvents(limit = 0) {
  const today = todayISO();
  const list = getEvents().filter(e => e.date < today).reverse();
  return limit ? list.slice(0, limit) : list;
}
/** Treatment markers (chemo, radio, surgery…) for overlaying on charts. */
function treatmentMarkers(from, to) {
  return getEvents()
    .filter(e => ['chemo', 'radio', 'immuno', 'surgery'].includes(e.type) && inRange(e.date, from, to) && e.status !== 'cancelled')
    .map(e => ({ x: e.date, label: e.title || eventLabel(e.type), icon: eventIcon(e.type), color: eventColor(e.type) }));
}

/** Documents and lab sets attached to one event. */
function eventAttachments(eventId) {
  return {
    records: getRecords().filter(r => r.eventId === eventId),
    labs:    getLabs().filter(l => l.eventId === eventId)
  };
}

/** Preset date windows used by the filter rows. */
const RANGES = {
  '30':  { label: '30 days',  days: 30  },
  '90':  { label: '3 months', days: 90  },
  '180': { label: '6 months', days: 180 },
  '365': { label: '1 year',   days: 365 },
  'all': { label: 'All time',  days: null }
};
function rangeFrom(key) {
  const r = RANGES[key];
  return r && r.days ? addDays(todayISO(), -r.days) : '';
}

/* ══ BACKUP ═════════════════════════════════════════════════════ */

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Write the whole archive — records and scanned documents — to one .json file. */
async function exportBackup(includeFiles = true) {
  const payload = {
    app: 'carelog', version: 1, exportedAt: new Date().toISOString(),
    profile: getProfile(),
    vitals:  Store.list(HK.vitals),
    events:  Store.list(HK.events),
    records: Store.list(HK.records),
    labs:    Store.list(HK.labs),
    meds:    Store.list(HK.meds),
    files:   []
  };

  if (includeFiles) {
    const wanted = new Map();
    payload.records.forEach(r => (r.attachments || []).forEach(a => wanted.set(a.id, a)));
    for (const [id, att] of wanted) {
      const blob = await Files.get(id);
      if (!blob) continue;
      payload.files.push({ id, name: att.name, type: att.type || blob.type, data: await blobToDataURL(blob) });
    }
  }

  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const who = (payload.profile.name || 'patient').replace(/[^\w\-]+/g, '-').toLowerCase();
  a.href = url;
  a.download = `carelog-${who}-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  setMeta({ lastBackup: new Date().toISOString() });
  return { records: payload.records.length, files: payload.files.length, bytes: json.length };
}

/**
 * Restore an archive.
 * mode 'replace' wipes what is here first; 'merge' keeps both, skipping ids
 * that already exist so re-importing the same file is harmless.
 */
async function importBackup(file, mode = 'merge') {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(t('st.notJson')); }
  if (!data || data.app !== 'carelog') throw new Error(t('st.notCarelog'));

  const lists = [
    [HK.vitals,  data.vitals],
    [HK.events,  data.events],
    [HK.records, data.records],
    [HK.labs,    data.labs],
    [HK.meds,    data.meds]
  ];

  let added = 0;
  for (const [key, incoming] of lists) {
    const rows = Array.isArray(incoming) ? incoming : [];
    if (mode === 'replace') {
      Store.saveList(key, rows);
      added += rows.length;
    } else {
      const existing = Store.list(key);
      const seen = new Set(existing.map(r => r.id));
      rows.forEach(r => { if (r && r.id && !seen.has(r.id)) { existing.push(r); seen.add(r.id); added++; } });
      Store.saveList(key, existing);
    }
  }

  if (data.profile && (mode === 'replace' || !getProfile().name)) saveProfile(data.profile);

  let filesIn = 0;
  for (const f of (data.files || [])) {
    try {
      const blob = await (await fetch(f.data)).blob();
      await Files._tx('readwrite', s => s.put(blob, f.id));
      filesIn++;
    } catch { /* one unreadable attachment must not abort the restore */ }
  }

  return { records: added, files: filesIn };
}

/** Spreadsheet-friendly export of the daily readings. */
function exportVitalsCSV() {
  const cols = ['date', 'time', ...Object.keys(METRICS), 'glucoseContext', 'notes'];
  const head = [t('common.date'), t('common.time'),
                ...Object.keys(METRICS).map(k => `${L(METRICS[k])} (${METRICS[k].unit})`),
                t('vt.colWhen'), t('common.notes')];
  const rows = getVitals().map(v => cols.map(c => {
    const val = c === 'glucoseContext' ? L(GLUCOSE_CONTEXTS[v[c]]) : (v[c] == null ? '' : v[c]);
    return /[",\n]/.test(String(val)) ? '"' + String(val).replace(/"/g, '""') + '"' : String(val);
  }).join(','));
  downloadText([head.join(','), ...rows].join('\n'), `carelog-daily-${todayISO()}.csv`, 'text/csv');
}

/** Spreadsheet-friendly export of every lab value, one row per analyte. */
function exportLabsCSV() {
  const head = [t('common.date'), t('lb.otherTests'), t('lb.colTest'), t('lb.colValue'), t('lb.colUnit'),
                t('lb.colRefLow'), t('lb.colRefHigh'), t('common.status'), t('lb.labName'), t('common.notes')];
  const rows = [];
  getLabs().forEach(l => (l.values || []).forEach(v => {
    if (num(v.value) === null) return;
    const def = LAB_TESTS[v.key] || {};
    const st  = rangeStatus(v.value, v.low, v.high);
    rows.push([l.date, panelLabel(def), (def.label ? L(def) : v.label) || v.key, v.value, v.unit || def.unit || '',
               v.low ?? '', v.high ?? '', st === 'good' ? t('rp.inRange') : st ? t('lb.outOfRangeN', { n: 1 }) : '',
               l.source || '', (l.notes || '').replace(/\n/g, ' ')]
      .map(c => /[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c)).join(','));
  }));
  downloadText([head.join(','), ...rows].join('\n'), `carelog-labs-${todayISO()}.csv`, 'text/csv');
}

function downloadText(text, filename, mime = 'text/plain') {
  const blob = new Blob(['﻿' + text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Days since the last backup, or null if there has never been one. */
function daysSinceBackup() {
  const m = getMeta();
  if (!m.lastBackup) return null;
  return Math.floor((Date.now() - new Date(m.lastBackup).getTime()) / 86400000);
}

/* ══ CALENDAR EXPORT (.ics) ═════════════════════════════════════
 * Care Log cannot notify anyone while it is closed — a browser simply can't.
 * So reminders are delegated: appointments are written to a standard iCalendar
 * file that Google, Apple and Outlook all import, alarms included.
 * ═════════════════════════════════════════════════════════════ */

/** Escape a value for an iCalendar property. */
function icsEscape(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold a content line to 75 octets, per RFC 5545. */
function icsFold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {                       // iterate by code point
    const next = cur + ch;
    if (new TextEncoder().encode(next).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; }
    else cur = next;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

function icsStampUTC(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
         p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}
function icsDate(iso)         { return iso.replace(/-/g, ''); }
function icsDateTime(iso, hm) { return icsDate(iso) + 'T' + hm.replace(':', '') + '00'; }

/** Minutes-before → an iCalendar duration such as -P1DT2H. */
function icsTrigger(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  let s = '-P';
  if (d) s += d + 'D';
  if (h || mm || !d) {
    s += 'T';
    if (h) s += h + 'H';
    if (mm || !h) s += mm + 'M';
  }
  return s;
}

/** One VEVENT for a Care Log event. Times are floating (local wherever opened). */
function icsEvent(e) {
  const lines = [];
  const startHM = e.time || '';
  const dur = num(e.durationMin) || 60;

  lines.push('BEGIN:VEVENT');
  lines.push('UID:' + e.id + '@carelog');
  lines.push('DTSTAMP:' + icsStampUTC());
  /* Bump SEQUENCE on every edit so a re-import replaces rather than duplicates. */
  const EPOCH_2020 = 1577836800000;
  lines.push('SEQUENCE:' + Math.max(0, Math.floor(
    (new Date(e.updatedAt || e.createdAt || Date.now()).getTime() - EPOCH_2020) / 1000)));

  if (startHM) {
    const [h, m] = startHM.split(':').map(Number);
    const end = new Date(2000, 0, 1, h, m + dur);
    const p = n => String(n).padStart(2, '0');
    lines.push('DTSTART:' + icsDateTime(e.date, startHM));
    lines.push('DTEND:'   + icsDateTime(e.date, p(end.getHours()) + ':' + p(end.getMinutes())));
  } else {
    lines.push('DTSTART;VALUE=DATE:' + icsDate(e.date));
    lines.push('DTEND;VALUE=DATE:'   + icsDate(addDays(e.date, 1)));
  }

  const title = e.title || eventLabel(e.type);
  lines.push('SUMMARY:' + icsEscape(eventIcon(e.type) + ' ' + title));

  const desc = [
    eventLabel(e.type),
    e.doctor ? t('cal.doctorDept') + ': ' + e.doctor : '',
    e.cycle  ? t('cal.cycle', { n: e.cycle }) : '',
    e.notes || ''
  ].filter(Boolean).join('\n');
  if (desc) lines.push('DESCRIPTION:' + icsEscape(desc));
  if (e.place) lines.push('LOCATION:' + icsEscape(e.place));
  if (e.status === 'cancelled') lines.push('STATUS:CANCELLED');

  /* An event saved before reminders existed still deserves one: default to a
     day's notice, and treat an explicit 0 as "the user asked for none". */
  const remind = (e.remind === undefined || e.remind === null || e.remind === '')
    ? 1440 : (num(e.remind) ?? 0);
  if (remind > 0) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('TRIGGER:' + icsTrigger(remind));
    lines.push('DESCRIPTION:' + icsEscape(title));
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  return lines;
}

/** Wrap VEVENT blocks into a complete calendar document. */
function icsWrap(bodyLines) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Care Log//Care Log//EN',
          'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
    .concat(bodyLines, ['END:VCALENDAR'])
    .map(icsFold).join('\r\n') + '\r\n';
}

function downloadICS(text, filename) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Export one event to the phone's calendar. */
function exportEventICS(event) {
  if (!event) return;
  downloadICS(icsWrap(icsEvent(event)), `carelog-${event.date}.ics`);
  toast(t('rm.exportedOne'));
}

/** Export every appointment from today onwards. */
function exportUpcomingICS() {
  const list = upcomingEvents().filter(e => e.status !== 'cancelled');
  if (!list.length) { toast(t('rm.nothingUpcoming'), 'warning'); return; }
  const body = list.flatMap(icsEvent);
  downloadICS(icsWrap(body), `carelog-appointments-${todayISO()}.ics`);
  toast(t('rm.exported', { n: list.length }));
}

/**
 * A repeating daily nudge to record readings. Written as its own event so the
 * calendar app owns the notification — Care Log never needs to be open.
 */
function exportDailyReminderICS(hm) {
  const time = /^\d{2}:\d{2}$/.test(hm || '') ? hm : '09:00';
  const start = todayISO();
  const lines = [
    'BEGIN:VEVENT',
    'UID:carelog-daily-' + time.replace(':', '') + '@carelog',
    'DTSTAMP:' + icsStampUTC(),
    'DTSTART:' + icsDateTime(start, time),
    'DTEND:'   + icsDateTime(start, time),
    'RRULE:FREQ=DAILY',
    'SUMMARY:' + icsEscape('◔ ' + t('rm.dailySummary')),
    'DESCRIPTION:' + icsEscape(t('rm.dailyDesc')),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT0M',
    'DESCRIPTION:' + icsEscape(t('rm.dailySummary')), 'END:VALARM',
    'END:VEVENT'
  ];
  downloadICS(icsWrap(lines), 'carelog-daily-reminder.ics');
  toast(t('rm.dailyCreated'));
}
