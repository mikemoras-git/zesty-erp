#!/usr/bin/env python3
"""ETF Portfolio - local test server. Needs only Python 3, nothing to install.

Serves the app on http://localhost:8765 and answers the app's proxy.php requests by
fetching Yahoo Finance directly, exactly like proxy.php does on Papaki, so live prices
work on your laptop. Your data stays in your browser.

Start:  double-click Start-Mac.command (Mac), or run:  python3 local-server.py
Stop:   close the window (or press Ctrl+C).
"""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRST_PORT = 8765
RANGES = {'1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max'}
INTERVALS = {'1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo'}
SYMBOL_RE = re.compile(r'^[A-Za-z0-9.\-=^]{1,20}$')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

_cache = {}
_lock = threading.Lock()


def fetch_chart(symbol, rng, interval):
    """Return (status, body bytes) for a Yahoo chart request, with a short cache."""
    key = (symbol, rng, interval)
    ttl = 60 if rng in ('1d', '5d') else 6 * 3600
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return 200, hit[1]
    query = urllib.parse.urlencode({'range': rng, 'interval': interval, 'events': 'div|split', 'includePrePost': 'false'})
    last = 0
    for host in ('query1', 'query2'):
        url = f'https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?{query}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=12) as resp:
                body = resp.read()
            json.loads(body)  # make sure it is valid JSON before caching
            with _lock:
                _cache[key] = (time.time(), body)
            return 200, body
        except urllib.error.HTTPError as e:
            last = e.code
        except Exception:  # network error, timeout, bad JSON
            last = 0
    if hit:  # serve stale data rather than nothing
        return 200, hit[1]
    return 502, json.dumps({'chart': {'result': None, 'error': {'description': f'Upstream error {last}'}}}).encode()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def log_message(self, fmt, *args):  # keep the window quiet
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, code, body):
        if not isinstance(body, (bytes, bytearray)):
            body = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = url.path
        if path.endswith('/proxy.php'):
            qs = urllib.parse.parse_qs(url.query)
            symbol = qs.get('symbol', [''])[0].strip()
            rng = qs.get('range', ['1d'])[0]
            interval = qs.get('interval', ['15m'])[0]
            if not SYMBOL_RE.match(symbol) or rng not in RANGES or interval not in INTERVALS:
                return self._json(400, {'chart': {'result': None, 'error': {'description': 'Bad parameters'}}})
            return self._json(*fetch_chart(symbol, rng, interval))
        if path.endswith('sync.php'):
            return self._sync_unavailable()
        if path.startswith('/local/') or path.endswith('.php'):
            return self._json(404, {'error': 'Not found'})
        return super().do_GET()

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path.endswith('sync.php'):
            return self._sync_unavailable()
        return self._json(405, {'error': 'Method not allowed'})

    def _sync_unavailable(self):
        return self._json(404, {'error': 'Sync works only on the online (Papaki) version. Locally, use Settings > Export / Import backup.'})


def main():
    server = None
    for port in range(FIRST_PORT, FIRST_PORT + 10):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    if server is None:
        print('Could not start: ports 8765-8774 are all busy.')
        sys.exit(1)
    url = f'http://localhost:{port}/'
    print('=' * 60)
    print(' ETF Portfolio is running (local test version)')
    print(f' Open: {url}')
    if port != FIRST_PORT:
        print(f' Note: port {FIRST_PORT} was busy. Data saved on another port is kept separately.')
    print(' Live prices: on.  Sync: only on the online version.')
    print(' To stop: close this window or press Ctrl+C.')
    print('=' * 60)
    if os.environ.get('ETFP_NO_BROWSER') != '1':
        threading.Timer(0.8, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
