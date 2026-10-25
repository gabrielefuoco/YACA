# Handoff — distillare il grafo in uno spazio denso

**A**: il senior · **Da**: l'agente · **Data**: 21/10/2026
**Allegati**: `digest.txt` (79 file, **267,8k token**) · `fotografia-grafo.md` + `.csv` ·
`report-pulizia.md` · `lettura-vicini.md` · `topk.txt`
**Stato**: brainstorming, niente in `src/` — la decisione è tua.

---

## 0. La domanda in una pagina

YACA ha un **grafo di co-visione** su 66.259 titoli (49.709 film + 16.550 serie) e 13,25 M di archi.
Il grafo è un buon **substrato** — sa *dove guardare* — ma non è un **ranker**: i primi 10 vicini di un
titolo sono quasi sempre giusti, oltre il 20-30 la coda è rumore. Le bolle (3.497) sono la parte
affidabile; gli archi lunghi no. Il freddo (titoli nuovi, serie) è il punto debole.

L'idea da mettere sul tavolo: **distillare il grafo in uno spazio vettoriale denso**. Costruire una
matrice **N×20** (per ogni titolo i suoi 20 archi pesati migliori; top-30 come variante), e addestrare
un modello che, dai **metadati TMDB** (trama embeddata come già facciamo, keyword che passano dal
nostro grafo delle keyword, generi, cast, registi, reti, collezioni, paesi, lingue, stagioni/episodi,
ecc.), produca un **embedding denso** per ogni titolo — anche per quelli che nel grafo non hanno archi.
L'obiettivo non è copiare il grafo: è **generalizzarlo** a un titolo nuovo, a una serie con pochi dati,
a una bolla sbagliata.

Ti chiedo quattro cose:

1. **Dimmi se è la strada giusta** — o se un'alternativa più semplice (SVD + Ridge, come già facciamo)
   basta e avanza. Se l'idea è sbagliata, dillo.
2. **Dimmi come rappresentare la matrice** (top-20/30, pesi grezzi o trasformati, simmetrica o no) e
   **come addestrare lo studente** (target, architettura, loss, feature) per migliorare cold start,
   rumore e serie.
3. **Dimmi come misurarlo**, e qual è il numero che decide.
4. **Alla fine, scrivi la bozza di script** che addestra la rete partendo dalla matrice, con gli
   **iperparametri scelti e motivati** (§6). Non un saggio: codice che gira.

Il digest che accompagna questo file contiene **tutto il codice del modulo** e **come il prodotto lo
invoca**: non fidarti dei riassunti, la fonte è il codice. I due report allegati contengono le misure
per esteso.

---

## 1. Il grafo com'è (e come l'ho trovato)

### 1.1 I numeri, con il metodo

| cosa | valore | come |
|---|---|---|
| canone | **66.259** titoli = 49.709 film + 16.550 serie | `spazi-trakt.npz` |
| archi | **13.253.674** | triangolo simmetrizzato, 10 componenti |
| bolle | **3.497** (mediana 11 membri) | Leiden RB 200 + divisione per voti |
| coerenza intra-bolla | **+0,942** PMI mediana | indice di chimera |
| saghe TMDB spezzate | **0 su 1.994** | adiacenza sulla mappa |
| collocazione | **27,7%** film (banco) · **~90/100** (occhio) · **63,0%** serie (V1, 87,3% con promozioni) | `collocator.py` |
| camminata | α = **0,60**, 20 iterazioni, top-16 potato | `camminata.py` |
| motore intero | precisione **5,0-6,4%** contro pavimento **0,08%** (63-76×), **115-147 ms** | `measure/intero.py` |
| freddo | da **1 titolo** 36,9× contro 0,6× di un titolo a caso | `measure/freddo.py` |

I **10 componenti** della miscela: `CF 1 · CFst 1 · B 1 · KW 1 · TV 1 · CAST 1 · DIR 1 · COLL 3 ·
LIST 1 · TRAMA 1`. `CF` è MovieLens, `CFst` il salvagente per i titoli ciechi, `B`/`TV` i segnali
Trakt, `KW` le keyword, `CAST`/`DIR` persone, `COLL` le collezioni, `LIST` le Trakt-liste, `TRAMA`
l'embedding della trama. Il triangolo è il **risultato** di questa miscela; non è un coseno puro.

