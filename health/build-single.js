#!/usr/bin/env node
/**
 * Care Log — single-file build.
 *
 *   node health/build-single.js
 *
 * Compiles the eight pages, the stylesheet and the two libraries into one
 * self-contained CareLog.html that runs from a double-click (file://), with no
 * server, no install and no network. The multi-page version stays the source of
 * truth; re-run this after changing it.
 *
 * Each page keeps its own scope: its script is wrapped in an IIFE that publishes
 * only the handlers its markup calls, so the three functions that share a name
 * across pages (render, renderStats, setRange) no longer collide.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

/* view id ← source file. The order is the sidebar order. */
const VIEWS = [
  { id: 'overview', file: 'index.html',    icon: '⬡',  key: 'nav.overview', section: 'nav.daily' },
  { id: 'vitals',   file: 'vitals.html',   icon: '◔',  key: 'nav.dailyLog' },
  { id: 'calendar', file: 'calendar.html', icon: '📅', key: 'nav.calendar' },
  { id: 'labs',     file: 'labs.html',     icon: '🧪', key: 'nav.labs',     section: 'nav.records' },
  { id: 'records',  file: 'records.html',  icon: '🗂',  key: 'nav.documents' },
  { id: 'charts',   file: 'charts.html',   icon: '📊', key: 'nav.trends',   section: 'nav.review' },
  { id: 'reports',  file: 'reports.html',  icon: '📄', key: 'nav.reports' },
  { id: 'settings', file: 'settings.html', icon: '⚙',  key: 'nav.settings' }
];
const PAGE_TO_VIEW = Object.fromEntries(VIEWS.map(v => [v.file, v.id]));

/* IDs used by more than one page; each gets a per-view prefix. */
const DUPLICATE_IDS = ['chartWeight', 'searchBox', 'statTiles'];

const ON_ATTR = /\son([a-z]+)="([^"]*)"/gi;

