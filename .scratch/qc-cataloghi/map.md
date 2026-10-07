# Mappa: QC Cataloghi (preset + hero)

**Aperta**: 06/10/2026 · **Tracker**: markdown locale, `.scratch/qc-cataloghi/issues/` · **Stato**: in corso

## Destinazione

Sapere, catalogo per catalogo, **cosa c'è davvero dentro** i 161 preset e gli 8 hero di YACA, con un
punteggio di qualità difendibile e un verdetto P/B/N. Non un audit di soglie: la lettura dei primi 50
titoli di ogni catalogo, con giudizio esplicito su pertinenza alla promessa, qualità, distintività,
coerenza dell'ordine e completezza del pool.

Il prodotto della mappa è **un report con ranking** (`.scratch/qc-cataloghi/ricerche/`) più **ticket di
bonifica** raggruppati per causa, non un fix: le correzioni sono lavoro di un'altra mappa.

**Esito (06/10/2026)**: report scritto, 12 ticket di bonifica aperti, 2 preset N e 63 B da lavorare, più un bug
verificato sul selettore «Solo Anime» dei hero (ticket 13).
La mappa si chiude qui: la bonifica vive nei ticket, questo racconto resta per chi la riprende.

## Perché adesso

`scripts/qa/catalog-audit.js` misura le soglie (score mediano, overlap J@40, keyword morte) e
`scripts/qa/simulate.js` misura la struttura delle risposte live. Nessuno dei due guarda i titoli: un
catalogo può passare tutte le soglie ed essere comunque imbarazzante — o fallirle per un dettaglio
irrilevante. La qualità editoriale non è mai stata verificata su tutti i cataloghi.

## Decisioni (06/10/2026)

| # | Decisione | Alternativa scartata, perché |
|---|---|---|
| D1 | **Seam doppio**: preset offline su DuckDB (parquet di produzione copiati in `.cache/tmdb/`), hero live via `simulate.js` su produzione | Tutto offline: gli hero dipendono da DNA/seed/Trakt, offline non esistono. Tutto live: 161 preset non sono tutti nel manifest di un profilo, e la cache di produzione si sporca |
| D2 | **Rubrica a 5 dimensioni pesate** (pertinenza 35, qualità 20, distintività 15, coerenza 15, completezza 15) → score 0-100 → **P ≥ 80 / B 60-79 / N < 60** | Solo punteggio: non dice quale dimensione è rotta. Solo finding meccanici: non coglie «la promessa non è mantenuta» |
| D3 | **Giudizio delegato ad agy**, a lotti tematici di ~15±5 cataloghi, output a schema fisso; verifica dell'orchestratore su tutti gli N e ~10% dei P/B | Un agente unico: 161×(promessa+50 titoli) non entrano in un contesto solo con qualità costante |
| D4 | Ancore di punteggio **esplicite per dimensione** nel brief al giudice | Ancore implicite: due lotti diversi darebbero scale diverse, e il ranking sarebbe rumore |
| D5 | Report in `ricerche/` (versionato), dump grezzi in `runs/` (gitignorato) | Tutto in `runs/`: la memoria della mappa sparirebbe al primo clone, e la lezione del 06/10/2026 dice che non va bene |
| D6 | Ticket di bonifica **raggruppati per causa** (es. «anime nei preset occidentali», «pool sotto 60»), non uno per catalogo | 161 ticket: nessuno li chiude. Le cause sono poche e si ripetono |

## Nebbia (da sciogliere mentre si lavora)

- **Trakt live non coperto**: i profili sim non hanno token Trakt, quindi `trakt_filtered` si giudica sul
  percorso di degrado. Quanto vale la pena verificare il percorso vero (profilo reale) va deciso dopo
  aver visto il degrado.
- **Soglia del «semi-vuoto»**: la skill parla di 60 elementi, `catalog-audit.js` usa altre soglie. Se i
  due numeri non coincidono, vince quello che spiega il sintomo (pagina corta in Stremio), non il più
  comodo.
- **Doppio giudice**: quanto del punteggio è rumore del giudice? Se un lotto ri-giudicato da un secondo
  agente diverge di >15 punti, la rubrica va stretta prima di pubblicare il ranking.

## Fuori ambito

Fix dei cataloghi, mappe TMDB→Kitsu, prestazioni, frontend, cataloghi di ricerca/watchlist, e il preset
`preset_anime_simulcast` (non passa dal parquet: `_provider = airing_state`).

## Ticket

Campagna **eseguita**: 160/160 preset + 40/40 liste hero giudicate, 582 righe di errore con 0 titoli
inesistenti. Report: [`ricerche/01-report-qc-cataloghi.md`](ricerche/01-report-qc-cataloghi.md) · numeri:
`ricerche/report.json`. **Preset**: 112 P · 46 B · 2 N (media 85,4). **Hero**: 23 P · 17 B · 0 N (media 82,8).
Il metodo ha mostrato i suoi limiti: Δ fino a 34 punti fra due giudici ciechi, 25% dei verdetti a ridosso di
una soglia.

**In più**, la verifica di un giudice hero ha fatto emergere un bug vero: con un profilo «Solo Anime» i hero
servono titoli non-anime marcati `_isAnime: true` (14 su 20 nel test dedicato) — ticket 13.

- [01 — Campagna QC cataloghi (spec)](issues/01-campagna-qc-cataloghi.md) · **eseguito**
- [02 — Anime fuori promessa nei cataloghi occidentali](issues/02-anime-fuori-promessa.md) · `ready-for-agent`
- [03 — Promesse appoggiate a una singola keyword](issues/03-keyword-come-promessa.md) · `ready-for-agent`
- [04 — Pool sotto la pagina Stremio](issues/04-pool-sotto-la-pagina.md) · `ready-for-agent`
- [05 — Soglie di voto e anti-trash](issues/05-soglie-voti-e-trash.md) · `ready-for-agent`
- [06 — Cataloghi di persona: documentari, corti e cameo](issues/06-cataloghi-di-persona.md) · `ready-for-agent`
- [07 — Corti, backstage e trailer serviti come film](issues/07-corti-e-trailer.md) · `ready-for-agent`
- [08 — Nome e filtro che non dicono la stessa cosa](issues/08-nome-vs-filtro.md) · `ready-for-agent`
- [09 — Hero: il fallback non deve travestirsi da raccomandazione](issues/09-hero-fallback-invisibile.md) · `ready-for-agent`
- [10 — Hero trakt_filtered: percorso reale mai misurato](issues/10-hero-trakt-reale.md) · `ready-for-agent`
- [11 — Harness: fixture stantie e comandi che ingannano](issues/11-harness-fixture-stantie.md) · `ready-for-agent`
- [12 — Rubrica: rumore del giudice e promessa tematica](issues/12-rubrica-rumore.md) · `ready-for-agent`
- [13 — Solo Anime non filtra i hero: il marcatore `_isAnime` è `true` su tutto](issues/13-solo-anime-non-filtra-i-hero.md) · `ready-for-agent` · **da fare per primo**

## Nebbia residua

- **Secondo giro di giudizio** su un campione con la rubrica stretta (ticket 12): serve a sapere se il ranking è ripetibile.
- **Percorso Trakt reale** (ticket 10): senza, un quarto dell'esperienza hero resta non misurato.
- **Il confine P/B**: 40 verdetti a ridosso della soglia, con o senza seconda campagna, restano bande.
