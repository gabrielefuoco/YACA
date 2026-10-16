Status: resolved
Type: task

# Il motore del grafo entra nel FEED — e sono due strade, non una

La rotta `POST /api/bolle` esiste, è montata e verificata (l'app parte, `GET /` risponde 200, la rotta
risponde 401 senza sessione). Ma **il feed non la usa**: le raccomandazioni che l'utente vede in Stremio
vengono da un altro posto, e questo ticket è la decisione che manca.

## Dove sta il feed, verificato

`src/engines/hybridRecommendations.js` produce **quattro «hero catalog»**:

    HERO_PRIORITY = ['true_blend', 'seed_network', 'hidden_gems', 'trakt_filtered']

e sono le righe dichiarate nel manifest di Stremio (`src/api/stremio.js:250-257`):

    yaca_true_blend_*      ⭐ Scelti per Te
    yaca_seed_network_*    🕸️ La Rete dei tuoi Preferiti
    yaca_hidden_gems_*     💎 Gemme Nascoste
    yaca_trakt_filtered_*  🌐 Suggeriti dalla Community

I quattro si calcolano insieme (`Promise.all` a riga 246), passano da una cache per profilo, e il
`catalogHandler` li smista per `id`. Cioè: **c'è già un sistema di righe raccomandate**, e il motore del
grafo deve entrare lì — non in una rotta a parte, che resta utile per il frontend e per il debug ma non è
il feed.

## Le due strade, e la decisione è del proprietario

**A. Una QUINTA hero** («I tuoi mondi», dal portafoglio delle bolle). Si aggiunge una voce a
`HERO_PRIORITY`, un ramo nel `Promise.all`, due righe nel manifest (film e serie), un ramo nel
`catalogHandler`. **Pro**: non tocca niente di esistente, si misura da sola, si spegne togliendo una riga.
**Contro**: due motori che dicono cose diverse nella stessa schermata, senza che nessuno spieghi come
convivono.

**B. Il grafo ALIMENTA `true_blend`** come sorgente di candidati. **Pro**: una sola riga «per te», con la
spiegazione del mondo dietro. **Contro**: si entra nella logica del pool e delle priorità di un motore che
non è nostro, e un errore lì peggiora *tutte* le raccomandazioni, non una.

## Dove si tocca, in ogni caso

| cosa | dove | nota |
|---|---|---|
| il calcolo delle righe | `src/engines/hybridRecommendations.js` (`HERO_PRIORITY:65`, `Promise.all:246`) | è il posto in cui il motore entra nel feed |
| le righe del manifest | `src/api/stremio.js:250-257` | due righe per il medium film/serie |
| la consegna della riga | `src/handlers/catalogHandler.js` (dispatch per `id`) | deve tornare **MetaPreview**: poster, nome, anno — non `{type, id}` |
| la storia del profilo | `WatchHistory` con `{owner, context}` | già pronta: è quella che usa anche la rotta |
| i due pezzi mancanti | `uscite_nuove` e `nicchia_di_qualita` | anni, popolarità e voto medio stanno nel catalogo del prodotto |

## Cosa NON è un problema

L'artefatto: `src/data/bolle.json` (3,2 MB) **è in git**, quindi qualunque istanza dell'app ce l'ha — la
Space, il mate, un portatile appena clonato. E `raccomanda.js` ha la sua cache con la chiave che porta
artefatto e impronta della ricetta: se l'artefatto cambia, le liste vecchie non vengono servite.

## LA CUCITURA ESATTA, e i numeri che servono per decidere (trovati il 16/10/2026)

Il posto preciso in cui il motore entra: `buildSharedHeroCatalogs` in `hybridRecommendations.js`.

    const [trueBlend, seed, hidden, trakt] = await Promise.all([
        runPoolBuilder(builder, fallback, 'true_blend', [args]),   // <- una voce in piu' e' una sorgente in piu'
        ...
    ]);
    const pools = { [getHeroCatalogId('true_blend', mediaType)]: normalizePoolResult(trueBlendResult), ... }

Una sorgente nuova = un `runPoolBuilder` in piu' + una voce in `pools` + due righe nel manifest + una voce
in `HERO_PRIORITY`. Il pool e' un array di **id TMDB numerici** (`normalizePoolResult` accetta `[...]` o
`{ids: [...]}`), e tutto l'arricchimento (poster, badge, cache per profilo) e' **condiviso**: non va
toccato. Quindi la cucitura e' piccola.

**MA NON E' UNA RIGA IN PIU', e questi sono i numeri che lo dicono.**

1. **L'assegnazione e' DISGIUNTA**: un titolo va in UNA sola riga. Lo dice il codice stesso — «con un pool
   a monte di 160, true_blend (primo nella priorita') consuma 50 item, impoverendo a cascata» — e il
   budget e' `heroCandidateLimit = 160` (250 in contesto stretto) per **4 righe x 50 = 200 titoli
   disgiunti**. Una quinta riga **affama le altre quattro**: o si alza il bacino (piu' latenza TMDB/DuckDB)
   o si abbassa il numero per riga (righe piu' corte). **E' una decisione misurata, non un dettaglio.**
2. **TREDICI FILE DI TEST** fissano il comportamento degli hero: `heroDiversity` (471 righe),
   `heroPolicyAndTrakt` (611), `hybridRecommendations` (293), piu' `animeContentFilter`,
   `catalogCacheKeys`, `catalogKindAndSelectors`, `heroAnimeTypeSelectors`, `heroMovieDateRegression`,
   `hybridRatingsSync`, `hybridRecommendationsFallback`, `manifestFingerprint`, `presetsSorting`,
   `profileDuplicates`. Vanno fatti girare **prima e dopo**, e alcuni andranno aggiornati (quelli che
   contano le righe e la copertura).

**QUINDI: e' una mattina con i test, non l'ultima ora di una sessione.** Il lavoro e' pronto e turnkey —
cucitura, budget, test da toccare, nomi e ordine decisi dalle misure (il tuo mondo 12,81% per slot, un
passo fuori 10,62%, la nicchia 4,31% e percio' ULTIMA) — ma va fatto con i test aperti.

## E UNA COSA CHE NON C'ENTRA, e vale la pena dirlo

**Il trasferimento dei dati sul mate NON dipende da questo.** Il prodotto ha bisogno solo di
`src/data/bolle.json` (3,2 MB, in git): la Space, il mate o un portatile appena clonato servono il grafo
appena clonano il repo. I ~2 GB utili sono del MODULO — gli artefatti per ricostruire e i parquet TMDB
per collocare i titoli nuovi ogni notte — e il job notturno gira da riga di comando, non passa dal feed.
Quindi: **la chiavetta si puo' fare adesso**, e il feed dopo, con calma.

## La domanda

A o B? E se A: la quinta riga **sostituisce** una delle quattro quando il profilo ha una storia
sufficiente, o si aggiunge sempre? (Con le misure di oggi, la riga del grafo merita il primo posto: il
mondo più acceso rende 12,81% per titolo mostrato, e la nicchia 4,31%.)

---

RISOLTO il 17/10/2026: la strada A ("una riga in piu', non toccare gli altri quattro") e' stata
implementata. Due righe nuove nel feed (`yaca_mondi_*`, `yaca_passo_fuori_*`), servite dal grafo DOPO
l'assegnazione disgiunta: non consumano il bacino degli hero e possono ripetere un titolo. Nove posti su
dieci sono derivati dal registro; il decimo (`HERO_PRIORITY` dentro il motore) e' stato aggiunto a mano.
