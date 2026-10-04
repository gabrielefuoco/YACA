#!/usr/bin/env bash
# Byte di rete per richiesta: legge /proc/net/dev del container PRIMA e DOPO la richiesta.
# Serve a distinguere "aspetta la rete" da "calcola": RX = risposta HTTP al client + pacchetti
# MongoDB/Redis, TX = richieste MongoDB/Redis + eventuali chiamate TMDB.
# NON modifica nulla.
set -u
H="${YACA_HANDLE:-ff7084d8-904b-42d9-91f5-ea2b4ae37590}"
B="${YACA_BASE:-http://127.0.0.1:7860}"

netdev() {
  docker exec yaca-app node -e '
    const fs = require("fs");
    const lines = fs.readFileSync("/proc/net/dev", "utf8").trim().split("\n").slice(2);
    let rx = 0, tx = 0;
    for (const l of lines) {
      const p = l.trim().split(/\s+/);
      if (p[0] === "lo") continue;
      rx += Number(p[8]); tx += Number(p[9]);
    }
    console.log(rx + " " + tx);
  ' 2>/dev/null | tr -d '\r'
}

report() {
  local label="$1"; shift
  local url="$1"; shift
  local before after t out rx tx body
  before=$(netdev)
  t=$(curl -s -o /tmp/_io.json -w '%{time_total}' "$url")
  after=$(netdev)
  body=$(wc -c < /tmp/_io.json)
  rx=$(( $(echo "$after" | cut -d' ' -f1) - $(echo "$before" | cut -d' ' -f1) ))
  tx=$(( $(echo "$after" | cut -d' ' -f2) - $(echo "$before" | cut -d' ' -f2) ))
  TOTAL_S="$t" LBL="$label" RX="$rx" TX="$tx" BODY="$body" node -e '
    const t = Number(process.env.TOTAL_S) * 1000;
    const rx = Number(process.env.RX), tx = Number(process.env.TX);
    const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(2) + " MB" : b >= 1024 ? (b / 1024).toFixed(1) + " KB" : b + " B";
    console.log(`${process.env.LBL.padEnd(34)} ${t.toFixed(0).padStart(6)} ms  rx=${fmt(rx).padStart(10)}  tx=${fmt(tx).padStart(10)}  corpo=${process.env.BODY} B`);
  '
}

echo "== byte di rete per richiesta (RX = tutto quello che entra, TX = tutto quello che esce) =="
report "catalog preset caldo"      "$B/$H/catalog/movie/yaca_preset_preset_top_rated_movies.json"
report "catalog preset caldo (2a)" "$B/$H/catalog/movie/yaca_preset_preset_top_rated_movies.json"
report "meta caldo tmdb:1396"      "$B/$H/meta/series/tmdb:1396.json"
report "ricerca 'the bear' caldo"  "$B/$H/catalog/series/yaca_search_standard.json?search=the%20bear"
report "ricerca 'the bear' caldo2" "$B/$H/catalog/series/yaca_search_standard.json?search=the%20bear"
report "ricerca senza risultati"   "$B/$H/catalog/series/yaca_search_standard.json?search=azzzqqq"
