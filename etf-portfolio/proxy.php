<?php
/**
 * ETF Portfolio: live price proxy for Yahoo Finance (chart API only).
 *
 * Browsers can't call Yahoo directly (CORS), so the app asks this file instead:
 *   proxy.php?symbol=VWCE.DE&range=1d&interval=15m
 *
 * It only accepts a ticker symbol plus whitelisted range/interval values, so it
 * cannot be abused as a general-purpose proxy. Responses are cached briefly on
 * disk to stay well inside Yahoo's rate limits.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
// Same-origin use needs no CORS header. Uncomment to allow the app to be opened
// from another place (for example the HTML file opened locally on your laptop):
// header('Access-Control-Allow-Origin: *');

$symbol   = isset($_GET['symbol']) ? trim($_GET['symbol']) : '';
$range    = isset($_GET['range']) ? $_GET['range'] : '1d';
$interval = isset($_GET['interval']) ? $_GET['interval'] : '15m';

$ranges    = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max'];
$intervals = ['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo'];

if (!preg_match('/^[A-Za-z0-9.\-=^]{1,20}$/', $symbol) || !in_array($range, $ranges, true) || !in_array($interval, $intervals, true)) {
    http_response_code(400);
    echo json_encode(['chart' => ['result' => null, 'error' => ['description' => 'Bad parameters']]]);
    exit;
}

$ttl = ($range === '1d' || $range === '5d') ? 60 : 6 * 3600;
$cacheDir = sys_get_temp_dir() . '/etfp-cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0700, true);
$cacheFile = $cacheDir . '/' . md5($symbol . '|' . $range . '|' . $interval) . '.json';

if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    readfile($cacheFile);
    exit;
}

function fetch_url($url) {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_USERAGENT => $ua,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$code, $body];
    }
    $ctx = stream_context_create(['http' => ['timeout' => 12, 'header' => "User-Agent: $ua\r\nAccept: application/json\r\n", 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
    return [$code, $body];
}

$query = 'range=' . $range . '&interval=' . $interval . '&events=div%7Csplit&includePrePost=false';
$body = false;
$code = 0;
foreach (['query1', 'query2'] as $host) {
    list($code, $body) = fetch_url("https://$host.finance.yahoo.com/v8/finance/chart/" . rawurlencode($symbol) . '?' . $query);
    if ($code === 200 && $body) break;
}

if ($code === 200 && $body && json_decode($body) !== null) {
    @file_put_contents($cacheFile, $body, LOCK_EX);
    echo $body;
    exit;
}

// Serve stale cache rather than nothing
if (is_file($cacheFile)) { readfile($cacheFile); exit; }

http_response_code(502);
echo json_encode(['chart' => ['result' => null, 'error' => ['description' => 'Upstream error ' . $code]]]);
