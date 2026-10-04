#!/usr/bin/env bash
# Ricerca: separa "indice" da "arricchimento TMDB".
# Prima richiesta di un termine = dettagli TMDB freddi; le successive = cache calda.
# NON modifica nulla: solo GET e statistiche.
set -u
H="${YACA_HANDLE:-ff7084d8-904b-42d9-91f5-ea2b4ae37590}"
B="${YACA_BASE:-http://127.0.0.1:7860}"

one() {
  # stampa: millisecondi totale, byte, numero di meta, numero di meta con descrizione (arricchiti)
  local url="$1"
  local out
  out=$(curl -s -o /tmp/_s.json -w '%{time_total} %{size_download}' "$url")
  local t b n d
  t=$(echo "$out" | cut -d' ' -f1)
  b=$(echo "$out" | cut -d' ' -f2)
  read -r n d < <(node -e '
    const fs=require("fs");
    try{const j=JSON.parse(fs.readFileSync("/tmp/_s.json","utf8"));const m=j.metas||[];
      console.log(m.length, m.filter(x=>x.description&&x.description.length>0).length);}catch(e){console.log(0,0);}
  ')
  printf '%8.1f ms  %7d B  metas=%-3s con_descrizione=%-3s' "$(echo "$t*1000" | bc)" "$b" "$n" "$d"
}

for TERM in "$@"; do
  enc=$(printf '%s' "$TERM" | sed 's/ /%20/g')
  URL="$B/$H/catalog/series/yaca_search_standard.json?search=$enc"
  echo "== termine: '$TERM'"
  for i in 1 2 3 4; do
    printf '   richiesta %d: ' "$i"
    one "$URL"
    echo
  done
done