La camminata usa la **potatura top-16 per riga** (più gli archi inversi): 1.529.390 archi, l'11,5%,
**8,7× meno lavoro**. Il prodotto carica `bolle.json` (bolle + probabilità di transizione) e cammina in
JavaScript; l'offline `motore.py` fa la stessa cosa in Python. **La parte che funziona è la
partizione; il ranking degli archi è la parte fragile.**

### 1.2 La lettura dei 100 vicini — la prova che il grafo è locale

Ho preso i 100 archi di peso maggiore di sei titoli e li ho letti uno per uno, classificandoli in
**giusti** (stesso mondo/pubblico), **dubbi** (pubblico largo o legame debole ma spiegabile) e
**sbagliati** (mondo diverso). Il confine è mio; il profilo è netto.

| titolo | giusti | dubbi | sbagliati | 1° sbagliato |
|---|---:|---:|---:|---:|
| Spider-Man (2002) | 64 | 15 | **21** | 52 (Pirates of the Caribbean) |
| Inkheart (2008) | 54 | 8 | **38** | 37 (Piacere Dave) |
| Un ponte per Terabithia (2007) | 52 | 8 | **40** | 44 (Hairspray) |
| Inception (2010) | 42 | 37 | **21** | 32 (Il ritorno del re) |
| Perfetti sconosciuti (2016) | 29 | 13 | **58** | 27 (Без границ) |
| Breaking Bad (2008) | 40 | 15 | **45** | 14 (drama coreano) |

Aggregata sui sei titoli:

| taglio | giusti | dubbi | sbagliati |
|---|---:|---:|---:|
| **top 10** | **60/60 (100%)** | 0 | 0 |
| **top 20** | **110/120 (92%)** | 9 | 1 |
| **top 30** | **153/180 (85%)** | 23 | 4 |
| **top 50** | **206/300 (69%)** | 45 | 49 |
| **top 100** | **281/600 (47%)** | 96 | 223 |

Casi che valgono più di una tabella:

- **Inkheart e Terabithia si somigliano davvero**: 11 titoli comuni nei rispettivi top 20 (Jaccard
  0,38), 13 nei top 100, e 8-9 dei primi 10 nella stessa bolla **1395** (Spiderwick, La bussola d'oro,
  Stardust, Tata Matilda, Eragon…). Il fantasy per famiglie il grafo lo vede. Poi, dal 41 al 58,
  Inkheart prende **11 titoli da una bolla tedesca di comedy/TV** (Bullyparade, Pastewka,
  Knallerfrauen…), con pesi 1-1,5% del massimo.
- **Breaking Bad**: i primi 10 sono ottimi (Better Call Saul, Narcos, Power, Chernobyl, Squid Game…),
  ma al 14 c'è un drama coreano, al 25 Seinfeld, al 31 HIMYM, al 37 Il Trono di Spade. E i vicini
  **giusti** del mondo crime — The Shield (87), Ozark (89), I Soprano (90), Fargo (93) — stanno
  **dopo** la spazzatura, con pesi migliaia di volte più piccoli. L'ordine è monotono **nel peso**, non
  **nel significato**.
- **Spider-Man**: i primi 4 sono i compagni della sua stessa bolla (i cinque film live-action); fino al
  50 non c'è **un solo** sbagliato netto; dal 52 è una coda di blockbuster per famiglie (Shrek, Hook,
  Nemo, Peter Pan), che non sono film brutti (`vote_average` mediano dei 21 sbagliati **7,13**): sono
  un altro pubblico.

**Il quadro**: il grafo è **forte ma locale**. I primi 10 sono perfetti, i primi 20-30 sono buoni, e la
coda non è "meno pertinente": è **attivamente sbagliata**, e in mezzo ci sono titoli che non c'entrano.
La causa non è il voto: i vicini sbagliati hanno `vote_average` mediano **6,3-7,1**. La causa è il
**supporto**: sono titoli oscuri (mediana 70-610 voti per cinque semi; Spider-Man è l'eccezione, 2.886) o hub popolari (Shrek, Nemo,
Peter Pan), e in entrambi i casi l'arco è una co-occorrenza, non una somiglianza. Il peso non dice
**quanta evidenza** c'è dietro.

### 1.3 La pulizia per voto — e perché non risolve questo

Ho misurato anche la pulizia delle bolle togliendo la coda bassa del voto bayesiano (`m=300`, `C=6.5`):

