# Il motore di raccomandazione

Questo documento descrive come YACA raccomanda, quali numeri sono stati misurati e quali sono ancora
scelte. È scritto per chi deve giudicare le decisioni, non per chi deve avviare il servizio: per quello
c'è [RECOMMENDATION_GRAPH.md](RECOMMENDATION_GRAPH.md).

## 1. Il vincolo di partenza: nessun bacino di utenti

Il collaborative filtering classico — "utenti simili a te hanno apprezzato" — richiede molti utenti che
votino gli stessi titoli. YACA gira su una istanza self-hosted con **un** utente. Non esiste una matrice
utente × item da fattorizzare, non esiste un vicinato di utenti, e non esiste un ground truth di
gradimenti su cui addestrare un ranker supervisionato.

Le due sole fonti disponibili sono:

1. **Il comportamento dell'utente** — cosa ha visto, rivisto, amato, apprezzato, messo in lista.
2. **Il contenuto** — registi, cast, produzione, keyword, trama, collezioni, e la co-visione fra titoli
   nelle liste pubbliche.

Il motore quindi non impara una funzione da esempi etichettati: costruisce una struttura dal contenuto e
propaga il segnale dell'utente su quella struttura. È un approccio di information retrieval, non di
apprendimento supervisionato, e il documento lo dice perché la differenza conta quando si valuta.

## 2. Il grafo

Il grafo servito è eterogeneo: **76.497 nodi** e **14 tipi di legame**, ognuno con un peso proprio.

| Tipo | Peso | Da dove viene il legame |
|---|---:|---|
| KWSEM | 1,4 | semantica delle keyword |
| RESID | 1,2 | matrici residue |
| DIR | 1,0 | regia |
| LIST | 1,0 | co-occorrenza nelle liste |
| RRFST | 1,0 | studente denso (vedi sotto) |
| COVISION | 0,8 | titoli visti insieme |
| COLL | 0,5 | collezioni |
| CAST | 0,4 | cast |
| PROD | 0,3 | produzione |
| CONTESTI, TRAMA, TRIBU, CREWPROP, LISTSEM | 0,15–0,2 | contesti d'uso, trama, tribù, crew propagation, semantica delle liste |

I canali si fondono con **reciprocal rank fusion (k = 15)**; la fusione a rango, e non a punteggio, è
ciò che rende confrontabili canali che non producono punteggi sulla stessa scala. Da ogni titolo si
tengono i **top 100 vicini**.

### Lo studente

`RRFST` non è un canale simbolico: è una **matrice densa 76.497 × 2.048**, addestrata sul grafo stesso e
riusata così com'è. Il suo SHA-256 è bloccato in `recipes/V45.lock.json`, insieme ai pesi e ai parametri
della ricetta.

### Riproducibilità

La build è congelata e riproducibile: le matrici sorgente (CAST, DIR, PROD) sono congelate, la ricetta e
le impronte stanno nel repository, e il grafo servito si **ricostruisce** da fonti ricostruibili invece
di essere dato per buono. Il protocollo di replay è in [V45.md](../services/graph/V45.md); il lock è
[`recipes/V45.lock.json`](../services/graph/recipes/V45.lock.json).

### La potatura è un vincolo, non un'ottimizzazione tardiva

Il grafo completo conta **50.660.592 archi float32**. Servirlo non potato tocca i **627 MiB** di picco
dentro un container da **512 MiB**: è un OOM, non un numero teorico. Ogni titolo tiene quindi i **16
archi più forti**.

La scelta non è un compromesso al ribasso, ed è misurata:

- tiene il **12%** degli archi e costa **8,7× meno**;
- la massa che resta sui compagni di saga **sale dal 26,6% al 47,8%**, contro lo **0,011%** di un titolo
  qualunque: la potatura **rafforza** i legami forti invece di disperderli;
