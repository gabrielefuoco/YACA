# Harness di simulazione profili (`scripts/qa/`)

CLI per eseguire gli 8 profili di test di YACA sulla pipeline reale di produzione
(`https://mate.taild24589.ts.net`) **senza toccare il profilo reale `REOZrGNRr3`**.

- Spec dei profili: [`profiles.spec.json`](./profiles.spec.json) (modificare qui → rilanciare `profiles`).
- Protocollo di revisione (verdetti P/B/N, classi di catalogo, soglie): `.scratch/simulazione-profili/rubric.md`.
- Modello dati e decisioni: `.scratch/simulazione-profili/issues/07-*`, `08-*`, `09-*`.

## Prerequisiti

- `.env` nella root con `MONGODB_URI` e `TMDB_API_KEY` (la chiave viene scritta **solo** nel
  `UserAccount` di test; nessun token Trakt/Stremio viene copiato).
- Server di produzione raggiungibile (default `https://mate.taild24589.ts.net`, override `--url`/`YACA_BASE_URL`).
- Il server legge i profili da Atlas a ogni richiesta: dopo `profiles` non serve riavviarlo.

## Comandi

```bash
node scripts/qa/simulate.js profiles   # crea/aggiorna i documenti sim_* in Atlas
node scripts/qa/simulate.js fetch      # scarica manifest + cataloghi nella run dir
node scripts/qa/simulate.js review     # artefatti JSON+MD e summary strutturale
node scripts/qa/simulate.js compare <runA> <runB>
node scripts/qa/simulate.js teardown   # rimuove i dati sim_* e verifica il profilo reale
```

### `profiles`

| Flag | Default | Descrizione |
|---|---|---|
| `--spec <file>` | `scripts/qa/profiles.spec.json` | Spec alternativa |
| `--cold absent\|empty` | valore della spec (`cold_absent`) | Scenario del profilo Freddo: nessun documento `TasteProfile` vs documento con `V_final:{}` |
| `--report <file>` | `.scratch/simulazione-profili/atlas-state.json` | Report JSON dello stato materializzato |
| `--json` | off | Stampa il report completo |

Crea/aggiorna in Atlas:

- `useraccounts`: `userId: sim_user_yaca`, `addonUuid: sim-uuid-yaca`, `apiKeys: { tmdb }`.
- `addonconfigs`: `uuid: sim-uuid-yaca` con gli 8 profili, i cataloghi risolti
  (`yaca_preset_<id>` con `where`/`orderBy`/`queries`/`isAnime`) e gli hero in
  `raw_ui_state.selectedPresets`; `syncStatus.lastLibrarySync` fresco per non innescare sync di rete.
- `tasteprofiles`: cloni dei context reali (`owner → sim_user_yaca`, `context → sim_prof_*`,
  `V_static`/`V_active`/`V_final`/`idNames` copiati, `lastUpdated` **riportato a now()** così il
  ramo "stale" di `hybridRecommendations` non scatta). Per il Freddo: `cold_absent` (delete) o
  `cold_empty` (`V_final:{}`).
- `userlibraryitems` (watchlist account-level, 9 righe di cui **2 legacy con `itemId: null`**),
  `userlists` (1 lista), `watchhistories` (per `context` di profilo).

I due scenari freddi sono **due giri**: `profiles` (absent) → `fetch` → `review`, poi
`profiles --cold empty` → nuova `fetch` → nuova `review`.

### `fetch`

| Flag | Default | Descrizione |
|---|---|---|
| `--url <base>` | `https://mate.taild24589.ts.net` | Base URL del server |
| `--run <dir>` | nuova `<timestamp>` in `.scratch/simulazione-profili/runs/` | Run dir di destinazione |
| `--profiles a,b` | tutti | Filtra i profili (id o nome) |
| `--only id1,id2` | tutti i cataloghi del manifest | Filtra i cataloghi (id completo o base id senza `yaca_preset_`) |
| `--pages N` | `2` | Pagine per catalogo (`skip=0,20,…`) |
| `--fresh` / `--cached` | `--fresh` | `--fresh` appende `_nocache=<ts>`; `--cached` non lo appende |
| `--include-search` | off | Include `yaca_search_standard`/`yaca_search_ai` (richiedono un parametro `search`, fuori dal protocollo 40 item) |
| `--concurrency N` | `3` | Richieste parallele (max 5) |
| `--pacing ms` | `60` | Pausa fra richieste dello stesso worker |

Per ogni profilo: imposta `config.activeProfileId`, scarica il manifest e ogni catalogo selezionato
su 2 pagine. Con `--only` è possibile chiedere anche **fetch dirette** di preset/hero non presenti
nel manifest (piano di copertura 160/160, `profiles-proposal.md` §C): vengono serviti dal
`catalogHandler` solo se conformi ai `typeSelectors` del profilo; gli id non conformi vengono
registrati come `skippedCatalogs` in `run.json`. A fine fetch `activeProfileId` torna al default
della spec.

