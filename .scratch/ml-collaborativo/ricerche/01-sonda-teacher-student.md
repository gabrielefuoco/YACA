# 01 — Sonda teacher/student: il piano regge? (campione, 08/10/2026)

**Mappa**: [../map.md](../map.md) · **Banco**: `probe-teacher-student.py`, `probe2-teacher.py` (campione: 3.000 film con ≥20 voti MovieLens, 32M voti, 200.948 utenti)

---

## A) Il teacher è informativo e diverso dalle keyword? **Sì, e molto**

Similarità collaborativa item-item dai co-voti, due normalizzazioni a confronto.

| | `cos` (cosine sui co-voti) | `npmi` (corretta per popolarità) |
|---|---|---|
| *Il padrino* → | Matrix (0.57), Fight Club (0.57), Blade Runner (0.51) | (resta sul canone maschile, ma più specifico) |
| *Fight Club* → | Matrix (0.70), Pulp Fiction (0.63), Inception (0.60) | Matrix (0.42), **Donnie Darko (0.40), Requiem for a Dream (0.38)**, Truman Show (0.34) |
| *Interstellar* → | Inception (0.68), Guardiani della Galassia (0.59) | Inception (0.58), Guardiani (0.55), **Lei (0.49)**, Blade Runner 2049 (0.47) |
| *Forrest Gump* → | Pulp Fiction (0.67), Matrix (0.61), Il re leone (0.58) | Speed (0.32), Pretty Woman (0.31), Ghost (0.29) |

**L'indipendenza dalle keyword è la notizia**: `Spearman(cos, keyword) = +0,104`, `Spearman(npmi, keyword) = +0,044`, sovrapposizione dei top-10 **0,3/10**. Sono due spazi quasi ortogonali: le keyword descrivono il *soggetto*, i co-voti descrivono il *pubblico*. Esattamente ciò che manca al nostro grafo.

**Ma `cos` è popolarità travestita**: i vicini di qualunque film famoso sono Matrix, Fight Club, Forrest Gump — perché sono i film che tutti hanno visto. `npmi` corregge: da *Fight Club* escono Requiem for a Dream, Donnie Darko, Truman Show (adiacenza culturale vera). `Spearman(cos, npmi) = 0,794`: stessa informazione di fondo, ma `npmi` toglie l'alone di fama.

## B) Lo student è imparabile dai metadati? **Sì, ma la feature dominante è la popolarità**

Predire «sono vicini nel teacher?» dalle sole feature di metadati (keyword pesate IDF, generi, distanza d'anno, distanza di voti, durata, lingua), split **per item** e non per coppia:

| modello | teacher `cos` | teacher `npmi` |
|---|---|---|
| solo keyword | 0,884 | 0,670 |
| **solo POPOLARITÀ** (controllo) | **0,933** | **0,772** |
| keyword + popolarità | 0,971 | 0,810 |
| TUTTO (10 feature) | 0,993 | **0,920** |

Lettura: **il piano è fattibile** (AUC 0,92 con il teacher buono), ma il modello impara soprattutto *quali film sono famosi* (0,772 da solo), non *quali film si somigliano*. Le keyword contribuiscono (0,670 da sole) e il resto delle feature porta il salto finale. Il rischio concreto: costruire un grafo che sa di popolare — esattamente il difetto che la campagna QC ha già trovato nei cataloghi hero ("popolari del momento travestiti da scelta personale").

## C) Il dato strutturale che riorienta il piano

| profilo reale | film in cronologia | serie in cronologia |
|---|---|---|
| tutti e 5 | **5** ciascuno | ~16 ciascuno |

MovieLens copre **0 serie**. Quindi:

- il teacher **non ha nulla da dire sulle serie**, che sono l'80% di ciò che i tuoi profili guardano;
- il valore per le serie dipende **interamente** dallo student (metadati → spazio collaborativo) — cioè da un assunto che questa sonda *non* ha ancora testato: che la lezione imparata sui film si trasferisca alle serie;
- e il segnale che lo student impara è, per ora, in prevalenza **popolarità**.

## Verdetto della sonda

| Assunto del piano | Esito |
|---|---|
| Il teacher porta informazione nuova rispetto alle keyword | ✅ **confermato** (Spearman 0,04; top-10 in comune 0,3/10) |
| Il teacher è «gusto» e non popolarità | ⚠️ **dipende dalla normalizzazione**: `cos` no, `npmi` sì (da usare `npmi`) |
| I metadati bastano a imparare la lezione collaborativa | ✅ fattibile (AUC 0,92 su item tenuti fuori) — ma ⚠️ dominata dalla popolarità (0,77 da sola) |
| Il valore si estende a serie e uscite recenti | ❓ **non testato**, ed è l'assunto su cui poggia tutto il valore (80% delle cronologie è serie) |

## Cosa farei adesso, in ordine di costo

1. **Canale collaborativo per i FILM** (economico, informazione nuova già disponibile): dai film visti, i vicini `npmi` diventano un'origine di candidati — misurarli sulle liste servite (nitidezza, distintività, e quanto sono *nuovi* rispetto ai cataloghi attuali). Se i vicini `npmi` non sono buoni suggerimenti, nessuno student li salverà.
2. **Solo dopo**, lo student (metadati → collaborative) — con il **controllo di popolarità** nel target e nella valutazione, e il cancello sul banco leave-out (deve aggiungere al grafo delle keyword, non solo correlare).
3. **Grafo k-NN + Leiden** confrontato con L1-L5: se i cluster escono uguali, non serve un grafo nuovo.

## Riproduzione

```bash
offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe2-teacher.py
node .scratch/ml-collaborativo/export-histories.js   # cronologie reali (solo film) per il test leave-out
```

---

## Addendum — il test del trasferimento (probe3) e perché NON ha deciso

Costruito secondo le tre decisioni: controllo di popolarità (target `npmi`), test del trasferimento
film→serie, metrica = recupero della cronologia vera sul banco leave-out. Cronologie reali esportate:
**5 film e 14-16 serie per profilo**.

Risultato:

| setting | modello | film nascosti @50 | **serie nascoste @50** | serie @200 |
|---|---|---|---|---|
| semi = SOLO FILM (trasferimento puro) | base (keyword) | — | **0,0%** | 0,0% |
| | student | — | **0,0%** | 0,3% |
| | teacher (oracolo film) | — | 0,0% | 0,0% |
| semi = misti (realistico) | base (keyword) | 5,4% | **11,6%** | 32,1% |
| | student | 1,6% | 9,1% | 19,8% |
| | pop (controllo) | 0,0% | 8,5% | 14,0% |
| | blend base+student | 2,1% | **14,0%** | 30,7% |
| | teacher (oracolo film) | 20,4% | 0,0% | — |

*(caso casuale @50 ≈ 1,6% · @200 ≈ 6,2%)*

**Perché questo tabellone non risponde**: nel setting «semi = solo film» **tutti** i modelli fanno 0,0%
sulle serie, incluso il baseline. Non è un risultato sul trasferimento: è un difetto dello strumento. Il
proxy Python del baseline usa **solo keyword pesate IDF + generi**, mentre lo score di produzione passa
anche dalla **gerarchia L1-L5** — ed è proprio la gerarchia il ponte che fa funzionare il trasferimento
film→serie: l'avevo misurato stamattina in Node, **18,2% @50 contro il 4,1% del caso**, con il codice vero.
Il proxy ha buttato via il ponte e quindi misura l'assenza del ponte.

Secondo difetto: l'AUC 0,977 dello student in questo giro è **su dati di addestramento** (il probe2, con
lo split per item, dava 0,920 — quello è il numero da usare).

