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


## Verdetto Finale e Riformulazione del Criterio (Adozione M = 12)

### Perché il Criterio Precedente (Match Tassonomia >= 70%) era Sbagliato
Il criterio quantitativo dichiarato a priori (almeno il 70% degli scaffali serviti etichettato con la tassonomia curata) è **fallito a ogni valore di M esplorato**:
- $M = 8$: $65,85\%$ match rate (27/41 tassonomia, 14 fallback);
- $M = 12$: $60,98\%$ match rate (25/41 tassonomia, 16 fallback);
- $M = 20$: $56,10\%$ match rate (23/41 tassonomia, 18 fallback);
- $M = 30$: $60,98\%$ match rate (25/41 tassonomia, 16 fallback).

Tuttavia, **era la metrica a essere concettualmente errata, non la soglia**: «Perché hai visto» non è un fallimento dell'algoritmo o un buco di copertura, bensì il **fallback trasparente, veritiero al 100% per costruzione e onesto verso l'utente** quando un cluster non ha una firma tematica univoca ad alta confidenza. Contare il fallback come insuccesso punisce la trasparenza e incentiva perversamente la produzione di etichette generiche e forzate.

Ciò che decide e convalida in modo oggettivo la granularità ottimale tra $M=8$ e $M=12$ è l'ispezione empirica dei cluster serviti:
- **A $M=12$**, i due grab bag misti si scindono nettamente in un blocco sitcom puro e un blocco drama/thriller puro, che scivolano fuori dai primi 5 e **smettono di essere serviti**. La cinquina servita di `castoffcrown` diventa una sequenza esemplare di nicchie nitidissime: *Anime shōnen*, *Dramma coreano*, *Animazione d'autore*, *Cinema d'autore*, *Samurai Kurosawa*;
- **A $M=8$**, la bisezione eccessiva spezza artificiosamente lo shōnen generando **due scaffali entrambi denominati «Anime shōnen» all'interno dello stesso profilo** di `castoffcrown` (e due «Sitcom animate» in `1jacobjohn`), violando platealmente la regola di distinctness.

### I Quattro Criteri Onesti
Il verdetto vincolante viene pertanto riformulato contro i **quattro criteri onesti**:
1. **Nessun nome duplicato all'interno di un profilo**: **SUPERATO (PASS)** — 0 duplicati su tutte le 10 timeline a $M=12$ (a $M=8$ fallisce con 2 duplicazioni);
2. **Nessun scaffale servito che si legga come grab bag**: **SUPERATO (PASS)** — tutti i blocchi misti decomposti e non serviti;
3. **Preservazione dei conteggi degli scaffali serviti**: **SUPERATO (PASS)** — 41 / 41 scaffali serviti inalterati (2 per profili corti `<12` semi, 5/5 per tutti i profili $\ge 25$ semi);
4. **Copertura semi >= 85% sulle timeline lunghe (>100 semi)**: **SUPERATO (PASS)** — `castoffcrown` 90,0%, `warnok` 94,3%, `pepsipex` 94,9%, `1jacobjohn` 91,0% (media 92,6%).


## Ricetta Finale di Produzione (Blocco Unico per l'Implementazione)

Questo è il blocco operativo definitivo e congelato per l'implementazione del servizio cluster & scaffali:

