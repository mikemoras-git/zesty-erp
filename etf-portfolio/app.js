'use strict';
/*
 * ETF Portfolio — personal ETF/UCITS tracker & allocation planner.
 * Runs entirely in the browser. Data is kept in localStorage (per browser),
 * with JSON export/import and optional server sync (sync.php).
 * Live prices: Yahoo Finance chart API via your own proxy (proxy.php or a
 * Cloudflare Worker) or a public CORS proxy. FX: ECB rates (frankfurter.dev).
 */

const APP_VERSION = '1.0.0';
const LS_KEY = 'etfp.state.v1';
const LS_CACHE = 'etfp.cache.v1';
const LS_SYNC = 'etfp.sync.v1';
const CURRENCIES = ['EUR', 'USD', 'NOK', 'GBP', 'CHF', 'SEK', 'DKK'];
const FX_FALLBACK = { USD: 1.10, NOK: 11.7, GBP: 0.86, CHF: 0.94, SEK: 11.2, DKK: 7.46 };
const TX_TYPES = {
  buy: 'Buy', sell: 'Sell', dividend: 'Dividend', deposit: 'Deposit', withdrawal: 'Withdrawal',
  fx: 'Currency conversion', fee: 'Fee', interest: 'Interest', tax: 'Tax paid',
};
const PUBLIC_PROXIES = [
  'https://api.allorigins.win/raw?url={url}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
  'https://corsproxy.io/?url={url}',
];
const FX_APIS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];
const FREQ = {
  weekly: { n: 52, per: 'week', adj: 'Weekly' },
  biweekly: { n: 26, per: '2 weeks', adj: 'Every 2 weeks' },
  monthly: { n: 12, per: 'month', adj: 'Monthly' },
};
const freq = () => FREQ[S.settings.contribFreq] || FREQ.monthly;

const DEFAULT_PRODUCTS = [
  { id: 'vwce', name: 'Vanguard FTSE All-World UCITS ETF (USD) Acc', isin: 'IE00BK5BQT80', ibkr: 'VWCE', exchange: 'Xetra (IBIS/IBIS2)', yahoo: 'VWCE.DE', currency: 'EUR', type: 'growth', policy: 'Acc', weight: 65, ter: 0.19, expReturn: 7.0, wht: 0, color: 0, active: true, note: 'Core holding: ~3,700 large & mid caps across developed + emerging markets.' },
  { id: 'xnas', name: 'Xtrackers Nasdaq 100 UCITS ETF 1C', isin: 'IE00BMFKG444', ibkr: 'XNAS', exchange: 'Xetra (IBIS/IBIS2)', yahoo: 'XNAS.DE', currency: 'EUR', type: 'growth', policy: 'Acc', weight: 20, ter: 0.20, expReturn: 8.5, wht: 0, color: 1, active: true, note: 'Growth tilt: 100 largest Nasdaq non-financials. Tech-heavy, more volatile.' },
  { id: 'iusn', name: 'iShares MSCI World Small Cap UCITS ETF (Acc)', isin: 'IE00BF4RFH31', ibkr: 'IUSN', exchange: 'Xetra (IBIS/IBIS2)', yahoo: 'IUSN.DE', currency: 'EUR', type: 'growth', policy: 'Acc', weight: 15, ter: 0.35, expReturn: 7.5, wht: 0, color: 2, active: true, note: 'Diversifier: ~3,500 developed-market small companies.' },
  { id: 'vhyl', name: 'Vanguard FTSE All-World High Dividend Yield UCITS ETF (USD) Dist', isin: 'IE00B8GKDB10', ibkr: 'VHYL', exchange: 'Euronext Amsterdam (AEB)', yahoo: 'VHYL.AS', currency: 'EUR', type: 'dividend', policy: 'Dist', weight: 50, ter: 0.29, expReturn: 6.5, wht: 0, color: 3, active: true, note: 'Global high-dividend stocks; pays quarterly.' },
  { id: 'spyw', name: 'SPDR S&P Euro Dividend Aristocrats UCITS ETF (Dist)', isin: 'IE00B5M1WJ87', ibkr: 'SPYW', exchange: 'Xetra (IBIS/IBIS2)', yahoo: 'SPYW.DE', currency: 'EUR', type: 'dividend', policy: 'Dist', weight: 30, ter: 0.30, expReturn: 6.5, wht: 0, color: 4, active: true, note: 'Euro-area companies with long dividend records: income in euro assets, low FX risk.' },
  { id: 'spyd', name: 'SPDR S&P US Dividend Aristocrats UCITS ETF (Dist)', isin: 'IE00B6YX5D40', ibkr: 'SPYD', exchange: 'Xetra (IBIS/IBIS2)', yahoo: 'SPYD.DE', currency: 'EUR', type: 'dividend', policy: 'Dist', weight: 20, ter: 0.35, expReturn: 6.5, wht: 0, color: 5, active: true, note: 'US companies with 20+ years of rising dividends.' },
];

const PRESETS = {
  opportunistic: { label: 'Opportunistic rebalancing + dip tilt (recommended)', dipOn: true, dip: [5, 10, 20], tilt: [1.25, 1.5, 2], ddAlert: 15, tpOn: true, tp: 25, tpNeedsOverweight: true, absBand: 5, relBand: 25 },
  dca: { label: 'Plain DCA (no buy/sell signals)', dipOn: false, dip: [5, 10, 20], tilt: [1, 1, 1], ddAlert: 0, tpOn: false, tp: 25, tpNeedsOverweight: true, absBand: 5, relBand: 25 },
  dipbuyer: { label: 'Aggressive dip buyer', dipOn: true, dip: [3, 7, 15], tilt: [1.5, 2, 3], ddAlert: 10, tpOn: true, tp: 20, tpNeedsOverweight: false, absBand: 3, relBand: 20 },
};

// Risk profiles: all-equity mixes (the 7% target needs stocks). Weights are inside each sleeve.
// "worst" = rough worst calendar-year drop of similar mixes historically (e.g. 2008), for orientation only.
const RISK_PROFILES = {
  defensive: { label: 'Defensive', dividendShare: 50, weights: { vwce: 75, xnas: 10, iusn: 15, vhyl: 45, spyw: 35, spyd: 20 }, worst: 30, note: 'Half in dividend payers, little tech. Smaller swings, but expected return may stay just under 7%.' },
  balanced: { label: 'Balanced', dividendShare: 30, weights: { vwce: 65, xnas: 20, iusn: 15, vhyl: 50, spyw: 30, spyd: 20 }, worst: 35, note: 'Your 30% dividend / 70% growth mix. About 7% expected over the long run.' },
  growth: { label: 'Growth', dividendShare: 15, weights: { vwce: 55, xnas: 30, iusn: 15, vhyl: 50, spyw: 30, spyd: 20 }, worst: 40, note: 'More Nasdaq-100 and less dividend. Higher expected return, deeper drops.' },
  aggressive: { label: 'Aggressive', dividendShare: 10, weights: { vwce: 45, xnas: 40, iusn: 15, vhyl: 50, spyw: 30, spyd: 20 }, worst: 45, note: 'Tech-heavy. Highest expected return and the biggest swings (−40% years happen).' },
};
function currentProfile() {
  for (const [k, rp] of Object.entries(RISK_PROFILES)) {
    if (num(S.settings.dividendShare) !== rp.dividendShare) continue;
    if (Object.entries(rp.weights).every(([id, w]) => { const p = prod(id); return !p || (p.active && num(p.weight) === w); })) return k;
  }
  return 'custom';
}
function profileExpected(rp) {
  const ds = rp.dividendShare / 100;
  const list = S.products.filter(p => rp.weights[p.id] != null);
  const sd = sum(list.filter(p => p.type === 'dividend'), p => rp.weights[p.id]);
  const sg = sum(list.filter(p => p.type !== 'dividend'), p => rp.weights[p.id]);
  return sum(list, p => (p.type === 'dividend' ? (sd ? ds * rp.weights[p.id] / sd : 0) : (sg ? (1 - ds) * rp.weights[p.id] / sg : 0)) * num(p.expReturn));
}
function applyProfile(k) {
  const rp = RISK_PROFILES[k]; if (!rp) return;
  S.settings.dividendShare = rp.dividendShare;
  for (const [id, w] of Object.entries(rp.weights)) { const p = prod(id); if (p) { p.weight = w; p.active = true; } }
  save(); invalidate();
}
function profileSummary() {
  const k = currentProfile();
  if (k === 'custom') {
    const tw = targetWeights();
    const exp = sum(S.products.filter(p => tw[p.id] > 0), p => tw[p.id] * num(p.expReturn));
    return { key: k, label: 'Custom', exp, worst: null, note: `Your own mix: ${S.settings.dividendShare}% dividend / ${100 - S.settings.dividendShare}% growth.` };
  }
  const rp = RISK_PROFILES[k];
  return { key: k, label: rp.label, exp: profileExpected(rp), worst: rp.worst, note: rp.note };
}

function defaultState() {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    settings: {
      contribAmount: 1000,
      contribFreq: 'monthly',
      initialAmount: 2500,
      dipExtra: [0, 500, 1000],
      dividendShare: 30,
      targetReturn: 7,
      preset: 'opportunistic',
      strategy: { ...PRESETS.opportunistic, dip: [...PRESETS.opportunistic.dip], tilt: [...PRESETS.opportunistic.tilt] },
      feeModel: 'ibkr-tiered',
      feePct: 0.05,
      feeMin: 1.25,
      minOrder: 250,
      autoDividends: true,
      autoConfirmDividends: false,
      divTaxRate: 5,
      provider: location.protocol === 'file:' ? 'public' : 'proxy',
      proxyUrl: 'proxy.php',
      publicProxy: PUBLIC_PROXIES[0],
      refreshMin: 5,
      notifications: false,
      syncUrl: location.protocol === 'file:' ? '' : 'sync.php',
      syncKey: '',
      autoSync: false,
      scenarioLow: 4,
      scenarioHigh: 10,
      projYears: 20,
      manualFx: { ...FX_FALLBACK },
    },
    products: DEFAULT_PRODUCTS.map(p => ({ ...p })),
    transactions: [],
    dismissedDivs: [],
    alertState: {},
  };
}

/* ---------------------------------------------------------------- utils */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const n = parseFloat(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fin = v => typeof v === 'number' && Number.isFinite(v);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayISO = () => new Date().toLocaleDateString('sv-SE');
const isoFromTs = ts => new Date(ts * 1000).toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function money(v, cur = 'EUR', dec = 2) {
  if (!fin(v)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v); }
  catch { return v.toFixed(dec) + ' ' + cur; }
}
function moneyS(v, cur = 'EUR', dec = 2) { if (!fin(v)) return '—'; return (v > 0 ? '+' : '') + money(v, cur, dec); }
function pct(v, dec = 1, sign = false) {
  if (v == null || !fin(v)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: dec, maximumFractionDigits: dec, signDisplay: sign ? 'exceptZero' : 'auto' }).format(v);
}
function nf(v, dec = 2) { if (!fin(v)) return '—'; return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(v); }
const cls = v => (v > 0.000001 ? 'pos' : v < -0.000001 ? 'neg' : '');

function toast(msg, ms = 4000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function banner(html) { $('#banner').innerHTML = html ? `<div class="banner">${html}</div>` : ''; }

/* ---------------------------------------------------------------- state */
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

function normalizeState(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  s.settings = { ...d.settings, ...(s.settings || {}) };
  s.settings.strategy = { ...d.settings.strategy, ...((s.settings && s.settings.strategy) || {}) };
  s.settings.manualFx = { ...FX_FALLBACK, ...(s.settings.manualFx || {}) };
  if (!Array.isArray(s.settings.dipExtra) || s.settings.dipExtra.length !== 3) s.settings.dipExtra = [...d.settings.dipExtra];
  if (!FREQ[s.settings.contribFreq]) s.settings.contribFreq = 'monthly';
  if (!Array.isArray(s.products)) s.products = d.products;
  if (!Array.isArray(s.transactions)) s.transactions = [];
  if (!Array.isArray(s.dismissedDivs)) s.dismissedDivs = [];
  if (!s.alertState || typeof s.alertState !== 'object') s.alertState = {};
  s.products.forEach((p, i) => { if (p.color == null) p.color = i; if (p.active == null) p.active = true; });
  return s;
}
function loadState() { let s = null; try { s = JSON.parse(storageGet(LS_KEY)); } catch { /* ignore */ } return normalizeState(s); }
function loadCache() {
  let c = null; try { c = JSON.parse(storageGet(LS_CACHE)); } catch { /* ignore */ }
  c = c && typeof c === 'object' ? c : {};
  c.quotes ||= {}; c.history ||= {}; c.fx ||= null; c.fxSeries ||= null;
  return c;
}

let S = loadState();
let C = loadCache();
let syncTimer = null;
let suppressSync = false;

function save(opts = {}) {
  S.updatedAt = new Date().toISOString();
  if (!storageSet(LS_KEY, JSON.stringify(S))) toast('Could not save to browser storage. Export a backup!');
  if (!opts.noSync && !suppressSync && S.settings.autoSync && S.settings.syncUrl && S.settings.syncKey) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncPush(true), 3000);
  }
}
function saveCache() {
  if (!storageSet(LS_CACHE, JSON.stringify(C))) {
    C.history = {}; storageSet(LS_CACHE, JSON.stringify(C)); // storage full: drop history cache
  }
}
const prod = id => S.products.find(p => p.id === id);

/* ---------------------------------------------------------------- FX */
// Convention everywhere: fxRate = units of currency per 1 EUR (market quote, e.g. EURUSD 1.08).
function fxRate(cur) {
  if (!cur || cur === 'EUR') return 1;
  const live = C.fx && C.fx.rates && C.fx.rates[cur];
  if (fin(live) && live > 0) return live;
  const man = num(S.settings.manualFx[cur]);
  return man > 0 ? man : (FX_FALLBACK[cur] || 1);
}
const usedCurrencies = () => [...new Set([
  ...S.products.map(p => p.currency),
  ...S.transactions.map(t => t.currency),
  ...S.transactions.filter(t => t.toCurrency).map(t => t.toCurrency),
].filter(c => c && c !== 'EUR'))];

async function fetchJSON(url, opts = {}, timeout = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    return JSON.parse(txt);
  } finally { clearTimeout(timer); }
}
async function fxApi(path) {
  let err;
  for (const base of FX_APIS) {
    try { return await fetchJSON(base + path); } catch (e) { err = e; }
  }
  throw err;
}
async function refreshFx() {
  const syms = CURRENCIES.filter(c => c !== 'EUR').join(',');
  try {
    const j = await fxApi(`/latest?base=EUR&symbols=${syms}`);
    if (j && j.rates) C.fx = { rates: j.rates, date: j.date, src: 'ECB', at: Date.now() };
  } catch { /* keep cached */ }
  // Intraday FX from Yahoo when a price proxy is configured
  if (S.settings.provider !== 'manual') {
    for (const cur of usedCurrencies()) {
      try {
        const d = await fetchChart(`EUR${cur}=X`, '1d', '15m');
        if (fin(d.meta.price) && d.meta.price > 0) { C.fx = C.fx || { rates: {} }; C.fx.rates[cur] = d.meta.price; C.fx.src = 'live'; C.fx.at = Date.now(); }
      } catch { /* ECB rate stays */ }
    }
  }
}
async function fxOnDate(cur, date) {
  if (!cur || cur === 'EUR') return 1;
  const j = await fxApi(`/${date}?base=EUR&symbols=${cur}`);
  const r = j && j.rates && j.rates[cur];
  if (!fin(r)) throw new Error('No rate');
  return r;
}
async function refreshFxSeries() {
  const curs = usedCurrencies();
  const first = sortedTx()[0];
  if (!curs.length || !first) return;
  const key = first.date + '|' + curs.join(',');
  if (C.fxSeries && C.fxSeries.key === key && C.fxSeries.fetched === todayISO()) return;
  try {
    const j = await fxApi(`/${first.date}..?base=EUR&symbols=${curs.join(',')}`);
    if (j && j.rates) C.fxSeries = { key, fetched: todayISO(), rates: j.rates };
  } catch { /* optional */ }
}

