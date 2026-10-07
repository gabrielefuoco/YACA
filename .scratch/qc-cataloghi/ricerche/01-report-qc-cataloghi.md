# Report QC cataloghi — preset e hero

> ⚠️ **Snapshot del 06/10/2026.** Questo report fotografa i cataloghi **prima** della bonifica: i numeri
> valgono per la versione che i giudici hanno letto, non per quella di oggi. Dopo questa misura sono cambiati
> 15 cataloghi (esclusioni anime, ticket 02), 11 cataloghi di persona (documentari e durata minima, ticket 06),
> i percorsi hero (durata minima, ticket 07) e 12 cataloghi di keyword (ticket 17), oltre al selettore
> «Solo Anime» (bug del marcatore, ticket 13). Per lo stato corrente servono una rilettura dei cataloghi toccati
> (ticket 12) e le misure dei ticket 14-15-04. Ciò che **non** invecchia è il metodo: la rubrica, le etichette
> «in tema / fuori tema» — che il banco keyword usa come ground truth — e le cause raggruppate in §3.

**Campagna**: 06/10/2026 · **Spec**: [`../issues/01-campagna-qc-cataloghi.md`](../issues/01-campagna-qc-cataloghi.md) · **Mappa**: [`../map.md`](../map.md)
**Commit al momento del dump**: `0201a8f` · **Parquet**: `movies.parquet` 59.460.766 B + `tv.parquet` 9.292.473 B (estrazione dal volume `yaca_tmdb` del mate, 06/10/2026 18:45)

---

## 0. Sintesi in dieci righe

- **160 preset su 161** giudicati leggendo la top 50 di ciascuno (7.214 titoli). Escluso `preset_anime_simulcast` (non passa dal parquet).
- **112 P · 46 B · 2 N**. Media 85,4 · mediana 88 · p10 76.
- I due **N** sono `preset_tv_high_fantasy` (79% anime in un catalogo dichiarato non-anime) e `preset_zombies_movies` (AND Horror+Fantascienza che strozza il pool a 32 e riempie la lista di trash, mediana 5,78).
- Le cause sono poche e ricorrenti: **anime che filtrano nei cataloghi occidentali** (15 cataloghi), **promesse appoggiate a una singola keyword** (10+), **pool che non riempiono una pagina Stremio** (46 sotto 60 titoli, 12 sotto 20), **trash nelle nicchie** (horror, action, commedia italiana, Bollywood), **cataloghi di persona inquinati da documentari/cortometraggi/cameo**.
- La categoria peggiore è **Fantascienza & Fantasy** (media 74,7); la migliore **Solo Anime** (90,3) e **Network & Piattaforme** (89,3).
- **Il metodo è più rumoroso di quanto si vorrebbe**: a parità di dati e rubrica, un secondo giudice cieco ha dato fino a **34 punti di differenza** e un verdetto ribaltato (N 57 → P 91). Δ medio assoluto 12,8.
- **40 verdetti su 160 (25%) stanno entro 3 punti da una soglia**: P/B e B/N sono bande, non misure.
- Verifica anti-allucinazione: **582 righe di errore, 0 titoli inesistenti, 0 fuori posizione**. I giudizi citano righe reali del dump.
- Una correzione dell'orchestratore su un caso conteso (`preset_anime_shonen`, N 57 → B 76) e una correzione di rubrica inviata ai giudici hero (vincolo voti delle «Gemme»: 50, non 100).
- **Un bug vero trovato mentre si verificava un giudice**: con un profilo «Solo Anime» i cataloghi hero servono titoli
  non-anime marcati `_isAnime: true` (14 su 20 nel test dedicato) — il selettore è inefficace sui suggerimenti.
  Origine: [ticket 13](issues/13-solo-anime-non-filtra-i-hero.md).
- Gli **hero** degradano in modo disomogeneo: **23 P · 17 B** su 40 liste. `hidden_gems` è l'unico perfetto (10 P su 10, in tutti i profili), `trakt_filtered` l'unico bocciato quasi ovunque (1 P, media 72,5), e il profilo freddo prende 6 B su 8. Il `true_blend` di un profilo senza DNA è, alla lettera, il fallback «popolari ultimi 36 mesi» (**50 titoli su 50 identici, stesso ordine**). Vedi §6.
- **Esito dei ticket**: 12 ticket di bonifica proposti (02-13), raggruppati per causa, in [`../issues/`](../issues/).