**Cosa serve per chiudere davvero il test** (una sola cosa, già chiara):

1. il baseline deve essere lo **scorer di produzione** (Node, con L1-L5 e la curva logaritmica), non un proxy;
2. lo student gira in Python → si esportano i suoi punteggi per coppia (semi × candidati) in JSON e si
   fanno ordinare a Node, così i due concorrenti vedono lo stesso pool con la stessa metrica.

Nel setting misto, per quel poco che vale, il blend batte il baseline **sulle serie @50** (14,0% vs 11,6%)
ma **peggiora** su film (2,1% vs 5,4%) e su serie @200 (30,7% vs 32,1%): nessuna vittoria netta, e con un
baseline mutilato non si può concludere nulla.

---

## Il banco definitivo (bench-transfer.js) — **cancello 3: NON passa**

Impianto corretto: i punteggi dei modelli appresi li produce Python (`export-student-scores.py`,
student addestrato sul target `npmi` con split **per item**: **AUC 0,920**, controllo popolarità 0,782),
e il **baseline lo calcola il codice di produzione** in Node — `extractActiveDNAFromTmdbData` →
`computeActiveDNA` → `computeFinalDNA` → `ProfileScorer._computeThematicScoreForVector`, cioè con la
gerarchia L1-L5 e la mappa id→nome. Pool 3.210 titoli (2.002 film + 1.208 serie), 50 trial, 5 profili reali.

### Setting realistico (semi misti) — il caso d'uso

| modello | film @50 | **serie @50** | serie @200 | film @200 |
|---|---|---|---|---|
| **base (produzione, L1-L5)** | 4,1% | **13,0%** | **41,7%** | 13,6% |
| student (metadati → collaborativo) | 3,8% | 9,9% | 26,0% | 12,2% |
| pop (controllo popolarità) | 0,0% | 1,0% | 9,2% | 0,8% |
| blend base+student | 3,1% | 15,0% | 34,0% | 15,9% |

*(caso casuale @50 ≈ 1,6% · @200 ≈ 6,2%)*

Lo student **non batte** il baseline: 9,9% contro 13,0% @50 sulle serie, 26,0% contro 41,7% @200. Il blend
vince solo su un numero (serie @50: 15,0% vs 13,0%) e perde su tutti gli altri. Il controllo di popolarità
(1,0%) dice che non è nemmeno una questione di fama: il segnale appreso semplicemente non aggiunge.

### Setting di trasferimento puro (semi solo film → serie nascoste)

