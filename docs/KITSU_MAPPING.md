# Kitsu & TMDB: Strategia Ibrida di Mapping

YACA è un addon ibrido, che deve gestire due database di entità radicalmente differenti per rappresentare gli Anime: TMDB (The Movie Database) e Kitsu.

## L'Incompatibilità Strutturale
- **TMDB** tratta gli anime come normali serie TV occidentali: raggruppa sotto un unico identificativo "Serie" tutte le stagioni. (Es. "L'attacco dei giganti" è una singola entità TMDB con `Season 1`, `Season 2`, `Season 3`, ecc.).
- **Kitsu** (come MyAnimeList) tratta ogni stagione come un'opera separata a sé stante, con un identificativo unico, un proprio poster e propri episodi che ripartono da 1 (es. "Attack on Titan", "Attack on Titan Season 2", "Attack on Titan Season 3 Part 2").

Stremio utilizza TMDB come sistema primario, tuttavia per gli Anime (specie per fonti come Torrentio o Aniwatch), avere ID Kitsu permette risultati molto più affidabili e precisi per i metadati, evitando il mixing degli episodi.

## 1. Identità Canonica Anime e Risoluzione TMDB -> Kitsu
YACA adotta una singola fonte di verità per determinare se un'opera è un anime (`src/utils/animeIdentity.js`):
- È presente nel mapping store (`animeMappingStore.isAnimeTmdbId(tmdbId)`) **OPPURE**
- Ha genere TMDB 16 (Animation) E (`original_language === 'ja'` OR keyword TMDB contiene "anime" case-insensitive, con filtro anti-falsi positivi come "anime-inspired").

### Risoluzione tramite `animeMappingStore` (Anibridge + Fribb)
Invece di query live a Kitsu o a database esterni non strutturati, YACA carica in memoria e sincronizza periodicamente (ogni 12 ore, ETag) due indici:
1. **Anibridge**: cluster multi-provider (AniDB, AniList, MAL) che collegano ogni stagione TMDB con i rispettivi range di episodi anime.
2. **Fribb (`anime-list-mini`)**: mapping incrociato Kitsu ID, AniDB, AniList, MAL e TMDB (inclusi film via `tmdbToKitsuMovie`).
3. **Lookup O(1)**: `animeMappingStore.isAnimeTmdbId(id)` verifica l'appartenenza in tempo costante tramite `Set`.

## 2. Risoluzione Episodica e Consensus Voting in `metaHandler`
In `src/handlers/metaHandler.js`, per le serie anime:
1. Viene scaricata la griglia episodi ufficiale da TMDB (`resolveAnimeEpisodes`).
2. Per ogni episodio, `applyKitsuMappingToMeta` interroga `animeMappingStore.resolveKitsu(tmdbId, season, episode)`.
3. Qualora vi siano più candidati per la stessa boundary di episodi, un algoritmo di **consensus voting** ponderato (AniList: 5, MAL: 4, AniDB: 3, LiveChart: 2, Kitsu: 1) seleziona il mapping più affidabile.
4. L'episodio riceve l'ID normalizzato Stremio `kitsu:{kitsuId}:{kitsuEpisode}`. Se non coperto o in caso di collisione, viene mantenuto l'ID nativo TMDB come fallback sicuro.

## 3. Immagini e Metadati in ERDB (EasyRatingsDB)
Quando si inviano gli ID ad EasyRatingsDB per recuperare le valutazioni (o generare il poster), il comportamento diverge a seconda della tipologia:
- Gli ID Kitsu (es. `kitsu:12345`) non vengono mai convertiti in TMDB per i poster. EasyRatingsDB offre un mapping interno per Kitsu che permette di scaricare l'immagine localizzata specifica **per quella singola stagione** (a differenza di TMDB che servirebbe sempre l'ultima immagine generica aggiornata).

## 4. Part Detection e Split-Cours
Alcuni anime vengono divisi in due metà (split-cour). I titoli Kitsu originali potrebbero avere diciture come "Part 2". YACA fa parsing automatico e inietta questi tag sotto forma di badge (`Pt2`, `Pt3`), ignorando i falsi positivi (come "Season 4") in modo da mantenere pulito il riquadro badge.
