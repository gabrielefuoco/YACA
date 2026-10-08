# Mappa: il grafo collaborativo (teacher MovieLens → student sui metadati)

**Aperta**: 08/10/2026 · **Tracker**: markdown locale, `.scratch/ml-collaborativo/issues/` · **Stato**: aperta
**Origine**: brainstorming dell'utente (PDF `blank.pdf`, dialogo con Gemini), sintetizzato qui in una scheda di lavoro.

## Destination

**Capire se esiste una rappresentazione densa dei titoli — distillata dalla co-visione reale di 200.948 utenti
MovieLens e proiettata sui metadati — che generi candidati migliori di quelli che la produzione pesca oggi**,
senza toccare `src/` finché la misura non lo giustifica.

Il grafo **non è il fine**: è il modo di rispondere a una domanda che il DNA e il grafo delle keyword non possono
rispondere. La regola lasciata dal prototipo OCEAN è la premessa di tutto: *una rappresentazione densa serve solo
se porta informazione che le keyword non hanno*. MovieLens è esattamente quella informazione mancante.

Uso previsto, se i cancelli passano: i cluster diventano il **primo imbuto** (500-1.000 candidati pescati in
proporzione ai gusti multipli dello storico), poi punteggio, re-ranking e diversità.

**Stato al 08/10/2026** — la catena `feature → coseno → selezione → liste` regge, misurata end-to-end:

| | valore | contro |
|---|---|---|
| Student (coseno held-out) | **0,500** | base 0,430 · **controllo del banale 0,224** |
| Imbuto: grafo 2 hop, recall@50 | **5,9%** | pool di produzione 1,9% · caso 1,3% |
| Grafo | 87.848 nodi · 897.020 archi · **276 cluster** (mediana 299 titoli, coerenza 0,618) | |

Il vantaggio del grafo sul pool di produzione è **3,1×** con **2,2 volte meno candidati**.

## Decisions so far

1. **Il teacher è MovieLens, non EASE/ALS sulla matrice intera**: 32M voti, item-item con soglia ≥20 voti.
   Copre il **64%** dei film e **0%** delle serie. EASE su 84k item è fuori scala (~30 GB).
2. **Il teacher si costruisce con SVD pesata anti-popolare** (`1/log1p(n_item)`): la prima componente spiega il
   42% della varianza e il vettore medio ha coseno **0,224** coi bersagli — è il controllo del banale, e va
   stampato accanto a ogni misura.
3. **Lo student è un Ridge lineare sui metadati, non un modello non lineare**: misurato, il gap in-sample della
   base è +0,054 → **non sotto-adatta**, quindi una testa non lineare non era la prima leva. La leva erano le
   **feature** e la **regolarizzazione** (alpha 30).
4. **Le feature estese entrano nel grafo**: lingua, persone (cast+creatori, top 3.000), franchise (top 800),
   budget, `content_rating`, stagioni → +0,049 di coseno held-out (**+11% relativo**), e il guadagno si
   trasferisce **intatto** sui candidati (2 hop: 4,7% → **5,9% @50**).
5. **La regolarizzazione è la risposta all'alta cardinalità**: alpha 1 → 30 porta l'held-out 0,479 → **0,500** e
   dimezza il gap (0,135 → 0,081). La normalizzazione L2 delle righe fa lo stesso lavoro (0,494) e **non si
   somma** ad alpha: sono due risposte allo stesso problema.
6. **La risoluzione di Leiden resta 16** (276 cluster, mediana 299 titoli): la manopola esiste (res 64 → 899
   cluster da 94, coerenza 0,618 → 0,676) ma il livello attuale è già micro-genere.
7. **Il grafo si costruisce fuori da `src/`** (`offline_graph_builder/venv`, output in `.cache/movielens/`,
   gitignorato). Nessuna modifica irreversibile al prodotto.
8. **La catena da tenere è `feature → coseno → selezione → liste`**: un miglioramento che non arriva in fondo
   alla catena non conta. Il coseno non è un risultato, è un passaggio.

## Not yet specified

