# 18 — Normalizzazione, reti TV, debiasing: il ponte si apre

**Data**: 08/10/2026 · `build-film-graph.py` → `film-graph-v3.npz` · debiasing in forma chiusa

## Le tre modifiche (e il punto concettuale dell'utente)

L'utente: *«rappresentare un vettore (già latente) in un altro spazio latente non fa danno?»*. La
risposta è nei numeri di oggi: **sì, se la seconda trasformazione non ha un bersaglio esterno** — le tre
ri-embeddate non supervisionate (embedding del grafo keyword, grafo comportamentale, max-pooling) hanno
tutte dato **+0,001 o peggio**. Lo student è una **proiezione supervisionata** (il secondo spazio è
definito dal teacher), ed è l'unica forma che guadagna. **Regola: una trasformazione delle feature vale
solo se guidata da un bersaglio esterno.**

Modifiche a `build-film-graph.py`:
1. **IDF sui blocchi binari** (10.934 colonne; idf mediano 8,16): una persona rara pesa più di una
   onnipresente. È la normalizzazione *di frequenza*, quella che mancava.
2. **Standardizzazione delle 8 numeriche** (prima convivevano scale diverse sotto lo stesso alpha).
3. **`networks`** (colonna del parquet **mai usata**): 60 reti TV, copertura 19% — canale
   serie-specifico, come i paesi per i film (e i paesi, da bug a 98%, avevano dato il guadagno più grosso).

## Il confronto (quattro build, stesso protocollo)

| build | accuratezza film (held-out) | AUC tipo | vicini film di una serie | serie scoperte | **GoT ↔ Le crociate** |
|---|---|---|---|---|---|
| v2 (paesi + persone) | **0,448** | 0,966 | 4 | 13% | +0,255 · #28.890 |
| v2 + debiasing | — | 0,952 | 4 | 13% | +0,255 · #28.890 |
| v3 (IDF + std + reti) | 0,425 | 0,875 | **7** | **3%** | +0,305 · #19.965 |
| **v3 + debiasing** | — | **0,838** | **7** | **3%** | **+0,311 · #19.397** |

**Debiasing in forma chiusa** (nessun riaddestramento): si stima con una logistica la direzione che
predice film/serie nello spazio e si **proietta fuori** (`Q = P − (P·ŵ)ŵ`). È la versione in forma chiusa
del debiasing avversariale.

