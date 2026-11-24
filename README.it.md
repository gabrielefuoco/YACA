# YACA

![YACA](public/fiamma_yaca.png)

Addon stateful per Stremio che risponde alle richieste di catalogo interrogando un dataset colonnare locale invece dell'endpoint di discovery di TMDB, e ordina i titoli con un servizio PageRank su cluster di film e serie correlati.

## Indice

- [Features](#features)
- [Come funziona](#come-funziona)
- [Documentazione](#documentazione)
- [Quickstart](#quickstart)
- [Configurazione](#configurazione)

## Features

- **Cataloghi da un dataset locale.** Filtri e paginazione sono SQL sul dump locale; l'endpoint di discovery remoto non è sul percorso della richiesta.
- **Righe hero con composizione spiegabile.** Quattro blocchi in ordine di priorità fisso — true blend, seed network, hidden gems, trakt filtered — ogni id assegnato una volta sola.
- **Una libreria che distingue fatti da deduzioni.** L'identità canonica decide se un titolo è film, serie o anime; i duplicati sono un bug, non una scelta di interfaccia.
- **Ricerca in linguaggio naturale.** Un router mappa una frase dalla barra di ricerca Stremio su filtri strutturati (opzionale, richiede una chiave Mistral).
- **Badge episodio anime e stato del doppiaggio italiano**, tenuti in memoria da un worker.
- **Sincronizzazione bidirezionale con Trakt** tramite device flow OAuth.

## Come funziona

```mermaid
graph TD
    C[Client Stremio] -->|HTTPS| F[Tailscale Funnel]
    F --> A[app · Node.js + Express · 1536 MB]
    A --> D[(DuckDB in-memory<br/>Parquet ZSTD)]
    A --> R[(Cache L2 Redis · 300 MB)]
    A --> M[(MongoDB Atlas<br/>profili e configurazione)]
    A -->|HTTP :7862| G[graph · PageRank Python · 512 MB]
    A --> S[export statico Next.js<br/>servito dallo stesso processo]
    W[watchtower · 50 MB] -.->|scarica le nuove immagini| A
    T[tmdb-daemon · 1024 MB] -->|costruisce il dump locale| D
    N[anime-source · 256 MB] -->|stato episodi e doppiaggio| A
    GH[GitHub Actions] -->|immagini| GHCR[(GHCR)]
    GHCR -.->|pull| W
```

Sei container, ognuno con un tetto di memoria dichiarato. L'app è l'unico componente esposto a internet, tramite un Funnel di Tailscale; il servizio del grafo, Redis, MongoDB e i worker sono raggiungibili solo dentro la rete compose.

| Componente | Responsabilità | Memoria |
|---|---|---|
| `app` | Superficie HTTP, logica dei cataloghi, query DuckDB, cache, frontend statico | 1536 MB |
| `graph` | PageRank sui cluster di titoli, servito su `:7862` | 512 MB |
| `redis` | Cache L2, `maxmemory 256mb`, `allkeys-lru`, persistenza disattivata | 300 MB |
| `tmdb-daemon` | Costruisce e aggiorna il dump Parquet locale | 1024 MB |
| `anime-source` | Badge episodio e stato del doppiaggio italiano | 256 MB |
| `watchtower` | Scarica le nuove immagini da GHCR e riavvia i container | 50 MB |

**Il percorso del catalogo.** Una richiesta viene risolta su due dataset locali: 117k titoli con titolo italiano e poster pronti (Tier 1) e 1.485.129 titoli dall'export TMDB letti tramite indice FTS5 (Tier 2). Quando entrambi contengono lo stesso id, vince il record locale. Se l'indice manca o è illeggibile, la risposta è esattamente quella di prima che il Tier 2 esistesse.

**Il percorso dell'ordinamento.** Un vettore di gusti (pesato per interazione: love 4×, like 3×, watch 2×) viene combinato con il servizio del grafo, che diffonde PageRank su cluster — "mondi" — di titoli correlati. Le righe hero sono riempite da quattro blocchi in ordine di priorità fisso, ogni id assegnato una volta sola, e l'intero gruppo viene messo in cache insieme. La chiave della cache si costruisce da contesto, modalità kids e selettori di tipo; metterci la versione della configurazione orfanerebbe l'intera cache a ogni salvataggio — misurate 18 chiavi orfane su 23, con la stessa combinazione utente/profilo/tipo ricostruita nove volte da 21 a 42 secondi.

### Decisioni principali

**I filtri dei cataloghi sono una query SQL su un dump locale.** Cambiare filtro non costa una chiamata esterna e funziona anche quando TMDB non risponde. L'alternativa — tradurre ogni richiesta in una chiamata di discovery remota — mette latenza e ordinamento del fornitore sul percorso della richiesta. Il prezzo è una pipeline dati che deve girare e restare fresca: `tmdb-daemon` esiste per questa scelta.

**Il grafo gira come processo Python separato.** Caricare l'artefatto costa 2,05 s e 128 MB residenti. In-process si pagherebbe a ogni riavvio dell'app e competererebbe con il percorso delle richieste per la memoria. Dietro HTTP si carica una volta e resta fermo a 128 MB, e il grafo si può ridistribuire senza toccare l'addon.

**Il taglio delle keyword è alfabetico e deterministico.** Prima campionava 30 keyword a caso tra i figli di un nodo, quindi lo stesso nodo restituiva un insieme diverso a ogni chiamata: osservato su 25 dei 469 nodi L2, il più ricco con 57 keyword. Pool diverso a ogni cache miss, ordinamento irriproducibile, cache che non colpiva mai. Un test di contratto protegge il taglio deterministico.

**La composizione dei poster vive fuori dal processo dell'app.** I badge venivano disegnati in-process con `sharp` e `text-to-svg`, dietro una cache su disco. La composizione ora appartiene a un servizio esterno; YACA rende `/erdb-poster/:file` al primo miss, accoda l'evento se il servizio è giù, e tiene `/images/poster/...` come 302 per i client che conservano URL vecchi. `BadgeDiskCache`, `sharp` e `text-to-svg` non ci sono più, lockfile compresi.

### Misure

Servizio del grafo — benchmark su campione reale: 100 semi di storia Trakt, 4 liste, cap 60.

| Metrica | Valore | Nota |
|---|---|---|
| Avvio del processo, caricamento artefatti | 2,05 s | 66.259 titoli e 3.497 cluster da `.npz` |
| `GET /health` | 0,25 ms | contratto: sotto 1 ms |
| `POST /raccomanda` a freddo | 95,44 ms | prima chiamata dopo l'avvio |
| `POST /raccomanda` a caldo | 92,39 ms | media su 10 iterazioni, minimo 86,62 ms |
| Memoria residente | 128,4 MB | limite container 512 MB |
| Volume artefatto sull'host | 138 MB | contro 666 MB con gli scarti locali |

Correzioni misurate in produzione (ottobre 2026):

| Correzione | Prima | Dopo |
|---|---|---|
| Titoli mostrati con caratteri CJK | 716 serie su 3.177, 1.845 film su 4.351 | serie visibili 481 → 1, film 32 → 0, 757 titoli sanati |
| Quota anime in pagina 1 dell'hero per un profilo con DNA anime | 15 % | 100 % |
| Merge e interleave fra cataloghi | usati da 0 cataloghi su 73 | rimossi, tenuto il percorso di modifica |

La campagna di pulizia che è seguita ha rimosso percorsi morti, definizioni duplicate e due cache scritte a mano (sostituite dalla `LRUCache` già presente nel repository): 830 righe in meno dal codice, e `isItemAnime` da 4 definizioni a 1.

### Stato e limiti noti

| Cosa | Impatto | Stato |
|---|---|---|
| Un fallback può finire in cache come raccomandazione | profilo freddo: «scelti per te» uguale a «film popolari» per 7 giorni, visibile solo nei log (`fallbackUsed=true`) | aperto, correzione nota |
| La suite di test non gira in CI | i tre workflow costruiscono e pubblicano immagini; una regressione può passare inosservata | aperto |
| `heroMovieDateRegression` fallisce in suite completa, passa isolato | un rosso di cui non fidarsi | accettato, dipendenza dall'ordine |
| Il percorso dei cataloghi non ha un benchmark | nessuna cifra riproducibile da dichiarare, quindi nessuna ne viene dichiarata | accettato |
| L'uso non è strumentato | nessun dato su profili, richieste o uptime | accettato |
| Assunzioni da singolo utente | i profili sono configurazione, non account; nessun isolamento multi-tenant | accettato per progetto |

## Documentazione

Documentazione di prodotto, tenuta allineata al codice (la convenzione è che il codice è la verità e i documenti lo seguono):

- [Grafo delle raccomandazioni](docs/RECOMMENDATION_GRAPH.md) — il servizio PageRank, il suo contratto e le misure qui sopra
- [Architettura DuckDB](docs/DUCKDB_ARCHITECTURE.md) — il dataset colonnare in memoria
- [Algoritmi e scoring](docs/ALGORITHMS.md) — vettore di gusti, rating bayesiano, contratti hero, trappole note
- [Logica dei cataloghi](docs/CATALOG_LOGIC.md) — ciclo di vita delle richieste, cache a due livelli, ricerca Tier 1 / Tier 2
- [Internals Stremio](docs/STREMIO_INTERNALS.md) — manifest, profili, mapping anime
- [Modulo libreria](docs/LIBRARY_MODULE.md) — fatti contro deduzioni, identità canonica
- [Motore AI](docs/AI_ENGINE.md) — routing della ricerca in linguaggio naturale
- [Frontend](docs/FRONTEND.md) — l'export statico e il modello di sessione
- [Integrazioni](docs/INTEGRATIONS.md) — device flow di Trakt
- [Testing e utilities](docs/TESTING_UTILITIES.md) — suite e script operativi
- [Deploy su home server](docs/DEPLOYMENT_HOME_SERVER.md) — Docker Compose, Tailscale, Watchtower
- [Changelog](docs/CHANGELOG.md) — modifiche recenti con le misure che le sostengono

## Quickstart

Requisiti: Node.js 20+, Redis e MongoDB (Atlas va bene). Il servizio del grafo è opzionale: senza di esso l'ordinamento ricade sul solo scoring.

```bash
npm ci
cd frontend && npm ci && cd ..
npm run build        # compila l'export Next.js
npm start            # node --expose-gc index.js, in ascolto su :7860
```

Per lo stack completo, incluso il servizio del grafo, Redis, il costruttore del dump e gli aggiornamenti automatici:

```bash
docker compose up -d
```

Test:

```bash
npm test          # Jest: 199 suite, 1.986 test, ~111 s
pytest services   # servizi Python
```

## Configurazione

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `MONGODB_URI` | **Sì** | Stringa di connessione a MongoDB Atlas per profili e account. |
| `TMDB_API_KEY` | **Sì** | API key globale TMDB per i metadati estesi. |
| `HOST_URL` | **Sì** | URL pubblico del server, usato per poster, badge e manifest Stremio. |
| `REDIS_URL` | No | Server della cache L2 (default `redis://127.0.0.1:6379`, `redis://redis:6379` in compose). |
| `MISTRAL_API_KEY` | No | Abilita la ricerca in linguaggio naturale. |
| `JWT_SECRET` | No | Chiave di firma dei token di sessione (fallback casuale a ogni avvio se assente). |
| `PORT` | No | Porta HTTP del backend (default `7860`). |
| `GRAPH_SERVICE_URL` | No | URL del servizio di raccomandazione (default `http://graph:7862` nella rete compose). |
| `GRAPH_TAG` | No | Tag dell'immagine Docker `yaca-graph` (default `latest`). |
| `TRAKT_CLIENT_ID` | No | Client id Trakt.tv per la sincronizzazione di libreria e cronologia. |
| `TRAKT_CLIENT_SECRET` | No | Client secret Trakt.tv per il flusso OAuth. |
| `CORS_ALLOWED_ORIGINS` | No | Origini consentite per le API pubbliche (default `*`). |