| k (sotto media − k·σ) | titoli persi | % canone | film | serie |
|---:|---:|---:|---:|---:|
| 1,5 | 3.309 | 4,99% | 3.098 | 211 |
| 2,0 | 1.478 | 2,23% | 1.418 | 60 |
| **2,5** | **715** | **1,08%** | **694** | **21** |
| 3,0 | 346 | 0,52% | 336 | 10 |

La regola consigliata (pavimento assoluto `vote_count ≥ 50 & vote_average < 5,0` **∪** coda bayesiana
2,5σ) perde **2.057 titoli** (2.017 film + 40 serie, 3,1% del canone). Alternative: 69 bolle con
mediana < 5,0 = **1.430 titoli**; oppure la variante "coerenza" sul voto grezzo = **3.141 titoli**.

**Ma questa pulizia non tocca il rumore dei vicini.** I 100 vicini sbagliati non sono film con voto
basso: sono film **estranei**, con voto 6,3-7,1. La bolla di Inception contiene *Patisserie Coin De
Rue*, un film giapponese con **10 voti**: il voto bayesiano lo tira a 6,5, e la MAD non basta a
buttarlo fuori. Non è "schifezza di voto": è **supporto insufficiente**. Filtrando per voto si pulisce
un problema **diverso** da quello che rende rumorosi i 100 vicini. Le due pulizie sono ortogonali.

### 1.4 Top-16 → top-25: si può alzare?

Questa è la domanda concreta. Ho misurato la potatura a k = 8, 12, 16, 20, 25, 30, 40, 48 sul triangolo
V10, con la stessa definizione del codice (`pota`: top-k per riga, poi simmetrizza).

| k | archi | % pieno | costo | massa intra-bolla | massa saghe | peso/arco |
|---:|---:|---:|---:|---:|---:|---:|
| 16 | **1.529.390** | 11,5% | **8,7×** | **70,4%** | **29,1%** | 2,95 |
| 20 | 1.884.420 | 14,2% | 7,0× | 68,6% | 27,0% | 2,61 |
| 25 | **2.322.016** | 17,5% | **5,7×** | **66,8%** | **25,1%** | 2,30 |
| 30 | 2.754.078 | 20,8% | 4,8× | 65,2% | 23,6% | 2,06 |
| 48 | 4.206.348 | 31,7% | 3,2× | 60,7% | 20,7% | 1,54 |

*(Il grafo pieno ha 52,8% di massa intra-bolla e 17,4% sulle saghe: la potatura **concentra**; andare
più a fondo diluisce, riavvicinandosi al pieno. La quota saga è una quota del peso del grafo potato,
non la "massa trattenuta" del §7 della mappa: il segno è lo stesso, il denominatore no.)*

Sui sei titoli della sonda, la precisione marginale dei ranghi nuovi:

| ranghi | giusti | dubbi | sbagliati | giusti % |
|---|---:|---:|---:|---:|
| 1-16 | 91 | 4 | 1 | **95%** |
| 17-20 | 19 | 5 | 0 | 79% |
| 21-25 | 23 | 4 | 3 | 77% |
| 26-30 | 20 | 8 | 2 | 67% |
| 31-40 | 26 | 13 | 9 | 54% |
| 41-48 | 19 | 7 | 22 | **40%** |

**La risposta**: top-25 **non è "troppa spazzatura"**, è **troppo allargamento**. I ranghi 17-25 sono
ancora il 78% giusti (e solo 3 sbagliati su 54), ma i "dubbi" crescono — soprattutto sulle serie: per
Breaking Bad i ranghi 17-25 sono 3 giusti, 4 dubbi, 2 sbagliati. Il costo è +52% di archi (8,7× → 5,7×)
e la coerenza scende di ~3,6 punti (intra-bolla) e ~4 punti (saghe). E non è che i pesi siano
trascurabili: il **20° peso è ancora il 20,9% del massimo di riga** (mediana; p10 3,1%, p90 57,4%), il
25° il 17,2%, il 30° il 14,2%. Quindi il grafo è **denso di archi forti**: il taglio a 20 non è "la
coda", è una scelta di sparsità.

**Cosa farei**:

- **Per la camminata servita**: provare **top-20** prima di top-25 (+23% archi, 7,0×, marginale 79%).
  Se il banco a taglio temporale (`measure/intero.py`, `measure/alfa.py`) guadagna in recall senza
  perdere precisione, salire a 25. Non andare oltre 30 senza un filtro di supporto. La decisione va
  presa con l'arbitro, non a intuito.
- **Per la matrice di distillazione**: il target può essere **top-20 pesato** (default), con **top-30
  come ablation**. Ma il punto non è il numero: è **come pesi**. Usa i pesi (non binari), normalizza per
  riga, e metti un **pavimento relativo** (per esempio: scarta gli archi sotto il 2-5% del massimo di
  riga, o sotto un supporto minimo). Il 20° peso al 21% del massimo dice che la matrice non è dominata
  da polvere; ma il 41-48 è al 40% giusto, quindi oltre il 30 stai insegnando rumore.

---

### 1.5 La fotografia del grafo, per i pesi

In `fotografia-grafo.md` (e `fotografia-grafo.csv`, 270 archi in formato lungo) c'è **un pezzo del
grafo vero**: i top-20 di sei titoli, tutte le coppie interne della bolla 1395, il ponte
Inkheart→674, e le statistiche globali. È lì per la domanda **«come si costruiscono i pesi?»**:

| proprietà | archi | peso |
|---|---:|---:|
| stessa bolla | 10,8% | **52,8%** |
| stessa collezione (saga) | 0,2% | **17,4%** |
| stesso regista | 2,9% | 15,5% |
| stesso medium (film/film, serie/serie) | 86,4% | **92,9%** |
| anno entro 2 | 22,4% | 33,2% |
| entrambi ≥ 50 voti | 43,5% | 53,1% |

- grado simmetrico: mediana **175**, p90 **349**, max **1.737**; peso per arco: mediana **0,03**,
p90 **0,58**, max **402,85**;
- i **top-20** coprono il **58,5%** del peso di riga (p10 39,2%, p90 82,9%); i top-30 il **71,9%**;
- il **20° peso** è ancora il **20,9%** del massimo di riga (mediana), il 30° il **14,2%**;
- il peso è **già una miscela** di 10 componenti: non è un coseno puro, e non porta con sé il
  **supporto** (quanti co-spettatori).

La domanda precisa è: **cosa sfruttare per costruire il peso della matrice** — il peso grezzo, il
supporto, la bolla, la collezione/regia/medium/anno, la trama, un lift — e **come combinarli** in una
formula sola, con quale pavimento. Per il cold start, dove il comportamento manca: cosa sostituisce
il peso?

---

## 2. L'idea: dalla matrice N×20 a uno spazio denso

### 2.1 Cosa esiste già (e non va reinventato)

`services/graph/upstream/spazi-trakt.py` **fa già una distillazione**, con lo schema classico
teacher → student:

```
teacher 1: MovieLens ratings → SVD 64        → Pc  (64-d)
teacher 2: Trakt related → PPMI → SVD 256    → Pb  (256-d)
student:   Ridge(alpha=30) su FX (metadati)  → predice Pc, Pb per TUTTI i titoli
```

`FX` è una matrice sparsa di feature TMDB: keyword del **grafo gerarchico** (L1/L2/L3), generi,
anno, `vote_count`, bayes, runtime, popolarità, lingua originale, paesi, cast+registi (top 3000),
collezioni, case di produzione, sceneggiatori, lingue parlate, budget/incassi, content rating.
`Pc`/`Pb` finiscono in `spazi-trakt.npz` (63 MB) e sono la base dei componenti del grafo. Il
collocatore, invece, usa un **TF-IDF con vocabolario congelato** e i centroidi delle bolle, non questi
embedding.

**Limiti dell'esistente**: `Pb[is_tv] = 0` (le serie restano senza teacher); la trama non entra in
`FX` (il TRAMA è un componente separato del grafo); il teacher è MovieLens/Trakt, non il grafo dei
66.259 titoli; il Ridge è lineare e non vede le interazioni tra feature. La nuova idea è **cambiare
teacher**: usare la matrice top-20 del grafo (che copre anche le serie e il comportamento reale) e
tenere/evolvere lo studente sui metadati.

### 2.2 Cosa cambia con il grafo come teacher

