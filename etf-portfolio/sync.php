<?php
/**
 * ETF Portfolio: private cloud save, so your work and home computers share one portfolio.
 *
 * SETUP (once, on the server):
 *   1. Copy sync-config.example.php to sync-config.php (same folder).
 *   2. In sync-config.php, replace the key with a long random string (40+ characters).
 *   3. Enter the same key in the app under Settings → Sync between computers.
 * sync-config.php is in .gitignore, so the key never reaches your (public) GitHub repo.
 * The data file is stored in ./data/, which is protected by data/.htaccess. Use HTTPS.
 */

$cfg = __DIR__ . '/sync-config.php';
if (is_file($cfg)) require $cfg;
if (!defined('SYNC_KEY')) define('SYNC_KEY', '');

const DATA_DIR  = __DIR__ . '/data';
const DATA_FILE = DATA_DIR . '/portfolio.json';
const MAX_BYTES = 5 * 1024 * 1024;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail($code, $msg) { http_response_code($code); echo json_encode(['error' => $msg]); exit; }

$key = isset($_SERVER['HTTP_X_SYNC_KEY']) ? $_SERVER['HTTP_X_SYNC_KEY'] : '';
if (SYNC_KEY === 'CHANGE-ME-to-a-long-random-string' || strlen(SYNC_KEY) < 16) fail(403, 'Set SYNC_KEY in sync-config.php first');
if (!hash_equals(SYNC_KEY, $key)) { usleep(500000); fail(403, 'Forbidden'); }

if (!is_dir(DATA_DIR)) {
    @mkdir(DATA_DIR, 0700, true);
    @file_put_contents(DATA_DIR . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    @file_put_contents(DATA_DIR . '/index.html', '');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (!is_file(DATA_FILE)) { echo json_encode(['empty' => true]); exit; }
    readfile(DATA_FILE);
    exit;
}

if ($method === 'POST') {
    $body = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
    if ($body === false || strlen($body) > MAX_BYTES) fail(413, 'Too large');
    $data = json_decode($body, true);
    if (!is_array($data) || !isset($data['transactions']) || !is_array($data['transactions'])) fail(400, 'Invalid data');

    // Keep one backup per day (last 30 days)
    if (is_file(DATA_FILE)) {
        $bk = DATA_DIR . '/backup-' . date('Y-m-d') . '.json';
        if (!is_file($bk)) @copy(DATA_FILE, $bk);
        $old = glob(DATA_DIR . '/backup-*.json');
        if ($old && count($old) > 30) { sort($old); foreach (array_slice($old, 0, count($old) - 30) as $f) @unlink($f); }
    }
    $tmp = DATA_FILE . '.tmp';
    if (@file_put_contents($tmp, $body, LOCK_EX) === false || !@rename($tmp, DATA_FILE)) fail(500, 'Could not write data file (check folder permissions)');
    echo json_encode(['ok' => true, 'savedAt' => date('c')]);
    exit;
}

fail(405, 'Method not allowed');
