/**
 * Care Log — navigation shell.
 * Include at the end of <body>, after health-i18n.js and health-base.js.
 */
(function () {
  'use strict';

  var PAGES = [
    { url: 'index.html',    icon: '⬡',  key: 'nav.overview', section: 'nav.daily' },
    { url: 'vitals.html',   icon: '◔',  key: 'nav.dailyLog', section: null },
    { url: 'calendar.html', icon: '📅', key: 'nav.calendar', section: null },
    { url: 'labs.html',     icon: '🧪', key: 'nav.labs',     section: 'nav.records' },
    { url: 'records.html',  icon: '🗂',  key: 'nav.documents',section: null },
    { url: 'charts.html',   icon: '📊', key: 'nav.trends',   section: 'nav.review' },
    { url: 'reports.html',  icon: '📄', key: 'nav.reports',  section: null },
    { url: 'settings.html', icon: '⚙',  key: 'nav.settings', section: null }
  ];

  function currentPage() {
    var p = window.location.pathname;
    return p.substring(p.lastIndexOf('/') + 1) || 'index.html';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function build() {
    var cur = currentPage();
    var profile = (typeof getProfile === 'function') ? getProfile() : { name: '' };
    var lang = getLang();

    var links = PAGES.map(function (p) {
      var head = p.section ? '<div class="h-section">' + escapeHtml(t(p.section)) + '</div>' : '';
      return head + '<a href="' + p.url + '" class="h-link' + (p.url === cur ? ' active' : '') + '">' +
        '<i class="h-link-icon">' + p.icon + '</i>' + escapeHtml(t(p.key)) + '</a>';
    }).join('');

    var patient = profile.name
      ? '<div class="h-patient">' + escapeHtml(profile.name) +
        (profile.diagnosis ? '<small>' + escapeHtml(profile.diagnosis) + '</small>' : '') + '</div>'
      : '<div class="h-patient"><a href="settings.html" style="color:var(--gold-light);text-decoration:none">' +
        escapeHtml(t('app.setupPatient')) + '</a></div>';

    var since = (typeof daysSinceBackup === 'function') ? daysSinceBackup() : null;
    var stale = since === null || since > 14;
    var backupTxt = since === null ? t('backup.never')
                  : since === 0    ? t('backup.today')
                                   : t('backup.daysAgo', { n: since });

    var langSwitch =
      '<div class="h-lang" role="group" aria-label="' + escapeHtml(t('nav.language')) + '">' +
        '<button class="h-lang-btn' + (lang === 'en' ? ' on' : '') + '" onclick="setLang(\'en\')">EN</button>' +
        '<button class="h-lang-btn' + (lang === 'el' ? ' on' : '') + '" onclick="setLang(\'el\')">ΕΛ</button>' +
      '</div>';

    return '<aside id="h-sidebar">' +
        '<div class="h-brand">' +
          '<div class="h-brand-name">Care<span>·</span>Log</div>' +
          '<div class="h-brand-sub">' + escapeHtml(t('app.tagline')) + '</div>' +
        '</div>' +
        patient +
        links +
        '<div class="h-foot">' +
          langSwitch +
          '<div class="h-store"><span class="h-store-dot' + (stale ? ' warn' : '') + '"></span>' +
          '<a href="settings.html" style="color:inherit;text-decoration:none">' + escapeHtml(backupTxt) + '</a></div>' +
        '</div>' +
      '</aside>' +
      '<div id="h-overlay"></div>' +
      '<button id="h-burger" aria-label="Menu">&#9776;</button>';
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
