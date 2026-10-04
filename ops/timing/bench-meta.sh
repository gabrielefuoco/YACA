#!/usr/bin/env bash
# Scheda a freddo: misura il primo GET di titoli MAI aperti (cache `final_meta_cache` vuota)
# e il secondo (cache calda). Per ogni titolo riporta anche la dimensione della voce
# Redis `tmdb_episodes:eps:<id>`: quella è la mole di episodi scaricata da TMDB.
# NON modifica nulla: solo GET e letture su Redis.
set -u
H="${YACA_HANDLE:-ff7084d8-904b-42d9-91f5-ea2b4ae37590}"
B="${YACA_BASE:-http://127.0.0.1:7860}"

rcli() { docker exec yaca-redis redis-cli "$@" 2>/dev/null | tr -d '\r'; }

for ID in "$@"; do
  K="final_meta_cache:meta_${ID}_series"
  if [ "$(rcli exists "$K")" = "1" ]; then
    echo "tmdb:$ID  SKIP: gia' in cache, non e' una scheda a freddo"
    continue
  fi
  T1=$(curl -s -o /tmp/_m.json -w '%{time_total}' "$B/$H/meta/series/tmdb:$ID.json")
  T2=$(curl -s -o /dev/null -w '%{time_total}' "$B/$H/meta/series/tmdb:$ID.json")
  SZ=$(rcli strlen "tmdb_episodes:eps:${ID}")
  TTL=$(rcli ttl "tmdb_episodes:eps:${ID}")
  IDX="$ID" T1="$T1" T2="$T2" SZ="$SZ" TTL="$TTL" node -e '
    const fs = require("fs");
    let seasons = 0, episodes = 0, name = "?";
    try { const j = JSON.parse(fs.readFileSync("/tmp/_m.json", "utf8"));
      const v = (j.meta && j.meta.videos) || [];
      seasons = new Set(v.map(x => x.season)).size; episodes = v.length; name = (j.meta && j.meta.name) || "?";
    } catch (e) {}
    console.log(`tmdb:${process.env.IDX}  ${name.slice(0, 26).padEnd(26)} stagioni=${String(seasons).padStart(3)} episodi=${String(episodes).padStart(4)}` +
      `  FREDDO=${(Number(process.env.T1) * 1000).toFixed(0).padStart(6)} ms  CALDO=${(Number(process.env.T2) * 1000).toFixed(0).padStart(5)} ms` +
      `  eps_redis=${(Number(process.env.SZ) / 1024).toFixed(1).padStart(8)} KB  ttl=${process.env.TTL}s`);
  '
done
