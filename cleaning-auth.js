    (function(){
      const _msalConfig={
        auth:{
          clientId:'0938023f-cbbf-45f1-a71d-b18c95745ea6',
          authority:'https://login.microsoftonline.com/9c30b606-6648-4777-a623-64867e43e54f',
          redirectUri:'https://kissamosrealestate.com/wp-content/erp/index.html'
        },
        cache:{cacheLocation:'sessionStorage',storeAuthStateInCookie:false}
      };
      const _msal=new msal.PublicClientApplication(_msalConfig);
      const _loginRequest={scopes:['openid','profile','User.Read']};

      
      // \u2500\u2500 MSAL AUTH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      const _isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);

      async function _ensureLogin() {
        await _msal.initialize();
        // Handle any redirect result first
        try {
          const redirectResult = await _msal.handleRedirectPromise();
          if (redirectResult && redirectResult.account) {
            _msal.setActiveAccount(redirectResult.account);
            _showUserBadge(redirectResult.account.name || redirectResult.account.username);
            document.documentElement.style.visibility = 'visible';
            return;
          }
        } catch(e) { console.warn('Redirect promise:', e); }

        // Check for existing session
        const accounts = _msal.getAllAccounts();
        if (accounts.length > 0) {
          _msal.setActiveAccount(accounts[0]);
          _showUserBadge(accounts[0].name || accounts[0].username);
          document.documentElement.style.visibility = 'visible';
          return;
        }

        // No session - login
        if (_isMobile) {
          // Mobile: try popup first, fallback to redirect
          try {
            const result = await _msal.loginPopup(_loginRequest);
            if (result && result.account) {
              _msal.setActiveAccount(result.account);
              _showUserBadge(result.account.name || result.account.username);
            }
            document.documentElement.style.visibility = 'visible';
          } catch(e) {
            if (e.errorCode !== 'user_cancelled') {
              sessionStorage.setItem('msal_return_url', window.location.href);
              await _msal.loginRedirect(_loginRequest);
            } else {
              document.documentElement.style.visibility = 'visible';
            }
          }
        } else {
          // Desktop: store current page, redirect to login, come back
          sessionStorage.setItem('msal_return_url', window.location.href);
          await _msal.loginRedirect(_loginRequest);
        }
      }


      function _showUserBadge(name) {
        // Store name globally for sidebar to pick up
        window._erpUserName = name;
        // Try to update sidebar user display
        const zsUser = document.getElementById('zsUser');
        if (zsUser) {
          zsUser.innerHTML = '<span>\u{1F464} ' + name + '</span>' +
            '<button onclick="window._azureLogout()" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);font-size:10px;padding:2px 7px;border-radius:4px;cursor:pointer;font-family:DM Sans,sans-serif;margin-left:4px">Sign out</button>';
        }
        // Also try old header-right for backwards compat
        const hdr = document.querySelector('.header-right');
        if (hdr && !document.getElementById('_azure_badge')) {
          const badge = document.createElement('div');
          badge.id = '_azure_badge';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px';
          badge.innerHTML = '<span style="font-size:12px;color:rgba(255,255,255,.75);font-family:DM Sans,sans-serif">\u{1F464} ' + name + '</span>' +
            '<button onclick="window._azureLogout()" style="padding:4px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.3);background:transparent;color:rgba(255,255,255,.7);font-size:11px;cursor:pointer;font-family:DM Sans,sans-serif">Sign out</button>';
          hdr.appendChild(badge);
        }
      }

      window._azureLogout=function(){
        const accounts=_msal.getAllAccounts();
        if(accounts.length>0){_msal.logoutRedirect({account:accounts[0]});}
      };

      document.addEventListener('DOMContentLoaded',function(){
        const accounts=_msal.getAllAccounts();
        if(accounts.length===0){document.body.style.visibility='hidden';}
        else{document.body.style.visibility='visible';}
      });

      _ensureLogin().then(()=>{
        document.body.style.visibility='visible';
      });
    })();
    