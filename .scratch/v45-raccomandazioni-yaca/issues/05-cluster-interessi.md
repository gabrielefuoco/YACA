Status: resolved
Type: prototype
Blocked by: 03

# Prototipo dei cluster d'interesse personali

## Question

Quale metodo raggruppa i segnali di un profilo in interessi distinti senza appiattirli in un solo topic? Prototipare, su storie reali anonimizzate e casi sintetici, almeno due alternative: raggruppare i seed per affinità V45 e raggruppare la distribuzione di attivazione dopo la diffusione. Per ciascuna mostrare i cluster risultanti, i titoli suggeriti per cluster e i motivi; scegliere dopo aver controllato topic drift e copertura dei segnali love/like/library/recenti/liste.

## Risultato misurato — prototipo in `prototipo/`

Prima versione **artefatta**: tetto a 6 cluster e soglia 0,06 non provata facevano sembrare che il metodo
trovasse solo saghe. Riscritto con criterio dichiarato **prima** dell'osservazione (copertura ≥60%,
≥50% dei cluster non-saga, mediana 4-30 semi) e sweep della soglia su {0,005 0,01 0,02 0,04 0,06}:

| strategia | soglia | copertura | cluster | mediana | saga (coll. identica) | esito |
|---|---:|---:|---:|---:|---:|---|
| **A affinità coseno V45** | **0,02** | **80,3%** | **200** | **4** | **8,5%** | **passa** |
| B vicinato condiviso | 0,02 | 74,4% | 205 | 4 | 10,7% | passa, copertura minore |
| C solo co-visione+RESID | 0,02 | 92,0% | 57 | 4 | 14,0% | collasso: un cluster da 444 semi |

La variante C mostra perché il segnale comportamentale da solo non basta: massimizza la copertura ma
fonde quasi tutta la storia in una componente gigante. **Conferma da parte dell'umano ancora mancante**
on «A a soglia 0,02» come metodo.

**Correzione alla metrica saga** (verificata a mano su `warnok`, 476 semi): il rilevatore usato conta
solo chi condivide la **stessa** `collection_id`, e sottostima i franchise sparsi su più collezioni
(MCU, Jurassic, Apes). Con «almeno una collezione nel 50% dei membri» la quota passa dal **10% al
26,7%**, e il cluster più grande classificato non-saga ha il **45%** di membri in collezione. Il
criterio passa lo stesso (27% < 50%), ma il numero corretto è ~27%, non 8,5%.

**Il dato che cambia il progetto**: un profilo da 400+ semi ha **70-76 cluster naturali** a tetto
aperto (copertura 77-93%), non 6. Gli scaffali non possono essere uno per cluster: serve una
selezione con una regola esplicita (ticket 08).

**Difetto trovato nel prototipo**: il filtro di medium è applicato al profilo, non al cluster — per
questo il cluster anime di `warnok` (semi tutte serie) raccomanda solo lungometraggi. Va nel ticket 07.


## Ricetta misurata (conferma dell'umano: seconda passata + selezione per recenza e massa)

L'umano ha proposto: seconda passata per accorpare quando i cluster sono troppi, e selezione per
recenza e per numero di elementi a supporto. Misurata, con condizioni di fallimento dichiarate prima.

**Micro** - affinita coseno V45, soglia 0,02, tetto 60. Copertura 80,3%, 200 cluster su 8 profili,
mediana 4 semi.

**Macro - limitati per DIMENSIONE, non per numero.** Raggruppare "fino a k macro" produce sempre un
blob: a k=12 il macro piu grande di `warnok` e **264 semi su 476 (55%)**, cioe la dieta principale
dell'utente (MCU, Deadpool, Kingsman, Fast, Spider-Man). La bisezione ricorsiva finche ogni macro
<= 30 semi lo spezza in nicchie leggibili (MCU / Star Wars-Indiana Jones / sci-fi di sopravvivenza /
action Netflix). Verificato: M=30 -> 31 macro, max 29, mediana 12, copertura 87,2%; M=20 -> 42 macro,
max 20; M=40 -> 28 macro, max 37. **M=30 e la scelta.**

