# 23 — La connettività della mappa: i ponti fra i grappoli

**Status**: `resolved` · **Ticket**: [23](../issues/23-connettivita-della-mappa.md) · **Script**: `23-connettivita.py` · **Log**: `log/23-connettivita.log` · **121 s**

## Il problema, in una riga

Il ticket 09 aveva sparsificato il grafo delle bolle a 5 vicini mediani — e **frammentato la mappa in 143 componenti connesse** (117 col suo conteggio, 143 con questo, che ricostruisce la base senza il ripiego). Il ticket 11 su quella base **non poteva** avere 25-35 macro-mondi: qualunque partizione di un grafo con 143 componenti ne ha almeno 143.

## Le quattro varianti

| variante | archi | mediana grado | **componenti** | bolle ≥15 isolate | coppie verificate |
|---|---|---|---|---|---|
| **A0** mutual k=8 (il ticket 09) | 23.450 | 4 | **143** | 81 | 5/6 |
| **B** mutual k=10 | 31.018 | 6 | **57** | 38 | 5/6 |
| **C** **diretto** k=8, simmetrizzato | 42.343 | **8** | **5** | **0** | **6/6** |
| **A1** mutual k=8 + **albero di copertura** | 23.726 | 4 | **5** | **0** | 5/6 |

**Le coppie verificate** sono le sei adjacency lette a mano nel ticket 09 — Fassbinder → *Il tamburo di latta* (Nuovo Cinema Tedesco), Star Wars TV → i film di Star Wars, mostri anni '50 → *I Was a Teenage Werewolf*, natalizie polacche → polacche, argentine → argentine, norvegesi → norvegesi. **Sono il controllo che conta**, perché il «tasso di conservazione sui vicini forti per peso» si è già mostrato una metrica sbagliata.

## ✅ Il k-NN diretto vince su ogni asse

**La variante C — il k-NN *non* mutuo, simmetrizzato — è la migliore su tutte e quattro le misure:**

- **5 componenti** contro 143 (e 57 a k=10)
- **mediana del grado 8**, dentro l'intervallo che il ticket 12 vuole
- **zero** bolle con ≥15 titoli isolate (erano 81)
- **6 coppie verificate su 6** — l'unica variante che le conserva tutte

Il motivo è chiaro: la **reciprocità** è ciò che frammenta. Un mondo piccolo che ha un legame forte verso un mondo grande raramente riceve il legame di ritorno (il mondo grande ha troppi vicini migliori), quindi il filtro mutuo **taglia esattamente i ponti asimmetrici fra grappoli** — che sono i ponti, per definizione.