/* ---------------------------------------------------------------- market data */
function yahooUrl(sym, range, interval) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&events=div%7Csplit&includePrePost=false`;
}
let workingPublicProxy = null;
async function fetchChart(sym, range, interval) {
  const s = S.settings;
  if (s.provider === 'manual') throw new Error('Manual price mode');
  if (s.provider === 'proxy') {
    const base = s.proxyUrl || 'proxy.php';
    const url = base + (base.includes('?') ? '&' : '?') + `symbol=${encodeURIComponent(sym)}&range=${range}&interval=${interval}`;
    return parseChart(await fetchJSON(url));
  }
  if (s.provider === 'direct') return parseChart(await fetchJSON(yahooUrl(sym, range, interval)));
  const list = [workingPublicProxy, s.publicProxy, ...PUBLIC_PROXIES].filter((v, i, a) => v && a.indexOf(v) === i);
  let err;
  for (const tpl of list) {
    try {
      const r = parseChart(await fetchJSON(tpl.replace('{url}', encodeURIComponent(yahooUrl(sym, range, interval)))));
      workingPublicProxy = tpl;
      return r;
    } catch (e) { err = e; }
  }
  throw err || new Error('No proxy worked');
}
function parseChart(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || 'No data');
  const m = r.meta || {};
  let f = 1, cur = m.currency;
  if (cur === 'GBp' || cur === 'GBX') { f = 0.01; cur = 'GBP'; }
  const n = v => (fin(v) ? v * f : null);
  const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const ts = r.timestamp || [];
  const t = [], c = [];
  for (let i = 0; i < ts.length; i++) if (fin(closes[i])) { t.push(ts[i]); c.push(round(closes[i] * f, 6)); }
  const div = Object.values((r.events && r.events.dividends) || {})
    .filter(d => fin(d.amount) && fin(d.date)).map(d => [d.date, round(d.amount * f, 6)]).sort((a, b) => a[0] - b[0]);
  return {
    meta: {
      price: n(m.regularMarketPrice), prevClose: n(m.chartPreviousClose ?? m.previousClose), currency: cur,
      time: m.regularMarketTime, high52: n(m.fiftyTwoWeekHigh), low52: n(m.fiftyTwoWeekLow),
      name: m.longName || m.shortName || '', exchange: m.fullExchangeName || m.exchangeName || '',
    },
    t, c, div,
  };
}
async function runPool(items, size, fn) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) { const it = queue.shift(); await fn(it); }
  });
  await Promise.all(workers);
}
const trackedSymbols = () => {
  const held = new Set(Object.entries(computeHoldings().H).filter(([, h]) => h.qty > 0).map(([id]) => id));
  return [...new Set(S.products.filter(p => p.yahoo && (p.active || held.has(p.id))).map(p => p.yahoo.trim()))];
};

let refreshing = false;
async function refreshAll(opts = {}) {
  if (refreshing) return;
  refreshing = true;
  const btn = $('#btnRefresh'); if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
  const failed = [];
  try {
    if (S.settings.provider !== 'manual') {
      const syms = trackedSymbols();
      await runPool(syms, 3, async sym => {
        try { const d = await fetchChart(sym, '1d', '15m'); C.quotes[sym] = { ...d.meta, at: Date.now() }; }
        catch { failed.push(sym); }
      });
      await runPool(syms.filter(s => !failed.includes(s)), 2, async sym => {
        const h = C.history[sym];
        if (!opts.forceHistory && h && h.fetched === todayISO()) return;
        try { const d = await fetchChart(sym, '5y', '1d'); C.history[sym] = { fetched: todayISO(), t: d.t, c: d.c, div: d.div }; }
        catch { /* history is optional */ }
      });
    }
    await refreshFx();
    await refreshFxSeries();
    C.lastUpdate = Date.now();
    saveCache();
    const added = autoDividends();
    if (added) toast(`${added} dividend payment(s) detected and recorded as pending. Check the Dividends tab.`);
    checkAlerts();
    if (failed.length) {
      banner(`<span>⚠ Could not load live prices for <b>${esc(failed.join(', '))}</b>. Check the Yahoo symbol in <i>ETFs &amp; targets</i> or the data source in <i>Settings</i>. Last known prices are shown.</span><button class="btn sm" data-action="goto" data-tab="settings">Data settings</button>`);
    } else banner('');
  } finally {
    refreshing = false;
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh prices'; }
    render();
  }
}

function quoteFor(p) {
  const q = (p.yahoo && C.quotes[p.yahoo.trim()]) || {};
  let price = fin(q.price) ? q.price : null;
  let src = 'live';
  if (S.settings.provider === 'manual' || price == null) {
    if (num(p.manualPrice) > 0) { price = num(p.manualPrice); src = 'manual'; }
    else if (price == null) src = 'none';
  }
  if (price == null) {
    const h = p.yahoo && C.history[p.yahoo.trim()];
    if (h && h.c.length) { price = h.c[h.c.length - 1]; src = 'close'; }
  }
  return { price, prevClose: fin(q.prevClose) ? q.prevClose : null, high52: q.high52, low52: q.low52, time: q.time, src };
}

/* ---------------------------------------------------------------- portfolio engine */
const TX_ORDER = { deposit: 0, fx: 1, buy: 2, sell: 3, dividend: 4, interest: 5, fee: 6, tax: 7, withdrawal: 8 };
function sortedTx() {
  return S.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (TX_ORDER[a.type] - TX_ORDER[b.type]) || ((a.created || 0) - (b.created || 0))));
}
function computeHoldings(asOf) {
  const H = {}, realizedByTx = {};
  for (const t of sortedTx()) {
    if (asOf && t.date > asOf) break;
    if (!t.productId || !['buy', 'sell', 'dividend'].includes(t.type)) continue;
    const h = H[t.productId] ||= { qty: 0, costLocal: 0, costEUR: 0, realizedEUR: 0, divGrossEUR: 0, divNetEUR: 0, whtEUR: 0, feesEUR: 0, first: t.date };
    const fx = num(t.fxRate) || 1, fee = num(t.fee), q = num(t.qty), px = num(t.price);
    if (t.type === 'buy') {
      const gross = q * px + fee;
      h.qty += q; h.costLocal += gross; h.costEUR += gross / fx; h.feesEUR += fee / fx;
    } else if (t.type === 'sell') {
      if (h.qty <= 1e-9) continue;
      const qs = Math.min(q, h.qty), frac = qs / h.qty;
      const basisL = h.costLocal * frac, basisE = h.costEUR * frac;
      const proceeds = qs * px - fee;
      const r = proceeds / fx - basisE;
      h.realizedEUR += r; realizedByTx[t.id] = { gainEUR: r, proceedsEUR: (qs * px) / fx, basisEUR: basisE, basisLocal: basisL };
      h.qty -= qs; h.costLocal -= basisL; h.costEUR -= basisE; h.feesEUR += fee / fx;
      if (h.qty < 1e-9) { h.qty = 0; h.costLocal = 0; h.costEUR = 0; }
    } else if (t.type === 'dividend') {
      const g = num(t.amount), w = num(t.withholding);
      h.divGrossEUR += g / fx; h.divNetEUR += (g - w) / fx; h.whtEUR += w / fx;
    }
  }
  for (const id in H) { const h = H[id]; h.avgLocal = h.qty > 1e-9 ? h.costLocal / h.qty : 0; }
  return { H, realizedByTx };
}
function qtyBefore(pid, date) {
  let q = 0;
  for (const t of sortedTx()) {
    if (t.date >= date) break;
    if (t.productId !== pid) continue;
    if (t.type === 'buy') q += num(t.qty);
    else if (t.type === 'sell') q = Math.max(0, q - num(t.qty));
  }
  return q;
}
function cashBalances() {
  const b = {};
  const add = (c, v) => { if (!c) return; b[c] = (b[c] || 0) + v; };
  for (const t of S.transactions) {
    const fee = num(t.fee), a = num(t.amount);
    switch (t.type) {
      case 'buy': add(t.currency, -(num(t.qty) * num(t.price) + fee)); break;
      case 'sell': add(t.currency, num(t.qty) * num(t.price) - fee); break;
      case 'dividend': add(t.currency, a - num(t.withholding)); break;
      case 'deposit': case 'interest': add(t.currency, a); break;
      case 'withdrawal': case 'fee': case 'tax': add(t.currency, -a); break;
      case 'fx': add(t.currency, -a); add(t.toCurrency, num(t.toAmount)); break;
    }
  }
  for (const k in b) if (Math.abs(b[k]) < 0.005) delete b[k];
  return b;
}
function targetWeights() {
  const ds = Math.min(100, Math.max(0, num(S.settings.dividendShare))) / 100;
  const act = S.products.filter(p => p.active && num(p.weight) > 0);
  const sd = sum(act.filter(p => p.type === 'dividend'), p => num(p.weight));
  const sg = sum(act.filter(p => p.type !== 'dividend'), p => num(p.weight));
  const dShare = sg === 0 ? (sd > 0 ? 1 : 0) : sd === 0 ? 0 : ds;
  const gShare = 1 - dShare;
  const w = {};
  for (const p of act) w[p.id] = p.type === 'dividend' ? (sd ? dShare * num(p.weight) / sd : 0) : (sg ? gShare * num(p.weight) / sg : 0);
  return w;
}
function xirr(flows) {
  if (flows.length < 2) return null;
  if (!flows.some(f => f.v > 0) || !flows.some(f => f.v < 0)) return null;
  const t0 = flows[0].d;
  const yrs = flows.map(f => (f.d - t0) / (365.25 * 864e5));
  const npv = r => flows.reduce((a, f, i) => a + f.v / Math.pow(1 + r, yrs[i]), 0);
  const dnpv = r => flows.reduce((a, f, i) => a - yrs[i] * f.v / Math.pow(1 + r, yrs[i] + 1), 0);
  let r = 0.08;
  for (let i = 0; i < 60; i++) {
    const v = npv(r), d = dnpv(r);
    if (!fin(v) || !fin(d) || d === 0) break;
    const nr = r - v / d;
    if (!fin(nr) || nr <= -0.999) break;
    if (Math.abs(nr - r) < 1e-8) return nr;
    r = nr;
  }
  let lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (!fin(flo) || !fin(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

function snapshot() {
  const { H, realizedByTx } = computeHoldings();
  const tw = targetWeights();
  const rows = [];
  for (const p of S.products) {
    const h = H[p.id];
    if (!p.active && !(h && (h.qty > 0 || h.realizedEUR || h.divNetEUR))) continue;
    const q = quoteFor(p);
    const fx = fxRate(p.currency);
    const qty = h ? h.qty : 0;
    const avg = h ? h.avgLocal : 0;
    const price = q.price != null ? q.price : (avg || null);
    const noPrice = q.price == null;
    const mvEUR = qty > 0 && price != null ? (qty * price) / fx : 0;
    const costEUR = h ? h.costEUR : 0;
    const plEUR = qty > 0 ? mvEUR - costEUR : 0;
    const priceEffEUR = qty > 0 && price != null ? ((price - avg) * qty) / fx : 0;
    const dayChgEUR = qty > 0 && q.prevClose && price != null ? (qty * (price - q.prevClose)) / fx : 0;
    const hist = histStats(p.yahoo);
    let high52 = fin(q.high52) ? q.high52 : null;
    if (high52 == null && hist) high52 = hist.high52;
    rows.push({
      p, h, qty, avg, price, noPrice, src: q.src, prevClose: q.prevClose, fx, mvEUR, costEUR, plEUR,
      plPct: costEUR > 0 && qty > 0 ? plEUR / costEUR : null,
      priceEffEUR, fxEffEUR: plEUR - priceEffEUR,
      dayChgEUR, dayChgPct: q.prevClose && price != null ? price / q.prevClose - 1 : null,
      chgVsAvg: qty > 0 && avg > 0 && price != null ? price / avg - 1 : null,
      dd52: high52 && price != null ? price / high52 - 1 : null, high52,
      target: tw[p.id] || 0,
      realizedEUR: h ? h.realizedEUR : 0, divNetEUR: h ? h.divNetEUR : 0, divGrossEUR: h ? h.divGrossEUR : 0,
      hist,
    });
  }
  const total = sum(rows, r => r.mvEUR);
  rows.forEach(r => { r.weight = total > 0 ? r.mvEUR / total : 0; });
  rows.forEach(r => { r.signal = signalFor(r); });

  const totals = {
    mvEUR: total,
    costEUR: sum(rows, r => (r.qty > 0 ? r.costEUR : 0)),
    plEUR: sum(rows, r => r.plEUR),
    realizedEUR: sum(rows, r => r.realizedEUR),
    divNetEUR: sum(rows, r => r.divNetEUR),
    dayChgEUR: sum(rows, r => r.dayChgEUR),
    divSleeve: sum(rows.filter(r => r.p.type === 'dividend'), r => r.weight),
  };
  totals.plPct = totals.costEUR > 0 ? totals.plEUR / totals.costEUR : null;
  totals.totalReturnEUR = totals.plEUR + totals.realizedEUR + totals.divNetEUR;
  const prevTotal = total - totals.dayChgEUR;
  totals.dayChgPct = prevTotal > 0 ? totals.dayChgEUR / prevTotal : null;

  // Money-weighted annualized return (XIRR) over buys, sells, dividends and today's value
  const flows = [];
  for (const t of sortedTx()) {
    if (!t.productId) continue;
    const fx = num(t.fxRate) || 1;
    if (t.type === 'buy') flows.push({ d: new Date(t.date + 'T12:00:00Z'), v: -(num(t.qty) * num(t.price) + num(t.fee)) / fx });
    else if (t.type === 'sell') flows.push({ d: new Date(t.date + 'T12:00:00Z'), v: (num(t.qty) * num(t.price) - num(t.fee)) / fx });
    else if (t.type === 'dividend') flows.push({ d: new Date(t.date + 'T12:00:00Z'), v: (num(t.amount) - num(t.withholding)) / fx });
  }
  totals.firstDate = flows.length ? flows[0].d.toISOString().slice(0, 10) : null;
  totals.spanDays = totals.firstDate ? daysBetween(totals.firstDate, todayISO()) : 0;
  if (total > 0) flows.push({ d: new Date(todayISO() + 'T12:00:00Z'), v: total });
  totals.xirr = totals.spanDays >= 90 ? xirr(flows) : null;

  const byId = Object.fromEntries(rows.map(r => [r.p.id, r]));
  return { rows, totals, byId, realizedByTx };
}

/* Historical stats from cached daily closes: total-return CAGR, yield, drawdown */
const histCache = new Map();
function histStats(sym) {
  if (!sym) return null;
  const h = C.history[sym.trim()];
  if (!h || !h.t || h.t.length < 30) return null;
  const key = sym + '|' + h.fetched + '|' + h.t.length;
  if (histCache.has(key)) return histCache.get(key);
  const divMap = new Map(h.div.map(([ts, a]) => [isoFromTs(ts), a]));
  let units = 1, peak = 0, maxDD = 0;
  const tr = h.c.map((c, i) => {
    const d = isoFromTs(h.t[i]);
    if (divMap.has(d) && c > 0) units *= 1 + divMap.get(d) / c;
    const v = units * c;
    peak = Math.max(peak, v); maxDD = Math.min(maxDD, v / peak - 1);
    return v;
  });
  const lastT = h.t[h.t.length - 1];
  const cagr = y => {
    const from = lastT - y * 365.25 * 86400;
    if (h.t[0] > from + 10 * 86400) return null;
    let i = 0; while (i < h.t.length - 1 && h.t[i] < from) i++;
    return tr[i] > 0 ? Math.pow(tr[tr.length - 1] / tr[i], 1 / y) - 1 : null;
  };
  const yearAgo = lastT - 365 * 86400;
  const ttm = sum(h.div.filter(([ts]) => ts >= yearAgo), d => d[1]);
  const last = h.c[h.c.length - 1];
  let hi = 0; for (let i = h.t.length - 1; i >= 0 && h.t[i] >= yearAgo; i--) hi = Math.max(hi, h.c[i]);
  const res = { r1: cagr(1), r3: cagr(3), r5: cagr(5), ttmDiv: ttm, yield: last > 0 ? ttm / last : 0, maxDD, high52: hi || null, last };
  histCache.set(key, res);
  return res;
}

/* ---------------------------------------------------------------- signals & strategy */
function signalFor(r) {
  const st = S.settings.strategy;
  const out = { code: 'ok', kind: 'ok', icon: '·', label: 'On track', detail: '', tilt: 1, over: false, under: false };
  const diffPP = (r.weight - r.target) * 100;
  const rel = r.target > 0 ? ((r.weight - r.target) / r.target) * 100 : (r.weight > 0 ? Infinity : 0);
  const hasPortfolio = S.transactions.some(t => t.type === 'buy');
  out.over = hasPortfolio && r.qty > 0 && (diffPP > st.absBand || rel > st.relBand);
  out.under = hasPortfolio && r.target > 0 && (-diffPP > st.absBand || rel < -st.relBand);

  let lvl = -1;
  if (st.dipOn && r.chgVsAvg != null) {
    const drop = -r.chgVsAvg * 100;
    for (let i = 2; i >= 0; i--) if (num(st.dip[i]) > 0 && drop >= num(st.dip[i])) { lvl = i; break; }
  }
  let ddHit = st.dipOn && num(st.ddAlert) > 0 && r.dd52 != null && -r.dd52 * 100 >= num(st.ddAlert);

  if (lvl >= 0) {
    Object.assign(out, { code: 'buy' + (lvl + 1), kind: 'buy', icon: '▼', label: ['Buy more', 'Buy more ×2', 'Strong buy'][lvl], detail: `${pct(r.chgVsAvg, 1, true)} vs your avg price`, tilt: num(st.tilt[lvl]) || 1 });
  } else if (ddHit && r.target > 0) {
    Object.assign(out, { code: 'dip52', kind: 'buy', icon: '▼', label: 'Dip', detail: `${pct(r.dd52, 1, true)} from 52-week high`, tilt: Math.max(1, num(st.tilt[0]) || 1) });
  }
  if (st.tpOn && r.chgVsAvg != null && r.chgVsAvg * 100 >= num(st.tp) && (!st.tpNeedsOverweight || out.over)) {
    Object.assign(out, { code: 'trim', kind: 'trim', icon: '▲', label: 'Trim', detail: `${pct(r.chgVsAvg, 1, true)} vs avg${out.over ? ', overweight' : ''}`, tilt: 0.5 });
  } else if (out.code === 'ok') {
    if (out.over) Object.assign(out, { code: 'over', kind: 'info', icon: '▲', label: 'Overweight', detail: `${diffPP > 0 ? '+' : ''}${diffPP.toFixed(1)} pp vs target`, tilt: 1 });
    else if (out.under) Object.assign(out, { code: 'under', kind: 'info', icon: '▼', label: 'Underweight', detail: `${diffPP.toFixed(1)} pp vs target`, tilt: 1 });
    else if (r.qty === 0 && r.target > 0) Object.assign(out, { code: 'new', kind: 'info', icon: '+', label: 'Not owned yet', detail: '' });
  }
  return out;
}
function sigHTML(sg, withDetail = true) {
  if (!sg || sg.code === 'ok') return '<span class="sig ok">On track</span>';
  return `<span class="sig ${sg.kind}" title="${esc(sg.detail)}"><span class="ic" aria-hidden="true">${sg.icon}</span>${esc(sg.label)}</span>${withDetail && sg.detail ? `<span class="sub">${esc(sg.detail)}</span>` : ''}`;
}

/* Fees (approximate) */
function estimateFee(v) {
  if (!(v > 0)) return 0;
  const s = S.settings;
  if (s.feeModel === 'ibkr-tiered') return Math.max(1.25, v * 0.0005) + v * 0.0001; // commission + approx. exchange/clearing
  if (s.feeModel === 'ibkr-fixed') return Math.max(3, v * 0.0005);
  return Math.max(num(s.feeMin), (v * num(s.feePct)) / 100);
}

/* Allocation planner.
   Regular money → ETFs furthest below target (weighted up for dips), whole shares only,
   no orders below the minimum order size. Extra "dip money" → only ETFs with a buy-more
   signal, so it lowers their average price. */
function allocateShares(cands, budget, scoreOf, gapOf, field, minOrder) {
  cands.forEach(i => { i[field] = 0; });
  if (!(budget > 0) || !cands.length) return [];
  const score = new Map(cands.map(i => [i, scoreOf(i)]));
  let pool = cands.filter(i => score.get(i) > 0);
  if (!pool.length) { pool = cands.slice(); pool.forEach(i => score.set(i, Math.max(i.r.target, 1e-6))); }
  const alloc = new Map();
  for (;;) {
    const tot = sum(pool, i => score.get(i));
    pool.forEach(i => alloc.set(i, (budget * score.get(i)) / tot));
    if (pool.length <= 1) break;
    const bad = pool.filter(i => alloc.get(i) < Math.max(minOrder, i.priceEUR + estimateFee(i.priceEUR)));
    if (!bad.length) break;
    bad.sort((a, b) => score.get(a) - score.get(b));
    pool = pool.filter(i => i !== bad[0]);
  }
  for (const i of pool) {
    let n = Math.floor(alloc.get(i) / i.priceEUR);
    while (n > 0 && n * i.priceEUR + estimateFee(n * i.priceEUR) > alloc.get(i) + 1e-9) n--;
    i[field] = n;
  }
  const cost = i => (i[field] > 0 ? i[field] * i.priceEUR + estimateFee(i[field] * i.priceEUR) : 0);
  let left = budget - sum(cands, cost);
  for (let guard = 0; guard < 5000; guard++) {
    const opts = cands.filter(i => {
      const marginal = (i[field] + 1) * i.priceEUR + estimateFee((i[field] + 1) * i.priceEUR) - cost(i);
      if (marginal > left + 1e-9) return false;
      if (i[field] === 0 && (left < Math.max(minOrder, i.priceEUR) || gapOf(i) <= 0)) return false; // no tiny new orders
      return true;
    });
    if (!opts.length) break;
    opts.sort((a, b) => gapOf(b) - gapOf(a));
    opts[0][field]++;
    left = budget - sum(cands, cost);
  }
  return pool;
}
function buildPlan(budget, dipBudget = 0) {
  const snap = snapshot();
  const minOrder = Math.max(0, num(S.settings.minOrder));
  budget = Math.max(0, budget); dipBudget = Math.max(0, dipBudget);
  const total = budget + dipBudget;
  const items = snap.rows.filter(r => r.target > 0).map(r => ({
    r, p: r.p, priceLocal: r.price, priceEUR: r.price ? r.price / r.fx : 0,
    tilt: r.signal.tilt || 1, shares: 0, regShares: 0, dipShares: 0,
  }));
  const warnings = [];
  items.filter(i => !i.priceEUR).forEach(i => warnings.push(`No price for ${i.p.ibkr || i.p.name}. Enter a manual price in ETFs & targets or fix live data.`));
  const priced = items.filter(i => i.priceEUR > 0);
  const dipped = priced.filter(i => i.r.signal.kind === 'buy');
  let regBudget = budget;
  if (dipBudget > 0 && !dipped.length) { regBudget += dipBudget; dipBudget = 0; warnings.push('No ETF has a buy-more signal right now, so the extra money is spread like regular money.'); }
  const T = snap.totals.mvEUR, T2 = T + regBudget;
  const result = { items, budget, dipBudget, total, T, warnings, spent: 0, fees: 0, left: total };
  if (!(total > 0) || !priced.length) return result;

  priced.forEach(i => { i.deficit = Math.max(0, i.r.target * T2 - i.r.mvEUR); });
  const pool = allocateShares(priced, regBudget, i => i.deficit * i.tilt, i => (i.r.target * T2 - i.r.mvEUR - i.regShares * i.priceEUR) * i.tilt, 'regShares', minOrder);
  if (dipBudget > 0) {
    const sc = i => Math.max(i.r.target, 0.01) * i.tilt;
    const tot = sum(dipped, sc);
    allocateShares(dipped, dipBudget, sc, i => (sc(i) / tot) * dipBudget - i.dipShares * i.priceEUR, 'dipShares', minOrder);
  }
  items.forEach(i => { i.shares = i.regShares + i.dipShares; });
  // Explain each line
  const totScore = sum(priced, i => i.deficit * i.tilt);
  for (const i of items) {
    const why = [];
    const gapPP = (i.r.target - i.r.weight) * 100;
    const ideal = totScore > 0 ? (regBudget * i.deficit * i.tilt) / totScore : 0;
    if (!i.priceEUR) why.push('No price available');
    else {
      if (i.regShares) {
        why.push(T > 0 ? (gapPP > 0.05 ? `Below target by ${gapPP.toFixed(1)} pp` : 'Uses the remaining budget') : `New position, target ${pct(i.r.target, 1)}`);
        if (i.tilt > 1) why.push(`priority ×${nf(i.tilt, 2)} (${i.r.signal.detail})`);
      }
      if (i.dipShares) why.push(`Dip money: ${i.r.signal.detail}, lowers your average`);
      if (!i.shares) {
        if (T > 0 && gapPP <= 0.05) why.push('At or above target. Not needed now');
        else if (ideal > 0 && ideal < Math.max(minOrder, i.priceEUR)) why.push(`Its share (≈ ${money(ideal, 'EUR', 0)}) is below the ${money(Math.max(minOrder, i.priceEUR), 'EUR', 0)} minimum order. Bought in a later plan`);
        else why.push('Lower priority this time');
      }
    }
    i.why = why.join(' · ');
  }
  if (!priced.some(i => i.shares > 0)) {
    const top = pool.slice().sort((a, b) => b.deficit - a.deficit)[0] || priced[0];
    warnings.push(`This budget (${money(total)}) does not cover one share of ${top.p.ibkr} (≈ ${money(top.priceEUR + estimateFee(top.priceEUR))}). Keep the cash; your next plan will include it.`);
  }
  result.fees = sum(priced, i => (i.shares > 0 ? estimateFee(i.shares * i.priceEUR) : 0));
  result.spent = sum(priced, i => i.shares * i.priceEUR) + result.fees;
  result.left = total - result.spent;
  const newTotal = T + sum(priced, i => i.shares * i.priceEUR);
  items.forEach(i => { i.after = newTotal > 0 ? (i.r.mvEUR + i.shares * i.priceEUR) / newTotal : 0; });
  return result;
}
// Highest buy-more level across your ETFs → suggested extra "dip money" (Settings → Strategy)
function dipSuggestion(snap) {
  let lvl = -1; const hits = [];
  for (const r of snap.rows) {
    if (r.signal.kind !== 'buy' || !(r.target > 0)) continue;
    const l = r.signal.code === 'dip52' ? 0 : num(r.signal.code.slice(3)) - 1;
    lvl = Math.max(lvl, l); hits.push(r);
  }
  return { lvl, hits, amt: lvl >= 0 ? num(S.settings.dipExtra[lvl]) : 0 };
}
function trimSuggestions(snap) {
  return snap.rows.filter(r => r.signal.code === 'trim' && r.price).map(r => {
    const excessEUR = r.mvEUR - r.target * snap.totals.mvEUR;
    const shares = Math.max(0, Math.floor(excessEUR / (r.price / r.fx)));
    return { r, shares, valueEUR: (shares * r.price) / r.fx };
  }).filter(x => x.shares > 0);
}

/* ---------------------------------------------------------------- dividends */
function autoDividends() {
  if (!S.settings.autoDividends) return 0;
  let added = 0;
  const today = todayISO();
  for (const p of S.products) {
    const h = p.yahoo && C.history[p.yahoo.trim()];
    if (!h || !h.div || !h.div.length) continue;
    for (const [ts, amt] of h.div) {
      const ex = isoFromTs(ts);
      if (ex > today) continue;
      const key = p.id + '|' + ex;
      if (S.dismissedDivs.includes(key)) continue;
      const exists = S.transactions.some(t => t.type === 'dividend' && t.productId === p.id &&
        (t.divKey === key || (!t.auto && daysBetween(ex, t.date) >= -7 && daysBetween(ex, t.date) <= 60)));
      if (exists) continue;
      const qty = qtyBefore(p.id, ex);
      if (qty <= 0) continue;
      const gross = round(qty * amt, 2);
      if (gross <= 0) continue;
      let fx = fxRate(p.currency);
      if (p.currency !== 'EUR' && C.fxSeries && C.fxSeries.rates) {
        const dates = Object.keys(C.fxSeries.rates).filter(d => d <= ex).sort();
        const r = dates.length && C.fxSeries.rates[dates[dates.length - 1]][p.currency];
        if (fin(r)) fx = r;
      }
      S.transactions.push({
        id: uid(), created: Date.now(), date: ex, type: 'dividend', productId: p.id, qty, perShare: amt,
        amount: gross, withholding: round(gross * num(p.wht) / 100, 2), currency: p.currency, fxRate: fx,
        auto: true, divKey: key, status: S.settings.autoConfirmDividends ? 'confirmed' : 'pending',
        note: `Auto: ${nf(qty, 4)} sh × ${nf(amt, 4)} ${p.currency} (ex-date ${ex}; paid ~2–4 weeks later)`,
      });
      added++;
    }
  }
  if (added) save();
  return added;
}
// Greek tax on one dividend: rate × gross, minus the foreign tax withheld on that payment (credit capped per payment)
function greekDivTaxEUR(t) {
  const fx = num(t.fxRate) || 1;
  return Math.max(0, (num(t.amount) / fx) * num(S.settings.divTaxRate) / 100 - num(t.withholding) / fx);
}
function forwardIncome(snap) {
  return snap.rows.map(r => {
    const ttm = r.hist ? r.hist.ttmDiv : 0;
    return { r, ttm, annualEUR: r.qty > 0 ? (r.qty * ttm) / r.fx : 0, yoc: r.avg > 0 ? ttm / r.avg : null };
  });
}

/* ---------------------------------------------------------------- alerts & notifications */
function checkAlerts() {
  const snap = snapshot();
  let changed = false;
  for (const r of snap.rows) {
    const code = r.signal.kind === 'buy' || r.signal.kind === 'trim' ? r.signal.code : null;
    const prev = S.alertState[r.p.id] || null;
    if (code !== prev) {
      S.alertState[r.p.id] = code; changed = true;
      if (code) {
        const ds = r.signal.kind === 'buy' ? dipSuggestion(snap) : null;
        notify(`${r.p.ibkr}: ${r.signal.label}`, `${r.signal.detail}. Price ${money(r.price, r.p.currency)}${ds && ds.amt > 0 ? `. Suggested extra: ${money(ds.amt, 'EUR', 0)}` : ''}`);
      }
    }
  }
  if (changed) save({ noSync: true });
}
function notify(title, body) {
  toast(`${title}: ${body}`, 7000);
  if (S.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* ignore */ }
  }
}

/* ---------------------------------------------------------------- charts */
const charts = {};
function seriesColor(i) { return i != null && i >= 0 && i < 8 ? css(`--s${i + 1}`) : css('--other'); }
function chart(id, cfg) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const el = document.getElementById(id);
  if (!el) return;
  if (!window.Chart) { el.parentElement.innerHTML = '<div class="empty">Charts need an internet connection (Chart.js could not load).</div>'; return; }
  Chart.defaults.color = css('--text-2');
  Chart.defaults.borderColor = css('--grid');
  Chart.defaults.font.family = css('--font') || 'system-ui';
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.maintainAspectRatio = false;
  charts[id] = new Chart(el, cfg);
}
const eurTick = v => money(v, 'EUR', 0);
const pctTick = v => `${v}%`;

/* ---------------------------------------------------------------- rendering */
let currentTab = 'dashboard';
const txFilter = { type: '', product: '', year: '' };
let planRegularOverride = null, planExtraOverride = null, planDipOverride = null, planSplitOpen = false;
let planIncludeCash = false;
let taxYear = String(new Date().getFullYear());

function render() {
  renderTop();
  const fn = { dashboard: renderDashboard, holdings: renderHoldings, plan: renderPlan, transactions: renderTransactions, dividends: renderDividends, products: renderProducts, reports: renderReports, settings: renderSettings }[currentTab];
  if (fn) fn();
  const pending = S.transactions.filter(t => t.status === 'pending').length;
  const dt = $('#tabs [data-tab="dividends"]');
  if (dt) dt.innerHTML = 'Dividends' + (pending ? ` <span class="badge" title="Pending dividends to confirm">${pending}</span>` : '');
  const alerts = snapshotCache().rows.filter(r => r.signal.kind === 'buy' || r.signal.kind === 'trim').length;
  document.title = (alerts ? `(${alerts}) ` : '') + 'ETF Portfolio';
}
let _snap = null, _snapAt = 0;
function snapshotCache() { if (!_snap || Date.now() - _snapAt > 500) { _snap = snapshot(); _snapAt = Date.now(); } return _snap; }
function invalidate() { _snap = null; }

function renderTop() {
  invalidate();
  const { totals } = snapshotCache();
  $('#topStats').innerHTML = `
    <div><span class="ts-l">Portfolio value</span><span class="ts-v">${money(totals.mvEUR)}</span></div>
    <div><span class="ts-l">Today</span><span class="ts-v ${cls(totals.dayChgEUR)}">${moneyS(totals.dayChgEUR)} <span class="small">${pct(totals.dayChgPct, 2, true)}</span></span></div>
    <div><span class="ts-l">Unrealized P/L</span><span class="ts-v ${cls(totals.plEUR)}">${moneyS(totals.plEUR)} <span class="small">${pct(totals.plPct, 1, true)}</span></span></div>`;
  const lu = C.lastUpdate ? new Date(C.lastUpdate) : null;
  const src = { proxy: 'live', public: 'live', direct: 'live', manual: 'manual prices' }[S.settings.provider];
  $('#lastUpdate').textContent = lu ? `${src} · ${lu.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : (S.settings.provider === 'manual' ? 'manual prices' : 'not refreshed yet');
}