---

## 1. Cos'è stato controllato, e come

| Fronte | Come | Copertura |
|---|---|---|
| **Preset** | DuckDB offline sui Parquet di produzione, stessa query e stesso `orderBy` del router, `LIMIT 50` | 160/161 · 7.214 titoli |
| **Hero** | Fetch HTTP live contro la produzione (`simulate.js`), 5 profili di test (4 cloni di DNA reale + 1 freddo) × 8 hero, 3 pagine | 5 profili × 8 = 40 liste |
| **Meccanica** | `scripts/qa/catalog-audit.js` (soglie, overlap J@40, keyword morte) + analisi del dump | 160 preset + 12 ricette hero |
| **Giudizio** | 13 lotti tematici su agente `agy`, rubrica a 5 dimensioni pesate, ancore esplicite, schema fisso | 160 + 40 verdetti |

Rubrica: `score = 0.35·pertinenza + 0.20·qualità + 0.15·distintività + 0.15·coerenza + 0.15·completezza`; **P ≥ 80 / B 60-79 / N < 60**.
Strumenti nuovi, riusabili: [`top50-dump.js`](../../../../scripts/qa/top50-dump.js) (dump top-50), [`hero-enrich.js`](../../../../scripts/qa/hero-enrich.js) (arricchimento voti/popolarità/durata degli hero), [`qc-aggregate.js`](../../../../scripts/qa/qc-aggregate.js) (aggregazione, verifiche, meccanica, correzioni).

**Artefatti**: i dump grezzi e le run stanno in `runs/` (gitignorato, rigenerabile); i verdetti in `review/`; i numeri aggregati in `ricerche/report.json`; questa è la distillazione.

---

## 2. Esito complessivo — preset

| Categoria | n | media | min | max |
|---|---|---|---|---|
| 🐉 Fantascienza & Fantasy | 12 | **74,7** | 59 | 90 |
| 💥 Adrenalina & Avventura | 11 | 82,4 | 74 | 93 |
| 🔥 Altri Cataloghi | 3 | 84,3 | 76 | 93 |
| 🍿 Serata Leggera & Risate | 13 | 85,1 | 68 | 100 |
| 🕵️ Crimine, Mistero & Thriller | 17 | 86,8 | 68 | 97 |
| 🌍 Documentari & Storie Vere | 13 | 86,8 | 77 | 95 |
| 🎬 Cinema d'Autore & Registi | 22 | 87,0 | 79 | 93 |
| 👨‍👩‍👧‍👦 Bambini & Famiglia | 10 | 87,0 | 68 | 96 |
| 🔥 Top & Trend | 14 | 87,1 | 64 | 96 |
| 🌏 K-Drama, Dizi & Asia | 6 | 88,0 | 71 | 99 |
| 📺 Network & Piattaforme | 12 | 89,3 | 79 | 94 |
| 🏮 Solo Anime | 16 | **90,3** | 76 | 98 |

**I due N**

| Catalogo | Score | Perché |
|---|---|---|
| `preset_tv_high_fantasy` — 🧙 High Fantasy (Spade & Draghi) | **59** | 22 titoli su 28 (78,6%) sono anime/isekai, in un catalogo con «Anime: no»; i pilastri occidentali del genere sono assenti. Pool di 28 titoli. Verificato a mano: Mushoku Tensei, Frieren, Dungeon Food, Goblin Slayer, Clevatess ai primi posti. |
| `preset_zombies_movies` — 🧟 Zombie & Infezioni (Film) | **59** | L'AND obbligatorio Horror+Fantascienza strozza il pool a 32 titoli ed esclude i classici zombie; mediana 5,78, 56,3% sotto 6.0, 3 righe di trash dichiarato (Day of the Dead, Zoombies, C.H.U.D. II). |