Controllo che il debiasing non distrugga il resto: **Il padrino ↔ Quei bravi ragazzi +0,436, rank #14**
(era #15) — la struttura film↔film è intatta. E la coppia anime resta alta (AoT ↔ Your Name 0,368).

## Il verdetto: un compromesso, non una vittoria

- **Il ponte si è aperto**: GoT ↔ Le crociate passa da **sotto il caso** (+0,145) a **+0,311**, con la
  posizione da **#42.248 a #19.397** (2,2× meglio). I vicini film di una serie passano da 2 a **7** e le
  serie senza alcun vicino film da 22% a **3%**.
- **Costa accuratezza sui film**: 0,448 → 0,425 (−5% relativo). L'IDF down-pesa le feature *frequenti*,
  che sono anche le più utili per il bersaglio collaborativo.
- **L'asse tipo non è sparito**: 0,838, non 0,5. Il ponte è aperto ma **debole**: #19.397 non è #200.

## Cosa resta

1. **Dosare l'IDF** (idf^0.5 invece di idf, o standardizzazione più blanda) per prendere il ponte
   **senza** perdere l'accuratezza sui film: un giro per variante, il compromesso è misurabile.
2. **La fonte cross-tipo mirata**: Trakt `/shows/{id}/related` (il client c'è, manca l'endpoint) su
   ~10 titoli chiave per vedere cosa suggerisce; poi MAL/AniList per gli anime (comportamentale vero).
3. **Jev** resta l'ultima spiaggia, con la validazione sui film (protocollo TMDB: AUC 0,768) — e la
   precisazione dell'utente è giusta: un modello di decisione addestrato su giudizi umani non è "solo
   linguistico", ma non è co-visione.

---

## Trakt `/related`: alta qualità, ma **same-type** — e la conclusione strutturale

10 titoli chiave (client id in `.env`, +User-Agent: senza, Trakt risponde non-JSON). Script:
`trakt-related.js` → `.cache/movielens/trakt-related.json`.

| titolo | Trakt suggerisce | tipo |
|---|---|---|
| **Attack on Titan** (serie) | Fullmetal Alchemist: Brotherhood · Hunter x Hunter · Berserk · Devilman Crybaby | **tutte serie** |
| **Your Name** (film) | A Silent Voice · I Want to Eat Your Pancreas · The Girl Who Leapt Through Time | **tutti film** |
| **The Last of Us** (serie) | Fallout · The Walking Dead · Station Eleven · The 100 | **tutte serie** |
| **World War Z** (film) | I Am Legend · 28 Days Later · Land of the Dead · #Alive | **tutti film** |

**La qualità è alta** — migliore delle raccomandazioni TMDB (The Last of Us → Fallout/TWD, World War Z →
I Am Legend sono centrati). Ma **il `related` di Trakt è same-type**, esattamente come le raccomandazioni
TMDB: `shows/{id}/related` restituisce serie, `movies/{id}/related` restituisce film.

### La conclusione che ne segue (strutturale, non di gusto)

**Nessun servizio di relatedness item-item che abbiamo trovato dà il ponte cross-tipo.** TMDB: same-type.
Trakt: same-type. E le fonti comportamentali (MovieLens, MAL) sono per definizione mono-dominio.

Quindi il ponte film↔serie può venire **solo** da:
1. **la semantica del modello** (il lavoro di debiasing: 0,979 → 0,838, e il ponte già aperto a +0,311);
2. **un modello di decisione** (Jev) che giudica *attraverso* i tipi — l'unico strumento che può farlo,
   con la validazione sui film;
3. **il comportamento dell'utente stesso** (chi guarda *sia* GoT *sia* Le crociate — la strada del DNA,
   che l'utente ha messo per ultima).

Trakt resta utile per altro: è una **validazione esterna della struttura within-type** (i nostri vicini
di una serie, confrontati con quelli di Trakt, sono un metro che non dipende da noi) e una fonte di
**relazioni same-type di qualità** se un giorno servisse rinforzare quel lato.

---

## Il dosaggio dell'IDF (08/10/2026): il ginocchio è a 0,5, ma il ponte non è un numero solo

| IDF^ | accuratezza film | AUC tipo | serie↔film | vicini film | scoperte |
|---|---|---|---|---|---|
| **0,0** (nessuno) | **0,448** | 0,966 | +0,137 | 4 | 13% |
| **0,5** | **0,430** | **0,870** | **+0,154** | **7** | **3%** |
| 1,0 | 0,425 | 0,875 | +0,148 | 7 | 3% |

**Due scoperte:**

1. **Isolamento dell'attribuzione**: `IDF^0,0` dà **esattamente** i numeri di v2 (0,448 / 0,966 / 4 /
   13%) → **la standardizzazione delle numeriche e le reti TV non hanno contribuito nulla**. Tutto
   l'effetto è dell'IDF. (E la dose-risposta è monotòna: 0,448 → 0,430 → 0,425, firma di un effetto reale.)
2. **IDF^0,5 domina IDF^1,0**: meglio sull'accuratezza film e uguale o migliore su ogni asse strutturale.
   È il ginocchio della curva.

### Ma la tabella a occhio dice che il ponte non è un numero solo

| grafo | GoT↔Crociate | BB↔Padrino | Mandalorian↔Star Wars | **AoT↔Your Name** | Padrino↔Bravi |
|---|---|---|---|---|---|
| idf00 | +0,257 #28.628 | +0,105 | +0,069 | **+0,476** | +0,444 #14 |
| idf05 | +0,295 #23.666 | +0,037 | −0,019 | **+0,442** | +0,439 #10 |
| idf10 | +0,305 #19.965 | +0,046 | +0,009 | **+0,368** | +0,442 #13 |

**L'IDF non è uniformemente buono**: aiuta GoT↔Le crociate (monotòno) ma **peggiora il ponte anime**
(+0,476 → +0,442 → +0,368) e la coppia franchise. E il ponte anime è **l'unico cross-tipo validato** che
abbiamo (i metadati si sovrappongono davvero).

**Quindi**: l'IDF compra *copertura strutturale* (vicini film 4 → 7, serie scoperte 13% → 3%, asse tipo
0,966 → 0,870) pagando *segnale reale* su alcune coppie. Non è una vittoria netta: è una **scelta di
compromesso**, e va presa sapendo cosa si compra e cosa si vende.

**Raccomandazione**: **IDF^0,5** come default (massima copertura, minima perdita di accuratezza), e la
consapevolezza che il ponte anime — l'unico verificabile — chiede di *non* alzare l'esponente.

Artefatti: `film-graph-idf00.npz`, `film-graph-idf05.npz`, `film-graph-v3.npz` (= idf10), `film-graph-v2.npz`.