function kpi(label, value, sub = '', valueCls = '') {
  return `<div class="card kpi"><div class="kpi-l">${label}</div><div class="kpi-v ${valueCls}">${value}</div><div class="kpi-s">${sub}</div></div>`;
}
function targetTag(v, target) {
  if (v == null) return '';
  const ok = v * 100 >= target;
  return `<span class="tag"><span class="ic ${ok ? 'good' : 'bad'}" aria-hidden="true">${ok ? '✓' : '✗'}</span>${ok ? 'Meets' : 'Below'} ${target}% target</span>`;
}

function renderDashboard() {
  const el = $('#tab-dashboard');
  const snap = snapshotCache();
  const { rows, totals } = snap;
  const target = num(S.settings.targetReturn);
  if (!S.transactions.length) {
    el.innerHTML = `
      <div class="card section">
        <h2>Welcome 👋</h2>
        <p>Your model portfolio is ready in <b>ETFs &amp; targets</b>: ${100 - S.settings.dividendShare}% growth / ${S.settings.dividendShare}% dividend, all UCITS ETFs available at Interactive Brokers in EUR.</p>
        <ol>
          <li>Press <b>↻ Refresh prices</b> to load live data. If prices don't load, open <b>Settings → Live data</b>.</li>
          <li>Open <b>Buy plan</b> to see what to buy with your starting ${money(num(S.settings.initialAmount), 'EUR', 0)} + ${money(num(S.settings.contribAmount), 'EUR', 0)} per ${freq().per}.</li>
          <li>Record purchases (or import your IBKR statement in <b>Transactions</b>).</li>
        </ol>
        <div class="btn-row"><button class="btn primary" data-action="goto" data-tab="plan">Open buy plan</button><button class="btn" data-action="addTx">+ Record a transaction</button><button class="btn" data-action="loadDemo">Load demo data</button></div>
      </div>
      ${expectedReturnCard()}`;
    return;
  }
  const xirrTxt = totals.xirr != null ? pct(totals.xirr, 1, true) : '—';
  const xirrSub = totals.xirr != null ? `money-weighted, since ${totals.firstDate}` : `available after 90 days (you started ${totals.spanDays} days ago)`;
  const cash = cashBalances();
  const cashEUR = sum(Object.entries(cash), ([c, v]) => v / fxRate(c));
  const divs12 = sum(S.transactions.filter(t => t.type === 'dividend' && t.date >= addDays(todayISO(), -365)), t => (num(t.amount) - num(t.withholding)) / (num(t.fxRate) || 1));
  const fwd = sum(forwardIncome(snap), x => x.annualEUR);
  const alerts = rows.filter(r => r.signal.kind === 'buy' || r.signal.kind === 'trim');
  const ds = S.settings.dividendShare;

  el.innerHTML = `
    <div class="kpis">
      ${kpi('Portfolio value', money(totals.mvEUR), `cost ${money(totals.costEUR)}`)}
      ${kpi('Unrealized P/L', moneyS(totals.plEUR), pct(totals.plPct, 2, true), cls(totals.plEUR))}
      ${kpi('Total return', moneyS(totals.totalReturnEUR), `incl. ${money(totals.realizedEUR)} realized + ${money(totals.divNetEUR)} dividends`, cls(totals.totalReturnEUR))}
      ${kpi('Annualized return', xirrTxt, `${xirrSub}<br>${targetTag(totals.xirr, target)}`, cls(totals.xirr || 0))}
      ${kpi('Dividends (12 months)', money(divs12), `forward est. ${money(fwd)}/yr`)}
      ${kpi('Cash at broker', Object.keys(cash).length ? money(cashEUR) : '—', Object.entries(cash).map(([c, v]) => money(v, c)).join(' · ') || 'record deposits to track cash')}
    </div>
    ${alerts.length ? `<div class="card section"><div class="card-head"><h2>Signals</h2><span class="muted small">Strategy: ${esc(PRESETS[S.settings.preset] ? PRESETS[S.settings.preset].label : 'Custom')}</span></div>
      <div class="table-wrap"><table><thead><tr><th>ETF</th><th>Signal</th><th class="num">Price</th><th class="num">Your avg</th><th class="num">Weight / target</th><th></th></tr></thead><tbody>
      ${alerts.map(r => `<tr><td><b>${esc(r.p.ibkr)}</b><span class="sub">${esc(r.p.name)}</span></td><td>${sigHTML(r.signal)}</td><td class="num">${money(r.price, r.p.currency)}</td><td class="num">${money(r.avg, r.p.currency)}</td><td class="num">${pct(r.weight)} / ${pct(r.target)}</td>
      <td class="num">${r.signal.kind === 'buy' ? '<button class="btn sm" data-action="goto" data-tab="plan">See plan</button>' : '<button class="btn sm" data-action="goto" data-tab="plan">Trim suggestion</button>'}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
    <div class="card section"><div class="card-head"><h2>Value vs. money invested</h2><span class="muted small">EUR, uses daily closes when available</span></div><div class="chart-box tall"><canvas id="chValue"></canvas></div></div>
    <div class="grid g2 section">
      <div class="card"><div class="card-head"><h2>Allocation: actual vs target</h2></div><div class="chart-box"><canvas id="chAlloc"></canvas></div></div>
      <div class="card">
        <div class="card-head"><h2>Dividend / growth split</h2><button class="btn sm" data-action="goto" data-tab="settings">Change split</button></div>
        <div class="split-label"><span>Actual</span><span>${pct(totals.divSleeve, 0)} dividend · ${pct(1 - totals.divSleeve, 0)} growth</span></div>
        <div class="split" role="img" aria-label="Actual split"><div class="d" style="flex:${Math.max(totals.divSleeve, 0.0001)}">${totals.divSleeve > 0.08 ? 'Dividend' : ''}</div><div class="g" style="flex:${Math.max(1 - totals.divSleeve, 0.0001)}">${1 - totals.divSleeve > 0.08 ? 'Growth' : ''}</div></div>
        <div class="split-label"><span>Target</span><span>${ds}% dividend · ${100 - ds}% growth</span></div>
        <div class="split" role="img" aria-label="Target split"><div class="d" style="flex:${Math.max(ds, 0.01)}">${ds >= 8 ? 'Dividend' : ''}</div><div class="g" style="flex:${Math.max(100 - ds, 0.01)}">${100 - ds >= 8 ? 'Growth' : ''}</div></div>
        <h3 style="margin-top:18px">Currency of holdings</h3>
        <div class="chart-box short"><canvas id="chCur"></canvas></div>
      </div>
    </div>
    <div class="card section"><div class="card-head"><h2>Holdings</h2><button class="btn sm" data-action="goto" data-tab="holdings">Details</button></div>${holdingsTable(rows.filter(r => r.qty > 0), true)}</div>
    ${expectedReturnCard()}`;

  // Value history chart
  const vh = valueHistory();
  if (vh) {
    chart('chValue', {
      type: 'line',
      data: { labels: vh.labels, datasets: [
        { label: 'Portfolio value', data: vh.value, borderColor: seriesColor(0), backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.15 },
        { label: 'Net invested', data: vh.invested, borderColor: css('--muted'), borderDash: [5, 4], borderWidth: 2, pointRadius: 0, stepped: true },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
        scales: { x: { ticks: { maxTicksLimit: 8, autoSkip: true }, grid: { display: false } }, y: { ticks: { callback: eurTick } } } },
    });
  }
  // Allocation bars
  const ar = rows.filter(r => r.target > 0 || r.qty > 0);
  chart('chAlloc', {
    type: 'bar',
    data: { labels: ar.map(r => r.p.ibkr), datasets: [
      { label: 'Actual', data: ar.map(r => round(r.weight * 100, 2)), backgroundColor: ar.map(r => seriesColor(r.p.color)), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.8, categoryPercentage: 0.7 },
      { label: 'Target', data: ar.map(r => round(r.target * 100, 2)), backgroundColor: 'transparent', borderColor: css('--text-2'), borderWidth: 1.5, borderRadius: 4, borderSkipped: 'start', barPercentage: 0.8, categoryPercentage: 0.7 },
    ] },
    options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.x.toFixed(1)}%` } } }, scales: { x: { ticks: { callback: pctTick } }, y: { grid: { display: false } } } },
  });
  // Currency doughnut
  const curMap = {};
  rows.forEach(r => { if (r.mvEUR > 0) curMap[r.p.currency] = (curMap[r.p.currency] || 0) + r.mvEUR; });
  const curKeys = Object.keys(curMap);
  chart('chCur', {
    type: 'doughnut',
    data: { labels: curKeys, datasets: [{ data: curKeys.map(k => round(curMap[k], 2)), backgroundColor: curKeys.map((k, i) => seriesColor(i)), borderColor: css('--surface'), borderWidth: 2 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => `${c.label}: ${money(c.parsed)} (${pct(c.parsed / totals.mvEUR)})` } } } },
  });
}

function expectedReturnCard() {
  const tw = targetWeights();
  const act = S.products.filter(p => tw[p.id] > 0);
  const assumed = sum(act, p => tw[p.id] * num(p.expReturn));
  const hist5 = act.every(p => histStats(p.yahoo) && histStats(p.yahoo).r5 != null) ? sum(act, p => tw[p.id] * histStats(p.yahoo).r5) : null;
  const yieldEst = sum(act, p => { const h = histStats(p.yahoo); return tw[p.id] * (h ? h.yield : (p.type === 'dividend' ? 0.03 : 0)); });
  const target = num(S.settings.targetReturn);
  const taxDrag = yieldEst * num(S.settings.divTaxRate) / 100;
  return `<div class="card section"><div class="card-head"><h2>Does the target portfolio reach ${target}%?</h2><button class="btn sm" data-action="goto" data-tab="products">Edit ETFs &amp; assumptions</button></div>
    <div class="grid g3">
      <div><div class="kpi-l muted small">Expected (your assumptions)</div><div class="kpi-v" style="font-size:22px;font-weight:650">${pct(assumed / 100, 2)}</div><div>${targetTag(assumed / 100, target)}</div></div>
      <div><div class="kpi-l muted small">Last 5 years (actual total return)</div><div class="kpi-v" style="font-size:22px;font-weight:650">${hist5 != null ? pct(hist5, 2) : '—'}</div><div class="small muted">${hist5 != null ? 'past ≠ future' : 'refresh prices to load history'}</div></div>
      <div><div class="kpi-l muted small">Dividend yield · Greek tax drag</div><div class="kpi-v" style="font-size:22px;font-weight:650">${pct(yieldEst, 2)}</div><div class="small muted">≈ ${pct(taxDrag, 2)} / yr lost to ${S.settings.divTaxRate}% dividend tax</div></div>
    </div>
    <p class="small muted" style="margin-bottom:0">Long-term stock returns are averages over 10+ years and vary a lot from year to year. Expect some years of −20% or worse. See <a href="#" data-action="goto" data-tab="guide">Guide</a>.</p></div>`;
}

function holdingsTable(rows, compact = false) {
  if (!rows.length) return '<div class="empty">No holdings yet.</div>';
  const t = { mv: sum(rows, r => r.mvEUR), cost: sum(rows, r => r.costEUR), pl: sum(rows, r => r.plEUR), day: sum(rows, r => r.dayChgEUR), fxe: sum(rows, r => r.fxEffEUR), pe: sum(rows, r => r.priceEffEUR) };
  return `<div class="table-wrap"><table><thead><tr>
    <th>ETF</th><th class="num">Shares</th><th class="num">Avg price</th><th class="num">Price</th><th class="num">Today</th>
    <th class="num">Value €</th><th class="num">P/L €</th><th class="num">P/L %</th>${compact ? '' : '<th class="num">Price effect</th><th class="num">FX effect</th><th class="num">Dividends</th>'}
    <th class="num">Weight / target</th><th>Signal</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td><span class="swatch" style="background:${seriesColor(r.p.color)}"></span><b>${esc(r.p.ibkr)}</b> <span class="pill">${esc(r.p.type === 'dividend' ? 'Div' : 'Growth')}</span><span class="sub">${esc(r.p.name)}</span></td>
      <td class="num">${nf(r.qty, 4)}</td>
      <td class="num">${money(r.avg, r.p.currency)}</td>
      <td class="num">${money(r.price, r.p.currency)}${r.src !== 'live' ? `<span class="sub">${r.src === 'manual' ? 'manual' : r.src === 'close' ? 'last close' : 'no price'}</span>` : ''}</td>
      <td class="num ${cls(r.dayChgPct)}">${pct(r.dayChgPct, 2, true)}</td>
      <td class="num">${money(r.mvEUR)}</td>
      <td class="num ${cls(r.plEUR)}">${moneyS(r.plEUR)}</td>
      <td class="num ${cls(r.plPct)}">${pct(r.plPct, 1, true)}</td>
      ${compact ? '' : `<td class="num ${cls(r.priceEffEUR)}">${moneyS(r.priceEffEUR)}</td><td class="num ${cls(r.fxEffEUR)}">${r.p.currency === 'EUR' ? '—' : moneyS(r.fxEffEUR)}</td><td class="num">${money(r.divNetEUR)}</td>`}
      <td class="num">${pct(r.weight)} / ${pct(r.target)}</td>
      <td>${sigHTML(r.signal, !compact)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td></td><td></td><td></td><td class="num ${cls(t.day)}">${moneyS(t.day)}</td><td class="num">${money(t.mv)}</td><td class="num ${cls(t.pl)}">${moneyS(t.pl)}</td><td class="num ${cls(t.pl)}">${pct(t.cost ? t.pl / t.cost : null, 1, true)}</td>
    ${compact ? '' : `<td class="num ${cls(t.pe)}">${moneyS(t.pe)}</td><td class="num ${cls(t.fxe)}">${moneyS(t.fxe)}</td><td class="num">${money(sum(rows, r => r.divNetEUR))}</td>`}<td></td><td></td></tr></tfoot></table></div>`;
}

function valueHistory() {
  const txs = sortedTx().filter(t => t.productId && (t.type === 'buy' || t.type === 'sell'));
  if (!txs.length) return null;
  const start = txs[0].date, today = todayISO();
  const pids = [...new Set(txs.map(t => t.productId))];
  const series = {}, dates = new Set(txs.map(t => t.date));
  for (const pid of pids) {
    const p = prod(pid); const h = p && p.yahoo && C.history[p.yahoo.trim()];
    if (!h) continue;
    const m = new Map();
    h.t.forEach((ts, i) => { const d = isoFromTs(ts); if (d >= start) { m.set(d, h.c[i]); dates.add(d); } });
    series[pid] = m;
  }
  dates.add(today);
  const D = [...dates].filter(d => d <= today).sort();
  const fxDates = C.fxSeries && C.fxSeries.rates ? Object.keys(C.fxSeries.rates).sort() : [];
  let fi = 0; const lastFx = {};
  const qty = {}, last = {}; let invested = 0, ti = 0;
  const labels = [], value = [], inv = [];
  for (const d of D) {
    while (ti < txs.length && txs[ti].date <= d) {
      const t = txs[ti++]; const fx = num(t.fxRate) || 1;
      if (t.type === 'buy') { qty[t.productId] = (qty[t.productId] || 0) + num(t.qty); invested += (num(t.qty) * num(t.price) + num(t.fee)) / fx; }
      else { qty[t.productId] = Math.max(0, (qty[t.productId] || 0) - num(t.qty)); invested -= (num(t.qty) * num(t.price) - num(t.fee)) / fx; }
      if (!(series[t.productId] && series[t.productId].has(d))) last[t.productId] = num(t.price);
    }
    while (fi < fxDates.length && fxDates[fi] <= d) { Object.assign(lastFx, C.fxSeries.rates[fxDates[fi]]); fi++; }
    let v = 0;
    for (const pid of pids) {
      if (series[pid] && series[pid].has(d)) last[pid] = series[pid].get(d);
      if (!(qty[pid] > 0)) continue;
      const p = prod(pid); if (!p) continue;
      let price = last[pid];
      if (d === today) { const q = quoteFor(p); if (q.price != null) price = q.price; }
      const fx = d === today || p.currency === 'EUR' ? fxRate(p.currency) : (lastFx[p.currency] || fxRate(p.currency));
      v += (qty[pid] * (price || 0)) / fx;
    }
    labels.push(d); value.push(round(v, 2)); inv.push(round(invested, 2));
  }
  // Downsample for long histories
  if (labels.length > 400) {
    const step = Math.ceil(labels.length / 400);
    const keep = (_, i) => i % step === 0 || i === labels.length - 1;
    return { labels: labels.filter(keep), value: value.filter(keep), invested: inv.filter(keep) };
  }
  return { labels, value, invested: inv };
}

function renderHoldings() {
  const el = $('#tab-holdings');
  const snap = snapshotCache();
  const rows = snap.rows.filter(r => r.qty > 0);
  const closed = snap.rows.filter(r => r.qty === 0 && (r.realizedEUR || r.divNetEUR));
  el.innerHTML = `
    <div class="card section"><div class="card-head"><h2>Open positions</h2><span class="muted small">Avg price includes commissions · P/L in EUR split into price and currency effect</span></div>${holdingsTable(rows)}</div>
    <div class="grid g2 section">
      <div class="card"><div class="card-head"><h2>Profit / loss by ETF (EUR)</h2></div><div class="chart-box"><canvas id="chPL"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Position vs. your average price</h2><span class="muted small">buy-more levels: −${S.settings.strategy.dip.join('% / −')}%</span></div><div class="chart-box"><canvas id="chVsAvg"></canvas></div></div>
    </div>
    ${closed.length ? `<div class="card section"><h2>Closed positions</h2><div class="table-wrap"><table><thead><tr><th>ETF</th><th class="num">Realized P/L €</th><th class="num">Dividends €</th></tr></thead><tbody>
      ${closed.map(r => `<tr><td>${esc(r.p.ibkr)} <span class="sub">${esc(r.p.name)}</span></td><td class="num ${cls(r.realizedEUR)}">${moneyS(r.realizedEUR)}</td><td class="num">${money(r.divNetEUR)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  if (!rows.length) return;
  chart('chPL', {
    type: 'bar',
    data: { labels: rows.map(r => r.p.ibkr), datasets: [
      { label: 'Price effect', data: rows.map(r => round(r.priceEffEUR, 2)), backgroundColor: seriesColor(0), borderRadius: 4 },
      { label: 'FX effect', data: rows.map(r => round(r.fxEffEUR, 2)), backgroundColor: seriesColor(1), borderRadius: 4 },
      { label: 'Dividends', data: rows.map(r => round(r.divNetEUR, 2)), backgroundColor: seriesColor(2), borderRadius: 4 },
    ] },
    options: { plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${moneyS(c.parsed.y)}` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: eurTick } } } },
  });
  const st = S.settings.strategy;
  chart('chVsAvg', {
    type: 'bar',
    data: { labels: rows.map(r => r.p.ibkr), datasets: [{ label: 'Price vs your average (%)', data: rows.map(r => round((r.chgVsAvg || 0) * 100, 2)), backgroundColor: rows.map(r => seriesColor(r.p.color)), borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.x > 0 ? '+' : ''}${c.parsed.x.toFixed(1)}% vs avg` } } },
      scales: { x: { ticks: { callback: pctTick }, suggestedMin: -Math.max(...st.dip.map(num), 10), suggestedMax: Math.max(num(st.tp), 10) }, y: { grid: { display: false } } } },
  });
}

function planBudget() {
  const snap = snapshotCache();
  const ds = dipSuggestion(snap);
  const regular = planRegularOverride != null ? planRegularOverride : num(S.settings.contribAmount);
  const extra = planExtraOverride != null ? planExtraOverride : (S.transactions.some(t => t.type === 'buy') ? 0 : num(S.settings.initialAmount));
  const dip = planDipOverride != null ? planDipOverride : ds.amt;
  const cash = cashBalances();
  const cashEUR = Math.max(0, sum(Object.entries(cash), ([c, v]) => v / fxRate(c)));
  const budget = regular + extra + (planIncludeCash ? cashEUR : 0);
  return { regular, extra, dip, ds, cashEUR, budget, total: budget + dip };
}
function renderPlan() {
  const el = $('#tab-plan');
  const b = planBudget();
  const plan = buildPlan(b.budget, b.dip);
  const snap = snapshotCache();
  const trims = trimSuggestions(snap);
  const rows = plan.items.slice().sort((a, z) => z.r.target - a.r.target);
  const buys = rows.filter(i => i.shares > 0);
  const st = S.settings.strategy, de = S.settings.dipExtra, f = freq();
  const firstTime = !S.transactions.some(t => t.type === 'buy');
  const prof = profileSummary();
  const nextLvl = de.findIndex(x => num(x) > 0);
  const dipNote = b.ds.lvl >= 0 && b.ds.amt <= 0
    ? `<div class="note"><b>▼ Small dip (level ${b.ds.lvl + 1}).</b> ${b.ds.hits.map(r => `${esc(r.p.ibkr)} ${esc(r.signal.detail)}`).join(' · ')}. Your regular money already leans toward it.${nextLvl >= 0 ? ` Extra money is suggested from a −${st.dip[nextLvl]}% drop (${money(num(de[nextLvl]), 'EUR', 0)}).` : ''}</div>`
    : b.ds.lvl >= 0
    ? `<div class="note"><b>▼ Market drop: level ${b.ds.lvl + 1}.</b> ${b.ds.hits.map(r => `${esc(r.p.ibkr)} ${esc(r.signal.detail)}`).join(' · ')}.<br>Suggested extra: <b>${money(b.ds.amt, 'EUR', 0)}</b>, invested only in these ETFs to lower your average price. Add it only if it is spare money on top of your regular ${money(num(S.settings.contribAmount), 'EUR', 0)}. Never skip the regular amount to wait for a drop.</div>`
    : `<div class="note muted">No market drop right now. Extra money is suggested when an ETF is ${st.dip.map(x => '−' + x + '%').join(' / ')} below your average price${num(st.ddAlert) ? ` or −${st.ddAlert}% below its 52-week high` : ''}: ${de.map(x => money(num(x), 'EUR', 0)).join(' / ')} (Settings → Strategy).</div>`;
  el.innerHTML = `
    <div class="card section">
      <div class="card-head"><h2>Buy plan</h2><span class="muted small">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      <div class="form-grid">
        <label class="field span2">How much do you want to invest now? (EUR)<input type="number" step="any" min="0" id="planTotal" value="${round(b.regular + b.extra + b.dip, 2)}" style="font-size:20px;font-weight:650"><span class="help">Type any amount. The app splits it and chooses ETFs and share counts from live prices.</span></label>
        <div class="field span2"><span class="small muted">Risk profile</span><span style="font-size:17px;font-weight:650">${esc(prof.label)} · expected ≈ ${nf(prof.exp, 1)}%/yr</span><span class="help">${prof.worst ? `A bad year can be −${prof.worst}% or worse. ` : ''}${esc(prof.note)} <a href="#" data-action="goto" data-tab="settings">Change</a></span></div>
      </div>
      <details id="planSplit" ${planSplitOpen ? 'open' : ''} style="margin-top:10px"><summary class="small" style="cursor:pointer">Automatic split: <b>${money(b.regular, 'EUR', 0)}</b> regular → ETFs furthest below target · <b>${money(b.dip, 'EUR', 0)}</b> dip money → ETFs that dropped · <b>${money(b.extra, 'EUR', 0)}</b> extra → like regular. Click to adjust</summary>
      <div class="form-grid" style="margin-top:10px">
        <label class="field">Regular contribution (EUR)<input type="number" step="any" min="0" id="planRegular" value="${b.regular}"><span class="help">${f.adj}: ${money(num(S.settings.contribAmount), 'EUR', 0)} (Settings)</span></label>
        <label class="field">One-off extra (EUR)<input type="number" step="any" min="0" id="planExtra" value="${b.extra}"><span class="help">${firstTime ? `Your starting amount ${money(num(S.settings.initialAmount), 'EUR', 0)}` : 'e.g. a bonus. Leave 0 normally'}</span></label>
        <label class="field">Extra dip money (EUR)<input type="number" step="any" min="0" id="planDip" value="${b.dip}"><span class="help">${b.ds.lvl >= 0 ? `Suggested ${money(b.ds.amt, 'EUR', 0)} (drop level ${b.ds.lvl + 1})` : 'Only used when there is a drop'}</span></label>
        <label class="field">Include uninvested cash<span class="check" style="padding-top:6px"><input type="checkbox" id="planCash" ${planIncludeCash ? 'checked' : ''}> ${money(b.cashEUR)} from recorded transactions</span></label>
        <label class="field">Minimum order size (EUR)<input type="number" step="any" min="0" id="planMin" value="${num(S.settings.minOrder)}"><span class="help">Avoids small orders with high fees</span></label>
        <div class="field"><span class="small muted">Total to invest</span><span style="font-size:22px;font-weight:650">${money(plan.total)}</span><span class="help">${esc(PRESETS[S.settings.preset] ? PRESETS[S.settings.preset].label : 'Custom strategy')}</span></div>
      </div></details>
      ${dipNote}
      ${plan.warnings.map(w => `<div class="note">${esc(w)}</div>`).join('')}
    </div>
    <div class="card section">
      <div class="card-head"><h2>What to buy</h2><div class="btn-row">${buys.length ? '<button class="btn primary" data-action="recordAllPlan">Record all as bought</button>' : ''}<button class="btn" data-action="recordDeposit">Record deposit of ${money(b.regular + b.extra + b.dip, 'EUR', 0)}</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>ETF · where in IBKR</th><th class="num">Price</th><th class="num">Now</th><th class="num">Target</th><th class="num">After</th><th>Why</th><th class="num">Buy shares</th><th class="num">Cost €</th><th class="num">Fee ≈</th><th></th></tr></thead><tbody>
      ${rows.map(i => { const cost = i.shares * i.priceEUR, fee = i.shares ? estimateFee(cost) : 0; return `<tr${i.shares ? '' : ' style="opacity:.72"'}>
        <td><span class="swatch" style="background:${seriesColor(i.p.color)}"></span><b>${esc(i.p.ibkr)}</b><span class="sub">${esc(i.p.name)}</span><span class="sub">${esc(i.p.exchange || '')} · ISIN ${esc(i.p.isin || '')}</span></td>
        <td class="num">${money(i.priceLocal, i.p.currency)}</td>
        <td class="num">${pct(i.r.weight)}</td><td class="num">${pct(i.r.target)}</td><td class="num">${i.after != null ? pct(i.after) : '—'}</td>
        <td style="min-width:200px;max-width:320px">${i.r.signal.kind === 'buy' || i.r.signal.kind === 'trim' ? sigHTML(i.r.signal, false) + ' ' : ''}<span class="small">${esc(i.why || '')}</span></td>
        <td class="num"><b style="font-size:15px">${i.shares || '—'}</b>${i.dipShares ? `<span class="sub">incl. ${i.dipShares} dip</span>` : ''}</td>
        <td class="num">${i.shares ? money(cost) : ''}</td>
        <td class="num">${i.shares ? `${money(fee)}<span class="sub">${pct(fee / cost, 2)}</span>` : ''}</td>
        <td class="num">${i.shares ? `<button class="btn sm" data-action="recordPlanItem" data-id="${i.p.id}" data-shares="${i.shares}" data-price="${i.priceLocal}">Record</button>` : ''}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="7">Total · ${buys.length} order(s)</td><td class="num">${money(plan.spent - plan.fees)}</td><td class="num">${money(plan.fees)}</td><td></td></tr>
      <tr><td colspan="7" class="muted">Left over → carries to your next plan</td><td class="num">${money(plan.left)}</td><td></td><td></td></tr></tfoot></table></div>
      <p class="small muted">How it works: regular money goes to the ETFs furthest below their target, weighted up for ETFs below your average price or 52-week high. Extra dip money goes only to ETFs with a buy-more signal. Whole shares only. Bought only part? The next plan starts from what you actually own and adds what's still missing.</p>
    </div>
    <div class="card section"><div class="card-head"><h2>Sell / trim suggestions</h2><span class="muted small">Only when up ≥ ${st.tp}% vs avg${st.tpNeedsOverweight ? ' and overweight beyond the band' : ''}</span></div>
      ${!st.tpOn ? '<div class="empty">Trim signals are off for this strategy.</div>' : trims.length ? `<div class="table-wrap"><table><thead><tr><th>ETF</th><th class="num">Up vs avg</th><th class="num">Weight / target</th><th class="num">Sell shares</th><th class="num">≈ Value</th><th></th></tr></thead><tbody>
      ${trims.map(x => `<tr><td><b>${esc(x.r.p.ibkr)}</b></td><td class="num pos">${pct(x.r.chgVsAvg, 1, true)}</td><td class="num">${pct(x.r.weight)} / ${pct(x.r.target)}</td><td class="num"><b>${x.shares}</b></td><td class="num">${money(x.valueEUR)}</td>
      <td class="num"><button class="btn sm" data-action="recordTrim" data-id="${x.r.p.id}" data-shares="${x.shares}" data-price="${x.r.price}">Record sale</button></td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">In Greece, gains on EU UCITS ETFs are generally tax-exempt (check with your accountant), so trimming costs only commission and spread. Usually it's simpler to rebalance by buying the underweight ETFs.</p>` : '<div class="empty">Nothing to trim. All positions are within your bands.</div>'}
    </div>`;
  const onNum = (id, fn) => $(id).addEventListener('change', e => { fn(Math.max(0, num(e.target.value))); renderPlan(); });
  onNum('#planTotal', A => {
    const reg = Math.min(A, num(S.settings.contribAmount));
    let rest = A - reg;
    const dip = Math.min(rest, b.ds.amt);
    rest -= dip;
    planRegularOverride = reg; planDipOverride = dip; planExtraOverride = round(rest, 2);
  });
  $('#planSplit').addEventListener('toggle', e => { planSplitOpen = e.target.open; });
  onNum('#planRegular', v => { planRegularOverride = v; });
  onNum('#planExtra', v => { planExtraOverride = v; });
  onNum('#planDip', v => { planDipOverride = v; });
  onNum('#planMin', v => { S.settings.minOrder = v; save(); });
  $('#planCash').addEventListener('change', e => { planIncludeCash = e.target.checked; renderPlan(); });
}

function renderTransactions() {
  const el = $('#tab-transactions');
  const years = [...new Set(S.transactions.map(t => t.date.slice(0, 4)))].sort().reverse();
  let txs = sortedTx().reverse();
  if (txFilter.type) txs = txs.filter(t => t.type === txFilter.type);
  if (txFilter.product) txs = txs.filter(t => t.productId === txFilter.product);
  if (txFilter.year) txs = txs.filter(t => t.date.startsWith(txFilter.year));
  const { realizedByTx } = computeHoldings();
  el.innerHTML = `
    <div class="card section">
      <div class="card-head"><h2>Transactions</h2>
        <div class="btn-row"><button class="btn primary" data-action="addTx">+ Add transaction</button><button class="btn" data-action="importCSV">Import CSV / IBKR statement</button><button class="btn" data-action="exportCSV">Export CSV</button></div></div>
      <div class="filters">
        <select id="fType"><option value="">All types</option>${Object.entries(TX_TYPES).map(([k, v]) => `<option value="${k}" ${txFilter.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select id="fProd"><option value="">All ETFs</option>${S.products.map(p => `<option value="${p.id}" ${txFilter.product === p.id ? 'selected' : ''}>${esc(p.ibkr)}</option>`).join('')}</select>
        <select id="fYear"><option value="">All years</option>${years.map(y => `<option ${txFilter.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <span class="muted small">${txs.length} of ${S.transactions.length}</span>
      </div>
      ${txs.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>ETF</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th><th class="num">Fee</th><th class="num">FX (1 € =)</th><th class="num">EUR</th><th class="num">Realized €</th><th>Note</th><th></th></tr></thead><tbody>
      ${txs.map(t => {
        const p = prod(t.productId); const fx = num(t.fxRate) || 1;
        const amt = txAmount(t);
        return `<tr><td class="nowrap">${t.date}</td><td>${TX_TYPES[t.type] || t.type}${t.status === 'pending' ? ' <span class="pill pending">pending</span>' : ''}${t.auto ? ' <span class="pill">auto</span>' : ''}</td>
        <td>${p ? esc(p.ibkr) : ''}</td><td class="num">${t.qty ? nf(num(t.qty), 4) : ''}</td><td class="num">${t.price ? money(num(t.price), t.currency, 3) : ''}</td>
        <td class="num">${t.type === 'fx' ? `${money(num(t.amount), t.currency)} → ${money(num(t.toAmount), t.toCurrency)}` : money(amt, t.currency)}</td>
        <td class="num">${num(t.fee) ? money(num(t.fee), t.currency) : ''}</td><td class="num">${t.currency === 'EUR' ? '' : nf(fx, 5)}</td>
        <td class="num">${money(amt / fx)}</td><td class="num ${realizedByTx[t.id] ? cls(realizedByTx[t.id].gainEUR) : ''}">${realizedByTx[t.id] ? moneyS(realizedByTx[t.id].gainEUR) : ''}</td>
        <td class="small" style="max-width:260px">${esc(t.note || '')}</td>
        <td class="num nowrap">${t.status === 'pending' ? `<button class="btn sm" data-action="confirmTx" data-id="${t.id}">Confirm</button> ` : ''}<button class="btn sm" data-action="editTx" data-id="${t.id}">Edit</button> <button class="btn sm danger" data-action="delTx" data-id="${t.id}" aria-label="Delete">✕</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">No transactions yet. Add one, or import your IBKR activity statement (CSV).</div>'}
    </div>`;
  $('#fType').addEventListener('change', e => { txFilter.type = e.target.value; renderTransactions(); });
  $('#fProd').addEventListener('change', e => { txFilter.product = e.target.value; renderTransactions(); });
  $('#fYear').addEventListener('change', e => { txFilter.year = e.target.value; renderTransactions(); });
}
// Signed cash amount of a transaction in its own currency
function txAmount(t) {
  const fee = num(t.fee), a = num(t.amount);
  switch (t.type) {
    case 'buy': return -(num(t.qty) * num(t.price) + fee);
    case 'sell': return num(t.qty) * num(t.price) - fee;
    case 'dividend': return a - num(t.withholding);
    case 'deposit': case 'interest': return a;
    case 'withdrawal': case 'fee': case 'tax': return -a;
    case 'fx': return -a;
    default: return a;
  }
}

function renderDividends() {
  const el = $('#tab-dividends');
  const snap = snapshotCache();
  const divs = sortedTx().filter(t => t.type === 'dividend').reverse();
  const pending = divs.filter(t => t.status === 'pending');
  const eurNet = t => (num(t.amount) - num(t.withholding)) / (num(t.fxRate) || 1);
  const yr = String(new Date().getFullYear());
  const thisYear = divs.filter(t => t.date.startsWith(yr));
  const fi = forwardIncome(snap).filter(x => x.r.qty > 0 && (x.ttm > 0 || x.r.p.policy === 'Dist'));
  const fwd = sum(fi, x => x.annualEUR);
  const grossYr = sum(thisYear, t => num(t.amount) / (num(t.fxRate) || 1));
  const whtYr = sum(thisYear, t => num(t.withholding) / (num(t.fxRate) || 1));
  const taxYr = sum(thisYear, greekDivTaxEUR);
  el.innerHTML = `
    <div class="kpis">
      ${kpi(`Received in ${yr}`, money(sum(thisYear, eurNet)), `${thisYear.length} payment(s)`)}
      ${kpi('Received all-time', money(sum(divs, eurNet)))}
      ${kpi('Forward annual income', money(fwd), `≈ ${money(fwd / 12)} / month · yield ${pct(snap.totals.mvEUR ? fwd / snap.totals.mvEUR : null, 2)}`)}
      ${kpi(`Est. Greek tax ${yr}`, money(taxYr), `${S.settings.divTaxRate}% of ${money(grossYr)} gross, minus ${money(whtYr)} foreign tax (credited per payment)`)}
    </div>
    ${pending.length ? `<div class="card section"><div class="card-head"><h2>Detected automatically: please confirm</h2><div class="btn-row"><span class="muted small">Compare with the IBKR statement (amount, pay date, withholding)</span><button class="btn sm primary" data-action="confirmAllDivs">Confirm all ${pending.length}</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Ex-date</th><th>ETF</th><th class="num">Shares</th><th class="num">Per share</th><th class="num">Gross</th><th class="num">Withholding</th><th></th></tr></thead><tbody>
      ${pending.map(t => { const p = prod(t.productId); return `<tr><td>${t.date}</td><td><b>${esc(p ? p.ibkr : '')}</b></td><td class="num">${nf(num(t.qty), 4)}</td><td class="num">${nf(num(t.perShare), 4)}</td><td class="num">${money(num(t.amount), t.currency)}</td><td class="num">${money(num(t.withholding), t.currency)}</td>
      <td class="num nowrap"><button class="btn sm primary" data-action="confirmTx" data-id="${t.id}">Confirm</button> <button class="btn sm" data-action="editTx" data-id="${t.id}">Edit</button> <button class="btn sm danger" data-action="dismissDiv" data-id="${t.id}">Not received</button></td></tr>`; }).join('')}
      </tbody></table></div></div>` : ''}
    <div class="card section"><div class="card-head"><h2>Monthly dividend income (EUR, net)</h2><span class="muted small">last 24 months</span></div><div class="chart-box"><canvas id="chDiv"></canvas></div></div>
    <div class="card section"><div class="card-head"><h2>Income by ETF</h2><span class="muted small">based on the last 12 months of distributions</span></div>
      ${fi.length ? `<div class="table-wrap"><table><thead><tr><th>ETF</th><th class="num">Shares</th><th class="num">12m div / share</th><th class="num">Yield</th><th class="num">Yield on cost</th><th class="num">Est. annual €</th><th class="num">Received €</th></tr></thead><tbody>
      ${fi.map(x => `<tr><td><span class="swatch" style="background:${seriesColor(x.r.p.color)}"></span><b>${esc(x.r.p.ibkr)}</b></td><td class="num">${nf(x.r.qty, 4)}</td><td class="num">${money(x.ttm, x.r.p.currency, 4)}</td><td class="num">${pct(x.r.hist ? x.r.hist.yield : null, 2)}</td><td class="num">${pct(x.yoc, 2)}</td><td class="num">${money(x.annualEUR)}</td><td class="num">${money(x.r.divNetEUR)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td class="num">${money(fwd)}</td><td class="num">${money(sum(fi, x => x.r.divNetEUR))}</td></tr></tfoot></table></div>` : '<div class="empty">No distributing ETFs held yet.</div>'}
    </div>
    <div class="card section"><div class="card-head"><h2>Dividend history</h2><button class="btn sm" data-action="addTx" data-type="dividend">+ Record dividend</button></div>
      ${divs.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>ETF</th><th class="num">Gross</th><th class="num">Withholding</th><th class="num">Net</th><th class="num">Net €</th><th>Status</th></tr></thead><tbody>
      ${divs.map(t => { const p = prod(t.productId); return `<tr><td>${t.date}</td><td>${esc(p ? p.ibkr : '')}</td><td class="num">${money(num(t.amount), t.currency)}</td><td class="num">${money(num(t.withholding), t.currency)}</td><td class="num">${money(num(t.amount) - num(t.withholding), t.currency)}</td><td class="num">${money(eurNet(t))}</td><td>${t.status === 'pending' ? '<span class="pill pending">pending</span>' : '<span class="pill">confirmed</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">No dividends yet. When you hold distributing ETFs (VHYL, SPYW, SPYD) and prices are refreshed, payments are detected automatically.</div>'}
    </div>`;
  // Monthly stacked bars
  const months = [];
  const d0 = new Date(); d0.setDate(1);
  for (let i = 23; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(d.toLocaleDateString('sv-SE').slice(0, 7)); }
  const pids = [...new Set(divs.map(t => t.productId))];
  chart('chDiv', {
    type: 'bar',
    data: { labels: months.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }); }),
      datasets: pids.map(pid => { const p = prod(pid); return { label: p ? p.ibkr : pid, backgroundColor: seriesColor(p ? p.color : 8), borderRadius: 3, data: months.map(m => round(sum(divs.filter(t => t.productId === pid && t.date.startsWith(m)), eurNet), 2)) }; }) },
    options: { plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: eurTick } } } },
  });
}

function renderProducts() {
  const el = $('#tab-products');
  const tw = targetWeights();
  const sleeve = type => S.products.filter(p => (type === 'dividend' ? p.type === 'dividend' : p.type !== 'dividend'));
  const table = (type, title, share) => {
    const list = sleeve(type);
    const totalW = sum(list.filter(p => p.active), p => num(p.weight));
    return `<div class="card section"><div class="card-head"><h2>${title} <span class="muted" style="font-weight:400">· ${share}% of portfolio</span></h2><span class="muted small">weights inside the sleeve: ${nf(totalW)} (normalized to 100%)</span></div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>ETF</th><th>IBKR</th><th>Yahoo</th><th class="num">Price</th><th class="num">Weight in sleeve</th><th class="num">Portfolio target</th><th class="num">TER</th><th class="num">Exp. return</th><th class="num">1y</th><th class="num">3y / yr</th><th class="num">5y / yr</th><th class="num">Max drop (5y)</th><th class="num">Yield</th><th></th></tr></thead><tbody>
    ${list.map(p => { const h = histStats(p.yahoo); const q = quoteFor(p); return `<tr${p.active ? '' : ' style="opacity:.55"'}>
      <td><span class="swatch" style="background:${seriesColor(p.color)}"></span><b>${esc(p.ibkr)}</b> <span class="pill">${esc(p.policy)}</span>${p.active ? '' : ' <span class="pill">inactive</span>'}<span class="sub">${esc(p.name)}</span><span class="sub">${esc(p.isin)} · ${esc(p.note || '')}</span></td>
      <td class="small">${esc(p.exchange)}<span class="sub">${esc(p.currency)}</span></td><td class="small">${esc(p.yahoo)}</td>
      <td class="num">${money(q.price, p.currency)}${q.src !== 'live' ? `<span class="sub">${q.src}</span>` : ''}</td>
      <td class="num">${nf(num(p.weight))}</td><td class="num"><b>${pct(tw[p.id] || 0)}</b></td><td class="num">${nf(num(p.ter), 2)}%</td><td class="num">${nf(num(p.expReturn), 1)}%</td>
      <td class="num ${cls(h && h.r1)}">${pct(h && h.r1, 1, true)}</td><td class="num ${cls(h && h.r3)}">${pct(h && h.r3, 1, true)}</td><td class="num ${cls(h && h.r5)}">${pct(h && h.r5, 1, true)}</td>
      <td class="num">${pct(h && h.maxDD, 0)}</td><td class="num">${h && (p.policy === 'Dist' || h.yield > 0) ? pct(h.yield, 2) : '—'}</td>
      <td class="num nowrap"><button class="btn sm" data-action="editProduct" data-id="${p.id}">Edit</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="empty">No ETFs in this sleeve.</div>'}</div>`;
  };
  el.innerHTML = `
    <div class="card section"><div class="card-head"><h2>Your ETF universe &amp; target allocation</h2>
      <div class="btn-row"><button class="btn primary" data-action="addProduct">+ Add ETF</button><button class="btn" data-action="resetProducts">Reset to recommended model</button></div></div>
      <p class="small muted" style="margin:0">Returns are total returns in the listing currency (dividends reinvested), per year. "Exp. return" is <b>your</b> long-term assumption used for the target check. Search each ETF in IBKR by ISIN. Check current fees on justETF before buying.</p>
    </div>
    ${expectedReturnCard()}
    ${table('growth', 'Growth sleeve', 100 - S.settings.dividendShare)}
    ${table('dividend', 'Dividend sleeve', S.settings.dividendShare)}`;
}

function renderReports() {
  const el = $('#tab-reports');
  const snap = snapshotCache();
  const s = S.settings;
  const years = Math.max(1, Math.min(50, num(s.projYears) || 20));
  const f = freq();
  const V0 = snap.totals.mvEUR > 0 ? snap.totals.mvEUR : num(s.initialAmount), W = num(s.contribAmount), N = f.n;
  const scen = [
    { k: 'Pessimistic', r: num(s.scenarioLow) / 100, c: seriesColor(1) },
    { k: 'Target', r: num(s.targetReturn) / 100, c: seriesColor(0) },
    { k: 'Optimistic', r: num(s.scenarioHigh) / 100, c: seriesColor(2) },
  ];
  const fv = (r, y) => { const i = Math.pow(1 + r, 1 / N) - 1, n = Math.round(N * y); return i === 0 ? V0 + W * n : V0 * Math.pow(1 + i, n) + W * (Math.pow(1 + i, n) - 1) / i; };
  const labels = Array.from({ length: years + 1 }, (_, y) => String(new Date().getFullYear() + y));
  const milestones = [5, 10, 15, 20, 25, 30, 40].filter(y => y <= years);
  if (!milestones.includes(years)) milestones.push(years);

  const yearsList = [...new Set([String(new Date().getFullYear()), ...S.transactions.map(t => t.date.slice(0, 4))])].sort().reverse();
  const tx = S.transactions.filter(t => t.date.startsWith(taxYear));
  const divs = tx.filter(t => t.type === 'dividend');
  const sells = tx.filter(t => t.type === 'sell');
  const { realizedByTx } = computeHoldings();
  const gross = sum(divs, t => num(t.amount) / (num(t.fxRate) || 1));
  const wht = sum(divs, t => num(t.withholding) / (num(t.fxRate) || 1));
  const greekTax = sum(divs, greekDivTaxEUR);
  const proceeds = sum(sells, t => realizedByTx[t.id] ? realizedByTx[t.id].proceedsEUR : 0);
  const gains = sum(sells, t => realizedByTx[t.id] ? realizedByTx[t.id].gainEUR : 0);
  const interest = sum(tx.filter(t => t.type === 'interest'), t => num(t.amount) / (num(t.fxRate) || 1));
  const bought = sum(tx.filter(t => t.type === 'buy'), t => (num(t.qty) * num(t.price) + num(t.fee)) / (num(t.fxRate) || 1));

  el.innerHTML = `
    <div class="card section"><div class="card-head"><h2>Projection</h2><span class="muted small">Start ${money(V0, 'EUR', 0)}${snap.totals.mvEUR > 0 ? '' : ' (starting amount)'} + ${money(W, 'EUR', 0)} per ${f.per} · not a guarantee</span></div>
      <div class="form-grid" style="margin-bottom:12px">
        <label class="field">Years<input type="number" min="1" max="50" id="pjYears" value="${years}"></label>
        <label class="field">Amount per ${f.per} (EUR)<input type="number" step="any" min="0" id="pjWeekly" value="${W}"></label>
        <label class="field">Pessimistic % / yr<input type="number" step="any" id="pjLow" value="${s.scenarioLow}"></label>
        <label class="field">Target % / yr<input type="number" step="any" id="pjTarget" value="${s.targetReturn}"></label>
        <label class="field">Optimistic % / yr<input type="number" step="any" id="pjHigh" value="${s.scenarioHigh}"></label>
      </div>
      <div class="chart-box tall"><canvas id="chProj"></canvas></div>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>After</th><th class="num">You put in</th>${scen.map(x => `<th class="num">${x.k} (${nf(x.r * 100, 1)}%)</th>`).join('')}</tr></thead><tbody>
      ${milestones.map(y => `<tr><td>${y} years (${new Date().getFullYear() + y})</td><td class="num">${money(V0 + W * N * y, 'EUR', 0)}</td>${scen.map(x => `<td class="num">${money(fv(x.r, y), 'EUR', 0)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="small muted">Nominal values (before inflation). At 2% inflation, divide the 20-year figures by about 1.5 to get today's purchasing power.</p>
    </div>
    <div class="card section"><div class="card-head"><h2>Tax report (Greece)</h2>
      <div class="btn-row"><select id="taxYear">${yearsList.map(y => `<option ${y === taxYear ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="btn" data-action="exportTax">Export CSV for accountant</button></div></div>
      <div class="kpis">
        ${kpi('Dividends gross', money(gross), `${divs.length} payment(s)`)}
        ${kpi('Foreign tax withheld', money(wht), 'credited against Greek tax')}
        ${kpi(`Est. Greek dividend tax (${s.divTaxRate}%)`, money(greekTax), 'pay via annual return (E1)')}
        ${kpi('Sales: gross proceeds', money(proceeds), `${sells.length} sale(s)`)}
        ${kpi('Realized gains', moneyS(gains), 'EU UCITS: generally exempt; report if required', cls(gains))}
        ${kpi('Interest received', money(interest), 'taxed at 15%')}
        ${kpi('Invested this year', money(bought))}
      </div>
      <p class="small muted">All amounts in EUR at the rate stored on each transaction (use the ECB rate of the transaction date). This is a helper, not tax advice. Confirm codes and treatment with your accountant.</p>
      ${divs.length || sells.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>ETF</th><th>ISIN</th><th class="num">Gross (orig.)</th><th class="num">FX</th><th class="num">Gross €</th><th class="num">Withheld €</th><th class="num">Gain €</th></tr></thead><tbody>
      ${[...divs, ...sells].sort((a, b) => (a.date < b.date ? -1 : 1)).map(t => { const p = prod(t.productId); const fx = num(t.fxRate) || 1; const g = t.type === 'sell' ? num(t.qty) * num(t.price) : num(t.amount); return `<tr><td>${t.date}</td><td>${TX_TYPES[t.type]}</td><td>${esc(p ? p.ibkr : '')}</td><td class="small">${esc(p ? p.isin : '')}</td><td class="num">${money(g, t.currency)}</td><td class="num">${t.currency === 'EUR' ? '' : nf(fx, 5)}</td><td class="num">${money(g / fx)}</td><td class="num">${t.type === 'dividend' ? money(num(t.withholding) / fx) : ''}</td><td class="num">${t.type === 'sell' && realizedByTx[t.id] ? moneyS(realizedByTx[t.id].gainEUR) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="empty">No dividends or sales in ${taxYear}.</div>`}
    </div>`;
  chart('chProj', {
    type: 'line',
    data: { labels, datasets: [
      ...scen.map(x => ({ label: `${x.k} ${nf(x.r * 100, 1)}%`, data: labels.map((_, y) => round(fv(x.r, y), 0)), borderColor: x.c, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.2 })),
      { label: 'Money put in', data: labels.map((_, y) => round(V0 + W * N * y, 0)), borderColor: css('--muted'), borderDash: [5, 4], borderWidth: 2, pointRadius: 0 },
    ] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y, 'EUR', 0)}` } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 11 } }, y: { ticks: { callback: eurTick } } } },
  });
  const bind = (id, key) => $(id).addEventListener('change', e => { S.settings[key] = num(e.target.value); save(); renderReports(); });
  bind('#pjYears', 'projYears'); bind('#pjWeekly', 'contribAmount'); bind('#pjLow', 'scenarioLow'); bind('#pjTarget', 'targetReturn'); bind('#pjHigh', 'scenarioHigh');
  $('#taxYear').addEventListener('change', e => { taxYear = e.target.value; renderReports(); });
}

function renderSettings() {
  const el = $('#tab-settings');
  const s = S.settings, st = s.strategy;
  const syncMeta = JSON.parse(storageGet(LS_SYNC) || '{}');
  el.innerHTML = `
    <div class="card section"><h2>Investing</h2>
      <div class="form-grid" style="margin-bottom:12px">
        <label class="field span2">Risk profile<select id="riskSel">${Object.entries(RISK_PROFILES).map(([k, rp]) => `<option value="${k}" ${currentProfile() === k ? 'selected' : ''}>${esc(rp.label)}: ${rp.dividendShare}% dividend · expected ≈ ${nf(profileExpected(rp), 1)}%/yr · bad year ≈ −${rp.worst}%</option>`).join('')}<option value="custom" ${currentProfile() === 'custom' ? 'selected' : ''}>Custom (your own split and weights)</option></select>
        <span class="help">${esc(profileSummary().note)} Choosing a profile sets the dividend share and the ETF weights. Expected returns use the assumptions in ETFs &amp; targets.</span></label>
      </div>
      <div class="form-grid">
        <label class="field">Regular contribution (EUR)<input type="number" step="any" min="0" data-set="contribAmount" value="${s.contribAmount}"></label>
        <label class="field">How often<select data-set="contribFreq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${s.contribFreq === k ? 'selected' : ''}>${v.adj}</option>`).join('')}</select></label>
        <label class="field">Starting amount, one-off (EUR)<input type="number" step="any" min="0" data-set="initialAmount" value="${s.initialAmount}"><span class="help">Pre-filled in your first buy plan</span></label>
        <label class="field span2">Dividend share: <b id="dsLbl">${s.dividendShare}% dividend · ${100 - s.dividendShare}% growth</b><input type="range" min="0" max="100" step="5" data-set="dividendShare" value="${s.dividendShare}"></label>
        <label class="field">Target annual return (%)<input type="number" step="any" data-set="targetReturn" value="${s.targetReturn}"></label>
      </div>
    </div>
    <div class="card section"><h2>Strategy: buy-more and trim signals</h2>
      <div class="form-grid">
        <label class="field span2">Preset<select id="presetSel">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${s.preset === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}<option value="custom" ${PRESETS[s.preset] ? '' : 'selected'}>Custom</option></select><span class="help">Changing any value below switches to Custom. Research summary in the Guide tab.</span></label>
        <label class="check"><input type="checkbox" data-st="dipOn" ${st.dipOn ? 'checked' : ''}> Buy-more signals &amp; dip tilt</label>
        <label class="field">Level 1: price below avg by (%)<input type="number" step="any" data-st="dip.0" value="${st.dip[0]}"></label>
        <label class="field">Level 2 (%)<input type="number" step="any" data-st="dip.1" value="${st.dip[1]}"></label>
        <label class="field">Level 3 (%)<input type="number" step="any" data-st="dip.2" value="${st.dip[2]}"></label>
        <label class="field">Tilt level 1 (× priority for new money)<input type="number" step="0.05" data-st="tilt.0" value="${st.tilt[0]}"></label>
        <label class="field">Tilt level 2<input type="number" step="0.05" data-st="tilt.1" value="${st.tilt[1]}"></label>
        <label class="field">Tilt level 3<input type="number" step="0.05" data-st="tilt.2" value="${st.tilt[2]}"></label>
        <label class="field">Extra dip money at level 1 (EUR)<input type="number" step="any" min="0" data-dx="0" value="${S.settings.dipExtra[0]}"></label>
        <label class="field">Extra dip money at level 2 (EUR)<input type="number" step="any" min="0" data-dx="1" value="${S.settings.dipExtra[1]}"></label>
        <label class="field">Extra dip money at level 3 (EUR)<input type="number" step="any" min="0" data-dx="2" value="${S.settings.dipExtra[2]}"><span class="help">Suggested on top of your regular amount, invested only in the ETFs that dropped</span></label>
        <label class="field">Dip alert: below 52-week high by (%)<input type="number" step="any" data-st="ddAlert" value="${st.ddAlert}"><span class="help">0 = off. Also works for ETFs you don't own yet.</span></label>
        <label class="check"><input type="checkbox" data-st="tpOn" ${st.tpOn ? 'checked' : ''}> Trim (sell) signals</label>
        <label class="field">Trim when price above avg by (%)<input type="number" step="any" data-st="tp" value="${st.tp}"></label>
        <label class="check"><input type="checkbox" data-st="tpNeedsOverweight" ${st.tpNeedsOverweight ? 'checked' : ''}> …only if also overweight (recommended)</label>
        <label class="field">Rebalance band: absolute (pp)<input type="number" step="any" data-st="absBand" value="${st.absBand}"></label>
        <label class="field">Rebalance band: relative (%)<input type="number" step="any" data-st="relBand" value="${st.relBand}"><span class="help">5/25 rule: 5 pp or 25% of target</span></label>
      </div>
    </div>
    <div class="card section"><h2>Fees</h2>
      <div class="form-grid">
        <label class="field">Fee model<select data-set="feeModel"><option value="ibkr-tiered" ${s.feeModel === 'ibkr-tiered' ? 'selected' : ''}>IBKR Pro Tiered (≈0.05%, min €1.25 + exch.)</option><option value="ibkr-fixed" ${s.feeModel === 'ibkr-fixed' ? 'selected' : ''}>IBKR Pro Fixed (0.05%, min €3)</option><option value="custom" ${s.feeModel === 'custom' ? 'selected' : ''}>Custom</option></select></label>
        <label class="field">Custom fee (%)<input type="number" step="any" data-set="feePct" value="${s.feePct}"></label>
        <label class="field">Custom minimum (EUR)<input type="number" step="any" data-set="feeMin" value="${s.feeMin}"></label>
        <label class="field">Minimum order size (EUR)<input type="number" step="any" data-set="minOrder" value="${s.minOrder}"><span class="help">Plan won't open orders smaller than this</span></label>
      </div>
    </div>
    <div class="card section"><h2>Dividends &amp; tax</h2>
      <div class="form-grid">
        <label class="check"><input type="checkbox" data-set="autoDividends" ${s.autoDividends ? 'checked' : ''}> Detect dividends automatically</label>
        <label class="check"><input type="checkbox" data-set="autoConfirmDividends" ${s.autoConfirmDividends ? 'checked' : ''}> Auto-confirm (skip review)</label>
        <label class="field">Greek dividend tax rate (%)<input type="number" step="any" data-set="divTaxRate" value="${s.divTaxRate}"></label>
      </div>
    </div>
    <div class="card section"><h2>Live data</h2>
      <div class="form-grid">
        <label class="field span2">Price source<select data-set="provider">
          <option value="proxy" ${s.provider === 'proxy' ? 'selected' : ''}>Yahoo Finance via my proxy (proxy.php or Cloudflare Worker), recommended</option>
          <option value="public" ${s.provider === 'public' ? 'selected' : ''}>Yahoo Finance via public CORS proxy (for testing)</option>
          <option value="direct" ${s.provider === 'direct' ? 'selected' : ''}>Yahoo Finance direct (needs a CORS browser extension)</option>
          <option value="manual" ${s.provider === 'manual' ? 'selected' : ''}>Manual prices only</option></select></label>
        <label class="field span2">My proxy URL<input type="text" data-set="proxyUrl" value="${esc(s.proxyUrl)}" placeholder="proxy.php or https://xxx.workers.dev/"><span class="help">"proxy.php" works when the app is hosted on a server with PHP</span></label>
        <label class="field span2">Public proxy template<input type="text" data-set="publicProxy" value="${esc(s.publicProxy)}"><span class="help">{url} is replaced by the Yahoo URL. Free proxies can be slow or go offline.</span></label>
        <label class="field">Auto-refresh every (minutes)<input type="number" min="0" data-set="refreshMin" value="${s.refreshMin}"><span class="help">0 = off</span></label>
        <div class="field"><span class="small muted">&nbsp;</span><button class="btn" data-action="testData">Test connection</button></div>
      </div>
      <h3 style="margin-top:14px">Fallback FX rates (1 EUR = …)</h3>
      <div class="form-grid">${CURRENCIES.filter(c => c !== 'EUR').map(c => `<label class="field">${c} <span class="muted">${C.fx && C.fx.rates && C.fx.rates[c] ? `(live ${nf(C.fx.rates[c], 4)})` : ''}</span><input type="number" step="any" data-fx="${c}" value="${s.manualFx[c]}"></label>`).join('')}</div>
    </div>
    <div class="card section"><h2>Notifications</h2>
      <label class="check"><input type="checkbox" id="notifChk" ${s.notifications ? 'checked' : ''}> Browser notifications for new buy-more / trim signals (while the app is open in a tab)</label>
    </div>
    <div class="card section"><h2>Sync between computers</h2>
      <p class="small muted">Your data lives in this browser. To use the same portfolio on your work and home laptop, either upload <b>sync.php</b> to your web hosting (PHP) and set the same key on both computers, or use Export / Import below.</p>
      <div class="form-grid">
        <label class="field span2">Sync URL<input type="text" data-set="syncUrl" value="${esc(s.syncUrl)}" placeholder="sync.php or https://your-site/portfolio/sync.php"></label>
        <label class="field">Sync key (same as in sync.php)<input type="password" data-set="syncKey" value="${esc(s.syncKey)}" autocomplete="off"></label>
        <label class="check"><input type="checkbox" data-set="autoSync" ${s.autoSync ? 'checked' : ''}> Auto-sync on every change</label>
      </div>
      <div class="btn-row" style="margin-top:10px"><button class="btn" data-action="syncPush">⇧ Save to server</button><button class="btn" data-action="syncPull">⇩ Load from server</button><span class="muted small">${syncMeta.at ? `Last sync: ${new Date(syncMeta.at).toLocaleString()} (${syncMeta.dir})` : 'Never synced'}</span></div>
    </div>
    <div class="card section"><h2>Backup</h2>
      <div class="btn-row"><button class="btn" data-action="exportJSON">Export backup (JSON)</button><button class="btn" data-action="importJSON">Import backup</button><button class="btn" data-action="exportCSV">Export transactions (CSV)</button><button class="btn danger" data-action="resetAll">Delete all data</button></div>
      <p class="small muted">Version ${APP_VERSION} · ${S.transactions.length} transactions · last change ${new Date(S.updatedAt).toLocaleString()}</p>
    </div>`;

  $$('[data-set]', el).forEach(inp => inp.addEventListener(inp.type === 'range' ? 'input' : 'change', e => {
    const k = inp.dataset.set;
    const v = inp.type === 'checkbox' ? inp.checked : (inp.type === 'number' || inp.type === 'range') ? num(inp.value) : inp.value.trim();
    S.settings[k] = v;
    if (k === 'dividendShare') { $('#dsLbl').textContent = `${v}% dividend · ${100 - v}% growth`; if (e.type === 'input') { save(); return; } }
    if (k === 'refreshMin') setupAutoRefresh();
    save(); invalidate(); renderTop();
  }));
  $$('[data-st]', el).forEach(inp => inp.addEventListener('change', () => {
    const [k, idx] = inp.dataset.st.split('.');
    const v = inp.type === 'checkbox' ? inp.checked : num(inp.value);
    if (idx != null) { st[k] = [...st[k]]; st[k][+idx] = v; } else st[k] = v;
    S.settings.preset = 'custom'; $('#presetSel').value = 'custom';
    save(); invalidate();
  }));
  $$('[data-dx]', el).forEach(inp => inp.addEventListener('change', () => { S.settings.dipExtra[+inp.dataset.dx] = Math.max(0, num(inp.value)); save(); }));
  $$('[data-fx]', el).forEach(inp => inp.addEventListener('change', () => { S.settings.manualFx[inp.dataset.fx] = num(inp.value); save(); invalidate(); }));
  $('#riskSel').addEventListener('change', e => {
    if (e.target.value === 'custom') return;
    applyProfile(e.target.value); renderSettings(); toast(`Risk profile: ${RISK_PROFILES[e.target.value].label}. Your next buy plan uses the new targets.`);
  });
  $('#presetSel').addEventListener('change', e => {
    const k = e.target.value; S.settings.preset = k;
    if (PRESETS[k]) { const p = PRESETS[k]; S.settings.strategy = { ...p, dip: [...p.dip], tilt: [...p.tilt] }; delete S.settings.strategy.label; }
    save(); invalidate(); renderSettings();
  });
  $('#notifChk').addEventListener('change', async e => {
    if (e.target.checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { e.target.checked = false; toast('Notifications were blocked by the browser. They need the app to be served over https.'); }
    }
    S.settings.notifications = e.target.checked; save();
  });
}

/* ---------------------------------------------------------------- modals: transactions */
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); const f = $('#modalBox input, #modalBox select'); if (f) f.focus(); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalBox').innerHTML = ''; }

function openTxForm(t = {}) {
  const isNew = !t.id;
  const tx = { date: todayISO(), type: 'buy', currency: 'EUR', fxRate: 1, ...t };
  if (tx.productId && !t.currency) { const p = prod(tx.productId); if (p) tx.currency = p.currency; }
  const prodOpts = S.products.map(p => `<option value="${p.id}" ${tx.productId === p.id ? 'selected' : ''}>${esc(p.ibkr)} · ${esc(p.name)}</option>`).join('');
  const curOpts = sel => CURRENCIES.map(c => `<option ${sel === c ? 'selected' : ''}>${c}</option>`).join('');
  openModal(`
    <h2>${isNew ? 'Add' : 'Edit'} transaction</h2>
    <form id="txForm" class="form-grid" autocomplete="off">
      <label class="field">Type<select name="type">${Object.entries(TX_TYPES).map(([k, v]) => `<option value="${k}" ${tx.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">Date<input type="date" name="date" value="${tx.date}" required></label>
      <label class="field span2 f-prod">ETF<select name="productId"><option value="">—</option>${prodOpts}</select></label>
      <label class="field f-trade">Quantity (shares)<input type="number" step="any" min="0" name="qty" value="${tx.qty ?? ''}"></label>
      <label class="field f-trade">Price per share<input type="number" step="any" min="0" name="price" value="${tx.price ?? ''}"></label>
      <label class="field f-amount">Amount<input type="number" step="any" name="amount" value="${tx.amount ?? ''}"><span class="help f-divhelp">Gross dividend (before tax)</span></label>
      <label class="field f-div">Tax withheld at source<input type="number" step="any" min="0" name="withholding" value="${tx.withholding ?? ''}"></label>
      <label class="field">Currency<select name="currency">${curOpts(tx.currency)}</select></label>
      <label class="field f-fee">Commission / fee<input type="number" step="any" min="0" name="fee" value="${tx.fee ?? ''}"></label>
      <label class="field f-fx2">To currency<select name="toCurrency">${curOpts(tx.toCurrency || 'USD')}</select></label>
      <label class="field f-fx2">Amount received<input type="number" step="any" min="0" name="toAmount" value="${tx.toAmount ?? ''}"></label>
      <label class="field f-rate">FX rate: 1 EUR = <span class="cur-l">${esc(tx.currency)}</span><input type="number" step="any" min="0" name="fxRate" value="${tx.fxRate ?? 1}"><span class="help"><a href="#" id="fetchFx">Get ECB rate for this date</a></span></label>
      <label class="field span2">Note<input type="text" name="note" value="${esc(tx.note || '')}"></label>
      <label class="check span2 f-div"><input type="checkbox" name="pending" ${tx.status === 'pending' ? 'checked' : ''}> Pending (not yet confirmed)</label>
    </form>
    <div class="calc" id="txCalc"></div>
    <div class="modal-foot">${isNew ? '' : '<button class="btn danger" data-action="delTx" data-id="' + tx.id + '">Delete</button>'}<button class="btn" data-action="closeModal">Cancel</button><button class="btn primary" id="txSave">Save</button></div>`);
  const f = $('#txForm');
  const val = n => f.elements[n].value;
  const update = () => {
    const type = val('type');
    const show = (sel, on) => $$(sel, f).forEach(x => x.classList.toggle('hidden', !on));
    show('.f-prod', ['buy', 'sell', 'dividend'].includes(type));
    show('.f-trade', ['buy', 'sell'].includes(type));
    show('.f-amount', !['buy', 'sell'].includes(type));
    show('.f-div', type === 'dividend');
    show('.f-divhelp', type === 'dividend');
    show('.f-fee', ['buy', 'sell'].includes(type));
    show('.f-fx2', type === 'fx');
    $('.cur-l', f).textContent = val('currency');
    const rateInp = f.elements.fxRate;
    if (val('currency') === 'EUR') { rateInp.value = 1; rateInp.disabled = true; } else rateInp.disabled = false;
    const fx = num(rateInp.value) || 1, cur = val('currency');
    let txt = '';
    if (['buy', 'sell'].includes(type)) {
      const g = num(val('qty')) * num(val('price')), fee = num(val('fee'));
      const tot = type === 'buy' ? g + fee : g - fee;
      txt = `${type === 'buy' ? 'Total cost' : 'Net proceeds'}: <b>${money(tot, cur)}</b>${cur !== 'EUR' ? ` = <b>${money(tot / fx)}</b>` : ''}${type === 'buy' && g ? ` · fee ${pct(fee / g, 2)}` : ''}`;
    } else if (type === 'dividend') {
      const net = num(val('amount')) - num(val('withholding'));
      txt = `Net received: <b>${money(net, cur)}</b>${cur !== 'EUR' ? ` = <b>${money(net / fx)}</b>` : ''} · Greek tax est. ${money(Math.max(0, num(val('amount')) / fx * num(S.settings.divTaxRate) / 100 - num(val('withholding')) / fx))}`;
    } else if (type === 'fx') {
      const a = num(val('amount')), b = num(val('toAmount'));
      txt = a && b ? `Effective rate: 1 ${cur} = ${nf(b / a, 5)} ${val('toCurrency')}` : '';
    } else txt = cur !== 'EUR' ? `= <b>${money(num(val('amount')) / fx)}</b>` : '';
    $('#txCalc').innerHTML = txt || '&nbsp;';
  };
  const fetchRate = async () => {
    const cur = val('currency'); if (cur === 'EUR') return;
    $('#txCalc').textContent = 'Fetching ECB rate…';
    try { f.elements.fxRate.value = await fxOnDate(cur, val('date')); } catch { f.elements.fxRate.value = round(fxRate(cur), 5); toast('Could not fetch the ECB rate; using the current rate.'); }
    update();
  };
  f.addEventListener('input', update);
  f.elements.productId.addEventListener('change', () => { const p = prod(val('productId')); if (p) { f.elements.currency.value = p.currency; if (p.currency !== 'EUR') fetchRate(); } update(); });
  f.elements.currency.addEventListener('change', fetchRate);
  f.elements.date.addEventListener('change', () => { if (val('currency') !== 'EUR') fetchRate(); });
  $('#fetchFx').addEventListener('click', e => { e.preventDefault(); fetchRate(); });
  if (isNew && tx.currency !== 'EUR' && !t.fxRate) fetchRate();
  update();
  $('#txSave').addEventListener('click', () => {
    const type = val('type');
    const out = { ...(isNew ? { id: uid(), created: Date.now() } : S.transactions.find(x => x.id === tx.id)) };
    Object.assign(out, { type, date: val('date'), currency: val('currency'), fxRate: val('currency') === 'EUR' ? 1 : num(val('fxRate')), note: val('note').trim() });
    if (['buy', 'sell', 'dividend'].includes(type)) out.productId = val('productId'); else delete out.productId;
    if (['buy', 'sell'].includes(type)) { out.qty = num(val('qty')); out.price = num(val('price')); out.fee = num(val('fee')); delete out.amount; }
    else { out.amount = num(val('amount')); delete out.qty; delete out.price; delete out.fee; }
    if (type === 'dividend') { out.withholding = num(val('withholding')); out.status = f.elements.pending.checked ? 'pending' : 'confirmed'; } else { delete out.withholding; delete out.status; }
    if (type === 'fx') { out.toCurrency = val('toCurrency'); out.toAmount = num(val('toAmount')); } else { delete out.toCurrency; delete out.toAmount; }
    // Validation
    if (!out.date) return toast('Please enter a date.');
    if (['buy', 'sell', 'dividend'].includes(type) && !out.productId) return toast('Please choose the ETF.');
    if (['buy', 'sell'].includes(type) && (!(out.qty > 0) || !(out.price > 0))) return toast('Quantity and price must be greater than 0.');
    if (type === 'sell') {
      const held = qtyBefore(out.productId, addDays(out.date, 1));
      if (isNew && out.qty > held + 1e-9) return toast(`You only hold ${nf(held, 4)} shares on that date.`);
    }
    if (!['buy', 'sell'].includes(type) && !(out.amount > 0)) return toast('Amount must be greater than 0.');
    if (out.currency !== 'EUR' && !(out.fxRate > 0)) return toast('Please enter the FX rate.');
    if (isNew) S.transactions.push(out); else S.transactions[S.transactions.findIndex(x => x.id === tx.id)] = out;
    save(); closeModal(); invalidate(); render();
    toast(isNew ? 'Transaction saved.' : 'Transaction updated.');
  });
}

/* ---------------------------------------------------------------- modals: products */
function openProductForm(p = {}) {
  const isNew = !p.id;
  const x = { type: 'growth', policy: 'Acc', currency: 'EUR', weight: 10, ter: 0.2, expReturn: 7, wht: 0, active: true, ...p };
  openModal(`
    <h2>${isNew ? 'Add' : 'Edit'} ETF</h2>
    <form id="pForm" class="form-grid" autocomplete="off">
      <label class="field span2">Name<input name="name" value="${esc(x.name || '')}" required></label>
      <label class="field">ISIN<input name="isin" value="${esc(x.isin || '')}" placeholder="IE00…"></label>
      <label class="field">IBKR symbol<input name="ibkr" value="${esc(x.ibkr || '')}" placeholder="VWCE"></label>
      <label class="field">Exchange<input name="exchange" value="${esc(x.exchange || '')}" placeholder="Xetra (IBIS)"></label>
      <label class="field">Yahoo symbol<input name="yahoo" value="${esc(x.yahoo || '')}" placeholder="VWCE.DE"><span class="help">.DE Xetra · .AS Amsterdam · .MI Milan · .L London · .OL Oslo</span></label>
      <label class="field">Trading currency<select name="currency">${CURRENCIES.map(c => `<option ${x.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Sleeve<select name="type"><option value="growth" ${x.type !== 'dividend' ? 'selected' : ''}>Growth</option><option value="dividend" ${x.type === 'dividend' ? 'selected' : ''}>Dividend</option></select></label>
      <label class="field">Distribution<select name="policy"><option ${x.policy === 'Acc' ? 'selected' : ''}>Acc</option><option ${x.policy === 'Dist' ? 'selected' : ''}>Dist</option></select></label>
      <label class="field">Weight inside sleeve<input type="number" step="any" min="0" name="weight" value="${x.weight}"></label>
      <label class="field">TER (%)<input type="number" step="any" min="0" name="ter" value="${x.ter}"></label>
      <label class="field">Expected return (%/yr)<input type="number" step="any" name="expReturn" value="${x.expReturn}"></label>
      <label class="field">Dividend withholding (%)<input type="number" step="any" min="0" name="wht" value="${x.wht}"><span class="help">0 for Irish ETFs</span></label>
      <label class="field">Manual price<input type="number" step="any" min="0" name="manualPrice" value="${x.manualPrice ?? ''}"><span class="help">Used if live data is unavailable</span></label>
      <label class="field span2">Note<input name="note" value="${esc(x.note || '')}"></label>
      <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Active (part of target allocation)</label>
    </form>
    <div class="calc" id="pTest">&nbsp;</div>
    <div class="modal-foot">${isNew ? '' : `<button class="btn danger" data-action="delProduct" data-id="${x.id}">Delete</button>`}<button class="btn" id="pTestBtn">Test Yahoo symbol</button><button class="btn" data-action="closeModal">Cancel</button><button class="btn primary" id="pSave">Save</button></div>`);
  const f = $('#pForm');
  $('#pTestBtn').addEventListener('click', async () => {
    const sym = f.elements.yahoo.value.trim(); if (!sym) return;
    $('#pTest').textContent = 'Loading…';
    try { const d = await fetchChart(sym, '1d', '15m'); $('#pTest').innerHTML = `✓ <b>${esc(d.meta.name)}</b> · ${esc(d.meta.exchange)} · ${money(d.meta.price, d.meta.currency || 'EUR')}`; if (d.meta.currency && CURRENCIES.includes(d.meta.currency)) f.elements.currency.value = d.meta.currency; if (!f.elements.name.value && d.meta.name) f.elements.name.value = d.meta.name; }
    catch (e) { $('#pTest').textContent = `✗ ${e.message}. Check the symbol or the data source in Settings.`; }
  });
  $('#pSave').addEventListener('click', () => {
    const v = n => f.elements[n].value.trim();
    const out = isNew ? { id: uid(), color: nextColor() } : prod(x.id);
    Object.assign(out, { name: v('name'), isin: v('isin').toUpperCase(), ibkr: v('ibkr').toUpperCase(), exchange: v('exchange'), yahoo: v('yahoo').toUpperCase(), currency: v('currency'), type: v('type'), policy: v('policy'), weight: num(v('weight')), ter: num(v('ter')), expReturn: num(v('expReturn')), wht: num(v('wht')), manualPrice: v('manualPrice') ? num(v('manualPrice')) : null, note: v('note'), active: f.elements.active.checked });
    if (!out.name || !out.ibkr) return toast('Name and IBKR symbol are required.');
    if (isNew) S.products.push(out);
    save(); closeModal(); invalidate(); render();
    if (isNew && out.yahoo) refreshAll();
  });
}
function nextColor() { const used = new Set(S.products.map(p => p.color)); for (let i = 0; i < 8; i++) if (!used.has(i)) return i; return 8; }

/* ---------------------------------------------------------------- import / export */
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function parseCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function exportCSV() {
  const head = ['date', 'type', 'symbol', 'isin', 'quantity', 'price', 'amount', 'withholding', 'currency', 'fee', 'fx_rate', 'to_currency', 'to_amount', 'status', 'note'];
  const lines = [head.join(',')];
  for (const t of sortedTx()) {
    const p = prod(t.productId);
    lines.push([t.date, t.type, p ? p.ibkr : '', p ? p.isin : '', t.qty ?? '', t.price ?? '', t.amount ?? '', t.withholding ?? '', t.currency, t.fee ?? '', t.fxRate ?? 1, t.toCurrency ?? '', t.toAmount ?? '', t.status ?? '', t.note ?? ''].map(csvCell).join(','));
  }
  download(`etf-transactions-${todayISO()}.csv`, lines.join('\n'), 'text/csv');
}
function findOrCreateProduct(symbol, isin, currency, created) {
  const sym = (symbol || '').toUpperCase();
  let p = S.products.find(x => (isin && x.isin === isin) || (sym && x.ibkr.toUpperCase() === sym));
  if (!p && sym) {
    p = { id: uid(), name: sym, isin: isin || '', ibkr: sym, exchange: '', yahoo: '', currency: currency || 'EUR', type: 'growth', policy: 'Acc', weight: 0, ter: 0, expReturn: 7, wht: 0, color: nextColor(), active: false, note: 'Created by import. Set the Yahoo symbol, sleeve and weight.' };
    S.products.push(p); created.push(sym);
  }
  return p;
}
async function importCSVText(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return toast('Empty file.');
  const created = [], newTx = [];
  const isIBKR = lines.some(l => /^(Trades|Dividends|Statement),Header,/.test(l));
  const dup = t => S.transactions.concat(newTx).some(x => x.type === t.type && x.date === t.date && x.productId === t.productId && Math.abs(num(x.qty) - num(t.qty)) < 1e-6 && Math.abs(num(x.price) - num(t.price)) < 1e-6 && Math.abs(num(x.amount) - num(t.amount)) < 0.005);
  if (isIBKR) {
    const headers = {};
    const wht = [];
    for (const line of lines) {
      const c = parseCSVLine(line);
      const [section, kind] = c;
      if (kind === 'Header') { headers[section] = c.slice(2); continue; }
      if (kind !== 'Data' || !headers[section]) continue;
      const row = Object.fromEntries(headers[section].map((h, i) => [h, c[i + 2]]));
      if (section === 'Trades') {
        if ((row.DataDiscriminator && row.DataDiscriminator !== 'Order') || (row['Asset Category'] && !/Stock|ETF/i.test(row['Asset Category']))) continue;
        const q = num(row.Quantity); if (!q) continue;
        const p = findOrCreateProduct(row.Symbol, '', row.Currency, created);
        const t = { id: uid(), created: Date.now(), date: (row['Date/Time'] || '').slice(0, 10), type: q > 0 ? 'buy' : 'sell', productId: p.id, qty: Math.abs(q), price: num(row['T. Price']), fee: Math.abs(num(row['Comm/Fee'] || row['Comm in EUR'])), currency: row.Currency, fxRate: row.Currency === 'EUR' ? 1 : null, note: 'Imported from IBKR' };
        if (!dup(t)) newTx.push(t);
      } else if (section === 'Dividends') {
        if (!row.Currency || /^Total/i.test(row.Currency)) continue;
        const m = (row.Description || '').match(/^([A-Z0-9.]+)\s*\(([A-Z0-9]{12})\)/);
        if (!m) continue;
        const p = findOrCreateProduct(m[1], m[2], row.Currency, created);
        const t = { id: uid(), created: Date.now(), date: row.Date, type: 'dividend', productId: p.id, amount: num(row.Amount), withholding: 0, currency: row.Currency, fxRate: row.Currency === 'EUR' ? 1 : null, status: 'confirmed', note: 'Imported from IBKR: ' + row.Description };
        if (t.amount > 0 && !dup(t)) newTx.push(t);
      } else if (section === 'Withholding Tax') {
        if (!row.Currency || /^Total/i.test(row.Currency)) continue;
        const m = (row.Description || '').match(/^([A-Z0-9.]+)\s*\(([A-Z0-9]{12})\)/);
        if (m) wht.push({ isin: m[2], sym: m[1], date: row.Date, amount: Math.abs(num(row.Amount)) });
      } else if (section === 'Deposits & Withdrawals') {
        if (!row.Currency || /^Total/i.test(row.Currency)) continue;
        const a = num(row.Amount); if (!a) continue;
        const t = { id: uid(), created: Date.now(), date: row['Settle Date'] || row.Date, type: a > 0 ? 'deposit' : 'withdrawal', amount: Math.abs(a), currency: row.Currency, fxRate: row.Currency === 'EUR' ? 1 : null, note: 'Imported from IBKR' };
        if (!dup(t)) newTx.push(t);
      }
    }
    for (const w of wht) {
      const d = newTx.find(t => t.type === 'dividend' && t.date === w.date && prod(t.productId) && (prod(t.productId).isin === w.isin || prod(t.productId).ibkr === w.sym));
      if (d) d.withholding = round(num(d.withholding) + w.amount, 2);
    }
  } else {
    const head = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const idx = n => head.indexOf(n);
    if (idx('date') < 0 || idx('type') < 0) return toast('CSV needs at least "date" and "type" columns (see Export CSV for the format).');
    for (const line of lines.slice(1)) {
      const c = parseCSVLine(line); const g = n => (idx(n) >= 0 ? (c[idx(n)] || '').trim() : '');
      const type = g('type').toLowerCase(); if (!TX_TYPES[type]) continue;
      const p = ['buy', 'sell', 'dividend'].includes(type) ? findOrCreateProduct(g('symbol'), g('isin'), g('currency'), created) : null;
      const t = { id: uid(), created: Date.now(), date: g('date').slice(0, 10), type, currency: g('currency') || 'EUR', fxRate: num(g('fx_rate')) || (g('currency') === 'EUR' || !g('currency') ? 1 : null), note: g('note') };
      if (p) t.productId = p.id;
      if (['buy', 'sell'].includes(type)) { t.qty = Math.abs(num(g('quantity'))); t.price = num(g('price')); t.fee = Math.abs(num(g('fee'))); }
      else t.amount = Math.abs(num(g('amount')));
      if (type === 'dividend') { t.withholding = Math.abs(num(g('withholding'))); t.status = g('status') || 'confirmed'; }
      if (type === 'fx') { t.toCurrency = g('to_currency'); t.toAmount = num(g('to_amount')); }
      if (!dup(t)) newTx.push(t);
    }
  }
  // Fill missing FX rates with ECB rates of the transaction date
  const missing = newTx.filter(t => !t.fxRate);
  if (missing.length) toast(`Fetching ECB rates for ${missing.length} non-EUR transaction(s)…`);
  for (const t of missing) { try { t.fxRate = await fxOnDate(t.currency, t.date); } catch { t.fxRate = round(fxRate(t.currency), 5); t.note = (t.note || '') + ' (FX: current rate, please check)'; } }
  S.transactions.push(...newTx);
  save(); invalidate(); render();
  toast(`Imported ${newTx.length} transaction(s).${created.length ? ` New ETFs created: ${created.join(', ')}. Complete their details in ETFs & targets.` : ''}`, 8000);
}
function pickFile(accept, cb) {
  const inp = $('#fileInput');
  inp.accept = accept; inp.value = '';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => cb(String(rd.result)); rd.readAsText(f); };
  inp.click();
}

/* ---------------------------------------------------------------- sync */
async function syncPush(silent = false) {
  const s = S.settings;
  if (!s.syncUrl || !s.syncKey) { if (!silent) toast('Set the sync URL and key first.'); return; }
  try {
    const r = await fetch(s.syncUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': s.syncKey }, body: JSON.stringify(S) });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 ? ' (wrong key?)' : ''}`);
    storageSet(LS_SYNC, JSON.stringify({ at: Date.now(), dir: 'saved', updatedAt: S.updatedAt }));
    if (!silent) toast('Saved to server.');
  } catch (e) { toast('Sync failed: ' + e.message); }
}
async function syncPull(opts = {}) {
  const s = S.settings;
  if (!s.syncUrl || !s.syncKey) { if (!opts.silent) toast('Set the sync URL and key first.'); return; }
  try {
    const j = await fetchJSON(s.syncUrl, { headers: { 'X-Sync-Key': s.syncKey } });
    if (j.empty) { if (!opts.silent) toast('Nothing stored on the server yet. Use "Save to server" first.'); return; }
    if (!Array.isArray(j.transactions)) throw new Error('Invalid data');
    if (opts.onlyIfNewer && !(j.updatedAt > S.updatedAt)) return;
    if (!opts.onlyIfNewer && !confirm(`Replace the data in this browser with the server copy (last changed ${new Date(j.updatedAt).toLocaleString()}, ${j.transactions.length} transactions)?`)) return;
    const keep = { syncUrl: s.syncUrl, syncKey: s.syncKey, autoSync: s.autoSync };
    S = normalizeState(j); Object.assign(S.settings, keep);
    storageSet(LS_KEY, JSON.stringify(S));
    storageSet(LS_SYNC, JSON.stringify({ at: Date.now(), dir: 'loaded', updatedAt: S.updatedAt }));
    invalidate(); render(); toast('Loaded portfolio from server.');
  } catch (e) { if (!opts.silent) toast('Sync failed: ' + e.message); }
}

/* ---------------------------------------------------------------- demo data */
function loadDemo() {
  if (S.transactions.length && !confirm('Add demo transactions to your existing data?')) return;
  const d = n => addDays(todayISO(), -n);
  const mk = (days, pid, qty, price, fee = 1.25) => ({ id: uid(), created: Date.now() + days, date: d(days), type: 'buy', productId: pid, qty, price, fee, currency: 'EUR', fxRate: 1, note: 'Demo' });
  S.transactions.push(
    { id: uid(), created: Date.now(), date: d(400), type: 'deposit', amount: 8000, currency: 'EUR', fxRate: 1, note: 'Demo' },
    mk(400, 'vwce', 20, 105.4), mk(390, 'vhyl', 15, 60.2), mk(360, 'xnas', 25, 38.1), mk(300, 'spyw', 30, 23.8),
    mk(250, 'vwce', 6, 112.0), mk(200, 'iusn', 60, 6.4), mk(150, 'spyd', 10, 64.5), mk(120, 'vwce', 4, 121.3), mk(60, 'xnas', 8, 44.0),
    { id: uid(), created: Date.now(), date: d(100), type: 'dividend', productId: 'vhyl', amount: 11.4, withholding: 0, currency: 'EUR', fxRate: 1, status: 'confirmed', note: 'Demo' },
  );
  S.products.forEach(p => { if (!p.manualPrice) p.manualPrice = { vwce: 128.4, xnas: 46.2, iusn: 6.9, vhyl: 66.1, spyw: 25.9, spyd: 66.8 }[p.id] || null; });
  save(); invalidate(); render(); toast('Demo data loaded. Delete it any time in Settings → Delete all data.');
}

/* ---------------------------------------------------------------- actions */
const actions = {
  refresh: () => refreshAll({ forceHistory: false }),
  goto: d => switchTab(d.tab),
  theme: () => {
    const root = document.documentElement; const cur = root.dataset.theme || 'auto';
    const next = cur === 'auto' ? 'dark' : cur === 'dark' ? 'light' : 'auto';
    if (next === 'auto') delete root.dataset.theme; else root.dataset.theme = next;
    storageSet('etfp.theme', next); toast(`Theme: ${next}`); render();
  },
  addTx: d => openTxForm(d.type ? { type: d.type } : {}),
  editTx: d => { const t = S.transactions.find(x => x.id === d.id); if (t) openTxForm({ ...t }); },
  delTx: d => {
    const t = S.transactions.find(x => x.id === d.id); if (!t) return;
    if (!confirm(`Delete this ${TX_TYPES[t.type]} of ${t.date}?`)) return;
    if (t.auto && t.divKey) S.dismissedDivs.push(t.divKey);
    S.transactions = S.transactions.filter(x => x.id !== d.id); save(); closeModal(); invalidate(); render();
  },
  confirmAllDivs: () => { const n = S.transactions.filter(t => t.status === 'pending').length; if (!confirm(`Confirm all ${n} pending dividend(s) as received?`)) return; S.transactions.forEach(t => { if (t.status === 'pending') t.status = 'confirmed'; }); save(); render(); },
  confirmTx: d => { const t = S.transactions.find(x => x.id === d.id); if (t) { t.status = 'confirmed'; save(); render(); } },
  dismissDiv: d => { const t = S.transactions.find(x => x.id === d.id); if (!t) return; if (t.divKey) S.dismissedDivs.push(t.divKey); S.transactions = S.transactions.filter(x => x.id !== d.id); save(); invalidate(); render(); },
  closeModal,
  recordPlanItem: d => { const p = prod(d.id); openTxForm({ type: 'buy', productId: d.id, qty: num(d.shares), price: round(num(d.price), 4), currency: p.currency, fee: round(estimateFee(num(d.shares) * num(d.price) / fxRate(p.currency)) * fxRate(p.currency), 2), fxRate: round(fxRate(p.currency), 5), note: 'Buy plan' }); },
  recordAllPlan: () => {
    const pb = planBudget();
    const plan = buildPlan(pb.budget, pb.dip);
    const buys = plan.items.filter(i => i.shares > 0);
    if (!confirm(`Record ${buys.length} purchase(s) at the current prices? You can edit each one afterwards with the real fill price.`)) return;
    for (const i of buys) S.transactions.push({ id: uid(), created: Date.now(), date: todayISO(), type: 'buy', productId: i.p.id, qty: i.shares, price: round(i.priceLocal, 4), fee: round(estimateFee(i.shares * i.priceEUR) * fxRate(i.p.currency), 2), currency: i.p.currency, fxRate: round(fxRate(i.p.currency), 5), note: 'Buy plan (est. price, edit with real fill)' });
    planRegularOverride = planExtraOverride = planDipOverride = null; save(); invalidate(); render(); toast('Purchases recorded. Edit them in Transactions if fill prices differ.');
  },
  recordDeposit: () => { const b = planBudget(); openTxForm({ type: 'deposit', amount: b.regular + b.extra + b.dip, currency: 'EUR', note: `${freq().adj} deposit` }); },
  recordTrim: d => { const p = prod(d.id); openTxForm({ type: 'sell', productId: d.id, qty: num(d.shares), price: round(num(d.price), 4), currency: p.currency, fee: round(estimateFee(num(d.shares) * num(d.price) / fxRate(p.currency)) * fxRate(p.currency), 2), fxRate: round(fxRate(p.currency), 5), note: 'Rebalance trim' }); },
  addProduct: () => openProductForm(),
  editProduct: d => { const p = prod(d.id); if (p) openProductForm({ ...p }); },
  delProduct: d => {
    if (S.transactions.some(t => t.productId === d.id)) { toast('This ETF has transactions. Set it to inactive instead (untick "Active").'); return; }
    if (!confirm('Delete this ETF?')) return;
    S.products = S.products.filter(p => p.id !== d.id); save(); closeModal(); invalidate(); render();
  },
  resetProducts: () => {
    if (!confirm('Restore the recommended model portfolio? ETFs you added stay but become inactive; the default ETFs get their default weights back.')) return;
    S.products.forEach(p => { if (!DEFAULT_PRODUCTS.some(d => d.id === p.id)) p.active = false; });
    for (const d of DEFAULT_PRODUCTS) { const ex = prod(d.id); if (ex) Object.assign(ex, { ...d, manualPrice: ex.manualPrice }); else S.products.push({ ...d }); }
    save(); invalidate(); render(); refreshAll();
  },
  testData: async () => {
    toast('Testing VWCE.DE…');
    try { const d = await fetchChart('VWCE.DE', '1d', '15m'); toast(`✓ Works: ${d.meta.name || 'VWCE'} = ${money(d.meta.price, d.meta.currency || 'EUR')}`); }
    catch (e) { toast(`✗ Failed: ${e.message}. See README for proxy setup.`, 8000); }
  },
  exportJSON: () => download(`etf-portfolio-backup-${todayISO()}.json`, JSON.stringify(S, null, 1), 'application/json'),
  importJSON: () => pickFile('.json,application/json', txt => {
    try {
      const j = JSON.parse(txt); if (!Array.isArray(j.transactions)) throw new Error('not a backup file');
      if (!confirm(`Replace ALL current data with this backup (${j.transactions.length} transactions)?`)) return;
      S = normalizeState(j); save(); invalidate(); render(); toast('Backup restored.');
    } catch (e) { toast('Import failed: ' + e.message); }
  }),
  exportCSV,
  importCSV: () => pickFile('.csv,text/csv', txt => importCSVText(txt)),
  exportTax: () => {
    const { realizedByTx } = computeHoldings();
    const rows = [['date', 'type', 'etf', 'isin', 'currency', 'gross_original', 'fx_rate_1EUR', 'gross_eur', 'withheld_eur', 'gain_eur', 'greek_tax_est_eur']];
    for (const t of sortedTx().filter(t => t.date.startsWith(taxYear) && ['dividend', 'sell', 'interest'].includes(t.type))) {
      const p = prod(t.productId); const fx = num(t.fxRate) || 1;
      const g = t.type === 'sell' ? num(t.qty) * num(t.price) : num(t.amount);
      const w = num(t.withholding) / fx;
      rows.push([t.date, t.type, p ? p.ibkr : '', p ? p.isin : '', t.currency, round(g, 2), fx, round(g / fx, 2), round(w, 2), t.type === 'sell' && realizedByTx[t.id] ? round(realizedByTx[t.id].gainEUR, 2) : '', t.type === 'dividend' ? round(greekDivTaxEUR(t), 2) : '']);
    }
    download(`tax-report-${taxYear}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  },
  syncPush: () => syncPush(false),
  syncPull: () => syncPull({}),
  resetAll: () => {
    if (!confirm('Delete ALL transactions, ETFs and settings in this browser? Export a backup first if unsure.')) return;
    if (!confirm('Are you sure? This cannot be undone.')) return;
    S = defaultState(); C = { quotes: {}, history: {}, fx: null, fxSeries: null }; save({ noSync: true }); saveCache(); invalidate(); render();
  },
  loadDemo,
};

function switchTab(tab) {
  currentTab = tab;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('main .tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  try { history.replaceState(null, '', '#' + tab); } catch { /* file:// */ }
  render();
  window.scrollTo({ top: 0 });
}

let refreshTimer = null;
function setupAutoRefresh() {
  clearInterval(refreshTimer);
  const m = num(S.settings.refreshMin);
  if (m > 0) refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, m * 60000);
}

/* ---------------------------------------------------------------- init */
function init() {
  const th = storageGet('etfp.theme');
  if (th === 'dark' || th === 'light') document.documentElement.dataset.theme = th;
  document.addEventListener('click', e => {
    const tabBtn = e.target.closest('#tabs button');
    if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }
    const a = e.target.closest('[data-action]');
    if (a && actions[a.dataset.action]) { e.preventDefault(); actions[a.dataset.action](a.dataset, a, e); }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
  const hash = location.hash.replace('#', '');
  if (hash && $('#tab-' + hash)) currentTab = hash;
  switchTab(currentTab);
  setupAutoRefresh();
  (async () => {
    if (S.settings.autoSync && S.settings.syncUrl && S.settings.syncKey) await syncPull({ onlyIfNewer: true, silent: true });
    refreshAll();
  })();
}
init();