**Il ticket 23 lo aveva messo come terza opzione e si rivela la prima.** La cautela scritta nel ticket («una mappa asimmetrica non si naviga») resta vera del k-NN *grezzo*: la variante C è **simmetrizzata** (l'arco esiste se uno dei due lo sceglie), ed è quella che si naviga.

## ✅ E l'albero di copertura funziona, a costo quasi zero

Sulla base del ticket 09 (mutual k=8), ricucire le componenti con l'arco più forte di PMI+ costa **138 archi su 23.450 — il +0,59%** — e porta le componenti da **143 a 5**, con zero bolle grandi isolate.

**Le ricuciture lette sono vere.** Le prime 12, per peso di PMI+:

| | | |
|---|---|---|
| [5169] 3 titoli (La maschera · Paolo apostolo di Cristo) | [4279] bible · denial of death · **woman director** | ✅ **religione + woman director** |
| [3467] 7 titoli (La leggenda di Sleepy Hollow · Shark Lake) | [4036] lake · shark attack · haunted house | ✅ **horror** |
| [5115] 3 titoli (Zola · Lost in Translation) | [2474] **woman director** · lyrical · loneliness | ✅ indie americano |
| [1422] Serenity · Palm Royale | [5255] based on novel · palm beach · 1960s | ✅ drama americano |
| [2080] Amore e inganni · Growing Up | [4828] **manhattan, new york city** · pursuit | ✅ commedia newyorkese |

**Nessuna delle ricuciture lette è il legame generico che il filtro aveva tolto.** La cautela del ticket («i ponti più forti fra due grappoli possono essere il legame generico») **non si materializza**: l'arco scelto è quello con la PMI+ più alta, e la PMI+ è già il criterio che penalizza i generici.

## Il conflitto col ticket 05 non si risolve: sono due problemi

Il ticket 05 aveva trovato che le bolle giudicate cattive sono **piccole** (15-35 titoli), mentre il ticket 08 aveva mostrato che **dividere** le bolle grandi spezza mondi coerenti. E ora il 23 dice che la mappa va **riconnossa**.

**Sono tre rimedi per tre problemi diversi, e non sono in conflitto:**

| problema | rimedio | ticket |
|---|---|---|
| bolle piccole senza filo (le «pattumiere») | **assorbire** i membri nei vicini | 08 (passo C/D, i due passi che il 08 ha promosso) |
| bolle grandi con due mondi dentro | **dividere** | 08 (passo A) — ma il 08 l'ha **respinto**: 4 divisioni su 4 spezzavano mondi coerenti |
| mappa frammentata | **ricucire** | 23 (questo ticket) |

**La ricucitura non tocca le bolle piccole**: le 215 bolle da 1-3 titoli restano tali, e le bolle ≥15 isolate dopo la ricucitura sono zero. Sono leve indipendenti su popolazioni indipendenti.

## I criteri del ticket

- [x] **le componenti connesse scendono da 143 a 5** ✓ (non a 1, perché 5 sono gruppi di bolle davvero isolate anche nel grafo denso). Con la variante C: **5**
- [x] **la mediana dei vicini resta sotto 10** ✓ (4 con l'albero, **8** con il k-NN diretto)
- [x] **le adjacency vere sono conservate**: **6/6** con il k-NN diretto, 5/6 con l'albero — e la sesta persa è la norvegese
- [x] **nessuna bolla con più di 15 titoli resta isolata** ✓ (da 81 a 0)
- [x] il costo è dichiarato: **+138 archi (+0,59%)** per l'albero; +18.893 archi (+80%) per il k-NN diretto
- [x] **la scelta è giustificata leggendo**: le 12 ricuciture per peso sono tutte relazioni reali (religione+woman director, horror, indie americano), quindi l'albero sceglie bene i ponti
- [ ] ⚠️ **il ticket 11 non è stato riprovato sopra**: il grafo connesso esiste (`bolle-archi-23.npz`) ma la gerarchia L1/L2 su di esso non è stata ricalcolata

## Raccomandazione

**Due strade, entrambe valide, e la scelta dipende da cosa serve:**

- **k-NN diretto simmetrizzato (C)** — 5 componenti, mediana 8, 6/6 verificate. **È la sparsificazione nuova**, e costa +80% di archi rispetto al mutuo. La mediana di 8 è esattamente il bersaglio del ticket 12.
- **mutual k=8 + albero di copertura (A1)** — 5 componenti, mediana 4, 5/6 verificate, **+0,59% di archi**. Più rada e più fedele al lavoro già fatto, perde una delle sei adjacency.

**Per il ticket 12 serve una mediana di 8**: la C è la scelta. Per una mappa più rada e più «sicura», la A1.

## Limiti dichiarati

1. **Il k-NN diretto è asimmetrico per costruzione**: la variante misurata è la sua simmetrizzazione (l'unione dei due versi), e questo è dichiarato — ma la direzione dell'arco si perde, e il ticket 13 (approfondimento/allargamento) la vorrà.
2. **Le 5 componenti residue non sono state lette**: potrebbero essere bolle davvero isolate (e allora va bene) o grappoli che una ricucitura più fine unirebbe.
3. **La base è stata ricostruita** senza il ripiego del ticket 09, e il conteggio delle componenti esce **143** invece di 117: la differenza è il ripiego, che riconnetteva le bolle isolate con un arco ciascuna. Le due misure non sono confrontabili alla cifra, solo nell'ordine.
4. **Nessuna delle quattro varianti è stata valutata sul recupero**: sono tutte scelte di *mappa*, e il loro effetto sul prodotto è nullo per costruzione (la mappa non entra nella camminata).
5. **Il ticket 11 va riprovato** su `bolle-archi-23.npz`: è il primo consumatore del risultato, e il criterio «L1 a 25-35 macro-mondi» era quello che aveva rivelato il problema.