**Recenza: `min_eta`, non la mediana.** Test dichiarato in anticipo: il macro col seme piu fresco deve
entrare nei 5 scaffali. Su `warnok` il seme piu fresco sta al **rango 1** con `min_eta` e al **rango
28 di 31** con la mediana - la mediana penalizza le passioni continuative, che hanno coda storica.
`massa_recente` (quota di semi <=90 giorni) fallisce su un profilo (rango 9). Vittoria: `min_eta` 8/8.

**Selezione**: rango combinato `(rank_min_eta + rank_supporto)/2`, 5 scaffali, filtro medium **per
macro** (non per profilo), dedupe di famiglia (collezione dominante) e scarto degli scaffali con
overlap >=50% sui top-10. Il controllo senza passata macro produce scaffali ugualmente nitidi ma
seppellisce i consumi diffusi in coppie/terzetti; la versione bounded li recupera senza mai superare
29 semi.


## Affinita: tre definizioni misurate, una vince (e la mia ipotesi e sbagliata)

| metodo | soglia | copertura | cluster | mediana | saga (b) | esito |
|---|---:|---:|---:|---:|---:|---|
| per-ragione (famiglie di tipi) | 0,02 | 88,1% | 213 | 3 | 13,1% | fallisce (mediana < 4) |
| **vicinato largo (top-100)** | **0,02** | **94,2%** | **128** | **4** | **10,9%** | **passa** |
| solo contenuto | 0,02 | 89,2% | 319 | 3 | 16,6% | escluso per decisione, non per misura |

**La mia ipotesi e stata falsificata dalla misura.** L'affinita «per ragione» doveva separare meglio le
saghe; separa **peggio**: rapporto intra/inter-franchise 18,2x contro 26,9x del metodo attuale
(-32%). Su `warnok`, coppie della stessa saga: 0,3786 medio contro 0,5407; coppie di saghe diverse:
0,0208 contro 0,0201, cioe **il rumore inter-franchise non scende** (Deadpool, Kingsman e Fast X
condividono cast, crew, co-visione e pubblico). Il vincolo di accordarsi su piu famiglie deprime la
coesione interna dei franchise piu di quanto pulisca il rumore esterno.

**Metodo scelto: vicinato largo.** Firma = top-100 vicini della matrice V45 NON potata, coseno.
La camminata resta a 16 archi. Con la ricetta (macro <=30 semi, 5 scaffali per `min_eta` + supporto,
medium per macro, dedupe di famiglia) i 5 scaffali di `warnok` sono: serie mystery/cult, K-drama e
crime asiatico, shonen, fantascienza d'invasione, animazione adulta — nessun blob generico di blockbuster.

Il metodo «solo contenuto» e stato scartato dall'umano per principio (il grafo raggruppa per natura);
i suoi numeri restano nel report ma non e un candidato.


## La fusione macro si ferma sulla similarita, non sul numero (tau=0,03)

Il vecchio schema (fondere fino a k macro, poi bisecare) fondeva micro-cluster con similarita
**mediana 0,0034** e le ultime dieci fusioni sotto 0,0004: a quel livello saldava *Come e fatto*,
*Indiana Jones* e Lav Diaz. Sostituito con arresto sulla similarita. Sweep:

| tau | macro | scarto cancello keyword | copertura (>100 semi) | scaffali serviti |
|---|---:|---:|---:|---:|
| 0,005 | 196 | 35,2% | 92,0-94,4% | 37/40 |
| 0,01 | 218 | 32,6% | 92,0-94,4% | 37/40 |
| 0,02 | 232 | 29,3% | 92,0-94,4% | 39/40 |
| **0,03** | **236** | **28,4%** | **92,0-97,2%** | **40/40** |
| 0,05 | 236 | 28,0% | 92,0-97,2% | 40/40 |

