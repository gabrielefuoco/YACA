# Bronte Audit — YACA (repo-wide)

> `/ponytail-audit` — scan dell'intero albero per over-engineering. Solo report: **non applica tagli**. Bug, sicurezza e performance fuori scope (vanno in una review normale).

**Repo**: `C:\Users\gabri\APP\Streaming\YACA`
**Base**: main @ `482fa3d`
**File tracciati**: 359 · righe totali: ~200k (gran parte dati intermedi commitati, non codice runtime)

---

## Sintesi

L'app runtime tocca solo `src/`, `frontend/src/` e `index.js`. Il resto — più della metà del repo — è pipeline iterata su se stessa, scratch dirs e dati generati commitati. Tagliare non tocca il runtime.

`net: -~104.000 righe, -0 deps` (tutte le 14 deps runtime hanno caller; nessuna morta).

---

## Findings (ranked, taglio più grosso prima)

### 1. `delete` Pipeline iterata — versioni stale della stessa build
- **Cut**: `rebuild_graph_v2.py` (249), `rebuild_graph_v3.py` (281), `rebuild_graph_v4.py` (325), `rebuild_graph_v5.py` (366 — 1221 righe in totale), `temp.js` (405, artifact generato da `extract.js`), `fix.js`/`fix2.js`/`map_adj.js`/`debug_weights.js`/`find_kws.js`, `visualizer.html` (501).
- **Tenere**: `build_graph.py` (528, canonico per README) + `export_graph.py` + `README.md`.
- **Prova**: zero import di `rebuild_graph_v2..5`, `map_adj`, `debug_weights`, `find_kws` in tutto il repo (grep vuoto). L'unico match in `extract.js` è falso positivo (scrive un path `temp.js`).
- **Path**: `offline_graph_builder/`

### 2. `delete: Dati di derivazione commitati`
- **Cut**: `yaca_graph.graphml` (~66.300 righe), `yaca_edges.csv` (~20.250), `yaca_nodes.csv` (~1.400).
- **Prova**: non letti da `src/`, rigenerabili dalla pipeline offline.
- **Path**: `offline_graph_builder/`

### 3. `delete: Script one-shot non documentati`
- **Cut**: la maggior parte dei 64 file in `scripts/` (5.565 righe): `generate_*_recap`, `analyze_*`, `audit_*`, `fetch_*`, `test_*`, `exclude_*`, ecc.
- **Tenere**: gli 11 citati in `docs/TESTING_UTILITIES.md` (sono utility mantenute).
- **Prova**: solo 11/64 documentati; zero wiring in `package.json` e `.github/workflows/deploy.yml`.
- **Path**: `scripts/`

### 4. `delete: Scratch dirs non referenziate`
- **Cut**: `.agents/scratch/` (21 file, ~958 righe) e `tests/manual_scripts/` (12 file, ~1.350 righe).
- **Prova**: nessun import da `src/`; non nel testMatch di jest.
- **Path**: `.agents/scratch/`, `tests/manual_scripts/`

### 5. `delete: File cancellati nel worktree ma ancora tracciati`
- **Cut** (è già-tagliato a disco): `hf_logs.txt`, `hf_logs2.txt`, `hf_logs3.txt`, `eslint_parsed.txt`, `test_keywords.js`, `test_kw_bug.js`, `Architettura_Grafo_Raccomandazioni.md`.
- **Azione**: solo `git add -u` + commit per non tornare nel tree.
- **Path**: root

### 6. `delete: utilities runtime morte in src/`
- **Cut**: `src/utils/queueProcessor.js` (131 righe) — export `processPendingScans`, **zero callers** (grep).
- **Path**: `src/utils/queueProcessor.js`

### 7. `delete: Starter SVG di Next mai usati`
- **Cut**: `next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg` — grep zero in `frontend/src`.
- **Path**: `frontend/public/`

### 8. `delete: Asset non referenziati`
- **Cut**: `public/assets/profile_updated.mp4` (non referenziato da frontend/src né index.js); blob di cache commitato `public/cache/images/8a059907...png`.
- **Path**: `public/`

### 9. `shrink: Immagine duplicata 3×`
- `fiamma_yaca.png` ha lo **stesso md5** (`09f25b80...`) in:
  - `public/fiamma_yaca.png`
  - `frontend/public/fiamma_yaca.png`
  - `frontend/src/app/icon.png`
- **Cut**: due delle tre; se serve l'icona app, referenzare il file unico.

### 10. `delete: Report di validazione commitato`
- **Cut**: `scripts/relevance_validation_report.json` (~1.780 righe) — artifact rigenerabile, va gitignored.
- **Path**: `scripts/relevance_validation_report.json`

---

## Cosa NON si tocca

- `docs/` (`README`, `AI_ENGINE`, ecc.) — documentazione utente.
- `todo/` — documentazione utente.
- `src/models` vs `src/db/models` — entrambe usate, fusione non necessaria.
- Le 14 deps in `package.json` — tutte con caller.
- `tests/*.test.js` (30 file, 4.752 righe) — suite jest che valida il runtime.

---

## Verifica (post-applicazione)

1. `npm test` — 30 suite jest verdi.
2. `node --check` sui file rimanenti.
3. Re-verifica grep: `processPendingSignal`, `profile_updated.mp4`, `rebuild_graph_v*` senza caller.
4. `npm run lint` pulito.

---

*Audit eseguito con `/ponytail-audit` — tagliare solo su conferma esplicita.*