**I 10 B peggiori** (fondo classifica): `preset_cult_classics` 64 · `preset_cyberpunk_series` 67 · `preset_psych_thriller` 68 · `preset_italian_comedy` 68 · `preset_animal_protagonists` 68 · `preset_mindfuck_series` 71 · `preset_asian_action` 71 · `preset_cyberpunk` 72 · `preset_fantasy_magic` 72 · `preset_space_hard_scifi` 73.

---

## 3. Le cause ricorrenti (preset)

Le 582 righe di errore si raggruppano in poche cause. È questa la parte che genera i ticket, non il singolo catalogo.

### C1 — Anime dentro cataloghi dichiarati non-anime · **15 cataloghi** · 1 N, 6 B

Il filtro `without_keywords: '210024'` non c'è (o non basta) e il dump lo dice coi numeri:

| Catalogo | Anime nei primi 50 | Verdetto |
|---|---|---|
| `preset_tv_high_fantasy` | **79%** (22/28) | **N 59** |
| `preset_cyberpunk_series` | 58% | B 67 |
| `preset_asian_action` | 44% | B 71 |
| `preset_cyberpunk` | 38% | B 72 |
| `preset_tv_superheroes_dark` | 23% | B 75 |
| `preset_extreme_survival` | 22% | B 77 |
| `preset_tv_politics` | 16% (8 anime su 50) | B 78 |
| `preset_tv_thriller` | 16% | P 85 |
| `preset_time_travel_movies` | 16% | B 78 |
| `preset_sad_romance` | 14% | P 86 |
| `preset_zombies_movies` | 13% | **N 59** |
| `preset_giant_monsters` | 12% | B 73 |
| `preset_netflix_movies` | 10% | P 89 |
| `preset_martial_arts` | 10% | P 88 |
| `preset_horror_all` | 4% (ma 5 righe di errore) | B 79 |

Nota: gli anime sono legittimi in «Solo Anime» e in «Azione Asiatica» (per definizione JP/KR/HK), ma lì la promessa lo dice. In tutti gli altri casi sono fuori promessa, e nei primi due sono la promessa mancata.

### C2 — Promesse appoggiate a una sola keyword (o a un'intersezione rigida) · **10+ cataloghi**

La keyword è il punto debole ricorrente: TMDB la applica in modo largo o stretto, e la promessa cade da una parte o dall'altra.

- `preset_cult_classics` (B 64) — keyword 6158: pool 64, popolato di B-horror, mediana 6,3
- `preset_zombies_movies` (N 59) — AND Horror+Fantascienza
- `preset_psych_thriller` (B 68) — intersezione Thriller∩Horror, pool 45, taglia fuori i capisaldi del thriller psicologico
- `preset_mindfuck` (B 75) / `preset_mindfuck_series` (B 71) — keyword ampie e poco selettive (3 film animati DC nei primi 50)
- `preset_fantasy_magic` (B 72) — keyword `dragon` che cattura Dragonball Evolution e In the Name of the King
- `preset_space_hard_scifi` (B 73) — «hard sci-fi» non distinguibile con le keyword attuali
- `preset_italian_comedy` (B 68) — keyword restrittiva, pool 53, 8 righe di trash
- `preset_action_blockbusters` (B 74) — «Motori & Esplosioni» ma la lista è action generico (Spider-Man, Aquaman)
- `preset_heist`, `preset_treasure_hunters` (B 77) — stessa forma, magnitudine minore
- `preset_anime_shonen` (B 76) — keyword 14643: pool 15, dentro Fate/Persona/Maken-Ki invece dei pilastri shonen

### C3 — Pool che non riempie la pagina · **46 cataloghi sotto 60 titoli · 12 sotto 20**

La pagina Stremio è 20 titoli e non c'è refill: sotto 20 il catalogo mostra **una pagina sola e corta**.

Sotto 20: `preset_villeneuve` 10 · `preset_fincher` 12 · `preset_nolan` 14 · `preset_anime_shonen` 15 · `preset_tarantino` 16 · `preset_kubrick` 16 · `preset_dc` 16 · `preset_sea_series_docs` 16 · `preset_teen_drama_comedy` 16 · `preset_sports_underdog` 17 · `preset_lynch` 19 · `preset_doc_tech_future` 19.
Tra 20 e 59: altri 34, tra cui tutti i cataloghi «registi» e «attori», 6 cataloghi anime di nicchia, i documentari su abissi/spazio/musica.

