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

La regola vale **sia per le serie sia per i film**: i film anime non hanno un percorso diverso e non sono esclusi da nessun vincolo `isMovie`. Conseguenze deliberate, da non "correggere":
- **Donghua cinesi/coreani**: dentro, ma solo se coperti dallo store (AniList/Kitsu li coprono). Non esiste una regola speciale.
- **Animazione occidentale** (Arcane, Avatar, Castlevania): fuori. Non è nello store, non è `ja`, e la keyword "anime-inspired/-influenced/-style" è esplicitamente scartata, quindi cade da sola.

### 1.1 Risoluzione tramite `animeMappingStore` (Anibridge + Fribb + certificati locali)
Invece di query live a Kitsu o a database esterni non strutturati, YACA carica in memoria e sincronizza periodicamente (ogni 12 ore, ETag) due indici:
1. **Anibridge**: cluster multi-provider (AniDB, AniList, MAL) che collegano ogni stagione TMDB con i rispettivi range di episodi anime.
2. **Fribb (`anime-list-mini`)**: mapping incrociato Kitsu ID, AniDB, AniList, MAL e TMDB (inclusi film via `tmdbToKitsuMovie`). Nel file reale `themoviedb_id.movie` è un **array** di id (rifacimenti, compilation): in avanti vale il primo, in dietro sono registrati **tutti**, così ogni variante del gruppo torna al suo Kitsu.
3. **Certificati locali**: la sezione `certify` di `services/anime-source/data/anime-overrides.json` (caricata a ogni sync, loader fail-safe). Serve per i titoli che mancano dagli indici: sono anime per *noi*, anche se Anibridge non li conosce. Va tenuta separata dagli indici perché è **dato curato**, non scaricato.
4. **Lookup O(1)**: `animeMappingStore.isAnimeTmdbId(id)` verifica l'appartenenza in tempo costante tramite `Set`. Tolera `12345`, `12345:1` e `tmdb:tv:12345`.

### 1.2 Il marcatore unico `_isAnime`
La risposta non viaggia come flag opaco tra i moduli: `normalizeAnimeMarker` (`src/utils/animeIdentity.js`) è **l'unico contratto** di normalizzazione. Scrive `_isAnime` sul payload e, se il boolean è già presente, lo propaga senza ricalcolare (chiamate successive O(1)). Prove positive: `type: 'anime'`, id `kitsu:` o `anilist:`, altrimenti `isAnimeContent`. Il default unico è `false`: **senza prove non si abilita** enrichment Kitsu, filtri anime o badge.

I consumatori sono i boundary della pipeline, non i chiamanti sparsi: `DuckDbProvider` e `clients/tmdb.js` lo calcolano sui propri payload, `catalogHandler` lo applica a ogni item in uscita dal routing (è il punto in cui partono filtro selettori anime, badge e clone) e `metaHandler` lo rivalida **sulla copia** — l'oggetto in `finalMetaCache` non si tocca mai (`normalizeAnimeMarker` *scrive* il marker).

> [!WARNING]
> Il suffisso di presentazione `_ita_offset` non cambia l'opera: `extractAnimeTmdbId` e `normalizeAnimeMarker` lo tolgono prima di ogni lookup. Un item che lo porta è già lo stesso titolo della card base, non uno nuovo.

### 1.3 Lo stesso store scrive la tabella `anime_mappings` di DuckDB
Lo store non serve solo alle richieste: a ogni sync passa gli id anime a `duckDbStore.updateAnimeMapping`, che popola la tabella `anime_mappings`. È la tabella che rende filtrabile l'animazione **in SQL**: `F.anime` (`src/data/filters.js`) è `"id" IN (SELECT "tmdb_id" FROM anime_mappings) OR (genere 16 AND "original_language" = 'ja')`.

Due cose da sapere prima di toccarla:
- **Le chiavi che arrivano allo store sono `${tmdbId}:${season}`**, non l'id nudo. La sanificazione in `duckDbStore.updateAnimeMapping` deve estrarre la parte prima del `:`, deduplicare (una serie con N stagioni produce N chiavi con lo stesso id, altrimenti `INSERT` duplicati su `PRIMARY KEY`) e scartare i non numerici. Senza questo passaggio la tabella resta **vuota** e `F.anime` non matcha nulla, in silenzio: il sintomo è un filtro anime vuoto, non un errore.
- **La regola SQL è la regola canonica meno le keyword**, per scelta: in SQL si valuta solo store OR (16 AND `ja`). Le keyword restano fuori perché sono fragili e generano falsi positivi. Chi scrive un filtro anime nuovo in SQL deve saperlo.

