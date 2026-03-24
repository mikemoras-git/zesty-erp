/**
 * Zesty ERP — Navigation Shell v4
 * Drop <script src="erp-nav.js"></script> at end of <body> on every page.
 * Handles: sidebar, mobile hamburger, ticket floating button, sync indicator.
 */
(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────── */
  var SUPA_URL = 'https://whuytfjwdjjepayeiohj.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';

  var MODULES = [
    { url: 'index.html',           icon: '⬡',  label: 'Dashboard' },
    { url: 'owners-crm.html',      icon: '◈',  label: 'Owners' },
    { url: 'properties-db.html',   icon: '▣',  label: 'Properties' },
    { url: 'guests-crm.html',      icon: '◉',  label: 'Guests' },
    { url: 'cleaning-system.html', icon: '◎',  label: 'Cleaning' },
    { url: 'contacts-crm.html',    icon: '◈',  label: 'Contacts' },
    { url: 'employees.html',       icon: '⬡',  label: 'Staff' },
    { url: 'leave.html',           icon: '◌',  label: 'Leave' },
    { url: 'tasks.html',           icon: '◻',  label: 'Tasks' },
    { url: 'jobs.html',            icon: '◈',  label: 'Job Orders' },
    { url: 'laundry.html',         icon: '◎',  label: 'Laundry' },
    { url: 'onboarding.html',      icon: '▷',  label: 'Onboarding' },
    { url: 'settings.html',        icon: '⚙',  label: 'Settings' },
    { url: 'tickets.html',         icon: '◈',  label: 'Tickets' },
    { url: 'reports.html',         icon: '📊', label: 'Reports' },
  ];

  /* ── UTILS ───────────────────────────────────────────────── */
  function currentPage() {
    var p = window.location.pathname;
    return p.substring(p.lastIndexOf('/') + 1) || 'index.html';
  }

  /* ── CSS ─────────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('zesty-nav-css')) return;
    var style = document.createElement('style');
    style.id = 'zesty-nav-css';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');

      :root {
        --z-teal:#1a7a6e; --z-teal-light:#23a090; --z-teal-dark:#0f4a42; --z-teal-deep:#0a3330;
        --z-gold:#c9a84c; --z-gold-light:#e8c97a; --z-gold-dim:#8a6a1c;
        --z-sidebar-w:220px;
      }

      * { box-sizing: border-box; }

      body { margin-left: var(--z-sidebar-w) !important; overflow-x: auto; }
      /* Main content area scrolls horizontally when content wider than viewport */
      body > *:not(#z-sidebar):not(#z-overlay):not(#z-hamburger):not(#z-ticket-fab):not(#z-ticket-overlay) {
        max-width: calc(100vw - var(--z-sidebar-w));
        overflow-x: auto;
      }
      header { display: none !important; }

      /* ── SIDEBAR ── */
      #z-sidebar {
        position: fixed; top: 0; left: 0; bottom: 0;
        width: var(--z-sidebar-w); z-index: 900;
        background: linear-gradient(175deg, #0a3330 0%, #0d4a41 60%, #0f3d35 100%);
        display: flex; flex-direction: column;
        border-right: 1px solid rgba(255,255,255,0.06);
        box-shadow: 4px 0 30px rgba(0,0,0,0.4);
        font-family: 'DM Sans', sans-serif;
        overflow-y: auto; overflow-x: hidden;
        scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
        transition: transform .26s cubic-bezier(.4,0,.2,1);
      }
      #z-sidebar::-webkit-scrollbar { width: 3px; }
      #z-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

      /* Brand */
      .z-brand {
        padding: 20px 18px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
        flex-shrink: 0;
      }
      .z-brand-name {
        font-family: 'Cormorant Garamond', serif;
        font-size: 21px; font-weight: 600; color: #fff; line-height: 1;
        letter-spacing: 0.3px;
      }
      .z-brand-name span { color: var(--z-gold-light); }
      .z-brand-sub {
        font-size: 9px; color: rgba(255,255,255,0.28);
        text-transform: uppercase; letter-spacing: 2.5px; margin-top: 5px;
        font-family: 'DM Mono', monospace;
      }

      /* Nav section label */
      .z-section-lbl {
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.15em; color: rgba(255,255,255,0.2);
        padding: 12px 18px 4px; margin-top: 2px;
      }

      /* Nav link */
      .z-link {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 18px; color: rgba(255,255,255,0.55);
        text-decoration: none; font-size: 13px; font-weight: 400;
        border-left: 2px solid transparent;
        transition: all .13s; cursor: pointer; white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
        position: relative;
      }
      .z-link:hover {
        color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.05);
        border-left-color: rgba(255,255,255,0.15);
      }
      .z-link.active {
        color: var(--z-gold-light); background: rgba(201,168,76,0.1);
        border-left-color: var(--z-gold); font-weight: 600;
      }
      .z-link-icon {
        font-size: 13px; width: 20px; text-align: center; flex-shrink: 0;
        opacity: 0.7; font-style: normal;
      }
      .z-link.active .z-link-icon { opacity: 1; }

      /* Divider */
      .z-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 6px 14px; }

      /* Footer */
      .z-footer {
        margin-top: auto; padding: 14px 18px;
        border-top: 1px solid rgba(255,255,255,0.07); flex-shrink: 0;
      }
      .z-user { font-size: 11px; color: rgba(255,255,255,0.38); line-height: 1.5; }
      .z-user strong { color: rgba(255,255,255,0.6); display: block; }
      .z-sync {
        display: flex; align-items: center; gap: 5px;
        margin-top: 7px; font-size: 10px; color: rgba(255,255,255,0.22);
        font-family: 'DM Mono', monospace;
      }
      .z-sync-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #27ae60; flex-shrink: 0; transition: background .3s;
      }
      .z-sync-dot.error { background: #e74c3c; }
      .z-sync-dot.syncing { background: var(--z-gold); animation: z-pulse .8s infinite; }
      @keyframes z-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

      /* Overlay */
      #z-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,0.5); z-index: 899;
      }
      #z-overlay.open { display: block; }

      /* Hamburger */
      #z-hamburger {
        display: none; position: fixed; top: 12px; left: 12px; z-index: 901;
        background: var(--z-teal-dark); border: 1px solid rgba(255,255,255,0.2);
        color: #fff; font-size: 18px; padding: 6px 10px; border-radius: 8px;
        cursor: pointer; line-height: 1; box-shadow: 0 2px 10px rgba(0,0,0,0.35);
        -webkit-tap-highlight-color: transparent;
      }

      /* ── TICKET BUTTON ── */
      #z-ticket-fab {
        position: fixed; bottom: 22px; right: 22px;
        width: 44px; height: 44px; border-radius: 50%;
        background: var(--z-gold); color: var(--z-teal-dark);
        border: none; font-size: 18px; cursor: pointer; z-index: 800;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        transition: transform .18s, box-shadow .18s;
        -webkit-tap-highlight-color: transparent;
      }
      #z-ticket-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(0,0,0,0.4); }

      /* ── TICKET MODAL ── */
      #z-ticket-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,0.55); z-index: 950;
        align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      }
      #z-ticket-overlay.open { display: flex; }
      #z-ticket-modal {
        background: #fff; border-radius: 18px; padding: 28px;
        width: 90%; max-width: 460px; font-family: 'DM Sans', sans-serif;
        box-shadow: 0 24px 70px rgba(0,0,0,0.35);
        animation: z-modal-in .2s ease;
      }
      @keyframes z-modal-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      #z-ticket-modal h2 {
        font-family: 'Cormorant Garamond', serif; font-size: 22px;
        color: #0f4a42; margin-bottom: 3px;
      }
      .z-ticket-sub { font-size: 12px; color: #6b7e7b; margin-bottom: 16px; }
      .z-ticket-types { display: flex; gap: 8px; margin-bottom: 14px; }
      .z-ticket-type {
        flex: 1; padding: 9px 6px; border-radius: 9px;
        border: 2px solid #d4e0de; background: #fff;
        font-size: 12px; font-weight: 600; cursor: pointer;
        font-family: 'DM Sans', sans-serif; transition: all .15s; text-align: center;
      }
      .z-ticket-type.sel { border-color: var(--z-gold); background: #fdf6e3; color: #0f4a42; }
      .z-ticket-type.bug.sel { border-color: #c0392b; background: #fdf0ef; color: #c0392b; }
      .z-ticket-type.idea.sel { border-color: #27ae60; background: #eafaf1; color: #1e8449; }
      #z-ticket-text {
        width: 100%; height: 88px; padding: 10px 12px;
        border: 1px solid #d4e0de; border-radius: 9px;
        font-family: 'DM Sans', sans-serif; font-size: 13px;
        resize: none; outline: none; margin-bottom: 14px;
        transition: border-color .15s;
      }
      #z-ticket-text:focus { border-color: #1a7a6e; }
      .z-ticket-foot { display: flex; gap: 10px; justify-content: flex-end; }
      .z-ticket-btn {
        padding: 9px 20px; border-radius: 9px; border: none;
        font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer;
        transition: all .15s;
      }
      .z-ticket-cancel { background: #f0f4f3; color: #6b7e7b; }
      .z-ticket-cancel:hover { background: #e0e8e6; }
      .z-ticket-submit { background: var(--z-gold); color: var(--z-teal-dark); }
      .z-ticket-submit:hover { background: var(--z-gold-light); }

      /* ── RESPONSIVE ── */
      @media (max-width: 900px) {
        body { margin-left: 0 !important; overflow-x: auto; }
        body > *:not(#z-sidebar):not(#z-overlay):not(#z-hamburger):not(#z-ticket-fab):not(#z-ticket-overlay) { max-width: 100vw; overflow-x: auto; }
        #z-sidebar { transform: translateX(-100%); }
        #z-sidebar.open { transform: translateX(0); }
        #z-hamburger { display: flex; align-items: center; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── BUILD ───────────────────────────────────────────────── */
  function buildHTML() {
    var cur = currentPage();

    /* Nav links */
    var links = MODULES.map(function (m) {
      var isActive = m.url === cur;
      return '<a href="' + m.url + '" class="z-link' + (isActive ? ' active' : '') + '">' +
        '<i class="z-link-icon">' + m.icon + '</i>' + m.label + '</a>';
    }).join('');

    return (
      /* Sidebar */
      '<aside id="z-sidebar">' +
        '<div class="z-brand">' +
          '<div class="z-brand-name">Zesty<span>·</span>ERP</div>' +
          '<div class="z-brand-sub">Operations Platform</div>' +
        '</div>' +
        '<div class="z-section-lbl">Modules</div>' +
        links +
        '<div class="z-footer">' +
          '<div class="z-user" id="z-user"><strong>Loading...</strong></div>' +
          '<div class="z-sync"><span class="z-sync-dot" id="z-sync-dot"></span><span id="z-sync-txt">Connected</span></div>' +
        '</div>' +
      '</aside>' +

      /* Overlay */
      '<div id="z-overlay"></div>' +

      /* Hamburger */
      '<button id="z-hamburger" aria-label="Menu">&#9776;</button>' +

      /* Ticket FAB */
      '<button id="z-ticket-fab" title="Report a bug or idea" onclick="zNavOpenTicket()">🎫</button>' +

      /* Ticket modal */
      '<div id="z-ticket-overlay">' +
        '<div id="z-ticket-modal">' +
          '<h2>Submit a Ticket</h2>' +
          '<div class="z-ticket-sub" id="z-ticket-page-lbl"></div>' +
          '<div class="z-ticket-types">' +
            '<button class="z-ticket-type bug sel" onclick="zNavTicketType(\'bug\',this)">🐛 Bug</button>' +
            '<button class="z-ticket-type" onclick="zNavTicketType(\'improvement\',this)">⚡ Improvement</button>' +
            '<button class="z-ticket-type idea" onclick="zNavTicketType(\'idea\',this)">💡 Idea</button>' +
          '</div>' +
          '<textarea id="z-ticket-text" placeholder="Describe the issue or idea..."></textarea>' +
          '<div class="z-ticket-foot">' +
            '<button class="z-ticket-btn z-ticket-cancel" onclick="zNavCloseTicket()">Cancel</button>' +
            '<button class="z-ticket-btn z-ticket-submit" onclick="zNavSubmitTicket()">Submit</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── INIT ────────────────────────────────────────────────── */
  function init() {
    // Skip if this page has its own embedded sidebar already
    if (document.getElementById('erpSidebar') || document.getElementById('z-sidebar')) return;
    injectCSS();

    var wrap = document.createElement('div');
    wrap.innerHTML = buildHTML();
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, document.body.firstChild);

    /* Events */
    document.getElementById('z-hamburger').addEventListener('click', toggleSidebar);
    document.getElementById('z-overlay').addEventListener('click', closeSidebar);
    document.getElementById('z-ticket-overlay').addEventListener('click', function (e) {
      if (e.target === this) zNavCloseTicket();
    });

    /* Watch for Azure user badge */
    var userObs = new MutationObserver(function () {
      var badge = document.getElementById('_azure_badge');
      var zUser = document.getElementById('z-user');
      if (badge && zUser) {
        var span = badge.querySelector('span');
        if (span) {
          var name = span.textContent.replace(/^👤\s*/, '').trim();
          window._erpUserName = name;
          zUser.innerHTML = '<strong>👤 ' + name + '</strong>';
        }
        badge.style.display = 'none';
        userObs.disconnect();
      }
    });
    userObs.observe(document.body, { childList: true, subtree: true });

    /* Sync dot mirror */
    setInterval(function () {
      var dot = document.getElementById('syncDot');
      var zDot = document.getElementById('z-sync-dot');
      var zTxt = document.getElementById('z-sync-txt');
      if (dot && zDot) {
        var cls = dot.className || '';
        if (cls.indexOf('error') > -1) {
          zDot.className = 'z-sync-dot error';
          if (zTxt) zTxt.textContent = 'Error';
        } else if (cls.indexOf('syncing') > -1) {
          zDot.className = 'z-sync-dot syncing';
          if (zTxt) zTxt.textContent = 'Saving…';
        } else {
          zDot.className = 'z-sync-dot';
          if (zTxt) zTxt.textContent = 'Connected';
        }
      }
    }, 600);
  }

  /* ── SIDEBAR TOGGLE ──────────────────────────────────────── */
  function toggleSidebar() {
    document.getElementById('z-sidebar').classList.toggle('open');
    document.getElementById('z-overlay').classList.toggle('open');
  }
  function closeSidebar() {
    document.getElementById('z-sidebar').classList.remove('open');
    document.getElementById('z-overlay').classList.remove('open');
  }

  /* ── TICKET SYSTEM ───────────────────────────────────────── */
  var _ztType = 'bug';

  window.zNavOpenTicket = function () {
    var lbl = document.getElementById('z-ticket-page-lbl');
    if (lbl) lbl.textContent = '📍 ' + currentPage();
    var txt = document.getElementById('z-ticket-text');
    if (txt) txt.value = '';
    _ztType = 'bug';
    document.querySelectorAll('.z-ticket-type').forEach(function (b) { b.classList.remove('sel'); });
    var first = document.querySelector('.z-ticket-type.bug');
    if (first) first.classList.add('sel');
    var ov = document.getElementById('z-ticket-overlay');
    if (ov) {
      ov.classList.add('open');
      setTimeout(function () {
        var t = document.getElementById('z-ticket-text');
        if (t) t.focus();
      }, 120);
    }
  };

  window.zNavCloseTicket = function () {
    var ov = document.getElementById('z-ticket-overlay');
    if (ov) ov.classList.remove('open');
  };

  window.zNavTicketType = function (type, btn) {
    _ztType = type;
    document.querySelectorAll('.z-ticket-type').forEach(function (b) { b.classList.remove('sel'); });
    btn.classList.add('sel');
  };

  window.zNavSubmitTicket = async function () {
    var txt = document.getElementById('z-ticket-text');
    if (!txt || !txt.value.trim()) {
      if (txt) txt.style.borderColor = '#e74c3c';
      return;
    }
    var ticket = {
      id: 'TK-' + Date.now(),
      type: _ztType,
      page: currentPage(),
      text: txt.value.trim(),
      status: 'open',
      created_by: window._erpUserName || 'Unknown',
      created_at: new Date().toISOString()
    };
    zNavCloseTicket();
    var fab = document.getElementById('z-ticket-fab');
    if (fab) fab.textContent = '⏳';
    try {
      var res = await fetch(SUPA_URL + '/rest/v1/tickets', {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(ticket)
      });
      if (fab) { fab.textContent = '✓'; fab.style.background = '#27ae60'; }
    } catch (e) {
      if (fab) { fab.textContent = '!'; fab.style.background = '#e74c3c'; }
    }
    setTimeout(function () {
      if (fab) { fab.textContent = '🎫'; fab.style.background = ''; }
    }, 2500);
  };

  /* ── BOOT ────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
