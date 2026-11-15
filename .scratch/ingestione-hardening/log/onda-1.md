# Onda 1 — fix invisibili (01, 02, 04)

**Branch**: `hardening/onda-1` · **Base**: `main` @ `e51f0fd4` · **Merge verso main**: in attesa di ok

| Ticket | Agent | Commit | Diff |
|---|---|---|---|
| 01 freschezza indici AG | `t01-indici` | `ddc9a0ac` | `indici.js` +112/−45, test +199 |
| 02 null TMDB ≠ 404 | `t02-tmdb-null` | `cdc5a633` | 4 file, +519/−192 |
| 04 spool Tier 1 | `t04-spool` | `2d0ef136` + `b23dac8b` | 6 file, +290/−38 |
| (review) | io | `ef8271b6` | rimozione alias morto `fetchWithRetryOutcome` |

Totale onda: **12 file, +1232/−275**.

## Test (misurati, non riportati dagli agenti)

- `npx jest` → **194 suite, 1932 passati, 1 skipped**, 97 s.
- `node --test services/tmdb-daemon/tests/ services/doppiaggi-source/tests/` → **119/119**, 8 esecuzioni consecutive pulite.

## Cosa è cambiato rispetto al ticket (e perché va bene)

1. **t04**: il mio `writeFileSync(spool, '')` dopo il merge era **sbagliato** — cancella le promozioni
   arrivate durante il merge. L'agente l'ha sostituito con una rilettura+slice, che stringe la finestra
   ma non la chiude. Rimandato indietro: ora è **claim per rename** (`promoted_*.jsonl` →
   `.draining`), che è corretto e più corto dello slice. Il `.draining` rimasto da un crash viene
   rifuso al giro dopo (idempotente).
2. **t02**: `fetchChanges` è stato aggiornato al nuovo return tipizzato — senza, ogni giro orario
   avrebbe trovato **zero** ID cambiati in silenzio. Era il punto più pericoloso del ticket.
3. **t02**: `daemonRunning` reso rientrante (senza, `dailySync` chiamato da solo usciva al primo
   `if (!daemonRunning) break` senza fare niente).
4. **01**: le pagine sono **81**, non 79; `giro.js` non chiama `fetchAllIndices` (solo `cli.js`).

## Flake noto (non correggo)

Una esecuzione su nove ha dato `fail 1` senza riprodursi. Sospetto: `renameSync` in
`_processFileSafely` senza retry (a differenza di `duckDbStore.swapDatabase` e `tier2.replaceFile`,
che ritentano su `EPERM/EBUSY`) sotto carico disco su Windows. **Solo sviluppo**: la produzione è
Linux, dove il rename su file aperto è lecito. Da rivedere solo se ricompare su Linux.

## Metriche post-merge (da leggere sul server entro 24 h)

| Ticket | Metrica | Atteso |
|---|---|---|
| 01 | mtime delle 81 pagine in `/srv/yaca/services/doppiaggi-source/.cache/*.htm` | tutte entro 48 h (prima: tutte al 2026-10-02) |
| 01 | righe "scaricato" nel journal del giro 04:00 | ~21 per giro, non 0 |
| 02 | riga `Disk Apply` in `docker logs yaca-tmdb-daemon` | `deletes` ~0 anche con `TMDB_CAP_LIMIT` basso; contatori `not_found/errore/filtered` |
| 04 | `/data/tmdb/promoted_*.jsonl` | cresce alle aperture di titoli Tier 2, sparisce dopo il giro orario; `.draining` non deve restare |

**Rollback**: `git revert` dei merge (tre commit, indipendenti) oppure riportare `main` al commit
precedente; nessuna migrazione dati, i file nuovi (`promoted_*.jsonl`, `.draining`) sono ignorati dal
codice vecchio.