### C4 — Trash nelle nicchie · **177 righe**

Dove il genere è di per sé povero (horror, slasher, action di serie B, commedia demenziale), le soglie di voto non bastano: `preset_bollywood` 8 righe · `preset_italian_comedy` 8 · `preset_cult_classics` 6 · `preset_a24_horror` 6 · `preset_slapstick_comedy` 5 · `preset_tv_dystopia` 5 · `preset_spy_action` 5 · `preset_nicolas_cage` 4 · `preset_medical_drama` 4 · `preset_stand_up` 4 · `preset_disney_plus` 4 · `preset_fairy_tales` 4 · `preset_fantasy_magic` 4 · `preset_hbo_max_movies` 4 · `preset_actor_reeves` 4.

### C5 — Cataloghi di persona inquinati da opere minori · **11 cataloghi**

Per un regista o un attore il problema non è il genere ma il **ruolo**: documentari *su* di lui, cortometraggi, cameo, film TV, partecipazioni di un minuto.

`preset_actor_cruise` (B 79: The Final - Attacco a Wembley, Val, Stanley Kubrick - Ein Leben für den Film) · `preset_actor_reeves` (Animatrix, Siberia, Nell'ombra di un delitto) · `preset_nicolas_cage` (Left Behind, Il prescelto, Ghost Rider 2, Outcast) · `preset_actor_dicaprio` (Spielberg, Critters 3) · `preset_de_niro` (Val, Sly) · `preset_kubrick` (The Seafarers, Il padre volante) · `preset_johnny_depp` (London Fields, Nightmare 6) · `preset_lynch` (The Amputee) · `preset_wesanderson` (Henry Sugar) · `preset_tarantino` (Reservoir Dogs come «non visto», Kill Bill: The Whole Bloody Affair) · `preset_scott` (The Counselor).

### C6 — Nome e filtro che non dicono la stessa cosa · **5 cataloghi**

- `preset_animal_protagonists` (B 68) — «Animali Protagonisti» con protagonisti umani (Mario, Pinocchio, Thumbelina) e un horror (`Le streghe`) in un catalogo per bambini
- `preset_teen_preteen_tv` (B 79) — target dichiarato teen, dentro Teletubbies, Barney, Sesamo apriti!, The Wiggles
- `preset_disney_animation` (B 79) — «Disney Classici» che è per metà Pixar (company id generico) e ha il pool a 50
- `preset_giant_monsters` (B 73) — «Squali & Mostri Giganti» che è per metà kaiju giapponese
- `preset_action_blockbusters` (B 74) — vedi C2</br>

### C7 — Metadati sottili: cataloghi con oltre il 30% di titoli sotto 50 voti · **23 cataloghi**

`preset_new_series_eps` 88% · `preset_doc_food_travel` 82% · `preset_donghua` 74% · `preset_sports_docs` 72% · `preset_doc_history_war` 72% · `preset_sea_series_docs` 69% · `preset_turkish_dizi` 66% · `preset_true_crime` 64% · `preset_anime_kids_series` 64% · `preset_space_docs` 63% · `preset_sketch_comedy` 58% · `preset_nordic_noir` 54% · `preset_sea_movie_docs` 54% · `preset_stand_up` 52% · `preset_italian_comedy` 48% · `preset_new_series` 46% · `preset_kdrama_thriller` 42% · `preset_german_dark` 42% · `preset_reality_shows` 42% · `preset_nature_series_docs` 38% · `preset_anthology` 36% · `preset_bollywood` 34% · `preset_teen_preteen_tv` 32%.

Non è un difetto di per sé (i documentari nuovi hanno pochi voti per natura), ma rende fragile l'ordinamento per voto e la dimensione Qualità.

---

## 4. Meccanica (numeri indipendenti dal giudizio)

- **Overlap J@40 ≥ 0,5**: `preset_anime_action` × `preset_pop_anime` = **0,569** (i due cataloghi sono lo stesso elenco con due nomi). Nessun'altra coppia sopra 0,5; `preset_new_series_eps` × `preset_new_series` = 0,36.
- **Keyword morte**: 12 (dalla baseline `catalog-audit`).
- **Finding meccanici**: 150 warning, 0 blocking.
- **Hero**: `hidden_gems` rispetta sempre il tetto di popolarità (0 item con Pop > 20 su tutti i profili); overlap fra hero dello stesso tipo = 1 titolo condiviso su 12 coppie (`Hope`, freddo, movie) — l'invariante «zero overlap» è quasi rispettato.
- **Quota ITA nei hero**: dal 20% (`trakt_filtered_movies`, freddo) all'86% (`true_blend_series`, generale).

---

## 5. Verifica, rumore e limiti del metodo

### 5.1 Verifica anti-allucinazione (automatica)

`qc-aggregate.js` ricontrolla ogni riga di `errori` contro il dump: **582 righe su 160 verdetti, 0 titoli inesistenti, 0 fuori posizione, 0 problemi di forma**. I giudici hanno citato solo righe reali, ed è la ragione per cui questo report può essere verificato riga per riga.

### 5.2 Verifica del campione (orchestratore)

Riletti a mano contro il dump: `preset_anime_shonen` (pool 15 ✓, keyword 14643 ✓), `preset_cult_classics` (pool 64 ✓, keyword 6158 ✓), `preset_tv_politics` (8 anime su 50 ✓), `preset_psych_thriller` (pool 45 ✓), `preset_mindfuck` (3 film animati DC nei primi 50 ✓), `preset_tv_high_fantasy` (22 anime su 28 ✓). **6 su 6 confermati.**

### 5.3 Rumore del giudice (ri-giudizio cieco di 4 cataloghi)

| Catalogo | Giudice 1 | Giudice 2 | Δ |
|---|---|---|---|
| `preset_nolan` | P 91 | P 84 | −7 |
| `preset_pop_series` | B 78 | P 85 | **+7 (verdetto ribaltato)** |
| `preset_anime_shonen` | N 57 | P 91 | **+34 (verdetto ribaltato)** |
| `preset_tv_politics` | B 78 | B 75 | −3 |

**Δ medio assoluto 12,8, Δ massimo 34.** Il caso `anime_shonen` è istruttivo: entrambi i giudici vedono gli stessi fatti (pool 15 → completezza 40), ma uno legge la promessa in modo severo (pertinenza 25) e l'altro in modo letterale (100). L'orchestratore ha adjudicato a **B 76** (10 dei 15 titoli sono battle shōnen, 5 no) con la correzione registrata in [`review/correzioni.json`](../review/correzioni.json).

**Conseguenza**: i punteggi vanno letti a bande. Un catalogo a 78 non è «peggio» di uno a 82; un N a 59 è un N, ma a 3 punti dalla soglia è un lancio di moneta (vedi sotto).

### 5.4 Verdetti al limite · **40 su 160 (25%)**

Stanno entro ±3 punti da una soglia: 33 in banda P/B (76-83) e 7 in banda B/N (57-63). Esempi: `preset_burton` 83 P · `preset_marvel` 82 P · `preset_sea_movie_docs` 82 P · `preset_dc` 78 B · `preset_pop_series` 78 B · `preset_hulu_series` 79 B · `preset_disney_animation` 79 B · `preset_tv_high_fantasy` 59 N.

Nessuno dei 160 verdetti è stato marcato `fiducia: bassa`.

### 5.5 Tensione interna della rubrica

7 cataloghi sono P **con 6-8 righe di errore** (`preset_tv_thriller` 85, `preset_sad_romance` 86, `preset_vampires_werewolves` 88, `preset_martial_arts` 88, `preset_cinema_coreano` 92, `preset_bollywood` 85, `preset_videogame_movies` 84). La causa è duplice: il cap a 8 righe satura il conteggio, e le ancore di pertinenza ammettono 5 item discutibili su 50 in banda 80. È il punto della rubrica da stringere in una seconda campagna.

### 5.6 Correzione di rubrica (errori del brief, non del giudice)

Il brief hero diceva che le «Gemme Nascoste» richiedono 100-1000 voti: è il gate del **fallback**, non del builder (`F.minVotes(50)`, verificato in `catalogStrategies.js`). Corretto il tool (`hero-enrich.js`) e comunicato ai giudici, che hanno rivisto i due hero delle Gemme: horror 88→**91** e 87→**93**, generale 87→**93** e 81→**90**. Le correzioni sono nella stessa sessione dei giudici, non applicate a mano sui file.

---

## 6. Hero

40 liste giudicate (5 profili × 8 hero). **23 P · 17 B · 0 N**, media 82,8. La distribuzione non è casuale: dice esattamente quali ricette funzionano.

| Hero | media | P/B/N | min-max | lettura |
|---|---|---|---|---|
| 💎 `hidden_gems` | **90,2** | **10/0/0** | 83-97 | funziona in tutti i profili, anche nel freddo: non promette personalizzazione, quindi non la tradisce |
| ⭐ `true_blend` | 87,5 | 7/3/0 | 68-98 | ottimo con DNA, **fallback travestito** senza DNA |
| 🕸️ `seed_network` | 80,9 | 5/5/0 | 66-93 | metà delle liste sono B per la stessa causa |
| 🌐 `trakt_filtered` | **72,5** | **1/9/0** | 63-95 | il percorso degradato, giudicato 5 volte su 5 |

| Profilo | media | verdetti non-P |
|---|---|---|
| generale | 85,4 | seed_network_movies, trakt_filtered_movies, trakt_filtered_series |
| horror | 83,5 | idem |
| serie | 85,9 | idem |
| otaku | 84,1 | **true_blend_movies**, trakt_filtered_movies |
| freddo | **75,0** | 6 su 8 (true_blend ×2, seed_network ×2, trakt ×2) |

### 6.1 Il profilo freddo: il fallback servito come raccomandazione (verificato)

Il `yaca_true_blend_movies` di un profilo senza DNA è **esattamente** il fallback «popolari ultimi 36 mesi, voti ≥ 100, media ≥ 6.8»: **50 titoli su 50 identici, stesso ordine** — verificato con una query diretta sul parquet, non con un'impressione. Il giudice cieco ha dato allo stesso hero **B 68**: «fallback di popolarità senza DNA servito come Scelto per Te». Nella stessa condizione `seed_network` diventa una **falsa rete dei preferiti** (B 66/B 68: corti, backstage, reality show, `match 0` su tutta la lista).

`hidden_gems`, nel freddo, prende **88 e 97**: è la dimostrazione che un hero non-personalizzato può essere onesto se non promette personalizzazione.

### 6.2 `seed_network_movies` sbaglia allo stesso modo in tre profili su cinque

Generale, horror e serie ricevono tutti **B 73-79** per la stessa ragione: la rete dei film è diluita da **animazione per famiglie, corti e speciali** slegati dai seed (Spider-Man: No Way Home, Il gatto con gli stivali 2, Once Upon a Studio 9', Dragon Trainer, Luck, Il bambino, la talpa, la volpe e il cavallo 35'). È lo stesso inquinamento strutturale del ticket 07, ma qui il pool è costruito dal builder, non da un filtro dichiarato.

### 6.3 Il caso otaku: il cap di diversità refluisce live-action

`yaca_true_blend_movies` per il profilo anime prende **B 73** con **19 film live-action a basso `match`**: il cap `HERO_DIVERSITY_CAPS.genre = 3` satura sull'Animazione (che per quel profilo è il genere dominante) e il refill riempie col resto. Il profilo riceve così una lista per metà live-action in un catalogo che dovrebbe essere il suo. Le altre sette liste dello stesso profilo sono P (true_blend_series 96, seed_network_series 92, trakt_filtered_series 95).

### 6.4 ⚠️ Il dato che sembrava un successo era un bug (ticket 13)

La campagna aveva registrato «100% anime negli hero del profilo anime — la `animePolicy` del ticket 17 funziona».
**Era falso**: quel 100% era il marcatore `_isAnime` del server, non il contenuto. Misurando il contenuto titolo per
titolo (generi, lingua e keyword dal parquet) la quota reale è **63-98%**, e un test dedicato ha mostrato che con un
profilo «Solo Anime» il hero `true_blend_movies` serve **14 item su 20 che non sono anime** (Mediterraneo,
I Tenenbaum, Nebraska, Marie Antoinette…), tutti marcati `_isAnime: true`: il filtro si fida del marcatore e quindi
non filtra nulla. Con «No Anime» invece funziona. Riproduzione, prove e ipotesi di causa: [ticket 13](13-solo-anime-non-filtra-i-hero.md).

Lo smontaggio è arrivato dalla verifica: un giudice hero aveva segnalato «19 film live-action», il dato meccanico
diceva «100% anime», e invece di scegliere una delle due versioni ho classificato i titoli uno per uno. Il giudice
aveva ragione.

### 6.5 Le cose che funzionano

- **`hidden_gems`**: 10 P su 10, tetto di popolarità rispettato (0 item con Pop > 20 in tutti i profili), e i vincoli voti/durata violati solo dove dichiarato (§5.6).
- **Invariante «zero titoli condivisi fra hero dello stesso tipo»**: rispettata in 11 coppie su 12; l'unica violazione è un titolo (`Hope`, profilo freddo, movie).
- **Badge ITA**: presenti dal 20% all'86% delle liste, coerenti col tipo di contenuto (più alti nelle serie, più bassi nei film recenti).
- **Il selettore «No Anime»** filtra correttamente (0 anime serviti nel test dedicato): il difetto del ticket 13 è asimmetrico.

### 6.6 Numeri meccanici (indipendenti dal giudizio)

| Profilo | Hero | item | anime reali | flag `_isAnime` | ITA % | rating med | pop med | anno med |
|---|---|---|---|---|---|---|---|---|
| generale | true_blend_movies | 50 | 0 | 0 | 52 | 7,8 | 20,2 | 2002 |
| generale | hidden_gems_movies | 50 | 0 | 0 | 24 | 7,7 | 4,7 | 2002 |
| generale | trakt_filtered_movies | 50 | 0 | 0 | 28 | 6,7 | 30,2 | 2026 |
| horror | hidden_gems_movies | 50 | 0 | 0 | 36 | 7,5 | 5,4 | 1986 |
| horror | trakt_filtered_movies | 50 | 0 | 0 | 26 | 6,7 | 32,0 | 2026 |
| otaku | true_blend_movies | 60 | **63** | **100** | — | — | — | — |
| otaku | hidden_gems_movies | 60 | **80** | **100** | — | — | — | — |
| serie | true_blend_series | 50 | 0 | 0 | 86 | 8,3 | 65,8 | 2016 |
| freddo | true_blend_movies | 50 | 3 | 3 | 52 | 7,6 | **71,2** | **2026** |

Le colonne «anime reali» sono ricalcolate sul contenuto (`isAnimeContent` con generi/lingua/keyword dal parquet);
il dettaglio di tutte le 40 liste è in `runs/hero-anime-truth.json`. Quando le due colonne divergono, il marcatore
servito è sbagliato (ticket 13).

Il `trakt_filtered` ha in ogni profilo la **mediana di voto più bassa di tutti i hero** (6,6-6,7), anno mediano 2026
e popolarità alta: è il fallback «uscite recenti», non una raccomandazione verificata.

### 6.7 Il percorso Trakt *reale* non è coperto

L'account di test non ha token Trakt, quindi i 4 profili con DNA giudicano solo il **percorso degradato**. L'account reale `REOZrGNRr3` invece **ha** `apiKeys.trakt` (verificato): in produzione il hero «Suggeriti dalla Community» segue un percorso che questa campagna non ha misurato. La lacuna è dichiarata, non nascosta (ticket 10).


---

## 7. Ticket proposti

| # | Ticket | Causa | Perimetro |
|---|---|---|---|
| [02](02-anime-fuori-promessa.md) | Anime fuori promessa nei cataloghi occidentali | C1 | 15 preset (2 N, 6 B) |
| [03](03-keyword-come-promessa.md) | Promesse appoggiate a una singola keyword | C2 | 12 preset |
| [04](04-pool-sotto-la-pagina.md) | Pool sotto la pagina Stremio | C3 | 46 preset (12 critici) |
| [05](05-soglie-voti-e-trash.md) | Soglie di voto e anti-trash | C4+C7 | 15 + 23 preset |
| [06](06-cataloghi-di-persona.md) | Cataloghi di persona: documentari, corti, cameo | C5 | 11 preset |
| [07](07-corti-e-trailer.md) | Corti, backstage e trailer serviti come film | nuova (hero) | 23 item nei hero, i percorsi film |
| [08](08-nome-vs-filtro.md) | Nome e filtro che non dicono la stessa cosa | C6 | 5 preset (1 con rischio contenuti per bambini) |
| [09](09-hero-fallback-invisibile.md) | Hero: il fallback non deve travestirsi da raccomandazione | hero | profilo freddo + `seed_network` movies + cap di diversità anime |
| [10](10-hero-trakt-reale.md) | Hero `trakt_filtered`: percorso reale mai misurato | hero | 2 hero × 5 profili |
| [11](11-harness-fixture-stantie.md) | Harness della campagna: fixture stantie | infrastruttura | `scripts/qa/` |
| [12](12-rubrica-rumore.md) | Rubrica: rumore del giudice e promessa tematica | metodo | la campagna stessa |
| [13](13-solo-anime-non-filtra-i-hero.md) | **`Solo Anime` non filtra i hero: il marcatore `_isAnime` è `true` su tutto** | bug verificato | i hero di qualunque profilo con `only` |

Ordine suggerito: **13** per primo (feature di selezione inefficace, misurata su un profilo fresco), poi **08** e **02**
(rischio contenuti e promessa più palese), **09** e **07** (la qualità percepita dei suggerimenti), **04** e **03**
(i pool, che toccano più cataloghi), quindi **05**, **06**, **10**, e infine **11**-**12** prima di una seconda campagna.

## 8. Lacune dichiarate

- **`preset_anime_simulcast`** non è nel perimetro: `_provider: airing_state`, non passa dal parquet.
- **Percorso Trakt autenticato** (§6.3): da coprire in una seconda campagna.
- **Ricerca, watchlist, custom/Matchmaker**: fuori ambito per spec.
- **Poster e badge**: non giudicati (l'oggetto è il contenuto), anche se le liste hero portano il dato ITA.
- **Data congelata**: i numeri di freschezza valgono al 06/10/2026; una seconda campagna in un'altra data non è confrontabile sulla completezza dei pool senza dichiarare la differenza.

## 9. Lezioni sulla campagna (per chi la ripete)

1. **Il fixture dei profili era stantio**: `scripts/qa/profiles.spec.json` puntava a due context (`aa0b4082`, `a920b180`) che non esistono più su Atlas — il comando `profiles` falliva subito. La campagna ha usato una spec derivata (`.scratch/qc-cataloghi/runs/qc-profiles.spec.json`) con i 5 DNA realmente presenti.
2. **La watchlist sintetica della spec fa crashare l'harness**: due righe legacy con `itemId: null` violano l'indice unico `addonUuid_1_itemId_1`. La campagna ne tiene una sola.
3. **`teardown` segnala «tasteprofiles 5/17 → ANOMALIA»** sul profilo reale: l'attesa è rimasta ferma alla vecchia configurazione. Da aggiornare.
4. **Con `fetch --cached` la cache hero va invalidata prima**, altrimenti si giudicano liste costruite da una sessione precedente (conta il context, non la `configVersion`: per questo i profili sim hanno context nuovi). `teardown` prova a pulire Redis, ma da Windows non è raggiungibile: le chiavi `sim_*` decadono col TTL.
5. **Il fetch legge i profili dalla spec, non dal database**: senza `--spec` scarica i profili vecchi, e per un profilo assente il server ricade su `profiles[0]` — si finisce per scaricare 8 volte lo stesso elenco.
6. **Un verdetto per catalogo, in una cartella sola**: il ri-giudizio cieco salvato in `review/preset/` ha sovrascritto 4 verdetti originali. Ora i controlli vivono fuori da `review/` e l'aggregatore segnala i duplicati.
7. **Un dato del server può essere la cosa rotta che stai misurando**: il «100% anime» dei hero era il marcatore `_isAnime`, non il contenuto — e il marcatore era il bug (ticket 13). Prima di usare una metrica, verifica che misuri la cosa e non la sua etichetta.
8. **La rubrica è più precisa del dato**: 25% dei verdetti a ridosso di una soglia e Δ 34 fra due giudici dicono che il ranking va pubblicato a bande, con l'evidenza accanto.
