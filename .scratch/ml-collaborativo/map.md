# Mappa: il grafo collaborativo (teacher MovieLens → student sui metadati)

**Aperta**: 08/10/2026 · **Tracker**: markdown locale, `.scratch/ml-collaborativo/issues/` · **Stato**: aperta
**Origine**: brainstorming dell'utente (PDF `blank.pdf`, dialogo con Gemini), sintetizzato qui in una scheda di lavoro.

## L'idea, in quattro righe

1. **Teacher** — MovieLens (32M voti di 200.948 utenti) dà una similarità *collaborativa* fra film: chi guarda X guarda anche Y, secondo una popolazione esterna. Sono informazioni che le keyword di TMDB **non contengono**.
2. **Student** — si addestra un modello che impara a **predire quella posizione collaborativa dai soli metadati** (keyword pesate IDF, generi, anno, durata, voto bayesiano, lingua): distillazione dallo spazio collaborativo a quello dei metadati.
3. **Grafo** — ogni titolo riceve un vettore denso (anche serie, anime e uscite nuove, che in MovieLens non esistono), si collega ai suoi k vicini più prossimi e si passa Leiden per ottenere micro-generi latenti, come già facciamo oggi sulle keyword.
4. **Uso** — i cluster diventano il primo imbuto (500-1000 candidati, pescati in proporzione ai gusti multipli dello storico utente), poi punteggio, re-ranking e diversità.

## Perché ora, e perché è la risposta giusta

Il prototipo OCEAN di oggi ha chiuso con una regola: **una rappresentazione densa serve solo se porta informazione che le keyword non hanno** — riproiettare gli stessi dati su 5 assi peggiora il risultato ([report](../ocean-prototipo/ricerche/01-ocean-prototipo.md)). MovieLens è esattamente l'informazione mancante: co-visione reale di 200.000 persone.

E la pipeline proposta (denso → k-NN → Leiden → cluster → retrieval → re-rank) **è già la nostra**: `offline_graph_builder` fa PPMI + embedding + Leiden sulle keyword e produce i livelli L1-L5. Qui cambia la similarità (collaborativa invece che co-occorrenza di keyword), non l'impianto.

## Il gate, già misurato (08/10/2026)

Dati scaricati in `.cache/movielens/` (1,1 GB, gitignorato): `ml-32m.zip`, `links.csv`, `movies.csv`, `ratings.csv`.

| Misura | Valore |
|---|---|
| Catalogo YACA | **97.613 film** + 19.585 serie |
| Film coperti da MovieLens | **62.516 (64,0%)** — con ≥100 voti TMDB: **87,9%** · ≥1.000: **93,3%** · ≥10.000: **99,7%** |
| Serie TV coperte | **0** — `links.csv` rimanda solo a `/movie/{id}` |
| Decennio 2020s coperto | **36,5%** (snapshot di fine 2023: il buco che lo *student* deve colmare) |
| Film MovieLens con ≥20 voti | **23.350** · ≥50: 16.034 · ≥200: 9.322 · ≥1.000: 4.397 |
| **Nostri film con ≥20 voti MovieLens** | **22.551** (mediana 228 voti TMDB) · di cui solo il **20%** sono "popolari" da noi (<1.000 voti) |

Due letture che contano:

- **Il teacher esiste e non è solo blockbuster**: 22.551 nostri film hanno almeno 20 voti MovieLens, e l'**80% di quelli non è popolare** nel nostro catalogo. La matrice cioè contiene anche cinema di nicchia, che è dove il gusto si distingue.
- **Il buco è dove serve lo student**: serie (0%) e 2020s (36,5%). Se il teacher servisse solo a se stesso, varrebbe poco; vale perché la sua lezione si trasferisce ai metadati.

## Il piano, a cancelli (non si costruisce tutto prima di aver misurato)

| # | Passo | Cancello: se non passa, ci si ferma lì |
|---|---|---|
| 1 | **Teacher**: matrice item-item dai voti MovieLens (solo item con ≥20 voti, top-N simili per item) | copre abbastanza catalogo da permettere un test onesto (già verificato: 22,5k film) |
| 2 | **Student**: modello metadati → similarità collaborativa, addestrato su coppie tenute fuori | **AUC su coppie tenute fuori** chiaramente sopra il caso, e la similarità appresa **non è una ricopiatura** della similarità delle keyword (correlazione di rango misurata e dichiarata) |
| 3 | **Valore aggiunto**: proiezione dello student applicata a serie, film senza teacher e uscite recenti | sul banco leave-out che usiamo da stamattina (recupero della cronologia reale), lo student batte **il grafo delle keyword** e/o aggiunge in miscela |
| 4 | **Grafo + Leiden**: k-NN mutuale sui vettori dello student, Leiden, confronto con L1-L5 | i cluster sono **diversi** da quelli attuali (se sono gli stessi, non serve un grafo nuovo: basta quello che c'è) |

## Sfide dichiarate (dalla letteratura + quello che abbiamo imparato oggi)

- **Popolarità**: la co-visione è dominata dai titoli visti da tutti. Va controllata (pesare/normalizzare, e valutare su item non-blockbuster) altrimenti lo student impara "popolare" e ci ritroviamo il catalogo popolare travestito — il difetto che la campagna QC ha già trovato nei hero.
- **Hubness**: negli spazi densi alcuni titoli diventano hub di tutti i vicini; si usa **k-NN mutuale** e si controlla la distribuzione dei gradi prima di Leiden.
- **Ricopiatura**: gli input dello student sono le stesse keyword che già usiamo. Il rischio è un giro lunghissimo per ottenere ciò che il grafo L1-L5 già dà. Per questo il cancello 3 è **incrementale**, non correlazionale.
- **Sforzo di calcolo**: EASE sulla matrice intera (84k item) è fuori scala (~30 GB di matrice); si resta su item-item con soglia di voti e, se serve, su `implicit` (ALS) che è nativo per matrici sparse. Tutto offline, una volta.
- **Uscite recenti**: nessun dato collaborativo, quindi lo student è *l'unica* via — ma anche la sua validazione va fatta su item che il teacher non ha mai visto, altrimenti si misura il teacher.

## Fuori ambito

- Sostituire il grafo delle keyword: l'esito atteso è un **secondo segnale** (o una estensione), non un rimpiazzo senza confronto.
- Teacher per serie e anime: non esiste un MovieLens equivalente pulito (MAL copre anime ma con mappatura per titolo, da valutare **dopo** il cancello 3).
- Riscrivere la pipeline di serving: qui si misura e si prototipa fuori da `src/`.

## Provenienza

Sintesi della conversazione in `blank.pdf` (10 pagine, 08/10/2026): architettura a tre stadi, librerie open source, e — la parte che interessa — il passaggio da lookup table statica a **Knowledge Distillation dal collaborativo al content space**, con le insidie su budget/incassi (assenti per le serie), keyword come 70% del segnale, hubness, clustering rigido e multi-interesse dell'utente.
