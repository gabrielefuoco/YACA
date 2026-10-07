# 11 — Harness della campagna: fixture stantie e comandi che ingannano

**Stato**: `chiuso` 06/10/2026 · contesti rimappati, attesa 5/5 calcolata, fetch validato contro AddonConfig (commit `478b6bb`)

## Problema

La campagna ha dovuto aggirare **quattro** ostacoli dell'harness `scripts/qa/`. Nessuno è un difetto del prodotto,
ma tutti insieme rendono «misurare i cataloghi» un lavoro da iniziati, e la prossima persona che ci prova ricade
negli stessi tiri.

1. **`simulate.js profiles` non parte**: `scripts/qa/profiles.spec.json` punta a due context (`aa0b4082`
   «Cinefilo», `a920b180` «Bambini») che non esistono più su Atlas. Il comando fallisce con
   `DNA sorgente non trovato: REOZrGNRr3/aa0b4082`. La campagna ha usato una spec derivata
   (`runs/qc-profiles.spec.json`) con i 5 DNA realmente presenti.
2. **La watchlist sintetica fa crashare l'insert**: due righe legacy con `itemId: null` violano l'indice unico
   `addonUuid_1_itemId_1` (`MongoBulkWriteError E11000`). Serve una sola riga.
3. **`teardown` mente sul profilo reale**: stampa `tasteprofiles 5/17 → ANOMALIA` perché l'attesa è ferma alla
   vecchia configurazione (5 è il numero corretto oggi).
4. **`fetch` legge i profili dalla *spec*, non dal database**: senza `--spec` scarica i profili vecchi e, per un
   profilo assente dal config, il server ricade su `profiles[0]` — si scaricano 8 volte le stesse liste senza
   accorgersene. Va documentato o reso esplicito nel comando.

## Approccio

1. Aggiornare `profiles.spec.json` ai context esistenti (o farlo derivare dai profili del config, con un controllo
   di esistenza *prima* di clonare, e un errore parlante che dica quali context esistono).
2. Ridurre a una la riga legacy con `itemId: null` e aggiornare il conteggio atteso nel report di `profiles`.
3. Riallineare l'attesa di `teardown` (5 tasteprofiles) o farla calcolare dai dati.
4. Nel comando `fetch`, far stampare la spec usata e i profili risolti, e **rifiutare** i profili non presenti nel
   config invece di ricadere su `profiles[0]`.
5. Documentare in `scripts/qa/README.md` la sequenza completa per una campagna (parquet, dump, profili, fetch,
   review, teardown) e il fatto che `teardown` da Windows non pulisce Redis (le chiavi decadono col TTL).

## Criteri di accettazione

- `node scripts/qa/simulate.js profiles` funziona su `main` senza `--spec`.
- `fetch` senza `--spec` scarica i profili che l'utente si aspetta, e non ripete lo stesso elenco 8 volte.
- `teardown` non segnala anomalie quando i dati sono sani.

## Fuori ambito

Rendere `teardown` in grado di parlare con Redis dalla macchina Windows: la nota basta.
