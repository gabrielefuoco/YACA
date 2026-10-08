# 03 — Deploy, ricostruzione e verifica: prima / dopo sulle liste servite

**Data**: 08/10/2026 · **Mappa**: [../map.md](../map.md) · **Mappe collegate**: [`.scratch/livello-latente/`](../../livello-latente/map.md)
**Banco**: harness `scripts/qa/simulate.js` (5 contesti reali clonati) + `analyze-serviti.js` + `diff-run.js` + `compare-analisi.js`

---

## 1. Cosa è stato fatto, in ordine

| # | Passo | Esito |
|---|---|---|
| 1 | Push su `main` di 11 commit (fix id↔nome, ricostruzione admin, prototipo OCEAN) | `f4bbeb9` |
| 2 | Build GitHub Actions → GHCR | ✅ `completed success`, 07:41 UTC |
| 3 | Deploy sul mate: `git pull` + `docker compose pull` + `up -d --no-build` | immagine `9932ad10…` → **`ed1f1bad…`**, container `healthy` |
| 4 | Verifica che il fix sia nell'immagine | `setKeywordNameMaps` presente, `rebuild_dna_vectors` presente |
| 5 | **Ricostruzione dei profili** via `POST /api/admin/scripts/trigger` | **10/10 profili in 4,5 s** |
| 6 | Censimento DNA prima/dopo | le chiavi a nome coprono le numeriche (sotto) |
| 7 | Fetch degli hero serviti (5 contesti clonati × 8 cataloghi) prima e dopo | 55 cataloghi, 0 errori |
| 8 | Confronto liste + nitidezza + ponte film↔serie | sotto |

**Trappola trovata al passo 7**: il primo fetch "dopo" è tornato **byte-identico** al "prima" (55/55 liste, 1,1 s contro 21 s di risposta). Era la **cache**: gli hero vivono in `recommendation_cache` con **TTL 7 giorni** (`src/config.js:39`). Svuotata via `POST /api/admin/system/flush {"namespace":"recommendation_cache"}`, il fetch successivo ha prodotto liste vere. **Conseguenza operativa: dopo una ricostruzione i cataloghi restano quelli vecchi per una settimana, se non si svuota la cache.**

## 2. Il DNA dei profili reali, prima e dopo

| profilo | V_final | chiavi `k:` a nome | livelli L1–L5 |
|---|---|---|---|
| `REOZrGNRr3/global` | 1408 → **2065** | 289 → **625** ✅ | 475 → **795** ✅ |
| `REOZrGNRr3/4159713d` | 1445 → **2086** | 303 → **628** ✅ | 484 → **799** ✅ |
| `REOZrGNRr3/1c1da0af` | 1404 → **2046** | 292 → **618** ✅ | 475 → **790** ✅ |
| `REOZrGNRr3/0465f104` | 1433 → **2066** | 299 → **622** ✅ | 487 → **796** ✅ |
| `REOZrGNRr3/3f2f4afd` | 1440 → **2067** | 305 → **627** ✅ | 488 → **792** ✅ |

Ogni chiave numerica ha ora il suo nome, e i livelli gerarchici passano da ~480 a ~795 per profilo. Predizione della mappa (copertura 99,9%): rispettata.

Scoperta collaterale: `V_static` è **vuoto** in tutti i profili reali (0 chiavi). Tutto il DNA viene dalla cronologia **più la libreria Stremio dell'account** (`ProfileBuilder.recomputeVectorsForUser` legge `UserLibraryItem` con peso 1 per titolo): è per questo che il clone senza libreria ha 900 chiavi contro le 2065 del profilo vero.

## 3. Le liste servite: quanto è cambiato

55 cataloghi (5 profili × 8 hero + watchlist), prima di tutto svuotando la cache.

| misura | valore |
|---|---|
| liste **identiche** (stesso ordine) | **22 / 55** |
| Jaccard medio | **81,6%** |
| cataloghi con sovrapposizione < 50% | 2 / 55 |

Le liste che cambiano di più: `4159713d/hidden_gems_series` (38%), `4159713d/true_blend_series` (43%), `4159713d/true_blend_movies` (54%), `global/hidden_gems_movies` (57%), `global/true_blend_movies` (57%).

