# Onda 2 — coerenza e visibilità (06, 07, 10)

**Branch**: `hardening/onda-2` · **Base**: `main` @ `b5d95728` · **Deploy**: 2026-11-15 20:0x, immagine `2828e2e0`

| Ticket | Agent | Commit | Diff |
|---|---|---|---|
| 06 filtro ITA + live sync | `t06-onlyita` | `bd7341ec` + `fe0f3086` | 4 file, +422 poi +70 (ermeticità) |
| 07 un solo parser mapping | `t07-mapping` | `a7259bd6` | `mapping.js` −140/+47 (netto **−93**) |
| 10 semaforo degradi | `t10-semaforo` | `1883facb` | modulo 177 righe + rotta + test |
| (review) | io | `fcd287ca` | commento di mapping allineato, 3 env senza chiamanti rimossi |

## Test (misurati, non riportati)

- `npx jest` (worker di default) → **197 suite, 1960 passati, 1 skipped**.
- `node --test services/*/tests/` → **236/236**.

## Cosa è cambiato rispetto ai ticket (e perché va bene)

1. **06 — il test di swap non era ermetico.** Nel worktree passava, nel checkout principale apriva il DB
   di produzione (97.847 righe invece di 4). Verde o rosso a seconda di dove giravi: rimandato indietro,
   ora il test costruisce lo store con path espliciti e ha una guardia `dbPath.startsWith(tmpDir)`.
   Nel farlo l'agente ha aggiunto 3 env nuove al costruttore (`DUCKDB_BASE_PATH`,
   `DUCKDB_MOVIES_PARQUET_PATH`, `DUCKDB_TV_PARQUET_PATH`): **rimosse**, il seam `opts` basta e
   `TMDB_DUMP_DIR` era già la convenzione del repo.
2. **07 — era codice morto, non un comportamento sbagliato.** `applyArtifact` legge `malToTmdb`
   **dall'artefatto** e il produttore lo popolava già: in produzione il drift non ha mai avuto effetto.
   Quindi il ticket elimina 138 righe di parser duplicato senza cambiare nulla di servito — rischio basso,
   ma va detto: non era un bug, era una seconda implementazione in attesa di divergere.
3. **10 — i campi del revisore non esistevano** (`movieCount`/`showCount`/`degraded` su
   `getSnapshot()`); l'agente usa `isReady` + `idsByType()` e ripiega sull'mtime del file.
4. **Flake noto**: `tests/heroMovieDateRegression.test.js` (~90 s, il più lento) fallisce sotto carico
   con molti worker e passa con `--maxWorkers=2` o da solo. Pre-esistente, non toccato da questa onda.

## Misure in produzione (2026-11-15, 20:0x)

### 06 — live sync della colonna `ita`

Log di boot: `[DuckDB Store] Colonna ita riallineata a caldo da ita_annotations.jsonl (187ms)` —
sotto il budget di 500 ms, quindi nessun bisogno del ramo `WHERE id IN (…)`.

Stati reali in `catalog.duckdb` (letti in sola lettura):

| tabella | true | null | false | `IS NOT FALSE` (= filtro solo-ITA) |
|---|---:|---:|---:|---:|
| movies | 14.381 | 4.145 | 79.972 | **18.526** |
| tv | 5.115 | 663 | 13.937 | **5.778** |
| totale | 19.496 | 4.808 | 93.909 | **24.304** |

Confronto con la verità (`ita_annotations.meta.json`): `null` **identici** (4.808 = 4.808), `true` 19.496
contro 19.577 = **−81**, che sono gli id annotati che non esistono nel catalogo (stessa differenza del
ticket 00). Il parquet, prima del live sync, aveva 14.295 `true` sui film: la colonna in RAM è quindi più
fresca di 86 righe, che è esattamente quello che il live sync doveva comprare.

> Nota accettata: gli `UPDATE` non sono atomici fra loro, quindi per ~187 ms (due volte al giorno) una
> query concorrente può vedere `ita` a metà. Con `CHECKPOINT` il WAL non resta da rigiocare.

### 07 — mapping

`[AnimeMappingStore] Build indici completata: 4303 solo serie, 2721 solo film (totale film: 2761, serie: 4343)`.

### 10 — semaforo

`GET /api/admin/ingestion-status` (401 senza `x-admin-pass`) → `overall: yellow` con due motivi:

- `anime_airing: homeInWindow=84, homeStale=54` → 54 documenti con `checkedAt` più vecchio di 3 giorni;
- `anime_mapping: artefatto più vecchio di 24h (2026-11-10)` → l'artefatto è fermo da 5 giorni.

Interpretazione (da verificare, non è un guasto del semaforo): il worker `yaca-anime-source` è **healthy**
e ha girato alle 16:54 (24 titoli scritti, 2 non risolti), quindi i due gialli sono «dato vecchio», non
«servizio morto» — il full pass della home gira solo se l'ultimo è >24 h e l'artefatto viene ripubblicato
solo quando i dump cambiano. Sono esattamente i due degradi che prima erano invisibili.
