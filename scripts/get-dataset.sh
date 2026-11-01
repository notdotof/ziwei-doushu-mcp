#!/bin/sh
# Cross-platform dataset installer for ziwei-doushu-mcp (POSIX sh).
# Downloads + decompresses the upstream v4.0 interpretation dataset
# (Release v4.0-13d) for a year range into $ZIWEI_DATASET_DIR or ./data/interp-v4.
#
# Usage:
#   sh scripts/get-dataset.sh                 # default years 1975-2005
#   sh scripts/get-dataset.sh 1990 1999       # custom range
#
# Needs one of: zstd in PATH, python3 with "zstandard", or installs nothing
# else (macOS: brew install zstd; Debian/Ubuntu: apt install zstd).
set -e

FROM=${1:-1975}
TO=${2:-2005}
DIR="${ZIWEI_DATASET_DIR:-$(dirname "$0")/../data/interp-v4}"
BASE="https://github.com/Renhuai123/ziwei-doushu/releases/download/v4.0-13d"
mkdir -p "$DIR/_zst"

DECODE=""
if command -v zstd >/dev/null 2>&1; then
  DECODE="zstd"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import zstandard" 2>/dev/null; then
  DECODE="python"
else
  echo "need 'zstd' (brew install zstd / apt install zstd) or python3 -m pip install zstandard" >&2
  exit 1
fi
echo "decoder: $DECODE -> $DIR"

for y in $(seq "$FROM" "$TO"); do
  [ "$y" -ge 1950 ] && [ "$y" -le 2026 ] || continue
  out="$DIR/year-$y.jsonl"
  [ -s "$out" ] && { echo "skip $y (installed)"; continue; }
  zst="$DIR/_zst/year-$y.jsonl.zst"
  [ -s "$zst" ] || curl -sL --retry 3 -o "$zst" "$BASE/year-$y.jsonl.zst"
  echo "decompress $y ..."
  if [ "$DECODE" = "zstd" ]; then
    zstd -d --long=27 -f "$zst" -o "$out"
  else
    python3 -c "import zstandard as z,sys; d=z.ZstdDecompressor(max_window_size=2**27); i=open(sys.argv[1],'rb'); o=open(sys.argv[2],'wb'); d.copy_stream(i,o); o.close(); i.close()" "$zst" "$out"
  fi
done
echo "DONE. dataset dir: $DIR"
