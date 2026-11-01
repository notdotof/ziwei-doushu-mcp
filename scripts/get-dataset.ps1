# Requires PowerShell 5.1+. ASCII only on purpose (encoding-safe on any box).
# Downloads + decompresses the ziwei-doushu v4.0 interpretation dataset
# (upstream Release v4.0-13d) for a year range into <package>\data\interp-v4\ .
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File get-dataset.ps1                  # 1975-2005
#   powershell -ExecutionPolicy Bypass -File get-dataset.ps1 -From 1990 -To 1999
#
# Notes:
#   - All years (1950-2026) uncompressed = ~56.6 GB. Default 1975-2005 = ~23 GB.
#   - Needs ONE of: zstd.exe in PATH, python with "zstandard" package,
#     or internet access to fetch zstd.exe automatically (script handles it).

param(
  [int]$From = 1975,
  [int]$To = 2005,
  [string]$Dest = (Join-Path $PSScriptRoot "data\interp-v4")
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$tmp = Join-Path $env:TEMP "ziwei-ds-tools"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# --- locate a zstd decoder: PATH -> python zstandard -> auto-download zstd.exe ---
$zstd = (Get-Command zstd -ErrorAction SilentlyContinue).Source
$mode = $null
if ($zstd) { $mode = "exe" }
if (-not $mode) {
  python -c "import zstandard" 2>$null
  if ($LASTEXITCODE -eq 0) { $mode = "python" }
}
if (-not $mode) {
  $exe = Join-Path $tmp "zstd.exe"
  if (-not (Test-Path $exe)) {
    Write-Host "fetching zstd.exe ..."
    $zip = Join-Path $tmp "zstd.zip"
    foreach ($u in @(
      "https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-v1.5.7-win64.zip",
      "https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-v1.5.6-win64.zip")) {
      try { Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing; break } catch { Write-Host "  miss: $u" }
    }
    if (-not (Test-Path $zip)) { throw "cannot download zstd.exe; install zstd or 'pip install zstandard' first" }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
  }
  $zstd = $exe
  $mode = "exe"
}
Write-Host "decoder: $mode ($zstd)"

# --- download + decompress per year ---
$base = "https://github.com/Renhuai123/ziwei-doushu/releases/download/v4.0-13d"
for ($y = $From; $y -le $To; $y++) {
  if ($y -lt 1950 -or $y -gt 2026) { Write-Host "skip $y (out of range)"; continue }
  $out = Join-Path $Dest "year-$y.jsonl"
  if (Test-Path $out) { Write-Host "skip $y (already installed)"; continue }
  $zst = Join-Path $tmp "year-$y.jsonl.zst"
  if (-not (Test-Path $zst)) {
    Write-Host "download $y ..."
    Invoke-WebRequest -Uri "$base/year-$y.jsonl.zst" -OutFile $zst -UseBasicParsing
  }
  Write-Host "decompress $y ..."
  if ($mode -eq "python") {
    python -c "import zstandard as z,sys; d=z.ZstdDecompressor(max_window_size=2**27); i=open(sys.argv[1],'rb'); o=open(sys.argv[2],'wb'); d.copy_stream(i,o); o.close(); i.close()" $zst $out
  } else {
    & $zstd -d --long=27 -f $zst -o $out 2>$null
  }
  if (-not (Test-Path $out)) { throw "decompress failed for year $y" }
}
Write-Host ""
Write-Host "DONE. dataset dir: $Dest"
Write-Host "no restart needed - the MCP picks up year files on demand."
