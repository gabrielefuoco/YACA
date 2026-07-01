# Kitsu & TMDB: Strategia Ibrida di Mapping

YACA è un addon ibrido, che deve gestire due database di entità radicalmente differenti per rappresentare gli Anime: TMDB (The Movie Database) e Kitsu.

## L'Incompatibilità Strutturale
- **TMDB** tratta gli anime come normali serie TV occidentali: raggruppa sotto un unico identificativo "Serie" tutte le stagioni. (Es. "L'attacco dei giganti" è una singola entità TMDB con `Season 1`, `Season 2`, `Season 3`, ecc.).
- **Kitsu** (come MyAnimeList) tratta ogni stagione come un'opera separata a sé stante, con un identificativo unico, un proprio poster e propri episodi che ripartono da 1 (es. "Attack on Titan", "Attack on Titan Season 2", "Attack on Titan Season 3 Part 2").

Stremio utilizza TMDB come sistema primario, tuttavia per gli Anime (specie per fonti come Torrentio o Aniwatch), avere ID Kitsu permette risultati molto più affidabili e precisi per i metadati, evitando il mixing degli episodi.

## 1. TMDB -> Kitsu (Sistemi di Risoluzione)
Quando un utente inserisce un titolo in Trakt o TMDB, YACA deve trasformarlo nel suo corrispettivo Kitsu, mantenendo la stagionalità esatta.

### Mappatura "inferredSeason"
La funzione `getKitsuIdFromTmdbId` (in `src/clients/kitsu.js`) interroga l'endpoint non documentato di mapping su Kitsu (via query GraphQL) o su database esterni (Anime-Offline-Database o yuki-myanimelist).
Durante questa conversione, YACA registra un `inferredSeason`: ovvero la Stagione TMDB originaria di provenienza.
Ad esempio: TMDB ID 1234, Season 2 -> Corrisponderà all'ID Kitsu 5678 (Season 2 di TMDB).

## 2. Enrichment Episodico da Kitsu
Kitsu ha spesso metadati carenti a livello dei singoli episodi (titoli non tradotti in italiano, assenza di overview o date di messa in onda mancanti per gli episodi placeholder).

In `fetchKitsuEpisodes`, gli episodi Kitsu originali (solitamente enumerati progressivamente) vengono arricchiti con i dati TMDB:
1. Viene recuperata l'intera lista episodi TMDB della serie corrispondente.
2. Tramite una logica di **matching incrociato** (che dà priorità all'`inferredSeason` targetizzata), l'episodio Kitsu viene appaiato all'episodio esatto di TMDB (es. Kitsu Ep 1 = TMDB S2 Ep 1).
3. **Traferimento Metadati**: YACA copia il `title`, l'`overview`, la `thumbnail` e (fondamentale) la data `released` da TMDB nell'episodio Kitsu.

### Filtraggio TMDB Stretto (Fix Episodi Multi-Stagione)
In caso Kitsu non abbia tutti gli episodi, YACA fa "append" degli episodi mancanti da TMDB. Per evitare di mescolare serie diverse, se la stagione target è specificata (`inferredSeason > 1`), YACA esclude dall'append tutti gli episodi non abbinati di TMDB appartenenti a stagioni differenti, in modo da non importare per sbaglio la Season 1 dentro il catalogo della Season 4.

## 3. Immagini e Metadati in ERDB (EasyRatingsDB)
Quando si inviano gli ID ad EasyRatingsDB per recuperare le valutazioni (o generare il poster), il comportamento diverge a seconda della tipologia:
- Gli ID Kitsu (es. `kitsu:12345`) non vengono mai convertiti in TMDB per i poster. EasyRatingsDB offre un mapping interno per Kitsu che permette di scaricare l'immagine localizzata specifica **per quella singola stagione** (a differenza di TMDB che servirebbe sempre l'ultima immagine generica aggiornata).

## 4. Part Detection e Split-Cours
Alcuni anime vengono divisi in due metà (split-cour). I titoli Kitsu originali potrebbero avere diciture come "Part 2". YACA fa parsing automatico e inietta questi tag sotto forma di badge (`Pt2`, `Pt3`), ignorando i falsi positivi (come "Season 4") in modo da mantenere pulito il riquadro badge.
