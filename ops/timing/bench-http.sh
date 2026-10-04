#!/usr/bin/env bash
# Benchmark HTTP "a freddo" della risposta, per isolare le fasi.
# NON modifica nulla: solo richieste GET ripetute e statistiche.
# Uso (sul mate): bash bench-http.sh [N]
set -u
H="${YACA_HANDLE:-ff7084d8-904b-42d9-91f5-ea2b4ae37590}"
B="${YACA_BASE:-http://127.0.0.1:7860}"
N="${1:-7}"

bench() {
  local label="$1"; shift
  local url="$1"; shift
  local times=()
  local size=0
  local code=0
  for _ in $(seq 1 "$N"); do
    local out
    out=$(curl -s -o /tmp/_bench_body.json -w '%{http_code} %{time_total} %{size_download}' "$url")
    code=$(echo "$out" | cut -d' ' -f1)
    size=$(echo "$out" | cut -d' ' -f3)
    times+=("$(echo "$out" | cut -d' ' -f2)")
  done
  printf '%s\n' "${times[@]}" | BLBL="$label" URL="$url" python3 -c "
import sys, os
lbl=os.environ['BLBL']; url=os.environ['URL']
vals=[float(x)*1000 for x in sys.stdin.read().split()]
vals_s=sorted(vals)
n=len(vals_s)
med=vals_s[n//2] if n%2 else (vals_s[n//2-1]+vals_s[n//2])/2
print(f'{lbl:38s} n={n} min={vals_s[0]:7.1f} med={med:7.1f} max={vals_s[-1]:7.1f} size=$size code=$code')
print(f'{\"\":38s}   url={url}')
"
}

echo "== N=$N  base=$B  handle=$H =="
bench "1 manifest (senza handle)"      "$B/manifest.json"
bench "2 manifest (handle, solo Mongo)" "$B/$H/manifest.json"
bench "3 handle inesistente (Mongo x2)" "$B/00000000-0000-0000-0000-000000000000/catalog/movie/yaca_preset_preset_top_rated_movies.json"
bench "4 catalog movie preset (caldo)"  "$B/$H/catalog/movie/yaca_preset_preset_top_rated_movies.json"
bench "5 catalog series preset (caldo)" "$B/$H/catalog/series/yaca_preset_preset_top_rated_series.json"
bench "6 catalog movie skip=40"         "$B/$H/catalog/movie/yaca_preset_preset_top_rated_movies.json?skip=40"
bench "7 ricerca 'dune'"                "$B/$H/catalog/series/yaca_search_standard.json?search=dune"
bench "8 ricerca 'breaking bad'"        "$B/$H/catalog/series/yaca_search_standard.json?search=breaking%20bad"
bench "9 meta series tmdb:1396 (calda)" "$B/$H/meta/series/tmdb:1396.json"
