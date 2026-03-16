/**
 * Zesty ERP — Unified Sidebar Navigation
 * Single JS file injected into every page. No HTML changes needed.
 */
(function() {

  const MODULES = [
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

  const MODULE_SECTIONS = {
    'laundry.html': [
      { label: '📊 Dashboard',  action: "showPage('dashboard')" },
      { label: '👥 Customers',  action: "showPage('customers')" },
      { label: '📋 Orders',     action: "showPage('orders')" },
      { label: '💰 Receipts',   action: "showPage('receipts')" },
      { label: '📈 Reports',    action: "showPage('reports')" },
      { label: '💲 Pricelists', action: "showPage('pricelists')" },
      { label: '⚙️ Settings',   action: "showPage('settings')" },
    ],
    'jobs.html': [
      { label: '📋 All Jobs',    action: "setFilter('status','')" },
      { label: '🔓 Open',        action: "setFilter('status','Open')" },
      { label: '⚙️ In Progress', action: "setFilter('status','In Progress')" },
      { label: '✅ Completed',   action: "setFilter('status','Completed')" },
      { label: '⚠️ Unpaid',      action: "setFilter('paid','unpaid')" },
    ],
  };

  // Pages that have their OWN full-width sticky <header> we need to hide
  const PAGES_WITH_OWN_HEADER = [
    'cleaning-system.html',
    'laundry.html',
    'onboarding.html',
  ];

  const CSS = `
    #zesty-overlay {
      display:none; position:fixed; inset:0;
      background:rgba(0,0,0,.5); z-index:899;
    }
    #zesty-overlay.open { display:block; }

    #zesty-sidebar {
      position:fixed; top:0; left:0; bottom:0; width:210px;
      z-index:900;
      background:linear-gradient(180deg,#0a3d36 0%,#0d4a42 100%);
      display:flex; flex-direction:column;
      box-shadow:3px 0 20px rgba(0,0,0,.35);
      font-family:'DM Sans',sans-serif;
      transition:transform .28s cubic-bezier(.4,0,.2,1);
      overflow-y:auto; overflow-x:hidden;
      scrollbar-width:thin;
      scrollbar-color:rgba(255,255,255,.1) transparent;
    }
    #zesty-sidebar::-webkit-scrollbar { width:3px; }
    #zesty-sidebar::-webkit-scrollbar-thumb { background:rgba(255,255,255,.12); }

    .zs-brand { padding:18px 16px 14px; border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0; }
    .zs-brand-name { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:600; color:#fff; line-height:1; }
    .zs-brand-name span { color:#e8c97a; }
    .zs-brand-sub { font-size:9px; color:rgba(255,255,255,.3); text-transform:uppercase; letter-spacing:2px; margin-top:3px; }

    .zs-lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,.25); padding:10px 16px 4px; }

    .zs-link {
      display:flex; align-items:center; gap:9px; padding:8px 16px;
      color:rgba(255,255,255,.6); text-decoration:none;
      font-size:13px; font-weight:500;
      border-left:3px solid transparent;
      transition:all .14s; cursor:pointer;
      -webkit-tap-highlight-color:transparent;
    }
    .zs-link:hover { color:#fff; background:rgba(255,255,255,.07); border-left-color:rgba(255,255,255,.2); }
    .zs-link.active { color:#e8c97a; background:rgba(201,168,76,.12); border-left-color:#e8c97a; font-weight:600; }
    .zs-link .zs-icon { font-size:14px; width:18px; text-align:center; flex-shrink:0; }

    .zs-divider { height:1px; background:rgba(255,255,255,.06); margin:6px 12px; }

    .zs-sub { display:flex; align-items:center; padding:6px 16px 6px 28px; color:rgba(255,255,255,.45); font-size:12px; font-weight:500; border-left:3px solid transparent; transition:all .14s; cursor:pointer; background:none; border-right:none; border-top:none; border-bottom:none; width:100%; text-align:left; font-family:'DM Sans',sans-serif; -webkit-tap-highlight-color:transparent; }
    .zs-sub:hover { color:#fff; background:rgba(255,255,255,.06); }
    .zs-sub.active { color:#c9a84c; border-left-color:#c9a84c; font-weight:600; }

    .zs-footer { padding:12px 16px; border-top:1px solid rgba(255,255,255,.08); flex-shrink:0; margin-top:auto; }
    .zs-user { font-size:11px; color:rgba(255,255,255,.4); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .zs-user button { background:transparent; border:1px solid rgba(255,255,255,.2); color:rgba(255,255,255,.5); font-size:10px; padding:2px 7px; border-radius:4px; cursor:pointer; font-family:'DM Sans',sans-serif; }
    .zs-sync { display:flex; align-items:center; gap:5px; margin-top:6px; font-size:10px; color:rgba(255,255,255,.25); }
    .zs-dot { width:6px; height:6px; border-radius:50%; background:#27ae60; flex-shrink:0; }

    #zesty-hamburger {
      display:none; position:fixed; top:10px; left:10px; z-index:901;
      background:#0a3d36; border:1px solid rgba(255,255,255,.2);
      color:#fff; font-size:20px; padding:5px 10px; border-radius:7px;
      cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3);
      -webkit-tap-highlight-color:transparent;
    }

    /* Push ALL page content right by sidebar width */
    body { margin-left:210px !important; }

    /* Hide all old built-in page headers - sidebar replaces them */
    header { display: none !important; }

    /* Mobile */
    @media (max-width:900px) {
      body { margin-left:0 !important; }
      body.zs-has-own-header > header { left:0 !important; }
      #zesty-sidebar { transform:translateX(-100%); }
      #zesty-sidebar.open { transform:translateX(0); }
      #zesty-hamburger { display:block !important; }
    }
    @media (max-width:600px) {
      #zesty-sidebar { width:185px; }
    }
  `;

  function currentPage() {
    const p = window.location.pathname;
    return p.substring(p.lastIndexOf('/') + 1) || 'index.html';
  }

  function buildSidebar() {
    const cur = currentPage();
    const secs = MODULE_SECTIONS[cur] || [];
    const links = MODULES.map(m => {
      const act = m.url === cur ? ' active' : '';
      return `<a href="${m.url}" class="zs-link${act}"><span class="zs-icon">${m.icon}</span>${m.label}</a>`;
    }).join('');
    const subsHtml = secs.length ? `<div class="zs-divider"></div><div class="zs-lbl">Sections</div>${secs.map(s=>`<button class="zs-sub" onclick="${s.action}">${s.label}</button>`).join('')}` : '';
    return `
      <div class="zs-brand"><div class="zs-brand-name">Zesty <span>ERP</span></div><div class="zs-brand-sub">Kissamos · Operations</div></div>
      <div class="zs-lbl">Modules</div>
      ${links}
      ${subsHtml}
      <div class="zs-footer">
        <div class="zs-user" id="zsUser">👤 Loading...</div>
        <div class="zs-sync"><span class="zs-dot" id="zsDot"></span><span id="zsSync">Connected</span></div>
      </div>`;
  }

  function init() {
    const cur = currentPage();

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Old headers are now hidden globally via CSS

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'zesty-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.prepend(overlay);

    // Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.id = 'zesty-sidebar';
    sidebar.innerHTML = buildSidebar();
    document.body.prepend(sidebar);

    // Create hamburger
    const burger = document.createElement('button');
    burger.id = 'zesty-hamburger';
    burger.innerHTML = '&#9776;';
    burger.setAttribute('aria-label', 'Open menu');
    burger.addEventListener('click', toggleSidebar);
    document.body.prepend(burger);

    // Add ticket button and modal
    document.body.insertAdjacentHTML('beforeend', `
  <!-- TICKET BUTTON -->
  <button id="zesty-ticket-btn" title="Report issue / idea" onclick="zsOpenTicket()">🎫</button>
  <!-- TICKET MODAL -->
  <div id="zesty-ticket-modal-overlay">
    <div id="zesty-ticket-modal">
      <h2>📝 Feedback</h2>
      <div class="tm-sub" id="tm-location"></div>
      <div class="tm-type-row">
        <button class="tm-type-btn bug" onclick="zsSelectType('bug',this)">🐛 Bug</button>
        <button class="tm-type-btn" onclick="zsSelectType('improvement',this)">⚡ Improvement</button>
        <button class="tm-type-btn idea" onclick="zsSelectType('idea',this)">💡 Idea</button>
      </div>
      <textarea id="tm-text" placeholder="Describe the issue or idea..."></textarea>
      <div class="tm-footer">
        <button class="tm-btn cancel" onclick="zsCloseTicket()">Cancel</button>
        <button class="tm-btn submit" onclick="zsSubmitTicket()">Submit</button>
      </div>
    </div>
  </div>
`);

    // Watch for Azure badge and move name to sidebar footer
    const obs = new MutationObserver(() => {
      const badge = document.getElementById('_azure_badge');
      const zsUser = document.getElementById('zsUser');
      if (badge && zsUser) {
        const nameEl = badge.querySelector('span');
        const btnEl = badge.querySelector('button');
        if (nameEl) {
          zsUser.innerHTML = '';
          const nameSpan = document.createElement('span');
          nameSpan.textContent = '👤 ' + nameEl.textContent.replace(/^👤\s*/,'').trim();
          zsUser.appendChild(nameSpan);
          if (btnEl) {
            const newBtn = btnEl.cloneNode(true);
            zsUser.appendChild(newBtn);
          }
        }
        badge.style.display = 'none';
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Mirror sync dot + user badge
    let _syncMirrorActive = false;
    function _mirrorSyncDot() {
      if (_syncMirrorActive) return;
      const dot = document.getElementById('syncDot');
      const zsDot = document.getElementById('zsDot');
      const zsSync = document.getElementById('zsSync');
      if (!dot || !zsDot) return;
      _syncMirrorActive = true;
      const mirror = () => {
        const cls = dot.className || '';
        if (cls.includes('error')) { zsDot.style.background='#e74c3c'; if(zsSync) zsSync.textContent='Error'; }
        else if (cls.includes('syncing')) { zsDot.style.background='#c9a84c'; if(zsSync) zsSync.textContent='Saving...'; }
        else { zsDot.style.background='#27ae60'; if(zsSync) zsSync.textContent='Connected'; }
      };
      mirror();
      new MutationObserver(mirror).observe(dot, { attributes: true, attributeFilter: ['class','title'] });
    }
    // Check periodically for syncDot (laundry creates it late)
    const _syncInterval = setInterval(() => {
      _mirrorSyncDot();
      // Also update user badge if name becomes available
      const zsUser = document.getElementById('zsUser');
      if (zsUser && window._erpUserName && zsUser.textContent.includes('Loading')) {
        zsUser.innerHTML = '<span>👤 ' + window._erpUserName + '</span>' +
          '<button onclick="window._azureLogout&&window._azureLogout()" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);font-size:10px;padding:2px 7px;border-radius:4px;cursor:pointer;font-family:DM Sans,sans-serif;margin-left:4px">Sign out</button>';
      }
      if (_syncMirrorActive && zsUser && !zsUser.textContent.includes('Loading')) {
        clearInterval(_syncInterval);
      }
    }, 500);
  }

  function toggleSidebar() {
    document.getElementById('zesty-sidebar').classList.toggle('open');
    document.getElementById('zesty-overlay').classList.toggle('open');
  }
  function closeSidebar() {
    document.getElementById('zesty-sidebar').classList.remove('open');
    document.getElementById('zesty-overlay').classList.remove('open');
  }


  // ── TICKET SYSTEM ──────────────────────────────────────
  let _zsTicketType = 'bug';
  function zsOpenTicket() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.getElementById('tm-location').textContent = '📍 ' + page;
    document.getElementById('tm-text').value = '';
    _zsTicketType = 'bug';
    document.querySelectorAll('.tm-type-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.tm-type-btn.bug').classList.add('selected');
    document.getElementById('zesty-ticket-modal-overlay').classList.add('open');
    setTimeout(() => document.getElementById('tm-text').focus(), 100);
  }
  function zsCloseTicket() {
    document.getElementById('zesty-ticket-modal-overlay').classList.remove('open');
  }
  function zsSelectType(type, btn) {
    _zsTicketType = type;
    document.querySelectorAll('.tm-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }
  async function zsSubmitTicket() {
    const text = document.getElementById('tm-text').value.trim();
    if (!text) { document.getElementById('tm-text').style.borderColor='#e74c3c'; return; }
    const ticket = {
      id: 'TK-' + Date.now(),
      type: _zsTicketType,
      page: window.location.pathname.split('/').pop() || 'index.html',
      text,
      status: 'open',
      created_by: window._erpUserName || 'Unknown',
      created_at: new Date().toISOString()
    };
    zsCloseTicket();
    const btn = document.getElementById('zesty-ticket-btn');
    btn.textContent = '⏳';
    try {
      const SUPA_URL = 'https://whuytfjwdjjepayeiohj.supabase.co';
      const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXl0Zmp3ZGpqZXBheWVpb2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQxMzQsImV4cCI6MjA4Nzg2MDEzNH0.pTDAqw_Cnzc9D3tJU-tU7Ch5qpapKmteiqI_ooSCufY';
      await fetch(`${SUPA_URL}/rest/v1/tickets`, {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(ticket)
      });
      btn.textContent = '✓';
      btn.style.background = '#27ae60';
    } catch(e) {
      btn.textContent = '!';
      btn.style.background = '#e74c3c';
      console.error('Ticket save failed:', e);
    }
    setTimeout(() => { btn.textContent = '🎫'; btn.style.background = '#c9a84c'; }, 2500);
  }
  // Close on overlay click
  document.getElementById('zesty-ticket-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) zsCloseTicket();
  });

    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
