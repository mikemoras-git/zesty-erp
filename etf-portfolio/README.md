# ETF Portfolio: setup on Papaki

A private web app to track your ETF/UCITS portfolio at Interactive Brokers. It shows live prices, detects dividends automatically, and builds a buy plan (€1,000/month by default, €2,500 starting amount, extra money suggested on market drops). It's a standalone module: it doesn't use the ERP's Supabase database or navigation.

## Files

| File | What it does |
|---|---|
| `index.html`, `app.js`, `style.css` | The app itself |
| `proxy.php` | Fetches live prices from Yahoo Finance for the app |
| `sync.php` | Keeps your work and home laptop on the same data (stored on Papaki, in `data/`) |
| `sync-config.example.php` | Template for your secret sync key |
| `cloudflare-worker.js` | Only needed if PHP is ever unavailable. A free alternative to `proxy.php` |

## 1. Get the files on your laptop

```bash
cd path/to/zesty-erp
git pull
```
The app is in the `etf-portfolio/` folder.

## 2. Create your secret sync key (once)

1. In `etf-portfolio/`, copy `sync-config.example.php` to **`sync-config.php`**.
2. Open it and replace `CHANGE-ME-to-a-long-random-string` with a long random password (40+ characters).

`sync-config.php` is in `.gitignore`, so it **never goes to GitHub**. This matters because the zesty-erp repository is public. Don't put the key anywhere else.

## 3. Upload to Papaki

Upload the `etf-portfolio/` folder (including your `sync-config.php`) to your Papaki hosting the same way as the other modules, e.g. to `https://your-domain.gr/etf-portfolio/`. Use **https**.

Recommended: password-protect the folder in the Papaki control panel ("Directory privacy" / "Password protected directories"), so only you can open the page.

## 4. First start

1. Open `https://your-domain.gr/etf-portfolio/` and press **↻ Refresh prices**. Prices load through `proxy.php`.
   If they don't, use **Settings → Live data → Test connection**.
2. **Settings → Sync between computers**: enter the same key, tick **Auto-sync**, and click **Save to server**.
3. On the other laptop: open the same address, enter the key, and click **Load from server**. From then on, both stay in sync.

## Monthly use

1. Transfer €1,000 to IBKR (the first time €3,500 = €2,500 + €1,000). Optionally record it as a **Deposit**.
2. Open **Buy plan**. It lists which ETFs to buy and how many shares. In IBKR, search each by ISIN and use limit orders.
3. Click **Record** per purchase and enter the real price and commission.
4. Confirm auto-detected dividends in the **Dividends** tab when IBKR pays them.
5. **Market drop?** The plan suggests *extra dip money* (default €500 at −10%, €1,000 at −20% below your average price) and invests it only in the ETFs that fell. Amounts and levels are in Settings → Strategy.

## Notes

- Yahoo symbols: `.DE` Xetra, `.AS` Amsterdam, `.MI` Milan, `.PA` Paris, `.L` London, `.OL` Oslo (Norwegian stocks, in NOK). Use **Test Yahoo symbol** when adding one.
- FX rates come from the ECB (frankfurter.dev). Each transaction stores its own rate (1 EUR = x currency).
- Browser notifications only fire while the app is open in a tab.
- `sync.php` keeps 30 daily backups in `data/` on the server. You can also use **Settings → Export backup**.
- Not investment or tax advice. Confirm Greek tax treatment with your accountant.