| | teacher attuale (`spazi-trakt`) | teacher proposto (grafo top-20) |
|---|---|---|
| copertura | film con ratings/related; serie zero | **66.259 titoli**, serie comprese |
| segnale | co-visione MovieLens + related Trakt | co-visione Trakt + 10 componenti |
| rumore | related Trakt è pulito ma esterno | coda rumorosa oltre il 20-30 |
| cold start | lo studente generalizza dai metadati | idem, ma il teacher è più ricco |
| serie | `Pb=0` | il segnale c'è, ma è debole |

Il punto delicato: **lo studente condivide le feature con il teacher**. Il grafo è costruito anche con
keyword, cast, registi, collezioni e trama; se lo studente usa le stesse feature, può **rimemorizzare**
la ricetta del teacher invece di imparare il gusto latente. La distillazione funziona se lo studente
generalizza a titoli **senza** archi; per misurarlo serve un test di **titoli tenuti fuori** (tutte le
loro feature restano, tutti i loro archi spariscono) e un test di **feature droppate**.

---

## 3. I dati disponibili

### 3.1 I campi TMDB (schema reale dei Parquet)

`movies.parquet` (37 colonne) e `tv.parquet` (40). Li ho raggruppati per **uso**:

| gruppo | film | serie | nota |
|---|---|---|---|
| **identità** | `id`, `imdb_id`, `title`, `original_title`, `title_en`, `release_date` | `id`, `imdb_id`, `tvdb_id`, `name`, `original_name`, `name_en`, `first_air_date`, `last_air_date` | join/chiavi, non feature |
| **contenuto** | `overview`, `tagline`, `keywords`, `genres`, `runtime`, `content_rating`, `adult` | `overview`, `tagline`, `keywords`, `genres`, `runtime`, `content_rating`, `adult`, `type` | **sicuro**; la trama è il segnale forte |
| **persone** | `cast`, `directors`, `writers` | `cast`, `created_by` | **sicuro**; sparso sui titoli nuovi |
| **produzione** | `production_companies`, `production_countries`, `spoken_languages`, `original_language`, `collection_id`, `collection_name` | `production_companies`, `production_countries`, `spoken_languages`, `original_language`, `networks` | **sicuro**; `collection` solo film |
| **serie** | — | `number_of_seasons`, `number_of_episodes`, `status`, `in_production`, `runtime` | **sicuro** per le serie |
| **esito** | `vote_average`, `vote_count`, `popularity`, `budget`, `revenue`, `status` | `vote_average`, `vote_count`, `popularity`, `status`, `in_production` | **attenzione: leak** |
| **disponibilità** | `watch_providers_it`, `watch_providers_us`, `ita` | `watch_providers_it`, `watch_providers_us`, `ita` | prodotto, non contenuto |
| **relazioni** | `recommendations` | `recommendations` | **leak**: è già una lista di simili |
| **media** | `poster_path`, `backdrop_path`, `logo_path`, `trailer_key` | idem | non feature (salvo multimodal) |
| **meta** | `_fetched_at` | `_fetched_at` | non feature |

**La regola che proporrei**: feature di contenuto + persone + produzione + serie; **fuori** esito,
disponibilità e `recommendations` (a meno di usarli come **target ausiliari** o per analisi). Il
`vote_count` è già usato dal collocatore per la regola dei voti, ma come **input dello studente**
rischia di insegnare la popolarità, non la somiglianza. `recommendations` è il candidato più pericoloso:
usarlo come input significa distillare una lista che è già una risposta.

### 3.2 La trama

`steps/00_embedding_trame.py`: **qwen3-embedding:0.6b** via Ollama, payload **«titolo. trama»**,
**35.829 trame × 1024**. Copre il **54%** del canone: il 46% non ha una trama. È il componente `TRAMA`
del grafo (peso 1), quindi lo studente che usa la trama **può riprodurre quel componente** — è un
vantaggio per il cold start, ma va misurato a parte.

Per i titoli senza trama: la `tagline` (spesso presente), le keyword, il titolo, i metadati. La
domanda per te: **come si allena lo studente a non dipendere dalla trama** quando manca? Feature
dropout sulla trama (e sulle altre feature) durante il training, e valutazione separata sul sottoinsieme
senza trama. La trama è anche il segnale più costoso da aggiornare per un'uscita nuova: l'embedding si
può calcolare in pochi secondi, ma va fatto.

### 3.3 Il grafo delle keyword

