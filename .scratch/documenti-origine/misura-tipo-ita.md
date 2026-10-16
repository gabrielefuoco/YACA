# Il tipo nel badge ITA degli anime: misura e rimedio

**Data della misura:** 04/10/2026 · **Ambiente:** produzione (`ssh mate`, container `yaca-app`, volume `yaca_tmdb`,
MongoDB Atlas `yaca.anime_airing_state`) · **Modalità:** sola lettura (nessuna scrittura in produzione, nessun deploy).

Script di misura: `.scratch/t12/` (forzato nel repo per riprodurre i numeri).

---

## 0. Sommario in una riga

Il tipo **è noto alla sorgente** (`anime-source` legge `tmdb_show:`/`tmdb_movie:` da AniBridge, `themoviedb_id.movie`
da Fribb e `mediaType` dal bridge TVDB) e **viene buttato via**: il servizio doppiaggi lo ri-indovina guardando in che
dump sta l'id, e quando l'id sta in **entrambi** i dump — cioè per i film più famous — la indovina **sbagliata**.
Misurato: **35 annotazioni `tv` che sono film** (23 già visibili all'utente con il poster senza badge) e
**4 annotazioni `movie` che non sono film**.

---

## 1. La catena, verificata riga per riga

```
AniBridge / Fribb / bridge TVDB            anime-source                 mongo                doppiaggi-source
tmdb_show:379088  ─┐
tmdb_movie:379088 ─┼─► _buildAnibridgeIndex ─┐
themoviedb_id.movie ┘                          ├─► resolve() ─► aggregate ──► store.upsert ──► animeDocsToRows
mediaType:'movie'  ────► tvdbBridge.resolveTvdb ┘   {tmdbId,…}   buildAiringStateDocument   {ids:{tmdb,…}}   t = indovinato
```

1. **Il tipo viene perso in `services/anime-source/src/identity.js`, in tre punti:**
   - `_buildFribbIndex` (~L153): `tmdbVal = item.themoviedb_id.tv || item.themoviedb_id.movie` → tiene il numero, scarta la chiave.
     Nel file di produzione: **7.118** voci `{tv:N}` e **1.394** `{movie:N}` (c'è anche un campo `type: "TV"|"MOVIE"` inutilizzato).
   - `_buildAnibridgeIndex` (~L215): `if (providerKey.startsWith('tmdb_show:') || providerKey.startsWith('tmdb_movie:'))`
     → **28.805** nodi `tmdb_show:` e **12.041** nodi `tmdb_movie:`, tutti ridotti al solo id.
   - bridge TVDB (~L586-611): `bridgeMatch.mediaType` esiste, è loggato solo per il nome e **non entra nel `match`**.
2. **`grep -rn mediaType services/` dà 4 righe, tutte dentro `tvdbBridge.js`** (righe 62, 100, 107) più 2 del suo test:
   **nessun consumatore**, in `identity.js`, `aggregate.js`, `store.js`, `discovery.js`, `animeunity.js`, `tmdbFallback.js`
   o nel `cli.js`. Confermato.
3. **Il documento Mongo non ha un campo tipo.** Chiavi di primo livello su 954 documenti:
   `_id, ids, italian, schedule, schemaVersion, sources, title, updatedAt, episodes, listSeenAt, orderIndex, sub, dub`;
   dentro `ids` solo `tmdb, kitsu, anilist, mal`. Nessun `type`/`mediaType`/`isMovie`, in nessun documento.
4. **`tmdbFallback.js:205` cerca solo `/3/search/tv`**: quel percorso * presuppone* `tv`, quindi lì il tipo non è proprio noto.
5. `services/doppiaggi-source/src/anime.js` (L128-134) indovina: `tv` per default, `movie` solo se
   `maxEpisodeNumber(doc) <= 3 && !tvIds.has(id) && movieIds.has(id)`.

---

## 2. La misura (numeri esatti)

### 2.1 Popolazione

| | |
|---|---|
| documenti in `anime_airing_state` | **954** |
| documenti doppiati (producono annotazione) | **904** |
| righe in `ita_annotations.jsonl` | **24.139** (19.444 `ita:true`, 4.695 `ita:null`) |
| di cui `tv:` con `ita:true` / `movie:` con `ita:true` | 5.163 / 14.281 |

### 2.2 Il tipo reale, secondo la fonte (Fribb + AniBridge, letti dalla cache del container `yaca-anime-source`)

Censimento dei 954 id tracciati contro i mapping che la sorgente scarica e già legge:

| tipo dichiarato dalla fonte | documenti (tutti) | doppiati |
|---|---|---|
| **film** | **260** | **260** |
| serie | 692 | 642 |
| nessuna fonte (2 doc con `_id` composto, vedi §5) | 2 | 2 |

### 2.3 Writer vs fonte — i due disaccordi

| direzione | numero annotazioni | cosa succede |
|---|---|---|
| **film dichiarato dalla fonte, annotato `tv`** | **35** | il badge **non compare** sulla card film |
| **serie dichiarata dalla fonte, annotata `movie`** | **4** | il badge finisce su un **film estraneo** (nessuna serie lo perde: la serie non è in `tv.parquet`) |

Totale disaccordi: **39 su 904** (concordi 863).

**I 35 film annotati `tv`, nel dettaglio:**

- **31** hanno la riga film in `movies.parquet` → esiste la card, il badge manca.
  Di questi **29 sono davvero il film dell'anime** (verificato per titolo/original_title):
  *Nausicaä* (81, pop 18.5), *La città incantata* (129, 40.1), *Il castello errante di Howl* (4935, 48.3),
  *Princess Mononoke* (128, 23.4), *Il mio vicino Totoro* (8392, 22.6), *Perfect Blue* (10494, 19.3),
  *Kiki* (16859, 14.6), *Il castello nel cielo* (10515, 12.4), *Jin-Roh* (823, 6.6), *One Piece 3D* (79082, 5.9),
  *Tokyo Godfathers* (13398, 5.4), *Fairy Tail The Movie* (135531, 5.0), *Steamboy* (8953, 3.9), *X The Movie* (44587),
  *Panda! Go, panda!* (21036), *Shinko e la magia millenaria* (64809), *Melanzane - Estate andalusa* (60843),
  *La ragazza che saltava nel tempo* (14069), *Lamù - Beautiful Dreamer* (43967),
  *Il gatto con gli stivali* (58704), *Yes! Pretty Cure 5* (153577), *Hello! Spank: Il film* (507477),
  *Bokura no Yoake* (950863), *Maison Ikkoku* ×2 (482810 e 512443), *Urusei Yatsura* ×2 (1163907 e 43967),
  *The Seven Deadly Sins the Movie* (507569), *Touch: Miss Lonely Yesterday* (266116), *Pokémon: Dragonite* (1430394).
- **2** hanno un **id sbagliato** a monte (la fonte stessa sbaglia): `44725` *Ie Naki Ko* → la card film è
  *One Piece - Il tesoro del re*; `114478` *Star Wars: Visions* → la card film è *Starship Troopers - L'invasione*.
  Qui l'assenza del badge è, per fortuna, giusta.
- **4** non hanno la riga in `movies.parquet` (96926, 66032, 92321, 12477): nessuna card, nessun danno.

**I 4 film annotati `tv`… no, i 4 "serie annotate `movie`":** `132169` *Genma Taisen* (Fribb la dice serie, TMDB la tiene
come film *Mr Vampire 1992*: la regola del dump ha indovinato bene per caso), `80219` *A Kite*, `106219` *Tattoon Master*,
`43032` *Taiho Shichau zo The Movie*: in questi tre il badge va a finire su tre film senza relazione.

### 2.4 La misura ingenua (quella che il brief proponeva) **sbaglia di 28×**

Se si incrocia `ita_annotations.jsonl` con i parquet senza la fonte:

| test | risultato | verità |
|---|---|---|
| righe `tv:` con id **solo** in `movies.parquet` | **50** | **1 sola è un film vero** (Touch 266116): le altre 49 sono serie assenti dal dump tv (Tier 1) il cui numero collide con un film estraneo |
| righe `movie:` con id **solo** in `tv.parquet` | **0** | corretto, ma per caso: le 4 serie sbagliate hanno l'id in `movies.parquet` |

La ragione: la regola sbaglia **proprio quando l'id è in entrambe le tabelle**, e lì i due test non guardano.
I 29 film veri hanno tutti l'id anche in `tv.parquet` (per un titolo diverso: 129 = *Soccer Aid*, 81 = *In the House*…).

Anche i numeri del brief non tornano più con i dati di oggi (dopo il backfill): dei 904 doppiati,
**276 sono assenti da `tv.parquet`**, di cui **274 presenti in `movies.parquet`**
(non 112/45): membership di `master_movies.jsonl`/`master_tv.jsonl` e dei due parquet coincide su tutti gli id tracciati.

---

## 3. Il danno è reale: verifica in produzione

Il badge non è un flag JSON ma **il nome del poster**: `StremioFormatter.urlPosterInCache` chiede
`tmdb-<tipo>-<id>[_ITA].jpg`. Quindi la prova è diretta: nel volume di produzione `/data/erdb-cache`
esiste il file con `_ITA` solo se il badge è stato applicato a quella card.

| gruppo | poster con `_ITA` | poster **senza** `_ITA` | nessun poster |
|---|---|---|---|
| 225 film annotati `movie` (controllo) | **225 (100%)** | 0 | 0 |
| **35 film annotati `tv`** | **0** | **23** | 12 |

Confronto visivo (file presi dalla produzione):

- `/data/erdb-cache/tmdb-movie-823.jpg` → *Jin-Roh*: chip in alto a sinistra = logo TMDB, **nessun badge ITA**.
- `/data/erdb-cache/tmdb-movie-38142_ITA.jpg` → *5 cm al secondo*: chip = **"ITA"**.
  Stessa pipeline, stesso tipo card, unica differenza: `movie:38142` c'è, `movie:823` no (c'è `tv:823`).

Per confronto, la salute generale del badge: 14.282 poster film con `_ITA`, 5.043 serie, 1.889 card kitsu.

**Costo per l'utente:** 23 card di film d'animazione già servite **senza badge**, di cui 21 film veri (le altre 2 sono
le card con id sbagliato di §2.3): *Spirited Away*, *Howl*, *Mononoke*, *Totoro*, *Nausicaä*, *Perfect Blue*, *Kiki*,
*Il castello nel cielo*, *Jin-Roh*, *Steamboy*, *Tokyo Godfathers*, *One Piece 3D*, *Fairy Tail The Movie*,
*Panda! Go, panda!*, *X The Movie*, *Il gatto con gli stivali*, *Precure 5*, *Shinko*, *Nasu*, *Urusei Yatsura*,
*La ragazza che saltava nel tempo*.

---

## 4. Che titoli sono

Non sono di nicchia: sono **classici del doppiaggio italiano**, uscita **1969-2022** (mediana anni '90),
popolarità TMDB da 0.8 a 48.3, con i tre film più popolari del gruppo (*Howl* 48.3, *Spirited Away* 40.1,
*Mononoke* 23.4). Sono esattamente i titoli che un utente cerca per il doppiaggio: il danno è visibile,
non marginale. Titoli coinvolti in tutto: **39 annotazioni sbagliate** (35 + 4), di cui **29 film reali**
e **23 card già in circolazione**.

---

## 5. Difetto collaterale trovato strada facendo

Due documenti (`_id` = `"989730,1322218,1322562"` e `"989937,1064835"`, cioè **più id kitsu concatenati**:
*Mononoke Movie: Karakasa* e *Nanatsu no Taizai: Ensa no Edinburgh*) **non producono annotazione alcuna**:
`animeDocsToRows` scarta ogni `_id` non numerico, e in più sono film ("Movie"). Sono 2 titoli doppiati senza badge
per un motivo diverso dal tipo. Da mettere in coda, non è lo stesso difetto.

---

## 6. Valutazione del rimedio proposto: **scrivere il tipo nel documento**

La proposta è quella giusta, ma il campo **non sta in `store.js`**: va piantato dove il tipo si perde.

**Punti da toccare (leggendo il codice, non indovinando):**

| file | punto | cosa serve |
|---|---|---|
| `services/anime-source/src/identity.js` | `_buildFribbIndex` ~L153 | tenere `.tv`/`.movie` oltre al numero (una mappa `tmdbId → 'tv'\|'movie'`) |
| idem | `_buildAnibridgeIndex` ~L215 | idem sui nodi `tmdb_show:`/`tmdb_movie:` |
| idem | ramo bridge ~L606 | copiare `bridgeMatch.mediaType` nel `match` |
| idem | `resolve()` L419/L439/L456 | aggiungere `mediaType` ai **4** return |
| `services/anime-source/src/aggregate.js` | `buildAiringStateDocument` ~L208 | `mediaType: primaryIdentity.mediaType \|\| null` |
| `services/anime-source/src/aggregate.js` | **`mergeAiringDocuments` ~L388** | `mergedDoc` è una **whitelist**: senza il campo qui il valore **muore alla merge successiva** (cioè a ogni upsert di un doc esistente) |
| `services/doppiaggi-source/src/anime.js` | L128-134 | usare `doc.mediaType` quando c'è, **tenendo la regola del dump come fallback** per i 954 doc che il campo non ce l'hanno ancora |
| `scripts/` (opzionale) | — | migrazione one-shot: ri-derivare il tipo dai due file che la sorgente **scarica già** (0 chiamate TMDB) |

`store.js` **non va toccato**: fa `{ $set: finalDoc }` (L91) e il merge è già fatto a monte. (Se si aggiungesse un indice,
sì, sarebbe l'unica ragione per passare da `store.js`.)

**Costo:** ~30-40 linee di codice di produzione (6-8 punti in `identity.js`, 2 in `aggregate.js`, 1 in `anime.js`),
~50-60 di test, ~40 per lo script di migrazione se serve. `schemaVersion` non va bumpato: il campo è additivo e
i vecchi lettori lo ignorano (il core valida solo `schemaVersion <= 1` e `ids.tmdb` numerico).

**Controindicazioni (misurate, non ipotizzate):**

1. **La fonte non è infallibile.** Fribb dichiara `MOVIE` per *Star Wars: Visions* (antologia, 9 episodi) e `TV` per
   *Genma Taisen* (che TMDB tiene come film). Dei 260 film dichiarati, **4 non hanno la riga in `movies.parquet`** e
   **2 hanno la riga di un altro film**: fidarsi ciecamente sposterebbe ~3-6 badge su titoli sbagliati.
   → **Ordine di regola consigliato**: (1) veto degli episodi (`maxEpisodeNumber > 3` ⇒ `tv`, com'oggi),
   (2) **`mediaType` della fonte**, (3) regola sul dump come ultima risorsa.
   Con questo ordine la regola riproduce la fonte su **258/260** documenti, contro 260/260 ma con 3-6 errori.
2. **I 954 documenti esistenti non hanno il campo**: senza fallback nel `anime.js` il badge resta perso per loro fino
   alla riscrittura. Il fallback di 3 righe risolve, e non costa nulla.
3. **Il percorso `tmdbFallback` (/3/search/tv) non può dare `movie`**: quei documenti (3 oggi) restano `tv` per costruzione.

---

## 7. La mia scelta fra le tre opzioni del brief

**Scelta: far provare **entrambi** i tipi alla lettura — come *rete di sicurezza* — insieme al campo nel documento
come *rimedio vero*.** Se si potesse fare una cosa sola, sceglierei il campo nel documento; se si potesse farne una
a costo quasi zero, sceglierei la lettura a due tipi.

| opzione | costo | effetto misurato | giudizio |
|---|---|---|---|
| **scrivere entrambe le chiavi quando il tipo è incerto** (come nella fixture `tests/animeAllCatalogsDubbedBadge.test.js`) | ~5-10 righe nel writer, +904 righe su 24.139 (irtisibile), e **non** ripara le righe già scritte | aggiunge i 23 badge mancanti | **no in produzione**: la doppia chiave mette il badge anche sulla card dell'*altro* titolo con lo stesso numero (il badge di *Jin-Roh* finirebbe su *WWF Superstars*, tv 823). Nelle fixture è innocuo perché la fixture non sa cosa c'è dall'altra parte; in produzione lo sappiamo |
| **far provare entrambi i tipi alla lettura** | ~5 righe in `isDubbed`/`annotationKeyFor`, una `Map.get` in più per card, zero migrazione | **23/23 badge recuperati**; non può perdere un badge (il fallback parte solo quando la chiave primaria manca) | **sì, subito**: è larattifica immediata e la più piccola |
| **niente** | 0 | 23 card senza badge + 3 badge su film estranei, per sempre | **no**: il danno è dimostrato, non è trascurabile |

Ordine che consiglio all'umano: (1) il fallback in lettura (5 righe, toglie il sintomo a tutti i 954 documenti
oggi), (2) il campo `mediaType` nel documento (§6, toglie la causa per i documenti che verranno riscritti),
(3) quando il campo esiste, valutare di ritirare il fallback — sarà il segnale che la fonte dice sempre `tv` o `movie`.

Una nota sul fallback: oggi la annotazione `tv:823` accende **già** il badge sulla card serie *WWF Superstars*.
Il fallback non aggiunge falsi positivi nuovi, **ripara** quello che c'è già nel caso ambiguo: quando la fonte
diventerà autorevole, anche quella riga si sistema da sola.