La copertura **del parquet** non è totale, e questo è il motivo per cui il catalogo novità può risultare più corto dello stato: misurata il 2026-09-22 (sessione della mappa anime, ticket *Misura: quante serie dello stato non esistono nel parquet*), su 235 documenti di stato 114 trovavano una riga in `tv`, **99 in `movies`** e 64 in nessuna delle due (copertura 73%). Chi non ha una riga nel parquet viene semplicemente **saltato** dal provider, in silenzio — e i film anime restano fuori dal catalogo novità per costruzione, perché quel catalogo è di tipo `series` (confine accettato: vedi [CATALOG_LOGIC.md](CATALOG_LOGIC.md) § 3).

## 2. Risoluzione Episodica e Consensus Voting in `metaHandler`
In `src/handlers/metaHandler.js`, per le serie anime:
1. Viene scaricata la griglia episodi ufficiale da TMDB (`resolveAnimeEpisodes`): per gli anime TMDB **non** la scarica di sua iniziativa (`getTmdbMetaDetails` salta quel passo e lascia a `metaHandler` il compito di dirle quante stagioni e con quale lingua rilevare gli episodi).
2. Per ogni episodio, `applyKitsuMappingToMeta` interroga `animeMappingStore.resolveKitsu(tmdbId, season, episode)`.
3. `resolveKitsu` lavora in tre tempi, e l'ordine conta:
   - **candidati**: fra tutte le regole che coprono l'episodio TMDB si prendono solo quelle dal **range TMDB più stretto** (una regola più specifica scarta le più larghe: è la gerarchia delle boundary, non un pareggio);
   - **votazione**: i candidati sono raggruppati per `kitsuId:kitsuEpisode` e vince il gruppo con più voti (`voti × 100`);
   - **spareggio**: a parità di voti vale il provider più affidabile fra quelli del gruppo (AniList 5, MAL 4, AniDB 3, LiveChart 2, Kitsu 1). I pesi sono **solo** un criterio di spareggio: non "pesano" la scelta fra candidati con voti diversi.
4. L'episodio riceve l'ID normalizzato Stremio `kitsu:{kitsuId}:{kitsuEpisode}`. Se non coperto o in caso di collisione, viene mantenuto l'ID nativo TMDB come fallback sicuro.