| modello | serie @50 | serie @200 |
|---|---|---|
| base (produzione) | **2,1%** | **11,0%** |
| student | 0,0% | 1,1% |
| blend | 1,3% | 4,5% |

Qui **tutti** sono ai limiti del caso (1,6% @50): con un pool misto, i film affollano la testa della lista e
le poche serie recuperabili restano in coda. Il trasferimento film→serie **esiste** ma va misurato su un
pool di sole serie (come il catalogo serie reale): lì il banco Node aveva dato **18,2% @50 contro 4,1%**.
Questo setting non aggiunge informazione: la aggiunge quello misto, dove però vince il baseline.

### Il difetto dello student, identificato (una riga)

Le feature dello student sono: keyword pesate IDF, generi, distanza d'anno, distanza di voti, durata,
lingua. **Manca la gerarchia L1-L5** — cioè proprio lo strato che le keyword usano per generalizzare (ed è
il ponte film→serie). Chiedere a un modello di estendere il grafo *senza dargli il grafo* è la spiegazione
più probabile del risultato: lo student vede solo le keyword grezze, che il baseline già sfrutta meglio.

### Verdetto e prossimo passo

**Cancello 3 non superato**: così com'è, il segnale collaborativo non migliora il recupero della cronologia
reale. Le due cose che avrebbero senso, in ordine:

1. **Dare la gerarchia allo student** (L1/L2/L3 come feature: quanti nodi condivide la coppia, con che peso).
   È l'unico modo in cui «distillare il collaborativo» può *estendere* il grafo invece di duplicarne una
   versione peggiore. Costo: mezza giornata, esito binario.
2. Se anche così non batte il baseline, **chiudere il filone**: il collaborativo MovieLens non porta valore
   sui nostri dati (che sono per l'80% serie, dove MovieLens è cieco).

---

## Secondo giro del banco, con il SOTTOGRAFO nelle feature — e verdetto

L'utente ha chiarito l'architettura: il grafo delle keyword **resta la base**, non si contamina; si costruisce un
**secondo** grafo con gli stessi principi, dove ogni film è rappresentato dal **sottografo delle sue keyword**
(i topoi L1/L2/L3) **più** i metadati, e gli **archi da imparare sono quelli del dataset** (MovieLens) proiettati
sui nostri film; poi si estende a chi nel dataset non c'è.

Ho aggiunto allo student le feature del sottografo (Jaccard sui set di nodi L1/L2/L3, risaliti dalla catena
keyword→L1→L2→L3: 6.125 catene, 85.176 titoli su 87.848 con topoi risolti).

**Effetto sullo student: AUC 0,920 → 0,922.** Nessun miglioramento: i topoi non aiutano a predire l'affinità
collaborativa — coerente con l'ortogonalità misurata (Spearman 0,04).

**Effetto sul banco (semi misti, il caso d'uso):**

| modello | film @50 | **serie @50** | serie @200 | film @200 |
|---|---|---|---|---|
| **base (produzione, L1-L5)** | 4,1% | 13,0% | **41,7%** | 13,6% |
| student (con topoi) | 2,0% | 12,7% | 27,3% | 9,7% |
| pop (controllo) | 0,0% | 1,0% | 9,2% | 0,8% |
| blend base+student | 3,1% | **15,0%** | 34,4% | 14,6% |

*(prima dei topoi lo student faceva 9,9% @50 sulle serie: il sottografo ha **chiuso il divario in testa** — 12,7%
contro 13,0% è un pareggio — ma non in profondità: 27,3% contro 41,7%.)*

### Verdetto definitivo su questo filone

| cancello | esito |
|---|---|
| 1 · copertura del teacher | ✅ passa (22.551 nostri film con ≥20 voti, 88-93% dei titoli che contano) |
| 2 · student imparabile | ✅ passa (AUC 0,922 su item tenuti fuori) |
| 3 · **valore aggiunto sui suggerimenti** | ❌ **non passa**: lo student non batte il grafo delle keyword; il blend vince solo la testa delle serie (@50 +2 punti) e perde la coda (−7,3) |
| 4 · grafo k-NN + Leiden | non tentato: senza il cancello 3 non ha senso costruirlo |

**Cosa resta vero, e va tenuto:**

1. Lo spazio collaborativo è **ortogonale** al nostro (Spearman 0,04; top-10 in comune 0,3/10): è informazione
   nuova, non una ricopiatura. Il posto giusto per usarla non è *sostituire* il grafo delle keyword — che resta
   la base, come dice l'utente — ma un **canale separato**: un carosello «chi ha amato X ha amato Y» sui film
   coperti, senza toccare il grafo.
2. La popolarità va controllata sempre (`npmi`): col cosine i vicini di qualunque film sono Matrix e Fight Club.
3. Il numero che tiene in piedi il canale separato è la testa: +2 punti di recall sulle serie quando si miscela.
   Poco, e solo in cima: motivo in più per non ricostruire il grafo su questo segnale.

**Raccomandazione**: chiudere qui il filone «secondo grafo denso». Se si vuole provare MovieLens, farlo come
**canale di candidati per i film** (economico, verificabile sulle liste servite con i giudici), non come
riproiezione di tutto il catalogo.
