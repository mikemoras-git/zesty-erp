# ETF Portfolio - local test server for Windows. Nothing to install.
# Serves the app on http://localhost:8765 and fetches live prices from Yahoo Finance,
# exactly like proxy.php does on Papaki. Your data stays in your browser.
# Start it with Start-Windows.bat. Close the window to stop.
# (Plain ASCII on purpose: Windows PowerShell 5.1 reads scripts without a BOM as ANSI.)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$AppDir = Split-Path -Parent $PSScriptRoot
$AppDirFull = [IO.Path]::GetFullPath($AppDir).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$Ranges = @('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max')
$Intervals = @('1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo')
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
$Mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}
$Cache = @{}

function Send-Bytes($res, [int]$code, [string]$type, [byte[]]$bytes) {
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.AddHeader('Cache-Control', 'no-store')
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Json($res, [int]$code, [string]$json) {
  Send-Bytes $res $code 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json))
}

function Get-Chart([string]$sym, [string]$range, [string]$interval) {
  $key = "$sym|$range|$interval"
  $ttl = 21600
  if ($range -eq '1d' -or $range -eq '5d') { $ttl = 60 }
  $hit = $Cache[$key]
  if ($hit -and ((Get-Date) - $hit.At).TotalSeconds -lt $ttl) { return @{ Code = 200; Body = $hit.Body } }
  $last = 0
  foreach ($h in @('query1', 'query2')) {
    $url = 'https://' + $h + '.finance.yahoo.com/v8/finance/chart/' + [Uri]::EscapeDataString($sym) +
      '?range=' + $range + '&interval=' + $interval + '&events=div%7Csplit&includePrePost=false'
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -UserAgent $UA -TimeoutSec 12 -Headers @{ Accept = 'application/json' }
      $body = $r.Content
      if ($body -is [byte[]]) { $body = [Text.Encoding]::UTF8.GetString($body) }
      if ($body -and $body.TrimStart().StartsWith('{')) {
        $Cache[$key] = @{ At = (Get-Date); Body = $body }
        return @{ Code = 200; Body = $body }
      }
    } catch {
      if ($_.Exception.Response) { try { $last = [int]$_.Exception.Response.StatusCode } catch { } }
    }
  }
  if ($hit) { return @{ Code = 200; Body = $hit.Body } }
  return @{ Code = 502; Body = ('{"chart":{"result":null,"error":{"description":"Upstream error ' + $last + '"}}}') }
}

# Start on the first free port from 8765
$listener = $null
$port = 0
for ($p = 8765; $p -lt 8775; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add('http://localhost:' + $p + '/')
  try { $l.Start(); $listener = $l; $port = $p; break } catch { $l.Close() }
}
if (-not $listener) {
  Write-Host 'Could not start: ports 8765-8774 are all busy.'
  Read-Host 'Press Enter to close'
  exit 1
}

$url = 'http://localhost:' + $port + '/'
Write-Host ('=' * 60)
Write-Host ' ETF Portfolio is running (local test version)'
Write-Host (' Open: ' + $url)
if ($port -ne 8765) { Write-Host ' Note: port 8765 was busy. Data saved on another port is kept separately.' }
Write-Host ' Live prices: on.  Sync: only on the online version.'
Write-Host ' To stop: close this window.'
Write-Host ('=' * 60)
Start-Process $url

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = $req.Url.AbsolutePath
      if ($path -like '*/proxy.php') {
        $sym = [string]$req.QueryString['symbol']
        if ($sym) { $sym = $sym.Trim() }
        $range = [string]$req.QueryString['range']
        if (-not $range) { $range = '1d' }
        $interval = [string]$req.QueryString['interval']
        if (-not $interval) { $interval = '15m' }
        if (($sym -cnotmatch '^[A-Za-z0-9.\-=^]{1,20}$') -or ($Ranges -cnotcontains $range) -or ($Intervals -cnotcontains $interval)) {
          Send-Json $res 400 '{"chart":{"result":null,"error":{"description":"Bad parameters"}}}'
        } else {
          $r = Get-Chart $sym $range $interval
          Send-Json $res $r.Code $r.Body
        }
      } elseif ($path -like '*sync.php') {
        Send-Json $res 404 '{"error":"Sync works only on the online (Papaki) version. Locally, use Settings > Export / Import backup."}'
      } else {
        $rel = [Uri]::UnescapeDataString($path).TrimStart('/')
        if ($rel -eq '') { $rel = 'index.html' }
        $full = [IO.Path]::GetFullPath((Join-Path $AppDir $rel))
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $inside = $full.StartsWith($AppDirFull, [StringComparison]::OrdinalIgnoreCase)
        if ((-not $inside) -or ($rel -like 'local/*') -or ($ext -eq '.php') -or (-not (Test-Path -LiteralPath $full -PathType Leaf))) {
          Send-Json $res 404 '{"error":"Not found"}'
        } else {
          $type = $Mime[$ext]
          if (-not $type) { $type = 'application/octet-stream' }
          Send-Bytes $res 200 $type ([IO.File]::ReadAllBytes($full))
        }
      }
    } catch {
      try { Send-Json $res 500 '{"error":"Server error"}' } catch { }
    } finally {
      try { $res.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