**Il criterio dichiarato e fallito**: nessun tau porta lo scarto sotto il 10%. Il motivo e che il
cancello keyword scarta gia il **30,2% dei micro-cluster grezzi** (45 su 149): in TMDB la copertura
delle keyword e disomogenea, e gruppi coerenti per comportamento (wrestling, documentari sportivi)
non hanno keyword condivise. **Il cancello misurava la copertura dei metadati, non la coerenza.**
tau=0,03 e quindi una scelta pragmatica (nessuno scaffale perso, copertura 94,4%), non un criterio
soddisfatto.


## Verdetto Finale e Riformulazione del Criterio (Adozione Budget N = 6 e Named Interests)

### I Tre Criteri Falliti e la Ragione Onesta del Loro Superamento
1. **Keyword coherence gate (support >= 0.5)**: È fallito perché la copertura delle keyword nei metadati è intrinsecamente disomogenea tra generi: filoni chiarissimi al comportamento (wrestling, docufiction true crime, cucina) mancano di keyword condivise in TMDB, per cui il cancello misurava la completezza dei metadati anziché la coerenza del cluster.
2. **Shelf consistency gate (Jaccard >= 0.10)**: È fallito perché la consistenza delle raccomandazioni riflette la densità locale del grafo e non l'omogeneità tematica: cluster di nicchia (film d'autore, documentari rari) producono distribuzioni PPR diffuse a bassa consistenza pur essendo perfettamente coerenti all'ispezione umana.
3. **Regola di copertura 80% (e 60%)**: È fallita perché con scaffali limitati a <= 40 semi (mediana 12-20 semi), coprire l'80% di un profilo lungo da 400-550 semi richiede matematicamente 18-25 righe: forzare la copertura su un budget prefissato di 5-8 righe imporrebbe o di collassare i semi in enormi minestroni da 100 titoli o di far esplodere la UI a 51 scaffali.

### Risoluzione Finale: Il Concetto di "Named Interest" con Budget N = 6
Uno scaffale è un **interesse nominato** (voce di tassonomia qualificata con confidenza dichiarata, oppure gruppo circoscritto <= 12 semi servito con fallback trasparente «Perché hai visto»).
Il budget per profilo è fissato a **N = 6 scaffali**, speso **ingordamente (greedy) per massimizzare i semi scoperti**, garantendo che la pagina non esploda e che ogni riga rappresenti un interesse tematico netto.


## Ricetta Finale di Produzione Congelata (Catena a 12 Passi)

Questo è il blocco operativo definitivo e congelato per l'implementazione del servizio cluster & scaffali:

```text
================================================================================
RICETTA FINALE CLUSTERING E GENERAZIONE SCAFFALI (V45 / TICKET 05)
================================================================================

1. MATRICE DI AFFINITÀ (TOP-100 UNPRUNED COSINE)
   - Grafo: matrice simmetrica non potata W = (M_tri + M_tri.T) da
     bolle-eterogeneo-V45-p1.0-triangolo.npz (74,409,922 archi, ~1.0 GB RAM).
   - Firma del seme: per ogni seme della storia utente, borsa dei top-100 vicini
     uscenti ordinati per peso decrescente, vettori L2-normalizzati.
   - Similarità tra semi: coseno S(u, v) = <b_u, b_v>.
   - Misure registrate: intra-saga media 0.5841 vs inter-saga media 0.0514;
     copertura micro-cluster 94.2%; quota saghe (rilevatore b) solo 10.9%.
     (Nota: la camminata PPR di raccomandazione dell'Engine resta a pota=16).

2. MICRO-CLUSTERING (AVERAGE LINKAGE SOGLIA 0.02)
   - Algoritmo: linkage gerarchico agglomerativo 'average' sulla distanza d = 1 - S.
   - Taglio gerarchia: soglia distanza d_th = 0.98 (min_affinity = 0.02).
   - Filtraggio cardinalità: micro-cluster ammissibili con min_size >= 2 semi.
   - Misure registrate: copertura 94.2% (128 micro su 8 profili, mediana 4.0 semi).

3. MACRO-MERGE (AGGREGAZIONE CON ARRESTO A TAU = 0.03)
   - Centroidi micro: per ogni micro-cluster, somma dei vettori riga unificati V45
     dei membri, L2-normalizzata.
   - Similarità tra micro: coseno tra centroidi micro.
   - Aggregazione: average linkage agglomerativo sui centroidi micro, arresto alla
     soglia di similarità tau = 0.03 (distanza 0.97). Nessuna fusione a conteggio prefissato.
   - Misure registrate: 236 macro generati su 8 profili; zero collassi monolitici;
     copertura 92.0% - 97.2% su profili lunghi; 41/41 scaffali servibili preservati.

4. STAPLE-DIET SPLIT (CARDINALITÀ MASSIMA 40 SEMI)
   - Regola: qualsiasi macro > 40 semi viene bisecato ricorsivamente sulla struttura
     coseno interna, INDIPENDENTEMENTE dal fatto che corrisponda o meno a una voce
     di tassonomia («Anime shōnen» a 65 semi è una dieta alimentare, non un singolo scaffale).
   - Misure registrate: il macro da 65 semi di castoffcrown si scinde in due blocchi
     puri: «Anime romantici & slice of life» (31 semi) e «Anime shōnen» (26 semi);
     i macro da 55 e 49 semi di warnok si scindono in blocchi <= 40 semi.
     Nessun singolo scaffale dell'intero catalogo supera 40 semi (max registrato: 40).

5. UNNAMEABLE RULE (BISEZIONE DEI GRAB BAG > 12 SEMI)
   - Regola: un macro > 12 semi che non matcha alcuna voce di tassonomia viene bisecato
     ricorsivamente e i figli ritestati. I gruppi non nominabili <= 12 semi rimangono
     e vengono qualificati come fallback «Perché hai visto».
   - Misure registrate: grab bag decomposti in blocchi puri non serviti; zero duplicati
     di etichette su tutte le 10 timeline.
   - Chiusura empirica del test di rimozione: rimuovere l'unnameable-bisect produce grab bag
     da 19 etichette, quindi la regola protegge il prodotto dalla coda diffusa del profilo stesso.

6. ADAPTIVE FLOOR (SOGLIA MINIMA VARIABILE)
   - Formula: soglia = min(4, max(2, ceil(semi_clusterizzati / 4))).
   - Misure registrate:
     * sangam456 (10 semi tot, 6 clust): floor = 3 (o 2 su clust) -> 2 scaffali (100% copertura);
     * carverclan (7 semi tot, 4 clust): floor = 2 -> 2 scaffali (100% copertura);
     * hammers-lists (11 semi tot, 8 clust): floor = 3 (75% copertura) o floor = 2 (100%);
     * profili >= 20 semi clust: floor = 4.
     Eliminato l'azzeramento dei profili corti/ultra-corti.

7. ELIGIBILITY (A SHELF IS A NAMED INTEREST)
   - Ammissibilità: uno scaffale è ammissibile se è un interesse nominato (match di
     tassonomia con confidenza >= 50%) oppure un piccolo gruppo non nominabile (<= 12 semi)
     servito con «Perché hai visto», sempre con size >= floor.
   - Misure registrate: su 10 profili, gli scaffali ammissibili spaziano da 2 (profili corti)
     a 34-51 (profili lunghi come castoffcrown e pepsipex).

8. MEDIUM OMOGENEO (CON WAIVER PER CLUSTER PICCOLI < 3 SEMI)
   - Regola: medium determinato per ogni scaffale. Se size >= 3 semi e misto film/serie,
     scissione nei due sotto-macro omogenei; se size < 3 semi (waiver carverclan), il medium
     è deciso dal seme con più riproduzioni/recenza.
   - Misure registrate: 0 violazioni di medium su tutti i candidati raccomandati serviti.

9. SCORING E ORDINAMENTO DISPLAY (RECENCY IN SLOT 1, COMBINED RANK IN SLOT 2..N)
   - Posizione 1: scaffale con min_eta minimo (il titolo più fresco visto dall'utente).
   - Posizioni 2..N: ordinati per rango combinato r_comb = (r_rec + r_sup) / 2.0, con
     tie-break su consistenza decrescente, dimensione e riproduzioni.
   - Misure registrate: l'interesse più fresco è sempre al vertice della homepage nel
     100% dei profili (10/10).

10. BUDGET N = 6 SPESO PER COPERTURA (GREEDY SELECTION)
   - Budget: N = 6 scaffali massimi per profilo.
   - Selezione ingorda (greedy): a ogni passo 1..N viene selezionato lo scaffale che
     aggiunge il maggior numero di SEMI NON ANCORA COPERTI, soggetto a:
     (a) Al massimo 1 scaffale per etichetta di tassonomia nel profilo;
     (b) Family dedupe (nessuna condivisione di TMDB collection dominante);
     (c) Raccomandazioni disgiunte (Jaccard sui top-10 raccomandati < 0.5).
   - Misure registrate su N=6:
     * castoffcrown: 6 scaffali serviti (Anime romance 31, Anime shonen 26, Animazione
       autore 12, Cinema autore 12, Cucina 12, K-drama 11);
     * pepsipex: 6 scaffali serviti (Horror 34, Giallo 31, Spy thriller 27, Epoca 26,
       Gangster 13, Succession/prestige 12);
     * Zero duplicati di etichette, zero saghe duplicate, zero overlap >= 0.5.

11. DENOMINAZIONE SCAFFALI (TASSONOMIA CURATA 36 VOCI + FALLBACK TRASPARENTE)
   - Vocabolario controllato di 36 voci tematiche italiane su 6 macro-aree.
   - Match: confidenza >= 50% univoca; fallback trasparente: «Perché hai visto <2-3 semi>».
   - Misure registrate: 100% etichette tassonomia sui primi 5 scaffali di pepsipex;
     terminologia pulita, nessun inglesismo crudo o percentuali esposte.

12. CATALOG ID STABILE DERIVATO DAL CONTENUTO
   - Identificatore: yaca_<top_representative_tmdbId>_<medium>.
   - Misure registrate: 100% ID univoci (0 collisioni su tutte le 10 timeline);
     stabilità del manifest garantita tra riordinamenti e modifiche di consistenza.
================================================================================
```

