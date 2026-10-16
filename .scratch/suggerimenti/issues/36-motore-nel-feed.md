Status: needs-info
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

## La domanda

A o B? E se A: la quinta riga **sostituisce** una delle quattro quando il profilo ha una storia
sufficiente, o si aggiunge sempre? (Con le misure di oggi, la riga del grafo merita il primo posto: il
mondo più acceso rende 12,81% per titolo mostrato, e la nicchia 4,31%.)
