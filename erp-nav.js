/**
 * Zesty ERP — Unified Sidebar Navigation
 * Drop this file in your ERP folder and add one <script> tag to each HTML file.
 * It injects the sidebar automatically without touching any existing HTML.
 */
(function() {

  // ── CONFIG ─────────────────────────────────────────────
  const MODULES = [
    { url: 'index.html',          icon: '🏠', label: 'Home' },
    { url: 'owners-crm.html',     icon: '👤', label: 'Owners' },
    { url: 'properties-db.html',  icon: '🏠', label: 'Properties' },
    { url: 'guests-crm.html',     icon: '✈️',  label: 'Guests' },
    { url: 'cleaning-system.html',icon: '🧹', label: 'Cleaning' },
    { url: 'contacts-crm.html',   icon: '📋', label: 'Contacts' },
    { url: 'employees.html',      icon: '👥', label: 'Staff' },
    { url: 'leave.html',          icon: '🏖️', label: 'Leave' },
    { url: 'tasks.html',          icon: '✅', label: 'Tasks' },
    { url: 'jobs.html',           icon: '🔧', label: 'Job Orders' },
    { url: 'laundry.html',        icon: '👔', label: 'Laundry ERP' },
    { url: 'onboarding.html',     icon: '📋', label: 'Onboarding' },
    { url: 'settings.html',       icon: '⚙️', label: 'Settings' },
  ];

  // Module-specific sub-sections shown below the nav
  const MODULE_SECTIONS = {
    'laundry.html': [
      { label: '📊 Dashboard',   action: "showPage('dashboard')" },
      { label: '👥 Customers',   action: "showPage('customers')" },
      { label: '📋 Orders',      action: "showPage('orders')" },
      { label: '💰 Receipts',    action: "showPage('receipts')" },
      { label: '📈 Reports',     action: "showPage('reports')" },
      { label: '💲 Pricelists',  action: "showPage('pricelists')" },
      { label: '⚙️ Settings',    action: "showPage('settings')" },
    ],
    'jobs.html': [
      { label: '📋 All Jobs',    action: "setFilter('status','')" },
      { label: '🔓 Open',        action: "setFilter('status','Open')" },
      { label: '⚙️ In Progress', action: "setFilter('status','In Progress')" },
      { label: '✅ Completed',   action: "setFilter('status','Completed')" },
      { label: '⚠️ Unpaid',      action: "setFilter('paid','unpaid')" },
    ],
  };

  // ── CSS ─────────────────────────────────────────────────
  const CSS = `
    /* ── ZESTY ERP SIDEBAR ── */
    #zesty-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,.5); z-index: 899;
    }
    #zesty-overlay.open { display: block; }

    #zesty-sidebar {
      position: fixed; top: 0; left: 0; bottom: 0;
      width: 210px; z-index: 900;
      background: linear-gradient(180deg, #0a3d36 0%, #0d4a42 100%);
      display: flex; flex-direction: column;
      box-shadow: 3px 0 20px rgba(0,0,0,.35);
      font-family: 'DM Sans', sans-serif;
      transition: transform .28s cubic-bezier(.4,0,.2,1);
      overflow-y: auto; overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.1) transparent;
    }
    #zesty-sidebar::-webkit-scrollbar { width: 3px; }
    #zesty-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); }

    /* brand */
    .zs-brand {
      padding: 18px 16px 14px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      flex-shrink: 0;
    }
    .zs-brand-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 20px; font-weight: 600; color: #fff;
      line-height: 1; letter-spacing: .3px;
    }
    .zs-brand-name span { color: #e8c97a; }
    .zs-brand-sub {
      font-size: 9px; color: rgba(255,255,255,.3);
      text-transform: uppercase; letter-spacing: 2px;
      margin-top: 3px;
    }

    /* section label */
    .zs-section-lbl {
      font-size: 9px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .12em;
      color: rgba(255,255,255,.25);
      padding: 10px 16px 4px;
    }

    /* nav links */
    .zs-link {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 16px;
      color: rgba(255,255,255,.6);
      text-decoration: none;
      font-size: 13px; font-weight: 500;
      border-left: 3px solid transparent;
      transition: all .14s;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .zs-link:hover {
      color: #fff;
      background: rgba(255,255,255,.07);
      border-left-color: rgba(255,255,255,.2);
    }
    .zs-link.active {
      color: #e8c97a;
      background: rgba(201,168,76,.12);
      border-left-color: #e8c97a;
      font-weight: 600;
    }
    .zs-link .zs-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }

    /* sub-section links */
    .zs-sub-link {
      display: flex; align-items: center;
      padding: 6px 16px 6px 28px;
      color: rgba(255,255,255,.45);
      font-size: 12px; font-weight: 500;
      border-left: 3px solid transparent;
      transition: all .14s; cursor: pointer;
      background: none; border-right: none;
      border-top: none; border-bottom: none;
      width: 100%; text-align: left;
      font-family: 'DM Sans', sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    .zs-sub-link:hover { color: #fff; background: rgba(255,255,255,.06); }
    .zs-sub-link.active { color: #c9a84c; border-left-color: #c9a84c; font-weight: 600; }

    /* divider */
    .zs-divider {
      height: 1px; background: rgba(255,255,255,.06);
      margin: 6px 12px;
    }

    /* footer */
    .zs-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255,255,255,.08);
      flex-shrink: 0; margin-top: auto;
    }
    .zs-user {
      font-size: 11px; color: rgba(255,255,255,.4);
      display: flex; align-items: center; gap: 6px;
      flex-wrap: wrap;
    }
    .zs-user button {
      background: transparent;
      border: 1px solid rgba(255,255,255,.2);
      color: rgba(255,255,255,.5); font-size: 10px;
      padding: 2px 7px; border-radius: 4px;
      cursor: pointer; font-family: 'DM Sans', sans-serif;
    }
    .zs-sync {
      display: flex; align-items: center; gap: 5px;
      margin-top: 6px; font-size: 10px;
      color: rgba(255,255,255,.25);
    }
    .zs-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #27ae60; flex-shrink: 0;
    }

    /* hamburger */
    #zesty-hamburger {
      display: none;
      position: fixed; top: 10px; left: 10px;
      z-index: 901;
      background: #0a3d36;
      border: 1px solid rgba(255,255,255,.2);
      color: #fff; font-size: 20px;
      padding: 5px 10px; border-radius: 7px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }

    /* push page content right */
    body { margin-left: 210px !important; }

    /* mobile */
    @media (max-width: 900px) {
      body { margin-left: 0 !important; }
      #zesty-sidebar { transform: translateX(-100%); }
      #zesty-sidebar.open { transform: translateX(0); }
      #zesty-hamburger { display: block !important; }
    }
    @media (max-width: 600px) {
      body { font-size: 13px; }
    }
  `;

  // ── HELPERS ─────────────────────────────────────────────
  function currentPage() {
    const path = window.location.pathname;
    return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
  }

  function buildSidebar() {
    const cur = currentPage();
    const sections = MODULE_SECTIONS[cur] || [];

    // Nav links
    const links = MODULES.map(m => {
      const active = (m.url === cur || (cur === '' && m.url === 'index.html')) ? ' active' : '';
      return `<a href="${m.url}" class="zs-link${active}">
        <span class="zs-icon">${m.icon}</span>${m.label}
      </a>`;
    }).join('');

    // Sub-section links
    const subsHtml = sections.length ? `
      <div class="zs-divider"></div>
      <div class="zs-section-lbl">Sections</div>
      ${sections.map(s => `<button class="zs-sub-link" onclick="${s.action}">${s.label}</button>`).join('')}
    ` : '';

    return `
      <div class="zs-brand">
        <div class="zs-brand-name">Zesty <span>ERP</span></div>
        <div class="zs-brand-sub">Kissamos · Operations</div>
      </div>
      <div class="zs-section-lbl">Modules</div>
      ${links}
      ${subsHtml}
      <div class="zs-footer">
        <div class="zs-user" id="zsUser">👤 Loading...</div>
        <div class="zs-sync">
          <span class="zs-dot" id="zsDot"></span>
          <span id="zsSync">Connected</span>
        </div>
      </div>
    `;
  }

  // ── INJECT ──────────────────────────────────────────────
  function init() {
    // 1. Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 2. Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.id = 'zesty-sidebar';
    sidebar.innerHTML = buildSidebar();
    document.body.prepend(sidebar);

    // 3. Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'zesty-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.prepend(overlay);

    // 4. Create hamburger
    const burger = document.createElement('button');
    burger.id = 'zesty-hamburger';
    burger.textContent = '☰';
    burger.addEventListener('click', toggleSidebar);
    document.body.prepend(burger);

    // 5. Watch for Azure user badge and move it into sidebar
    const obs = new MutationObserver(() => {
      const badge = document.getElementById('_azure_badge');
      const zsUser = document.getElementById('zsUser');
      if (badge && zsUser) {
        // Extract name and sign out button
        const nameEl = badge.querySelector('span');
        const btnEl = badge.querySelector('button');
        if (nameEl) {
          zsUser.innerHTML = `<span>👤 ${nameEl.textContent.replace('👤','').trim()}</span>`;
          if (btnEl) zsUser.appendChild(btnEl.cloneNode(true));
        }
        badge.style.display = 'none';
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // 6. Watch for sync dot
    const syncObs = new MutationObserver(() => {
      const dot = document.getElementById('syncDot');
      const zsDot = document.getElementById('zsDot');
      const zsSync = document.getElementById('zsSync');
      if (dot && zsDot) {
        // Mirror sync state
        const mirrorSync = () => {
          if (dot.classList.contains('error')) {
            zsDot.style.background = '#e74c3c';
            if (zsSync) zsSync.textContent = 'Sync error';
          } else if (dot.classList.contains('syncing')) {
            zsDot.style.background = '#c9a84c';
            if (zsSync) zsSync.textContent = 'Saving...';
          } else {
            zsDot.style.background = '#27ae60';
            if (zsSync) zsSync.textContent = 'Connected';
          }
        };
        mirrorSync();
        new MutationObserver(mirrorSync).observe(dot, { attributes: true });
        syncObs.disconnect();
      }
    });
    syncObs.observe(document.body, { childList: true, subtree: true });
  }

  function toggleSidebar() {
    document.getElementById('zesty-sidebar').classList.toggle('open');
    document.getElementById('zesty-overlay').classList.toggle('open');
  }

  function closeSidebar() {
    document.getElementById('zesty-sidebar').classList.remove('open');
    document.getElementById('zesty-overlay').classList.remove('open');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
