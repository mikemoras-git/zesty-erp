/**
 * KRE Real Estate ERP — Navigation Shell
 * Drop <script src="kre-nav.js"></script> at end of <body> on every page.
 * Handles: sidebar, mobile hamburger, role-based access, sync indicator.
 */
(function () {
  'use strict';

  const MODULES = [
    { url:'kre-index.html',            icon:'⬡', label:'Dashboard',        roles:['admin','employee'] },
    { url:'kre-properties.html',       icon:'▣', label:'Properties',       roles:['admin','employee','collaborator'] },
    { url:'kre-contacts.html',         icon:'◉', label:'Contacts',         roles:['admin','employee'] },
    { url:'kre-collaborators.html',    icon:'◈', label:'Collaborators',    roles:['admin','employee'] },
    { url:'kre-budget.html',           icon:'◳', label:'Budget Calc.',     roles:['admin','employee'] },
    { url:'kre-pipeline-clients.html', icon:'◌', label:'Client Pipeline',  roles:['admin','employee'] },
    { url:'kre-pipeline-deals.html',   icon:'◑', label:'Deal Pipeline',    roles:['admin','employee'] },
    { url:'kre-matches.html',          icon:'◇', label:'Matches',          roles:['admin','employee'] },
    { url:'kre-tasks.html',            icon:'◻', label:'Tasks',            roles:['admin','employee'] },
    { url:'kre-profits.html',          icon:'◆', label:'Revenue',          roles:['admin'] },
    { url:'kre-tickets.html',          icon:'🎫', label:'Tickets',          roles:['admin','employee'] },
    { url:'kre-settings.html',         icon:'⚙', label:'Settings',         roles:['admin'] },
  ];

  function currentPage() {
    const p = window.location.pathname;
    return p.substring(p.lastIndexOf('/') + 1) || 'kre-index.html';
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('kre_session') || 'null'); }
    catch { return null; }
  }

  function init() {
    if (document.getElementById('kre-sidebar')) return;

    const session  = getSession();
    const isPublic = window.location.pathname.includes('kre-property-public');
    const isLogin  = window.location.pathname.includes('kre-login');
    const isSeed   = window.location.pathname.includes('kre-seed');

    if (!session && !isPublic && !isLogin && !isSeed) {
      window.location.href = 'kre-login.html';
      return;
    }

    if (!session) return; // login / public / seed page — no nav needed

    const role = session.role || 'collaborator';
    const cur  = currentPage();

    // Collaborator can only see Properties
    if (role === 'collaborator' && cur !== 'kre-properties.html' && !isPublic) {
      window.location.href = 'kre-properties.html';
      return;
    }

    const visible = MODULES.filter(m => m.roles.includes(role));

    const links = visible.map(m => {
      const active = (m.url === cur);
      return `<a href="${m.url}" class="kre-nl${active ? ' active' : ''}">
        <i class="kre-ni">${m.icon}</i>${m.label}</a>`;
    }).join('');

    const displayName = session.full_name || session.name || session.email || '?';
    const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

    const html =
      `<aside id="kre-sidebar">
        <div class="kre-brand">
          <div class="kre-brand-nm">KRE<span>·</span>ERP</div>
          <div class="kre-brand-sub">Kissamos Real Estate</div>
        </div>
        <div class="kre-sec-lbl">Modules</div>
        ${links}
        <div class="kre-footer">
          <div class="kre-avatar">${initials}</div>
          <div class="kre-user-info">
            <div class="kre-user-nm">${esc(displayName)}</div>
            <div class="kre-user-role">${roleLabel}</div>
          </div>
          <div class="kre-sync-row">
            <span class="kre-sync-dot" id="kre-sync-dot"></span>
            <span id="kre-sync-txt">Connected</span>
          </div>
          <button class="kre-logout-btn" onclick="kreLogout()">↩ Sign out</button>
        </div>
      </aside>
      <div id="kre-ov"></div>
      <button id="kre-ham" onclick="kreSidebarToggle()" aria-label="Menu">&#9776;</button>`;

    injectCSS();
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, document.body.firstChild);

    document.getElementById('kre-ov').addEventListener('click', kreSidebarClose);
  }

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
  }

  function injectCSS() {
    if (document.getElementById('kre-nav-css')) return;
    const s = document.createElement('style');
    s.id = 'kre-nav-css';
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');
      #kre-sidebar {
        position:fixed;top:0;left:0;bottom:0;width:220px;z-index:900;
        background:linear-gradient(175deg,#0b1f30 0%,#0f2a3f 65%,#0d2035 100%);
        display:flex;flex-direction:column;
        border-right:1px solid rgba(255,255,255,.06);
        box-shadow:4px 0 30px rgba(0,0,0,.35);
        font-family:'DM Sans',sans-serif;
        overflow-y:auto;overflow-x:hidden;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.08) transparent;
        transition:transform .26s cubic-bezier(.4,0,.2,1);
      }
      #kre-sidebar::-webkit-scrollbar{width:3px}
      #kre-sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}

      .kre-brand{padding:22px 18px 16px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
      .kre-brand-nm{font-family:'Cormorant Garamond',serif;font-size:23px;font-weight:600;color:#fff;letter-spacing:.5px;line-height:1}
      .kre-brand-nm span{color:#e8c97a}
      .kre-brand-sub{font-size:9px;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:2.2px;margin-top:5px;font-family:'DM Mono',monospace}

      .kre-sec-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:rgba(255,255,255,.2);padding:12px 18px 4px;margin-top:2px}

      .kre-nl{
        display:flex;align-items:center;gap:10px;padding:9px 18px;
        color:rgba(255,255,255,.5);text-decoration:none;font-size:13px;font-weight:400;
        border-left:2px solid transparent;transition:all .13s;white-space:nowrap;
        -webkit-tap-highlight-color:transparent;
      }
      .kre-nl:hover{color:rgba(255,255,255,.85);background:rgba(255,255,255,.05);border-left-color:rgba(255,255,255,.15)}
      .kre-nl.active{color:#e8c97a;background:rgba(201,168,76,.1);border-left-color:#c9a84c;font-weight:600}
      .kre-ni{font-size:13px;width:18px;text-align:center;flex-shrink:0;opacity:.65;font-style:normal}
      .kre-nl.active .kre-ni{opacity:1}

      .kre-footer{margin-top:auto;padding:14px 18px;border-top:1px solid rgba(255,255,255,.07);flex-shrink:0}
      .kre-avatar{
        width:34px;height:34px;border-radius:50%;
        background:linear-gradient(135deg,#1c8a8c,#c9a84c);
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;color:#fff;
        margin-bottom:8px;
      }
      .kre-user-nm  {font-size:12px;color:rgba(255,255,255,.65);font-weight:600}
      .kre-user-role{font-size:10px;color:rgba(255,255,255,.3);text-transform:capitalize;font-family:'DM Mono',monospace;margin-bottom:8px}
      .kre-sync-row {display:flex;align-items:center;gap:5px;margin-bottom:8px;font-size:10px;color:rgba(255,255,255,.22);font-family:'DM Mono',monospace}
      .kre-sync-dot {width:6px;height:6px;border-radius:50%;background:#27ae60;flex-shrink:0;transition:background .3s}
      .kre-sync-dot.error  {background:#e74c3c}
      .kre-sync-dot.syncing{background:#c9a84c;animation:kre-pulse .8s infinite}
      @keyframes kre-pulse{0%,100%{opacity:1}50%{opacity:.4}}

      .kre-logout-btn{
        width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
        color:rgba(255,255,255,.35);font-family:'DM Sans',sans-serif;font-size:11px;
        padding:7px;border-radius:7px;cursor:pointer;transition:all .15s;text-align:center;
      }
      .kre-logout-btn:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.65)}

      #kre-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:899}
      #kre-ov.open{display:block}
      #kre-ham{
        display:none;position:fixed;top:12px;left:12px;z-index:901;
        background:#0f2a3f;border:1px solid rgba(255,255,255,.2);color:#fff;
        font-size:18px;padding:6px 10px;border-radius:8px;cursor:pointer;
        line-height:1;box-shadow:0 2px 10px rgba(0,0,0,.35);
        -webkit-tap-highlight-color:transparent;
      }
      @media(max-width:900px){
        #kre-sidebar{transform:translateX(-100%)}
        #kre-sidebar.open{transform:translateX(0)}
        #kre-ham{display:flex;align-items:center}
      }
    `;
    document.head.appendChild(s);
  }

  window.kreLogout = async function () {
    // Use AUTH.signOut() if available (Supabase sign-out), otherwise just clear and redirect
    if (window.AUTH && typeof AUTH.signOut === 'function') {
      await AUTH.signOut();
    } else {
      localStorage.removeItem('kre_session');
      window.location.href = 'kre-login.html';
    }
  };
  window.kreSidebarToggle = function () {
    document.getElementById('kre-sidebar').classList.toggle('open');
    document.getElementById('kre-ov').classList.toggle('open');
  };
  window.kreSidebarClose = function () {
    document.getElementById('kre-sidebar').classList.remove('open');
    document.getElementById('kre-ov').classList.remove('open');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