- sotto il top-16 un arco non porta massa misurabile, quindi la soglia decide *se un legame esiste* per
  la camminata.

Il banco che misura questo compromesso è [`runtime/bench.py`](../services/graph/runtime/bench.py): confronta le
configurazioni senza potatura e a 64, 32, 16, misurando picco RSS (`psutil`, `tracemalloc`), tempo di
caricamento e latenza p50/p95 su 20 richieste da 30 semi, precedute da due di warmup.

## 3. I segnali

I semi della camminata sono i titoli della storia utente, pesati per tipo di segnale:

| Segnale | Peso | Perché |
|---|---:|---|
| loved | 3,0 | è l'utente che **dice** una cosa, non che la fa |
| liked | 2,0 | idem, con meno enfasi |
| library | 1,0 | una lista di desideri non è un gusto |
| watched | 1,0 | il segnale più debole, ma il più abbondante |

Il motore precedente conosceva **un solo tipo** — "visto", moltiplicato per le ri-visioni — e scartava i
segnali espliciti, che sono i più forti.

Regole aggiuntive, ciascuna con una ragione:

- **Serie**: `peso = 1 + 2 × frazione di episodi visti`, quindi nell'intervallo [1, 3]. Una serie da 100
  episodi vale due terzi di un film, non cento visioni. Su storia corta, con il peso per ri-visioni, il
  titolo più pesante prendeva il 20,8% del seme; con la frazione, il 5,2%.
