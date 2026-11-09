/**
 * ETF Portfolio: free live-price proxy on Cloudflare Workers.
 * Use this if your web storage can't run PHP (or you open index.html locally).
 *
 * 1. Create a free account at https://dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker.
 * 2. Click "Edit code", replace everything with this file, then Deploy.
 * 3. Copy the worker URL (https://<name>.<you>.workers.dev) into the app:
 *    Settings → Live data → Price source "my proxy" → My proxy URL.
 */
const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max'];
const INTERVALS = ['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const u = new URL(request.url);
    const symbol = (u.searchParams.get('symbol') || '').trim();
    const range = u.searchParams.get('range') || '1d';
    const interval = u.searchParams.get('interval') || '15m';
    if (!/^[A-Za-z0-9.\-=^]{1,20}$/.test(symbol) || !RANGES.includes(range) || !INTERVALS.includes(interval)) {
      return new Response(JSON.stringify({ chart: { result: null, error: { description: 'Bad parameters' } } }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const ttl = range === '1d' || range === '5d' ? 60 : 21600;
    const qs = `range=${range}&interval=${interval}&events=div%7Csplit&includePrePost=false`;
    let res;
    for (const host of ['query1', 'query2']) {
      res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json' },
        cf: { cacheTtl: ttl, cacheEverything: true },
      });
      if (res.ok) break;
    }
    return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` } });
  },
};