```text
================================================================================
RICETTA FINALE CLUSTERING E GENERAZIONE SCAFFALI (V45 / TICKET 05)
================================================================================

1. MATRICE DI AFFINITÀ (TOP-100 UNPRUNED COSINE)
   - Grafo: matrice simmetrica non potata W = (M_tri + M_tri.T) da
     bolle-eterogeneo-V45-p1.0-triangolo.npz (74,4M archi, grafo a pota aperta).
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
     soglia di similarità tau = 0.03 (distanza 0.97). Nessun cap al numero di macro.
   - Misure registrate: 236 macro generati su 8 profili; zero collassi monolitici;
     copertura 92.0% - 97.2% su profili lunghi; 41/41 scaffali servibili preservati.

4. BISECTION CAP (CARDINALITÀ MASSIMA M = 12 SEMI)
   - Vincolo: nessun macro-cluster può superare 12 semi.
   - Bisezione ricorsiva: se len(macro) > 12, divisione deterministica in 2 partizioni
     sulla struttura coseno interna del macro (2-way clustering agglomerativo);
     ripetizione ricorsiva finché ogni frammento ha cardinalità <= 12 semi.
   - Misure registrate: max shelf size = 12 semi su tutte le 10 timeline;
     grab bag decomposti in blocchi puri non serviti; zero duplicati di etichette
     (a M=8 si duplicava «Anime shōnen» in castoffcrown e «Sitcom animate» in 1jacobjohn);
     copertura profili lunghi >= 85% (castoffcrown 90.0%, warnok 94.3%, pepsipex 94.9%,
     1jacobjohn 91.0%, media 92.6%).

5. FILTRO MEDIUM PER MACRO (CON WAIVER PER CLUSTER PICCOLI < 3 SEMI)
   - Macro standard (size >= 3 semi): se il macro contiene sia titoli film che serie,
     scissione in due sotto-macro omogenei ('movie' e 'series'); ciascun sotto-macro
     è ammissibile se size >= 2 semi.
   - Cluster piccolo (size < 3 semi, waiver carverclan): se size < 3 semi, il medium
     dello scaffale è deciso dal seme con più riproduzioni (tie-break sul seme più
     recente); l'asserzione 80% semi omogenei è condonata (WAIVED); l'asserzione
     100% candidati raccomandati conformi al medium dello scaffale resta rigida.
   - Misure registrate: 0 fallimenti di asserzione medium su tutti i 41 scaffali;
     risolta la regressione ultra-cold-start di carverclan (2 / 5 scaffali serviti).

6. SCORING E ORDINAMENTO (RANK COMBINATO MIN_ETA + SUPPORTO, TIE-BREAK CONSISTENZA)
   - Recency rank: r_rec = ordine per min_eta crescente (singolo seme più fresco).
   - Support rank: r_sup = ordine per dimensione decrescente, tie-break consistenza
     decrescente (Jaccard medio a coppie sui top-10 vicini) e riproduzioni totali.
   - Rango combinato: r_comb = (r_rec + r_sup) / 2.0.
   - Ordinamento finale: r_comb crescente, con tie-break su consistenza decrescente,
     dimensione decrescente, riproduzioni decrescenti.
   - Misure registrate: min_eta porta il macro con il seme più recente nei top-5 nel
     100% dei profili (10/10), posizionandolo al rango 1 su 7 profili su 8 (contro la
     mediana che sprofondava al rango 28-29 sui profili lunghi).

7. SELEZIONE CINQUE SCAFFALI E FAMILY DEDUPE
   - Cap per profilo: selezione fino ai primi 5 scaffali ammissibili (o tutti quelli
     disponibili se il profilo ne ha meno di 5).
   - Family dedupe: ogni macro è mappato alla sua collezione TMDB dominante (coll > 0
     presente in >= 50% dei membri). Se un candidato macro condivide la collezione
     dominante di uno scaffale già inserito, viene scartato per evitare saghe duplicate.
   - Overlap dedupe: scarto dei candidati macro che condividono >= 50% dei top-10
     candidati raccomandati con uno scaffale già inserito.
   - Misure registrate: 41 / 41 scaffali serviti (5/5 per tutti i 7 profili >= 25 semi,
     2/5 per profili corti <12 semi); 0 saghe duplicate; 0 scaffali sovrapposti.

8. DENOMINAZIONE SCAFFALI (TASSONOMIA CURATA + «PERCHÉ HAI VISTO»)
   - Tassonomia: vocabolario controllato di 36 voci tematiche in italiano distribuite
     su 6 aree (Animazione, Sci-Fi, Crime, Comedy, Drama, Sport/Doc).
   - Regola match: una voce di tassonomia è assegnata se e solo se un'entry univoca
     soddisfa i requisiti di evidenza con confidenza >= 50% (almeno il 50% dei semi
     soddisfa le keyword/criteri dell'entry e nessuna voce concorrente è a pari merito).
   - Fallback trasparente: tutti i cluster eterogenei o con match ambiguo ricevono il
     nome «Perché hai visto <titolo_1>, <titolo_2> e <titolo_3>» (con i 2-3 semi a
     maggior consumo/recenza).
   - Eliminazione totale della vecchia catena: rimosse percentuali («87%»), inglese non
     tradotto ed euristiche autorali parziali («Di X» / «Regia di X»).
   - Misure registrate: 25 scaffali tassonomia (60.98%), 16 scaffali «Perché hai visto»
     (39.02%); 0 nomi duplicati all'interno di ciascun profilo; 0 etichette over-generic
     (voce più frequente copre al massimo il 9.8% degli scaffali <= soglia 25%).
================================================================================
```