`services/keyword-graph` produce `src/data/hierarchical_graph.json` (~1 MB):
**6.125 keyword**, clusters **L1 1.382 · L2 469 · L3 131 · L4 70 · L5 5**, con `kw_to_L1` e i livelli
superiori. È costruito con **PPMI + BAAI/bge-small-en-v1.5 + Leiden**; il file contiene la gerarchia,
non gli embedding. `spazi-trakt.py` usa **L1/L2/L3 one-hot**; il grafo usa le keyword grezze nel
componente `KW` (con shrinkage).

Le opzioni per lo studente, da scegliere:

1. **multi-hot delle keyword grezze** (6.125 colonne, IDF) — semplice, sparso, interpretabile;
2. **one-hot dei cluster L1-L3** (già in `FX`) — gerarchia, meno sparso;
3. **embedding delle keyword** (bge 384-d) mediati/attenzionati per titolo — denso, generalizza a
   keyword nuove;
4. **graph embedding** del grafo delle keyword (node2vec/GNN) + pooling — usa la struttura, ma è un
   secondo modello da addestrare;
5. **gerarchia come target ausiliario** (predire L1-L5) — regolarizza.

La mia inclinazione: **2 + 3 insieme** (cluster one-hot + media degli embedding delle keyword), con
la gerarchia come ausiliario. Ma è una scelta da discutere: il grafo delle keyword è piccolo, e un
pooling semplice può perdere la struttura che i cluster già catturano.

### 3.4 Le serie

Le serie sono **16.550** (25% del canone), ma sono il **53% delle storie** degli utenti Trakt: il
prodotto le vede molto. Il grafo le copre male: la collocazione è al **63,0%** (87,3% con le
promozioni), e `Pb[is_tv]=0` nel teacher attuale. Le feature specifiche ci sono: `networks`,
`number_of_seasons`, `number_of_episodes`, `status`, `in_production`, `last_air_date`, `type`,
`created_by`, `production_countries`, `runtime`. La trama e le keyword ci
sono come per i film; i voti/la popolarità sono spesso più bassi e più rumorosi.

Le domande: **un modello unico con un type embedding, o due modelli con un encoder condiviso?** Il
trasferimento film→serie è una vera opportunità (le serie hanno pochi archi, i film molti), ma il
rischio è che le serie vengano "filmizzate". Un target ausiliario **bolla** (la partizione) e un target
**medium** possono aiutare. E la valutazione va separata per medium: per le serie il baseline è il 63,0% del
collocatore (87,3% con le promozioni); per i film il banco dice 27,7%, ma l'occhio dice ~90/100.

---

## 4. Le domande per te

Rispondi con una **raccomandazione**, non con un menu. Se un'opzione è sbagliata, dillo.

1. **È la strada giusta?** O basta un **SVD della matrice top-20 + Ridge sui metadati** (il pattern già
   in `spazi-trakt.py`)? Qual è il **baseline più semplice** che dobbiamo battere prima di addestrare
   un modello nuovo? Se il guadagno atteso è piccolo, voglio saperlo prima.
2. **Il teacher**: SVD/spettrale della matrice top-20 pesata, oppure distillazione **diretta** della
   matrice (listwise/contrastive), oppure node2vec/LightGCN? Quale teacher è più **robusto al rumore**
   della coda? Come tratto i pesi: grezzi, `log1p`, riga-normalizzati, PPMI/lift, rank? La matrice deve
   essere **simmetrica** (top-20 per riga + trasposta) o **diretta** (i 20 di ogni riga)?
3. **Lo studente**: tengo il **Ridge** (veloce, deterministico, 66k×feature) o passo a un **MLP /
   two-tower / transformer** sulle feature? Come fondo la trama (1024-d) con le feature categoriche
   sparse? Un modello unico o **due teste** (film/serie)? Che dimensione (128/256/512)? Il prodotto ha
   ~107 MB di artefatto in RAM: uno spazio 512-d per 66k titoli è ~136 MB.
4. **La loss**: MSE/coseno verso l'embedding del teacher, oppure **listwise** (KL/InfoNCE) sulle righe
   top-k? Come uso i pesi (positivi pesati, non binari)? Come gestisco il rumore: **weight floor**,
   Huber, label smoothing, edge dropout, **supporto minimo**? Aggiungo target ausiliari (bolla, genere,
   keyword, medium)?
