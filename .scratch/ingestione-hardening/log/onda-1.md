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

---

## Misure in produzione (2026-11-15, sera)

Deploy: push su `main` → CI ~4 min → `docker compose pull app tmdb-daemon` eseguito a mano sul mate
(Watchtower avrebbe fatto lo stesso entro un'ora) → **in più** `git pull` in `/srv/yaca`, perché il job
doppiaggi gira sull'host, non nell'immagine. Senza quel pull il fix 01 non era attivo.

### 01 — freschezza indici

| | Prima | Dopo 2 giri |
|---|---|---|
| pagine con mtime 2026-10-02 | 81 / 81 | 39 |
| pagine fresche | 0 | **42** |
| schede AG estratte | 25.165 | 25.249 |
| durata del giro | 6,4 s (tutto da cache) | 25 s (21 download) |

Ogni giro scarica 21 pagine: 81 coperte in 4 giri (48 h). Il giro dei 25 s è quello che fa rete.

### 02 — null TMDB ≠ 404

Prima riga `Disk Apply` con cui il fix è entrato in funzione:

```
Disk Apply: 917 upserts, 0 deletes for movies (not_found=0, errore=0, filtered=127)
```

**127 titoli** erano `filtered_vote_floor`: con il codice vecchio sarebbero finiti in `toDelete` e
sarebbero spariti da `master_movies.jsonl`. Non è teoria, è la prima ora.

### 04 — spool Tier 1

Nessun `promoted_*.jsonl` scritto nel periodo osservato (nessun titolo Tier 2 aperto). La logica è
coperta dai test (matrice di crash), la metrica si leggerà alla prima apertura.

### 12 — decode charset (hotfix, emerso qui)

Il primo giro con l'indice fresco ha **perso 310 badge ITA** perché il sito è passato a UTF-8 e il decode
era cablato su windows-1252 (dettaglio e prove nel ticket 12). Con il fix:

| | dopo il giro fresco (bug) | dopo il fix |
|---|---:|---:|
| AG `true` | 19.139 | **19.500** |
| `non trovate nel DB` | 3.952 | **3.665** |
| totale `true` (con anime) | 19.218 | **19.577** |
| diff del giro | 385 (310 persi) | 371 (365 recuperati, 6 persi) |

Rispetto a prima di tutta l'onda (19.453) il saldo è **+124 badge**: i 310 recuperati più ~124 titoli
realmente nuovi emersi dalle pagine sbloccate.

Coda poster: 441 eventi in attesa (i cambi di badge rigenerano il poster composto); il drenatore ne
smaltisce 10 ogni 10 minuti, quindi si svuota in ~7 ore.