- **Embedding appresi dal sottografo** (idea dell'utente): al posto di 1.982 nodi binari + 3.000 persone + 800
  franchise, un vettore per nodo (node2vec sulle adiacenze L1) e per il titolo la media appresa. Ticket 09.
- **Il trasferimento alle serie**: il teacher è cieco (0%), le serie sono l'80% delle cronologie reali, e il
  test misto **non ha dato nessuna vittoria netta** (student 9,9% vs baseline 13,0% @50). Ticket 12.
- **La statistica forte**: le misure dell'imbuto poggiano su 5 profili e 75 trial. Serve il banco con utenti
  MovieLens tenuti fuori. Ticket 11.
- **Il buco della popolarità**: la quota spiegata dalla sola popolarità è 4,9/5,9 nel 2 hop — il vantaggio
  *dopo* aver tolto la fama non è ancora misurato. Ticket 10.
- **`L1_adjacency`**: scritto dal builder (`build_graph.py:512`) ma **assente dal JSON di produzione** → la
  diffusione fra L1 non parte mai. Ticket 13.
- **Le liste servite** (rank 10→30): la metrica di prodotto vera, non ancora misurata. Ticket 14.

## Out of scope

- **Sostituire il grafo delle keyword**: l'esito atteso è un **secondo segnale** o una estensione, mai un
  rimpiazzo senza confronto a parità di budget (ed è il confronto che l'imbuto fa già).
- **Un teacher per serie e anime**: non esiste un MovieLens equivalente pulito (MAL copre gli anime con
  mappatura per titolo, da valutare *dopo* il cancello del ticket 12).
- **Riscrivere la pipeline di serving**: si misura e si prototipa fuori da `src/`.
- **Modelli non lineari come prima leva**: escluso dai numeri (decisione 3), non per gusto.
- **LLM/Transformer/autoencoder sul catalogo**: l'utente ha chiesto classificatori standard e la strada
  dell'embedding di nodo, non una nuova famiglia di modelli.

## Gli errori da non rifare (cari, già pagati)

1. **Confusione di namespace**: i voti MovieLens filtrati con i **tmdbId** invece che con i **movieId** —
   due namespace che collidono per caso. Ha prodotto un coseno di 0,044 falso per mezza giornata. **Convertire
   una volta sola, al confine, e stampare la copertura** (`colonne vuote 18.913 su 23.309`: la diagnostica l'ha
   smascherato in una riga).
2. **Il controllo del banale accanto a ogni misura, sempre**. Il vettore medio a 0,224 è ciò che ha reso
   visibile il bug: senza, 0,044 sarebbe sembrato un risultato.
3. **Un numero senza l'oggetto che misura non è un numero**: «mediana 4.118» era la mediana dei *candidati*,
   non dei *cluster* (299), e mi ha fatto inseguire un problema che non esisteva.
4. **Nessuna conclusione da un numero solo**: la struttura va guardata prima (per fascia di popolarità, per
   epoca, per numero di keyword). È così che è emerso che il buco sono i film poco votati (0,361) e gli anni
   '80-'90 (0,368), non i titoli con poche keyword.
5. **L'interpretazione si scrive prima dell'esperimento**: se (1) sale e (2) no → il collo di bottiglia è
   altrove. Decidere dopo aver visto i numeri è come non aver deciso.
6. **Mai validare su item che il teacher ha visto**: per serie e uscite recenti il teacher è cieco, e ogni
   misura lì è una misura dello student — ma non del teacher.
7. **La popolarità è un confondente, non un dettaglio**: sempre il ranker "solo popolarità" accanto allo
   scorer, e sempre la fascia non-blockbuster guardata a parte.

## Provenienza

Sintesi della conversazione in `blank.pdf` (10 pagine, 08/10/2026): architettura a tre stadi, librerie open
source, e il passaggio da lookup table statica a **Knowledge Distillation dal collaborativo al content space**,
con le insidie su budget/incassi (assenti per le serie), keyword come 70% del segnale, hubness, clustering
rigido e multi-interesse dell'utente.

## Effort collegati

- `.scratch/livello-latente/` — DNA deterministico: **risolto e in produzione** (`a20add6`).
- `.scratch/ocean-prototipo/` — OCEAN come vettore di punteggio: **respinto** sui numeri; sopravvive come
  *descrizione* per i giudici di dosaggio, mai come asse di scoring.

## Il grafo vecchio non era usato correttamente — verificato l'08/10/2026

Prima di costruire il grafo nuovo bisognava rispondere a «il vecchio viene usato bene?». **No.** Tre
fenomeni, tutti **silenziosi** (`?.` e `|| []` non lanciano e non loggano):

1. **`L1_adjacency` è morta** ([ticket 13](issues/13-l1-adjacency.md)): il codice la legge
   (`HierarchicalGraph.js:117`), il JSON non la contiene (il builder la scrive, `build_graph.py:512`). Era la
   **sola** sorgente di segnale *laterale* del grafo, e valeva **+90%…+164% di massa vettoriale** — senza di
   essa due keyword in micro-cluster *vicini* hanno coseno **0**. Il "grafo a più livelli" oggi è solo una
   gerarchia verticale: L0 54,8% · L1 27,4% · L2 13,5% · L3 2,7% · L4 1,3% · L5 **0,3%**.
2. **`getKeywordsForNodeIds` restituisce NOMI in uno slot usato come ID** (`catalogStrategies.js:105`): le
   chiavi di `kw_to_L1` sono nomi (`"evil"`), il DB costruisce le regole come `'k:' || (k->>'id')`, e il
   risultato finisce in `F.keywordStr(k)` in due percorsi SQL (righe 672 e 1241). Che il mix sia reale lo dice
   già il codice: l'ordinamento finale gestisce apposta sia numeri sia stringhe.
3. **`children_L1` esiste solo sui nodi L2** (per progetto: il builder la scrive così, riga 441), ma
   `getKeywordsForNodeIds` la cerca a ogni livello → con L3/L4 restituisce `[]` in silenzio. Oggi le chiamate
   sono solo `'L2'` (righe 628, 1239): **latente**, non ancora un danno.

E il file di produzione non è riproducibile dal builder del repo ([ticket 16](issues/16-json-non-riproducibile.md)).

**Conseguenza per questo filone**: il termine di paragone di tutte le misure dell'imbuto è il grafo vecchio
**con il segnale laterale spento**. Riaccenderlo costa quasi zero e va fatto *prima* di dichiarare che il
grafo nuovo vince.