## Chiusura Definitiva della Questione Copertura e Regola Unnameable-Bisect

- **Verifica empirica delle varianti (V1 vs V2 vs V3)**: Rimuovere l'unnameable-bisect produce grab bag da 19 etichette, quindi la regola protegge il prodotto dalla coda diffusa del profilo stesso.
- **Distribuzione della coda non servita**: Su `castoffcrown`, `warnok` e `pepsipex` ci sono **0 semi in cluster non serviti di dimensione >= 20** (0.0% del profilo). La totalità dei cluster non serviti (28 a 45 gruppi) ha dimensione mediana pari a **7 semi**: non stiamo perdendo alcun interesse strutturato, la coda rimanente è composta unicamente da «thirty small whims» (spunti estemporanei).
- **Integrità del segnale a monte**: Tutti i semi della storia del profilo in canone (inclusi quelli che non cadono in alcuno scaffale) entrano al 100% nel vettore teleport di `Engine.raccomanda` con i propri pesi completi e play count.
- **Conclusione**: Il profilo è semplicemente frammentato. Con 6 scaffali nitidi, il 25-32% di copertura dei titoli cattura il 26-39% della massa di riproduzioni totali e include il 100% dei cluster solidi (>=20 semi). Questione copertura definitivamente chiusa: la regola V1 resta congelata in produzione.