- **Film**: il peso per ri-visioni è limitato a 3,0. Senza tetto, a un utente di soli film le serie
  prendevano il **67%** del peso del seme (fino all'85%); con la specifica, il **31%**. La misura che
  sostiene il tetto è l'**equilibrio dei media**, non il lift.
- **Watchlist**: i titoli in lista entrano nei visti e vengono esclusi dall'output, salvo ripescaggio
  controllato (massimo 2 per riga, solo se nel top 15% per rilevanza indotta e con voto medio ≥ 7,0).

## 4. La diffusione

La raccomandazione è un **PageRank personalizzato** (personalized PageRank) con riavvio sui semi.

- **α = 0,60**: quanta luce torna ai titoli di partenza a ogni giro. Vale 0,60 perché è misurato: da 0,60
  a 0,90 il guadagno sale di +8,5% (dentro il rumore) mentre la luce sprecata sui già visti va dal 65% al
  91%, e il rango dei mondi nascosti ha il massimo proprio a 0,60. Il valore messo a intuito era 0,15:
  rendeva **20,7× contro 29,3×**.
- **20 iterazioni**, con **early stopping** a tolleranza L1 di 1e-5: il top 60 è identico al 100% a
  20 iterazioni fisse sui 10 profili di riferimento, usando in media **10,4** iterazioni.
- **Multi-seed batched**: la diffusione è calcolata per più vettori di riavvio insieme
  (`camminata.ppr_multi`), perché le liste richieste condividono la stessa matrice di transizione.

## 5. Gli iperparametri, con lo stato dichiarato

`parametri.py` è la fonte unica dei numeri del meccanismo, e ogni voce dichiara **cosa è**:

- **MISURATO** — c'è un arbitro che l'ha deciso; non si tocca senza rifare la misura.
- **DICHIARATO** — scelta di prodotto; si cambia con una decisione, non con un test.
- **INVENTATO** — messo a mano senza misura: è la prima cosa da rivedere.

Lo stato non è decorazione: rende visibile dove il sistema è sostenuto da un esperimento e dove da una
persona. È la parte del motore di cui vado più fiero, perché il modo in cui si sbaglia un sistema di
questo tipo non è scegliere male un numero, è **non sapere più quale numero era stato scelto e perché**.

## 6. Esperimenti finiti in «no»

Le decisioni più utili sono quelle che hanno eliminato un'idea plausibile. Sono documentate perché
l'intuito non le riporti dentro:

| Idea | Esito misurato |
|---|---|
| La recenza come peso (`recenza × ri-visioni`) | identico alle visioni da sole: **18,12× contro 18,17×** |
| Decadimento di rango (1/i, 1/log) | **peggio** di non fare niente: 15,9× e 11,2× contro 18,2× |
| Boost sui recenti (+10/+20/+50% sugli ultimi 5-10) | **vuoto**: 17,85 → 17,9-18,1 |
| «Quanti mondi si accendono» come segnale di gusto | **assente per misura**: una storia casuale della stessa lunghezza ne accende **più** di una vera, 0,9× a ogni soglia — misura la lunghezza della storia, non il gusto |
| «Titoli presenti in più cataloghi» come seme | **vuoto per progetto**: 0 titoli su 220 in più di un catalogo (famiglia Registi), sovrapposizione mediana 0 — la disgiunzione è curatela, non caso |

La recenza, quando serve, conta come **selezione** e non come peso: i soli ultimi 15 titoli fanno 47,5×,
perché buttano via tutto il resto — è un'altra cosa, e va tenuta distinta.

## 7. Come si valuta, e cosa non si misura

Il banco storico misurava un lift su insiemi di utenti di riferimento (120 utenti per la misura di α,
253 per l'equilibrio dei media). Le cifre citate in questo documento vengono da lì e sono riportate in
`parametri.py` accanto al parametro che hanno deciso. Il banco è archiviato in
`_archivio-v10/measure/`: è la storia delle misure, non codice di produzione.

**Cosa non c'è.** Non esistono metriche di qualità offline del tipo NDCG o recall@k calcolate su un
insieme di test etichettato, e non esiste un A/B in produzione: l'utente è uno, quindi non c'è un
controllo con cui confrontarsi. Le misure disponibili sono due, e sono dichiarate per quello che sono:
gli **esperimenti di ablazione** (un parametro alla volta, con l'esito in `parametri.py`) e le **misure
di servizio** (latenza e memoria). Chi legge deve sapere che il gradimento non è misurato: il motore è
tarato su esperimenti di struttura, non su un giudizio di qualità misurato.

## 8. Il servizio

| Endpoint | Contratto | Cosa restituisce |
|---|---|---|
| `POST /raccomanda` | v1 | liste spiegate (`il_tuo_mondo`, `un_passo_fuori`); mantenuto per retrocompatibilità |
| `POST /scaffali` | v2 | scaffali a due livelli: etichette tassonomiche in testa, fallback «Perché hai visto» in coda |

Lo scaffale v2 applica la separazione rigorosa del medium per riga (policy P2), ammissione permissiva
delle controparti a τ = 2,5% e un numero di candidati serviti compreso fra 20 e 60 per riga.

Misure di servizio (engine V45 standalone): `POST /raccomanda` **p50 1,0 ms / p95 17,4 ms**;
`POST /scaffali` **p50 1,525 s / p95 1,698 s** con obiettivo ≤ 3,0 s per 8 scaffali. Picco RSS su 30
richieste sequenziali: **323,41 MiB** (a riposo 299,1 MiB), con **188,59 MiB** di margine nel container
da 512 MiB.

## 9. Dove guardare

- [`parametri.py`](../services/graph/parametri.py) — la tabella degli iperparametri con stato ed evidenza
- [`camminata.py`](../services/graph/camminata.py) — diffusione, PageRank personalizzato, multi-seed
- [`runtime/engine.py`](../services/graph/runtime/engine.py) — il motore sparse servito
- [`runtime/bench.py`](../services/graph/runtime/bench.py) — il banco memoria/latenza delle configurazioni di potatura
- [`build/`](../services/graph/build) — la pipeline offline: co-visione, keyword semantiche, crew propagation, mixer
- [V45.md](../services/graph/V45.md) e [`recipes/V45.lock.json`](../services/graph/recipes/V45.lock.json) — ricetta congelata e impronte