5. **Il cold start**: come si costruisce il test? Io penso a **titoli tenuti fuori** (tutte le feature,
   zero archi) e a **feature dropout** (trama, cast, keyword) per simulare un'uscita nuova. La metrica
   è la **collocazione nella bolla** (confronto col collocatore: ~90/100 film, 63% serie) o il
   **recall@k contro gli archi nascosti**? O entrambe? E il sottoinsieme **senza trama** (46%) va
   valutato a parte.
6. **Le serie**: modello unico o separato? Trasferimento film→serie (pre-train sui film, fine-tune
   sulle serie) o multi-task? Quali feature pesano (networks, stagioni/episodi, status, created_by)?
   Il teacher delle serie è abbastanza denso, o serve un teacher dedicato (Trakt related, che già
   esiste in cache)?
7. **Rumore e leakage**: lo studente condivide keyword, cast, registi, collezioni e trama col teacher.
   Come evito che **rimemorizzi** la ricetta del teacher? Basta il test a titoli tenuti fuori, o serve
   un'**ablazione delle feature**? E quali feature sono **leak** (vote/popularity/budget/revenue/
   recommendations)? La bolla può essere un **target ausiliario** o un **vincolo**?
8. **La valutazione**: qual è **il numero che decide**? Fidelity@k verso il teacher, recall@k sugli
   archi nascosti, collocazione in bolla, o il banco di prodotto (`intero.py`: precisione 5-6,4%,
   lift 63-76×)? E come confronto col `spazi-trakt` attuale e col collocatore, a parità di condizioni?
9. **Top-20 o top-30?** I numeri del §1.4: il 20° peso è al 21% del massimo, il 30° al 14%; i ranghi
   17-25 sono al 78% giusti, i 26-30 al 67%, i 41-48 al 40%. Per il **target** sceglieresti 20, 25 o
   30? Con quale **pavimento**? Per la **camminata** servita, alzeresti a 20/25 o lasceresti 16?
10. **L'ingegneria**: 66k×20 sparso, SVD su CPU (quanto costa?), training su CPU o GPU, artefatto in
    float16, rebuild notturno, versioning con l'impronta dell'artefatto. Il modello deve essere
    **rilanciabile in una notte** e **leggero** nel prodotto; il collocatore deve poter usare
    l'embedding per un titolo nuovo in < 100 ms. C'è un vincolo che mi sfugge?
11. **Cosa sfruttare precisamente per i pesi?** Nella fotografia vedi i pesi veri e il contesto: per
    la matrice N×20, il peso si costruisce dal **peso grezzo**, dal **supporto** (co-spettatori/voti),
    dalla **bolla**, da **collezione/regia/medium/anno**, dalla **trama**, o da un **lift**? Con quale
    formula e quale pavimento? E per il cold start, cosa sostituisce il peso che non c'è?

---

## 5. Cosa non rifare / cosa è già misurato

- **La mappa dei suggerimenti** (`.scratch/suggerimenti/map.md`) ha 15 decisioni misurate: α=0,60,
  top-16, peso dei semi, freddo < 3 titoli, quattro liste, cache, ecc. **Non si riaprono senza una
  misura nuova.**
- **`spazi-trakt.py` esiste già**: teacher MovieLens/Trakt + Ridge su `FX`; `Pc` 64-d, `Pb` 256-d.
  La nuova idea è un **cambio di teacher**, non un greenfield. Il baseline da battere è quello.
- **La trama è già embeddata** (qwen3 0.6b, 1024-d, 54% di copertura) e il **grafo delle keyword**
  esiste (`hierarchical_graph.json`, 6.125 keyword). Non vanno rifatti: vanno **fusi**.
- **Il collocatore** (TF-IDF + centroidi, V1/V3) è il baseline del cold start: ~90/100 film all'occhio,
  63% serie. Il nuovo studente deve **batterlo sulla collocazione**, non solo sul recall del grafo.
- **Il banco di prodotto** (`measure/intero.py`) è il metro finale: precisione 5-6,4% contro 0,08%,
  lift 63-76×, 115-147 ms. Uno spazio denso che migliora il recall ma peggiora la precisione non serve.
- **Le trappole note**: gli id delle bolle non sono stabili fra partizioni; l'artefatto e i parametri
  vanno versionati con l'impronta (`parametri.impronta()`); `bolle.json` è l'artefatto del prodotto,
  non la partizione; la potatura top-16 è **simmetrizzata** (gli archi inversi rientrano);
  `un_passo_fuori` aveva una lunghezza doppia (corretto nei ticket 19-22).