## 4. Test (a) — nitidezza della cima, prima vs dopo

Misura: ogni titolo servito viene ripunteggiato con lo stesso codice dello scorer e collocato nella distribuzione di un pool ampio (3.000 film + 1.500 serie). «Nel top 5%» = quota della lista che sta in cima alla distribuzione del pool. Caso casuale: 5%.

| misura | prima | dopo | delta |
|---|---|---|---|
| percentile mediano degli item serviti | 77% | 78% | **+0,9 pt** |
| percentile dell'ultimo item | 69% | 71% | **+1,7 pt** |
| **quota nel top 5% del pool** | **30%** | **33%** | **+3,1 pt** |
| quota bambini/animazione | 35% | 33% | **−1,9 pt** |

E i casi dove morde davvero:

| catalogo | item | nel top 5%: prima → dopo | percentile mediano | bambini/animazione |
|---|---|---|---|---|
| `4159713d/hidden_gems_series` | 40 → 40 | **55% → 80%** | +13 pt | **−25 pt** |
| `4159713d/true_blend_series` | 40 → 40 | 53% → 68% | +7 pt | **−20 pt** |
| `global/true_blend_movies` | 40 → 40 | 38% → 50% | +2 pt | 0 |
| `global/true_blend_series` | 40 → 40 | **15% → 28%** | +4 pt | 0 |
| `global/hidden_gems_movies` | 40 → 40 | 13% → 23% | −3 pt | 0 |
| `1c1da0af/trakt_filtered_movies` | 19 → 19 | 89% → 79% | −0 pt | 0 |

Lettura: il guadagno è **modesto in media ma concentrato** — si vede dove il profilo era più povero (`4159713d`, `global`), che è esattamente dove la gerarchia mancava. E la contaminazione bambini/animazione **cala di 20-25 punti** nel profilo che ne soffriva di più: la tua preoccupazione era fondata e questo l'ha ridotta. L'unico peggioramento è il catalogo `trakt_filtered` del profilo anime, che resta il percorso degradato già noto dalla campagna QC.

## 5. Test (b) — ponte film↔serie sulle liste servite

Misura: i 3 topoi L2 dominanti della lista FILM, e quanta parte della lista SERIE li condivide (e viceversa), contro il caso.

| direzione | prima | dopo | caso |
|---|---|---|---|
| film → serie | 49% | **56%** | 13% |
| serie → film | 63% | 62% | 22% |

Il trasferimento c'è (4× il caso) e **migliora nella direzione che conta** (film → serie), mentre l'altra resta stabile. Nessuna delle due liste è vuota di temi condivisi: il ponte è reale anche nelle liste servite, non solo nel banco.

## 6. Limiti dichiarati

- Prima e dopo differiscono in **due** cose insieme (il codice e il DNA ricostruito): è la variazione reale di produzione, ma non isola quale delle due pesa.
- I confronti usano **cloni** dei contesti reali (DNA e cronologia veri, libreria no) su un utente di test: le liste sono quelle che *quel* profilo riceverebbe, non quelle della tua sessione Stremio.
- Le 22 liste identiche possono contenere differenze di ordine non misurate qui (il confronto è sull'insieme ordinato: identiche significa identiche).
- Il `trakt_filtered` degrada per una causa sua (fallback senza token), non per questo fix.

## 7. Come si riproduce

```bash
node .scratch/ocean-prototipo/build-spec-reali.js                     # spec dai profili reali
node scripts/qa/simulate.js profiles --spec .scratch/ocean-prototipo/runs/profili-reali.spec.json
node scripts/qa/simulate.js fetch    --spec .scratch/ocean-prototipo/runs/profili-reali.spec.json --run .scratch/ocean-prototipo/runs/dopo
node .scratch/ocean-prototipo/analyze-serviti.js .scratch/ocean-prototipo/runs/dopo
node .scratch/ocean-prototipo/runs/diff-run.js .scratch/ocean-prototipo/runs/prima .scratch/ocean-prototipo/runs/dopo
node .scratch/ocean-prototipo/runs/compare-analisi.js
```

Svuotare la cache prima di un fetch "dopo", altrimenti si misura il passato:
`POST /api/admin/system/flush {"namespace":"recommendation_cache"}`.
