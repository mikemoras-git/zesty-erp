/**
 * Zesty ERP — Sidebar Navigation v3
 * Add <script src="erp-nav.js"></script> to each HTML file.
 */
(function () {

  var MODULES = [
    { url: 'index.html',           icon: '🏠', label: 'Home' },
    { url: 'owners-crm.html',      icon: '👤', label: 'Owners' },
    { url: 'properties-db.html',   icon: '🏠', label: 'Properties' },
    { url: 'guests-crm.html',      icon: '✈️',  label: 'Guests' },
    { url: 'cleaning-system.html', icon: '🧹', label: 'Cleaning' },
    { url: 'contacts-crm.html',    icon: '📋', label: 'Contacts' },
    { url: 'employees.html',       icon: '👥', label: 'Staff' },
    { url: 'leave.html',           icon: '🏖️', label: 'Leave' },
    { url: 'tasks.html',           icon: '✅', label: 'Tasks' },
    { url: 'jobs.html',            icon: '🔧', label: 'Job Orders' },
    { url: 'laundry.html',         icon: '👔', label: 'Laundry ERP' },
    { url: 'onboarding.html',      icon: '📋', label: 'Onboarding' },
    { url: 'settings.html',        icon: '⚙️', label: 'Settings' },
    { url: 'tickets.html',         icon: '🎫', label: 'Tickets' },
  ];

  var MODULE_SECTIONS = {
    'laundry.html': [
      { label: '📊 Dashboard',  fn: "showPage('dashboard')" },
      { label: '👥 Customers',  fn: "showPage('customers')" },
      { label: '📋 Orders',     fn: "showPage('orders')" },
      { label: '💰 Receipts',   fn: "showPage('receipts')" },
      { label: '📈 Reports',    fn: "showPage('reports')" },
      { label: '💲 Pricelists', fn: "showPage('pricelists')" },
      { label: '⚙️ Settings',   fn: "showPage('settings')" },
    ],
    'jobs.html': [
      { label: '📋 All Jobs',    fn: "setFilter('status','')" },
      { label: '🔓 Open',        fn: "setFilter('status','Open')" },
      { label: '⚙️ In Progress', fn: "setFilter('status','In Progress')" },
      { label: '✅ Completed',   fn: "setFilter('status','Completed')" },
      { label: '⚠️ Unpaid',      fn: "setFilter('paid','unpaid')" },
    ],
  };

  var SUPA_URL = 'https://whuytfjwdjjepayeiohj.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';

  function currentPage() {
    var p = window.location.pathname;
    return p.substring(p.lastIndexOf('/') + 1) || 'index.html';
  }

  function injectCSS() {
    var style = document.createElement('style');
    style.id = 'zesty-nav-css';
    var css = [
      '#zesty-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:899}',
      '#zesty-overlay.open{display:block}',
      '#zesty-sidebar{position:fixed;top:0;left:0;bottom:0;width:210px;z-index:900;',
        'background:linear-gradient(180deg,#0a3d36 0%,#0d4a42 100%);',
        'display:flex;flex-direction:column;',
        'box-shadow:3px 0 20px rgba(0,0,0,.35);',
        'font-family:\'DM Sans\',sans-serif;',
        'transition:transform .28s cubic-bezier(.4,0,.2,1);',
        'overflow-y:auto;overflow-x:hidden;',
        'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}',
      '#zesty-sidebar::-webkit-scrollbar{width:3px}',
      '#zesty-sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12)}',
      '.zs-brand{padding:18px 16px 14px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}',
      '.zs-brand-name{font-family:\'Cormorant Garamond\',serif;font-size:20px;font-weight:600;color:#fff;line-height:1}',
      '.zs-brand-name span{color:#e8c97a}',
      '.zs-brand-sub{font-size:9px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:2px;margin-top:3px}',
      '.zs-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.25);padding:10px 16px 4px}',
      '.zs-link{display:flex;align-items:center;gap:9px;padding:8px 16px;',
        'color:rgba(255,255,255,.6);text-decoration:none;',
        'font-size:13px;font-weight:500;',
        'border-left:3px solid transparent;',
        'transition:all .14s;cursor:pointer;',
        '-webkit-tap-highlight-color:transparent}',
      '.zs-link:hover{color:#fff;background:rgba(255,255,255,.07);border-left-color:rgba(255,255,255,.2)}',
      '.zs-link.active{color:#e8c97a;background:rgba(201,168,76,.12);border-left-color:#e8c97a;font-weight:600}',
      '.zs-icon{font-size:14px;width:18px;text-align:center;flex-shrink:0}',
      '.zs-divider{height:1px;background:rgba(255,255,255,.06);margin:6px 12px}',
      '.zs-sub{display:flex;align-items:center;padding:6px 16px 6px 28px;',
        'color:rgba(255,255,255,.45);font-size:12px;font-weight:500;',
        'border-left:3px solid transparent;transition:all .14s;cursor:pointer;',
        'background:none;border-right:none;border-top:none;border-bottom:none;',
        'width:100%;text-align:left;font-family:\'DM Sans\',sans-serif;',
        '-webkit-tap-highlight-color:transparent}',
      '.zs-sub:hover{color:#fff;background:rgba(255,255,255,.06)}',
      '.zs-sub.active{color:#c9a84c;border-left-color:#c9a84c;font-weight:600}',
      '.zs-footer{padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;margin-top:auto}',
      '.zs-user{font-size:11px;color:rgba(255,255,255,.4);display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.zs-user button{background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);',
        'font-size:10px;padding:2px 7px;border-radius:4px;cursor:pointer;font-family:\'DM Sans\',sans-serif}',
      '.zs-sync{display:flex;align-items:center;gap:5px;margin-top:6px;font-size:10px;color:rgba(255,255,255,.25)}',
      '.zs-dot{width:6px;height:6px;border-radius:50%;background:#27ae60;flex-shrink:0}',
      '#zesty-hamburger{display:none;position:fixed;top:10px;left:10px;z-index:901;',
        'background:#0a3d36;border:1px solid rgba(255,255,255,.2);color:#fff;',
        'font-size:20px;padding:5px 10px;border-radius:7px;cursor:pointer;',
        'box-shadow:0 2px 8px rgba(0,0,0,.3);-webkit-tap-highlight-color:transparent}',
      'body{margin-left:210px !important}',
      'header{display:none !important}',
      '#zesty-ticket-btn{position:fixed;bottom:20px;right:20px;width:46px;height:46px;',
        'background:#c9a84c;color:#0a3d36;border:none;border-radius:50%;',
        'font-size:20px;cursor:pointer;z-index:800;',
        'box-shadow:0 4px 16px rgba(0,0,0,.25);',
        'display:flex;align-items:center;justify-content:center;',
        'transition:transform .2s;-webkit-tap-highlight-color:transparent}',
      '#zesty-ticket-btn:hover{transform:scale(1.1)}',
      '#zt-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:950;align-items:center;justify-content:center}',
      '#zt-overlay.open{display:flex}',
      '#zt-modal{background:#fff;border-radius:16px;padding:26px;width:90%;max-width:460px;font-family:\'DM Sans\',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
      '#zt-modal h2{font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#115950;margin-bottom:4px}',
      '#zt-modal .zt-sub{font-size:12px;color:#6b7e7b;margin-bottom:16px}',
      '.zt-types{display:flex;gap:8px;margin-bottom:14px}',
      '.zt-type{flex:1;padding:8px;border-radius:8px;border:2px solid #d4e0de;background:#fff;',
        'font-size:12px;font-weight:600;cursor:pointer;font-family:\'DM Sans\',sans-serif;',
        'transition:all .15s;text-align:center}',
      '.zt-type.sel{border-color:#c9a84c;background:#fdf6e3;color:#0a3d36}',
      '.zt-type.bug.sel{border-color:#c0392b;background:#fdf0ef;color:#c0392b}',
      '.zt-type.idea.sel{border-color:#27ae60;background:#eafaf1;color:#1e8449}',
      '#zt-text{width:100%;height:90px;padding:10px 12px;border:1px solid #d4e0de;border-radius:8px;',
        'font-family:\'DM Sans\',sans-serif;font-size:13px;resize:none;outline:none;margin-bottom:14px}',
      '#zt-text:focus{border-color:#1a7a6e}',
      '.zt-foot{display:flex;gap:10px;justify-content:flex-end}',
      '.zt-btn{padding:8px 18px;border-radius:8px;border:none;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:600;cursor:pointer}',
      '.zt-cancel{background:#f0f4f3;color:#6b7e7b}',
      '.zt-submit{background:#c9a84c;color:#0a3d36}',
      '.zt-submit:hover{background:#e8c97a}',
      '@media(max-width:900px){body{margin-left:0 !important}',
        '#zesty-sidebar{transform:translateX(-100%)}',
        '#zesty-sidebar.open{transform:translateX(0)}',
        '#zesty-hamburger{display:block}}',
    ].join('');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildSidebar() {
    var cur = currentPage();
    var secs = MODULE_SECTIONS[cur] || [];

    var links = MODULES.map(function(m) {
      var active = (m.url === cur) ? ' active' : '';
      return '<a href="' + m.url + '" class="zs-link' + active + '">' +
             '<span class="zs-icon">' + m.icon + '</span>' + m.label + '</a>';
    }).join('');

    var subsHtml = '';
    if (secs.length) {
      subsHtml = '<div class="zs-divider"></div><div class="zs-lbl">Sections</div>' +
        secs.map(function(s) {
          return '<button class="zs-sub" onclick="' + s.fn + '">' + s.label + '</button>';
        }).join('');
    }

    return '<div class="zs-brand">' +
             '<div class="zs-brand-name">Zesty <span>ERP</span></div>' +
             '<div class="zs-brand-sub">Kissamos · Operations</div>' +
           '</div>' +
           '<div class="zs-lbl">Modules</div>' +
           links +
           subsHtml +
           '<div class="zs-footer">' +
             '<div class="zs-user" id="zsUser">👤 Loading...</div>' +
             '<div class="zs-sync"><span class="zs-dot" id="zsDot"></span><span id="zsSync">Connected</span></div>' +
           '</div>';
  }

  function buildTicketBtn() {
    return '<button id="zesty-ticket-btn" title="Submit feedback" onclick="zsOpenTicket()">🎫</button>' +
      '<div id="zt-overlay">' +
        '<div id="zt-modal">' +
          '<h2>📝 Feedback</h2>' +
          '<div class="zt-sub" id="zt-loc"></div>' +
          '<div class="zt-types">' +
            '<button class="zt-type bug sel" onclick="zsType(\'bug\',this)">🐛 Bug</button>' +
            '<button class="zt-type" onclick="zsType(\'improvement\',this)">⚡ Improvement</button>' +
            '<button class="zt-type idea" onclick="zsType(\'idea\',this)">💡 Idea</button>' +
          '</div>' +
          '<textarea id="zt-text" placeholder="Describe the issue or idea..."></textarea>' +
          '<div class="zt-foot">' +
            '<button class="zt-btn zt-cancel" onclick="zsCloseTicket()">Cancel</button>' +
            '<button class="zt-btn zt-submit" onclick="zsSubmit()">Submit</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function init() {
    injectCSS();

    var overlay = document.createElement('div');
    overlay.id = 'zesty-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.prepend(overlay);

    var sidebar = document.createElement('aside');
    sidebar.id = 'zesty-sidebar';
    sidebar.innerHTML = buildSidebar();
    document.body.prepend(sidebar);

    var burger = document.createElement('button');
    burger.id = 'zesty-hamburger';
    burger.innerHTML = '&#9776;';
    burger.addEventListener('click', toggleSidebar);
    document.body.prepend(burger);

    // Ticket button
    var ticketWrap = document.createElement('div');
    ticketWrap.innerHTML = buildTicketBtn();
    document.body.appendChild(ticketWrap.firstChild);
    document.body.appendChild(ticketWrap.firstChild);

    // Watch for Azure user badge
    var obs = new MutationObserver(function() {
      var badge = document.getElementById('_azure_badge');
      var zsUser = document.getElementById('zsUser');
      if (badge && zsUser) {
        var nameEl = badge.querySelector('span');
        if (nameEl) {
          var name = nameEl.textContent.replace(/^👤\s*/,'').trim();
          window._erpUserName = name;
          zsUser.innerHTML = '<span>👤 ' + name + '</span>' +
            '<button onclick="window._azureLogout&&window._azureLogout()" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);font-size:10px;padding:2px 7px;border-radius:4px;cursor:pointer;font-family:DM Sans,sans-serif;margin-left:4px">Sign out</button>';
        }
        badge.style.display = 'none';
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Poll for sync dot and username
    var syncInterval = setInterval(function() {
      var dot = document.getElementById('syncDot');
      var zsDot = document.getElementById('zsDot');
      var zsSync = document.getElementById('zsSync');
      if (dot && zsDot) {
        var mirror = function() {
          var cls = dot.className || '';
          if (cls.indexOf('error') > -1) { zsDot.style.background='#e74c3c'; if(zsSync) zsSync.textContent='Error'; }
          else if (cls.indexOf('syncing') > -1) { zsDot.style.background='#c9a84c'; if(zsSync) zsSync.textContent='Saving...'; }
          else { zsDot.style.background='#27ae60'; if(zsSync) zsSync.textContent='Connected'; }
        };
        mirror();
        new MutationObserver(mirror).observe(dot, {attributes:true});
      }
      var zsUser = document.getElementById('zsUser');
      if (zsUser && window._erpUserName && zsUser.textContent.indexOf('Loading') > -1) {
        zsUser.innerHTML = '<span>👤 ' + window._erpUserName + '</span>' +
          '<button onclick="window._azureLogout&&window._azureLogout()" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);font-size:10px;padding:2px 7px;border-radius:4px;cursor:pointer;font-family:DM Sans,sans-serif;margin-left:4px">Sign out</button>';
      }
    }, 800);
  }

  function toggleSidebar() {
    document.getElementById('zesty-sidebar').classList.toggle('open');
    document.getElementById('zesty-overlay').classList.toggle('open');
  }
  function closeSidebar() {
    document.getElementById('zesty-sidebar').classList.remove('open');
    document.getElementById('zesty-overlay').classList.remove('open');
  }

  // Ticket system
  var _ztType = 'bug';
  window.zsOpenTicket = function() {
    var page = currentPage();
    var loc = document.getElementById('zt-loc');
    if (loc) loc.textContent = '📍 ' + page;
    var txt = document.getElementById('zt-text');
    if (txt) txt.value = '';
    _ztType = 'bug';
    var types = document.querySelectorAll('.zt-type');
    types.forEach(function(b) { b.classList.remove('sel'); });
    var first = document.querySelector('.zt-type.bug');
    if (first) first.classList.add('sel');
    var ov = document.getElementById('zt-overlay');
    if (ov) { ov.classList.add('open'); setTimeout(function(){ var t=document.getElementById('zt-text'); if(t)t.focus(); },100); }
  };
  window.zsCloseTicket = function() {
    var ov = document.getElementById('zt-overlay');
    if (ov) ov.classList.remove('open');
  };
  window.zsType = function(type, btn) {
    _ztType = type;
    document.querySelectorAll('.zt-type').forEach(function(b){ b.classList.remove('sel'); });
    btn.classList.add('sel');
  };
  window.zsSubmit = async function() {
    var txt = document.getElementById('zt-text');
    if (!txt || !txt.value.trim()) { if(txt) txt.style.borderColor='#e74c3c'; return; }
    var ticket = {
      id: 'TK-' + Date.now(),
      type: _ztType,
      page: currentPage(),
      text: txt.value.trim(),
      status: 'open',
      created_by: window._erpUserName || 'Unknown',
      created_at: new Date().toISOString()
    };
    window.zsCloseTicket();
    var btn = document.getElementById('zesty-ticket-btn');
    if (btn) btn.textContent = '⏳';
    try {
      await fetch(SUPA_URL + '/rest/v1/tickets', {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(ticket)
      });
      if (btn) { btn.textContent = '✓'; btn.style.background = '#27ae60'; }
    } catch(e) {
      if (btn) { btn.textContent = '!'; btn.style.background = '#e74c3c'; }
    }
    setTimeout(function() { if(btn){ btn.textContent='🎫'; btn.style.background='#c9a84c'; } }, 2500);
  };

  // Close ticket modal on overlay click
  document.addEventListener('click', function(e) {
    var ov = document.getElementById('zt-overlay');
    if (e.target === ov) window.zsCloseTicket();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
