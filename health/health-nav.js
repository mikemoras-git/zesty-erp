/**
 * Care Log — navigation shell.
 * Include at the end of <body> on every page, after health-base.js.
 */
(function () {
  'use strict';

  var PAGES = [
    { url: 'index.html',    icon: '⬡',  label: 'Overview',   section: 'Daily' },
    { url: 'vitals.html',   icon: '◔',  label: 'Daily Log',  section: null },
    { url: 'calendar.html', icon: '📅', label: 'Calendar',   section: null },
    { url: 'labs.html',     icon: '🧪', label: 'Lab Results',section: 'Records' },
    { url: 'records.html',  icon: '🗂',  label: 'Documents',  section: null },
    { url: 'charts.html',   icon: '📊', label: 'Trends',     section: 'Review' },
    { url: 'reports.html',  icon: '📄', label: 'Reports',    section: null },
    { url: 'settings.html', icon: '⚙',  label: 'Settings',   section: null }
  ];

  function currentPage() {
    var p = window.location.pathname;
    return p.substring(p.lastIndexOf('/') + 1) || 'index.html';
  }

  function build() {
    var cur = currentPage();
    var profile = (typeof getProfile === 'function') ? getProfile() : { name: '' };

    var links = PAGES.map(function (p) {
      var head = p.section ? '<div class="h-section">' + p.section + '</div>' : '';
      return head + '<a href="' + p.url + '" class="h-link' + (p.url === cur ? ' active' : '') + '">' +
        '<i class="h-link-icon">' + p.icon + '</i>' + p.label + '</a>';
    }).join('');

    var patient = profile.name
      ? '<div class="h-patient">' + escapeHtml(profile.name) +
        (profile.diagnosis ? '<small>' + escapeHtml(profile.diagnosis) + '</small>' : '') + '</div>'
      : '<div class="h-patient"><a href="settings.html" style="color:var(--gold-light);text-decoration:none">Set up the patient →</a></div>';

    var since = (typeof daysSinceBackup === 'function') ? daysSinceBackup() : null;
    var stale = since === null || since > 14;
    var backupTxt = since === null ? 'never backed up' : since === 0 ? 'backed up today' : 'backup ' + since + 'd ago';

    return '<aside id="h-sidebar">' +
        '<div class="h-brand">' +
          '<div class="h-brand-name">Care<span>·</span>Log</div>' +
          '<div class="h-brand-sub">Private · This device</div>' +
        '</div>' +
        patient +
        links +
        '<div class="h-foot">' +
          '<div class="h-store"><span class="h-store-dot' + (stale ? ' warn' : '') + '"></span>' +
          '<a href="settings.html" style="color:inherit;text-decoration:none">' + backupTxt + '</a></div>' +
        '</div>' +
      '</aside>' +
      '<div id="h-overlay"></div>' +
      '<button id="h-burger" aria-label="Menu">&#9776;</button>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    if (document.getElementById('h-sidebar')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = build();
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, document.body.firstChild);

    var side = document.getElementById('h-sidebar');
    var over = document.getElementById('h-overlay');
    document.getElementById('h-burger').addEventListener('click', function () {
      side.classList.toggle('open');
      over.classList.toggle('open');
    });
    over.addEventListener('click', function () {
      side.classList.remove('open');
      over.classList.remove('open');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