**Cache**: `_nocache` invalida la cache esterna delle richieste (`tmdb_catalog`, chiave hash che
include utente/profilo/configVersion). La cache interna degli hero (`recommendation_cache`,
chiave `userId_context_catalogId`) ha TTL 7 giorni e **non** è bypassabile via `_nocache`: per
ripartire da zero usare `teardown` (che cancella anche le chiavi Redis `sim_*`) o attendere il TTL.
I test di cache si fanno con due fetch: la prima `--fresh` (popola), la seconda `--cached` (hit).

### `review`

| Flag | Default | Descrizione |
|---|---|---|
| `--run <dir>` | ultima run | Run da revisionare |
| `--profiles a,b` | tutti | Filtra i profili |
| `--spec <file>` | spec di default | Per i nomi leggibili dei profili |

Genera, per ogni profilo×catalogo, un JSON e un MD con **metriche strutturali** (nessun verdetto):

- conteggi (item restituiti, unici, **primi 40 revisionati** in ordine di pagina — protocollo rubric);
- `vuoto` (0 item) e `semi-vuoto` (< 10);
- duplicati **intra-pagina** su id normalizzato namespace-aware (posizioni e pagine);
- **sovrapposizione fra pagine** (`pagine-sovrapposte`): i preset DuckDB possono restituire
  fino a 100 item per pagina, quindi `skip=0` e `skip=20` si sovrappongono — la ricerca 04
  richiede intersezione vuota, quindi va segnalato (ticket 16);
- item di tipo sbagliato (film in un catalogo serie, ecc.);
- distribuzione degli id per namespace;
- overlap tra i **4 hero dello stesso tipo** (invariante rubric: zero overlap).

Il summary (`review/summary.json` + `.md`) aggrega i totali e la matrice di overlap hero per profilo.
I campi `verdict`/`reason`/`evidence` di ogni item restano **vuoti**: si compilano a mano secondo
`rubric.md` (un artefatto per catalogo, verdetti P/B/N).

### `compare <runA> <runB>`

Confronta due run (usa `review/` se presente, altrimenti `raw/`) e scrive
`<runB>/compare_<runA>.md` (+ `.json`): item spariti/aggiunti/cambiati/spostati, transizioni
vuoto↔pieno, variazione dell'overlap hero. È la base della verifica post-fix (ticket 19).

### `teardown`

| Flag | Default | Descrizione |
|---|---|---|
| `--dry-run` | off | Conta senza cancellare |
| `--redis-url <url>` | `REDIS_URL` o `redis://127.0.0.1:6379` | Redis da pulire (best-effort) |

Cancella per regex `^sim_user_`/`^sim-uuid-` da `useraccounts`, `addonconfigs`, `tasteprofiles`,
`recommendationimpressions`, `userlists`, `userlibraryitems`, `watchhistories` e le chiavi Redis
`*sim_user_yaca*`, `*sim-uuid-yaca*`, `*sim_prof_*`. **Mai `flushdb`.** Verifica finale che
`REOZrGNRr3` (addonUuid `ff7084d8-…`) esista ancora con i suoi 17 `TasteProfile`; esce con codice 1
in caso di anomalia o residui.

## Struttura degli artefatti

```
.scratch/simulazione-profili/runs/<timestamp>/
  run.json                        # metadati: baseUrl, mode, profili, conteggi, errori, gitRev
  raw/<profileId>/_manifest.json  # manifest grezzo del profilo attivo
  raw/<profileId>/<catalogId>.json# pages[] + rawPages[] (payload server intatti)
  review/<profileId>/<catalogId>.json/.md
  review/summary.json / summary.md
  compare_<runA>.md / .json       # da `compare`
```

Item del review JSON: `id`, `title`, `year`, `type` + `verdict`/`reason`/`evidence` vuoti, più
metadati di supporto (`position`, `page`, `skip`, `genres`, `imdbRating`, `tlBadge`, `trBadge`, `poster`).

## Esempio (smoke test)

```bash
node scripts/qa/simulate.js profiles
node scripts/qa/simulate.js fetch --profiles sim_prof_cinefilo,sim_prof_freddo \
  --only yaca_true_blend_movies,yaca_true_blend_series,yaca_seed_network_movies,yaca_seed_network_series,\
yaca_hidden_gems_movies,yaca_hidden_gems_series,yaca_trakt_filtered_movies,yaca_trakt_filtered_series,\
preset_nolan,preset_pop_series
node scripts/qa/simulate.js review
```

## Limiti noti

- **Nessun token Trakt** negli account di test (per isolamento): gli hero `yaca_trakt_filtered_*`
  e la rete seed usano i fallback DuckDB/TMDB invece delle raccomandazioni Trakt.
- La cache interna degli hero ha TTL 7 giorni: se Redis non è raggiungibile da dove gira l'harness,
  `teardown` non può pulirla (viene segnalato) e i risultati hero possono restare quelli della prima build.
- `recommendationimpressions` del solo utente di test vengono scritte durante i fetch hero e
  rimosse dal teardown.
- I cataloghi di ricerca (`yaca_search_*`) non sono scaricati di default: richiedono un parametro
  `search` e non seguono il protocollo "primi 40 item".
