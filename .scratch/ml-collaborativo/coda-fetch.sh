#!/bin/bash
# Coda dei fetch Trakt: il rate limit e' CONDIVISO (1000 richieste / 5 min), quindi in sequenza.
cd /c/Users/gabri/APP/YACA
echo "[$(date +%H:%M)] attendo la fine del related delle serie..."
while ! grep -q "^FINE" .scratch/ml-collaborativo/fetch-rel-tv.log 2>/dev/null; do sleep 120; done
echo "[$(date +%H:%M)] related finito. Comincio le cronologie complete (senza tetto di 300)."
PAGES=8 node .scratch/ml-collaborativo/fetch-trakt-full.js > .scratch/ml-collaborativo/fetch-full.log 2>&1
echo "[$(date +%H:%M)] cronologie complete finite. Comincio la scoperta dei follower."
MAX=4000 PAGES=3 node .scratch/ml-collaborativo/fetch-trakt-followers.js > .scratch/ml-collaborativo/fetch-foll.log 2>&1
echo "[$(date +%H:%M)] TUTTO FINITO."