Per i **film** anime il percorso è diverso e più corto: `resolveKitsuMovie(tmdbId)` e, se c'è un Kitsu, l'id finisce in `behaviorHints.defaultVideoId = kitsu:{id}` (non c'è griglia episodi da mappare).

### 2.1 Quando il mapping manca o è ambiguo
Nessun fallback euristico: nessun `kitsu:{id}:{ep}` inventato, nessuna ricerca per titolo. L'episodio resta con l'id TMDB nativo ed è un comportamento voluto, non un buco.

- **Collisione**: se due episodi TMDB producono la stessa stringa `kitsu:{id}:{ep}`, **solo il primo** la riceve e il duplicato torna TMDB. Sparire da Stremio sarebbe peggio che ripetere l'id nativo.
- **Special/OVA/recap**: non vengono mai nascosti. Mappati si mostrano come gli altri; non mappati restano TMDB.

Il fatto che questi due casi siano *misurati* è la parte importante: `metaHandler` tiene contatori **in RAM** (`getKitsuMappingStats()` / `resetKitsuMappingStats()`, log su stdout):

| Segnale | Contatore | Chiave aggregata | Soglia di log |
|---|---|---|---|
| Miss di mapping | `totalMisses` | `tmdbId:stagione` | 50 miss |
| Collisioni di id Kitsu | `totalCollisions` | `kitsu:{id}:{ep}` (la card che ha perso) | 10 collisioni |

Ogni mappa è **limitata a 200 chiavi** (espulse la chiave a frequenza minima; i totali restano esatti), e il log aggregato esce comunque al massimo **ogni 10 minuti**, con il top 5. La forma aggregata serve a non sommergere i log: una riga per episodio avrebbe fatto da argomento al contrario. Nessun errore di log può propagarsi e nessun contatore sta nel percorso caldo della risposta: **zero cambi di comportamento** per Stremio.

Da sapere prima di fidarsi del top-5: il tracking scatta quando il titolo è anime **o quando non è ancora stato classificato** (marker assente, es. meta vecchi in `finalMetaCache`). È deliberato — meglio un falso positivo che perdere un anime — ma se il top-5 si riempie di titoli non-anime il problema è la propagazione del marker, non il mapping.

> [!NOTE]
> Gli id degli episodi di una serie **non-anime** seguono una regola diversa e più recente: vanno in forma IMDb (`tt…:S:E`) quando l'id IMDb è noto, altrimenti restano nella forma della richiesta. Gli anime sono **esclusi** da quella riscrittura (`alignVideoIdsToRequestedForm` esce subito sul marker anime): hanno già `kitsu:{id}:{ep}` e il fallback sull'id nativo è voluto.

## 3. Immagini e Metadati in ERDB (EasyRatingsDB)
Quando si inviano gli ID ad EasyRatingsDB per recuperare le valutazioni (o generare il poster), il comportamento diverge a seconda della tipologia:
- Gli ID Kitsu (es. `kitsu:12345`) non vengono mai convertiti in TMDB per i poster. EasyRatingsDB offre un mapping interno per Kitsu che permette di scaricare l'immagine localizzata specifica **per quella singola stagione** (a differenza di TMDB che servirebbe sempre l'ultima immagine generica aggiornata).

Il percorso dei poster anime è tutto in `scripts/erdb-builder/`: `dump-list-anime.js` legge l'indice Fribb, scarta i record senza `kitsu_id` o senza id TMDB (fuori dal catalogo non sappiamo dire se sono doppiati, e listarli significherebbe scaricare due volte la stessa copertina) e produce una lista JSONL `{erdbId: "kitsu:{id}", badge: "ITA"}` nel formato che legge `build.js`. I titoli **non** vengono arricchiti: al costruttore serve solo `{erdbId, badge}`.

Sul percorso di runtime la domanda è un'altra — «da questo evento TMDB devo tirare fuori un Kitsu?» — e la risposta porta con sé il **motivo**, non un id nudo. `resolveKitsuDaTmdbId(tmdbId, tipo)` distingue sei casi (`mappato`, `non_e_un_anime`, `anime_senza_kitsu`, `store_non_pronto`, `tipo_non_gestito`, `id_mancante`): `resolveKitsuMovie` e `isAnimeTmdbId` rispondono `null` anche quando lo store non è ancora pronto, e senza il motivo «non è un anime» e «la mappa non è ancora caricata» sarebbero la stessa cosa — con 8.263 poster anime rifatti solo dal ramo TMDB senza che nessuno se ne accorga. Per questo chi chiama conta i motivi e segnala `store_non_pronto` a voce, una volta sola.

## 4. ~~Part Detection e Split-Cour~~ — sezione obsoleta dal 2026-07-09

> [!CAUTION]
> Il parsing automatico dei «Part 2» sui titoli Kitsu **non esiste più**, e con lui la ragione per cui il badge `Pt2`/`Pt3` restava pulito rispetto ai falsi positivi (tipo «Season 4»).
>
> Il badge è ancora previsto nel formatter (`src/catalog/formatters/StremioFormatter.js:262`, `if (item._kitsuPart)`), ma **nessun codice scrive più `_kitsuPart`**: il produttore era `src/clients/kitsu.js`, rimosso il 2026-07-09 insieme a `TmdbToKitsuMapper.js`, `KitsuProvider` e al modello `TmdbToKitsuMapping` — è il commit `a028ff6`, lo stesso che ha introdotto l'attuale `animeMappingStore`. Il ramo è dormiente: si può reintrodurre il rilevamento, ma non va raccontato come una funzione attiva né usato come indicazione del comportamento corrente.

Alcuni anime vengono divisi in due metà (split-cour): i titoli Kitsu originali possono avere diciture come «Part 2». *Questa parte della sezione è superata, si veda l'avviso sopra.*