function esc(re) { return re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Rewrite page-level identifiers inside inline event handlers to NS.name. */
function namespaceHandlers(text, names, ns, used) {
  return text.replace(ON_ATTR, (whole, evt, body) => {
    let out = body;
    for (const n of names) {
      const re = new RegExp('(?<![.\\w$])' + esc(n) + '(?![\\w$])', 'g');
      if (re.test(out)) {
        used.add(n);
        out = out.replace(re, ns + '.' + n);
      }
    }
    return ' on' + evt + '="' + out + '"';
  });
}

/** Point every cross-page link at the matching view. */
function rewriteLinks(text) {
  for (const [file, view] of Object.entries(PAGE_TO_VIEW)) {
    text = text
      .replace(new RegExp('href="' + esc(file) + '#\\$\\{[^}]*\\}"', 'g'), 'href="#' + view + '"')
      .replace(new RegExp('href="' + esc(file) + '"', 'g'), 'href="#' + view + '"');
  }
  return text;
}

/** Names the page code may legitimately call without a namespace. */
function globalNames() {
  const libs = read('health-base.js') + read('health-i18n.js');
  const set = new Set([...libs.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
  [...libs.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].forEach(m => set.add(m[1]));
  ['document','window','location','event','this','navigator','console','alert',
   'true','false','null','undefined','Math','JSON','Date','Array','Object','String',
   'Number','Boolean','parseInt','parseFloat','isNaN','setTimeout','clearTimeout',
   'URL','Blob','File','FileReader','indexedDB','localStorage','return','new',
   'typeof','delete','void','if','else','for','while'].forEach(n => set.add(n));
  return set;
}

/**
 * Every identifier an inline handler calls must resolve: either it is a shared
 * library global, or it was namespaced. Anything else would be a silent
 * ReferenceError only discovered by a user clicking the button.
 */
function stripInterpolations(str) {
  /* ${...} inside a template literal runs in the surrounding JS scope, not in
     the handler, so its identifiers must not be checked here. */
  let out = '', i = 0;
  while (i < str.length) {
    if (str[i] === '$' && str[i + 1] === '{') {
      let depth = 1; i += 2;
      while (i < str.length && depth) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') depth--;
        i++;
      }
    } else out += str[i++];
  }
  return out;
}

function assertHandlersResolve(view, html, globals, names) {
  const problems = [];
  for (const m of html.matchAll(ON_ATTR)) {
    const body = stripInterpolations(m[2]);
    for (const idm of body.matchAll(/(?<![.\w$'"])([A-Za-z_$][\w$]*)\s*(?=[(.[])/g)) {
      const id = idm[1];
      if (id.startsWith('V_') || globals.has(id)) continue;
      if (names.includes(id)) problems.push(id + ' (declared but not namespaced)');
      else problems.push(id + ' (unresolved)');
    }
  }
  if (problems.length) {
    throw new Error(view + ': inline handlers reference ' + [...new Set(problems)].join(', '));
  }
}

function build() {
  const globals = globalNames();
  const styles = [];
  const sections = [];
  const scripts = [];

  for (const v of VIEWS) {
    const src = read(v.file);

    let style = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
    let body = (src.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1]
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .trim();
    let code = (src.match(/<script>\n([\s\S]*?)<\/script>/) || [, ''])[1];

    /* Per-view prefix for the handful of IDs that appear on several pages. */
    for (const id of DUPLICATE_IDS) {
      if (!new RegExp('\\b' + id + '\\b').test(body + code + style)) continue;
      const renamed = v.id + '_' + id;
      const re = new RegExp('(?<![\\w$-])' + id + '(?![\\w$-])', 'g');
      body = body.replace(re, renamed);
      code = code.replace(re, renamed);
      style = style.replace(re, renamed);
    }

    /* Split the page's own setup off from its render entry point. */
    const parts = code.split('/* ── boot ── */');
    if (parts.length !== 2) throw new Error('missing boot marker in ' + v.file);
    const [decl, boot] = parts;

    const fns  = new Set([...decl.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
    const vars = new Set([...decl.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
    const names = [...fns, ...vars].sort((a, b) => b.length - a.length);   // longest first

    const ns = 'V_' + v.id;
    const used = new Set();
    body = namespaceHandlers(body, names, ns, used);
    const nsCode = namespaceHandlers(decl, names, ns, used);

    /* Functions publish directly; variables go through accessors so a later
       reassignment (impRows = […]) stays visible to the markup. */
    const exports = [...used].map(n => fns.has(n)
      ? `  ${ns}.${n} = ${n};`
      : `  Object.defineProperty(${ns}, '${n}', { get: () => ${n}, set: _v => { ${n} = _v; } });`
    ).join('\n');

    assertHandlersResolve(v.file, body, globals, names);
    assertHandlersResolve(v.file + ' (generated markup)', nsCode, globals, names);

    styles.push(`/* ── ${v.file} ── */\n${style.trim()}`);
    sections.push(`<section class="view" id="view-${v.id}" hidden>\n${rewriteLinks(body)}\n</section>`);
    scripts.push(
`/* ═══ ${v.file} ═══ */
(function () {
  const ${ns} = window.${ns} = {};
${rewriteLinks(nsCode).replace(/^/gm, '  ').trimEnd()}

${exports}

  ${ns}.show = function () {
${rewriteLinks(boot).trim().replace(/^/gm, '    ')}
  };
})();`);
  }

  const nav = VIEWS.map(v =>
    (v.section ? `'<div class="h-section">' + escapeHtml(t('${v.section}')) + '</div>' + ` : '') +
    `'<a href="#${v.id}" class="h-link" data-view="${v.id}"><i class="h-link-icon">${v.icon}</i>' + escapeHtml(t('${v.key}')) + '</a>'`
  ).join(' +\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Care Log</title>
<style>
/* ════════════════════════════════════════════════════════════════
   Care Log — single file. Generated by health/build-single.js;
   edit the pages under health/ and rebuild rather than editing this.
   ════════════════════════════════════════════════════════════════ */
${read('health-style.css')}

.view[hidden] { display: none !important; }

${styles.join('\n\n')}
</style>
</head>
<body>

${sections.join('\n\n')}

<script>
${read('health-i18n.js')}
</script>
<script>
${read('health-base.js')}
</script>
<script>
${scripts.join('\n\n')}
</script>
<script>
/* ═══ shell: sidebar and hash router ═══ */
(function () {
  'use strict';

  var VIEWS = ${JSON.stringify(VIEWS.map(v => v.id))};

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildShell() {
    var profile = getProfile();
    var lang = getLang();

    var patient = profile.name
      ? '<div class="h-patient">' + escapeHtml(profile.name) +
        (profile.diagnosis ? '<small>' + escapeHtml(profile.diagnosis) + '</small>' : '') + '</div>'
      : '<div class="h-patient"><a href="#settings" style="color:var(--gold-light);text-decoration:none">' +
        escapeHtml(t('app.setupPatient')) + '</a></div>';

    var since = daysSinceBackup();
    var stale = since === null || since > 14;
    var backupTxt = since === null ? t('backup.never')
                  : since === 0    ? t('backup.today')
                                   : t('backup.daysAgo', { n: since });

    var html = '<aside id="h-sidebar">' +
        '<div class="h-brand">' +
          '<div class="h-brand-name">Care<span>·</span>Log</div>' +
          '<div class="h-brand-sub">' + escapeHtml(t('app.tagline')) + '</div>' +
        '</div>' +
        patient +
        ${nav} +
        '<div class="h-foot">' +
          '<div class="h-lang">' +
            '<button class="h-lang-btn' + (lang === 'en' ? ' on' : '') + '" onclick="setLang(\\'en\\')">EN</button>' +
            '<button class="h-lang-btn' + (lang === 'el' ? ' on' : '') + '" onclick="setLang(\\'el\\')">ΕΛ</button>' +
          '</div>' +
          '<div class="h-store"><span class="h-store-dot' + (stale ? ' warn' : '') + '"></span>' +
          '<a href="#settings" style="color:inherit;text-decoration:none">' + escapeHtml(backupTxt) + '</a></div>' +
        '</div>' +
      '</aside>' +
      '<div id="h-overlay"></div>' +
      '<button id="h-burger" aria-label="Menu">&#9776;</button>';

    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, document.body.firstChild);

    var side = document.getElementById('h-sidebar');
    var over = document.getElementById('h-overlay');
    document.getElementById('h-burger').addEventListener('click', function () {
      side.classList.toggle('open'); over.classList.toggle('open');
    });
    over.addEventListener('click', function () {
      side.classList.remove('open'); over.classList.remove('open');
    });
  }

  function currentView() {
    var h = (location.hash || '').replace(/^#/, '');
    return VIEWS.indexOf(h) >= 0 ? h : VIEWS[0];
  }

  function route() {
    var view = currentView();
    VIEWS.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.hidden = v !== view;
    });
    document.querySelectorAll('.h-link').forEach(function (a) {
      a.classList.toggle('active', a.dataset.view === view);
    });
    /* Render on show, never before: a chart measured while hidden has no width. */
    var ns = window['V_' + view];
    if (ns && ns.show) ns.show();
    document.title = 'Care Log — ' + t(({
      overview: 'nav.overview', vitals: 'nav.dailyLog', calendar: 'nav.calendar',
      labs: 'nav.labs', records: 'nav.documents', charts: 'nav.trends',
      reports: 'nav.reports', settings: 'nav.settings'
    })[view]);
    document.getElementById('h-sidebar').classList.remove('open');
    document.getElementById('h-overlay').classList.remove('open');
    window.scrollTo(0, 0);
  }

  function start() {
    buildShell();
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>
</body>
</html>
`;
}

const out = build();
const dest = path.join(DIR, '..', 'CareLog.html');
fs.writeFileSync(dest, out, 'utf8');
console.log('CareLog.html — ' + (out.length / 1024).toFixed(0) + ' KB, ' + out.split('\n').length + ' lines');