- **I due report allegati** (`report-pulizia.md`, `lettura-vicini.md`) hanno le tabelle complete, i 100
  vicini dei sei titoli e i CSV dei candidati. Il `topk.txt` ha l'output della misura top-k.

---

## 6. Il deliverable che mi aspetto

Una **revisione di 2-4 pagine**, con:

1. **La strada che sceglieresti** (teacher → student → loss → feature → valutazione), e **perché**.
   Se l'idea della distillazione è sbagliata o prematura, dillo e proponi l'alternativa.
2. **Il baseline minimo** e le **3-4 ablation** che valgono la pena (top-20 vs top-30; trama sì/no;
   keyword cluster vs embedding; un modello vs due; Ridge vs MLP).
3. **La metrica che decide** e il **numero da battere** (collocazione in bolla, recall@k, precisione
   del banco), con il protocollo di split (titoli tenuti fuori, feature dropout, serie).
4. **I rischi** (leakage delle feature condivise, coda rumorosa, serie povere, cold start senza trama)
   e come li controlleresti.
5. **Un piano di 1-2 settimane**, con il primo esperimento che dà un segnale in pochi giorni.
6. **La bozza di script** (una sola, eseguibile, **dopo** la revisione — non prima): caricamento della matrice N×20, costruzione del
   target, modello, training loop, validation, salvataggio dell'embedding. In testa al file, un
   blocco di **iperparametri scelti** (dimensione, learning rate, batch, epoche, loss, dropout,
   weight decay, pavimento, negative sampling) con **una riga di motivazione per ognuno**. Meglio un
   baseline semplice che gira e un'ablazione chiara, che un transformer che non si può addestrare.

Se noti che sto ottimizzando la cosa sbagliata, scrivilo. Il grafo è un substrato, non un ranker:
la cosa da migliorare è **la generalizzazione**, non la fedeltà al grafo.

---

## 7. Il digest

`digest.txt` — **79 file, 899 KB, 267,8k token**, generato con `gitingest` il 21/10/2026. Contiene:

- **`services/graph/`** — tutto il modulo: `canon.py`, `bubbles.py`, `collocator.py`, `camminata.py`,
  `motore.py`, `pipeline.py`, `parametri.py`, `uscite.py`, `servizio.py`, i 7 `steps/`, i 5
  `upstream/` (compreso `spazi-trakt.py`), i `measure/` (compresi i `legacy/`), i `fetch/`, README,
  Dockerfile, requirements.
- **`services/keyword-graph/`** — `build_graph.py`, README, requirements.
- **Il prodotto che invoca il grafo** — `src/api/bolle.js`, `src/api/mondi.js`,
  `src/clients/graphClient.js`, `src/pool/index.js`, `src/cache/index.js`,
  `src/profile/dnaEngine.js`, `src/profile/ProfileScorer.js`, `src/stremio/catalogHandler.js`,
  `src/indice/HierarchicalGraph.js`, `src/indice/keywordIds.js`.
- **I test** — `tests/bolleRoute.test.js`, `tests/graphClientPoolIntegration.test.js`,
  `tests/graphRowsInvariant.test.js`, `tests/test_graph_pipeline.py`, `tests/test_micro_graph.py`.

**Non** contiene: gli artefatti (`services/graph/data/`, 422 MB: `spazi-trakt.npz`, il triangolo,
`bolle.json`, i centroidi), i Parquet TMDB, `src/data/hierarchical_graph.json` (~1 MB) e
`src/data/bolle.json` (~3 MB), i report e i `.scratch/`. Sono dati, non codice; stanno sul mate
(`/srv/yaca/services/graph/data/`) e i Parquet TMDB nel volume Docker `yaca_tmdb` (montato
 a `/data/tmdb`), non in `/srv/yaca/.cache/tmdb`. Il digest è autoconsistente per leggere
il codice; se ti serve un artefatto, dimmelo e te lo passo. La **fotografia** (`fotografia-grafo.md`
e `.csv`) è fuori dal digest, come i due report: sono allegati separati, leggibili da soli.

Buon lavoro. Se il piano è sbagliato, è meglio scoprirlo ora che dopo due settimane di training.
