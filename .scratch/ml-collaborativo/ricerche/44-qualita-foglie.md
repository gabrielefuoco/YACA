# 44 — La qualità delle foglie, misurata sul comportamento vero

**Domanda (utente)**: cosa rende buona una raccomandazione, e come si misura — con tre assi scelti da lui: **sorprendente**, **azzeccato**, **che regge il cambio di medium**. Più: le 164 foglie sopra i 40 titoli si aprono abbassando la soglia?

**Risposta breve**: l'asse "azzeccato" adesso ha uno strumento che prima non c'era (il comportamento vero, non la curatela), e dice due cose controintuitive: **le foglie grandi sono le più coerenti, e le foglie piccole le più deboli**. E le foglie grandi **non** vanno aperte: la soglia di stop non c'entrava niente, e abbassare il criterio che le bloccava fa perdere coerenza.

Tutti gli script in `.scratch/ml-collaborativo/`: `qualita-foglie.py`, `diag-foglie.py`. Alberi: `albero.json` (base), `albero-s25.json`, `albero-mod05.json`.

---

## 1. Lo strumento: co-occorrenza nelle cronologie vere

La foglia è l'unità di raccomandazione. La domanda "è una buona unità?" non si può fare alla curatela (è il segnale da cui la struttura nasce — sarebbe circolare, come il bootstrap del report 43). Serve un segnale esterno.

Ce l'abbiamo: **MovieLens 32M**, 200.948 utenti, 31,6 milioni di interazioni, mappate su **49.736 dei 66.259 titoli** via `links.csv`.

La misura: **due film della stessa foglia compaiono nella stessa cronologia più spesso di due film raggruppati a caso?**

- osservato: per ogni utente, ogni coppia di film che cade nella stessa foglia
- nullo: la stessa cosa con le foglie **mescolate** (stessi film, stessa distribuzione di dimensioni, raggruppati a caso)
- `LIFT = osservato / nullo`

**Il controllo che rende credibile la misura**: il nullo per coppia è **piatto** su tutte le fasce di dimensione (6,1 · 8,1 · 8,2 · 8,0 · 8,7 · 6,8 · 7,9). Se avessi sbagliato la statistica, il nullo avrebbe avuto una pendenza. Non ce l'ha.

*(Nota: un modello di indipendenza "ogni utente vota il film i con probabilità deg_i/U" sbaglia di ~4× — dà lift 5,27 dove il nullo dà 3,94. Il motivo è l'eterogeneità degli utenti: pochi utenti iperattivi generano co-occorrenze anche fra titoli scorrelati. Per questo il riferimento è il nullo, non l'indipendenza.)*

## 2. Il risultato: le foglie sono unità comportamentali vere

Albero base, per fascia di dimensione:

| dimensione | foglie | coppie | co-occ/coppia | nullo | **LIFT** | popolarità | con entrambi i medium |
|---|---|---|---|---|---|---|---|
| 2-5 | 49 | 490 | 17,9 | 6,4 | **2,78** | 48° | 0,0% |
| 6-10 | 457 | 12.813 | 86,6 | 8,1 | **10,76** | 52° | 16,2% |
| 11-20 | 1.032 | 107.890 | 44,0 | 8,2 | **5,39** | 51° | 19,6% |
| 21-40 | 852 | 306.468 | 46,6 | 8,0 | **5,84** | 51° | 28,8% |
| 41-80 | 96 | 116.373 | 149,2 | 8,7 | **17,07** | 60° | 66,7% |
| 81-150 | 26 | 70.488 | 86,7 | 6,8 | **12,76** | 55° | 76,9% |
| 151+ | 6 | 160.892 | 141,3 | 7,9 | **17,91** | 55° | 83,3% |

**LIFT complessivo: 10,74.**

Tre letture:

1. **Le foglie raggruppano film che la gente guarda insieme**, da 2,8 a 17,9 volte il caso. È una validazione esterna che il filone albero non aveva mai avuto: fino a ieri le foglie erano giudicate "buone" perché rispettavano la curatela, che è il segnale da cui nascono.
2. **La coerenza CRESCE con la dimensione**, non cala. Le foglie sopra i 40 titoli hanno lift 17,9 — il valore più alto della tabella. Le foglie da 2-5 titoli hanno lift 2,78, il più basso.
3. **Le foglie piccole sono i residui.** La ricorsione si ferma su un nodo quando non trova struttura: quel nodo diventa una foglia anche se è piccolo e incoerente. Le foglie piccole non sono "specifiche": sono il rumore di fondo del catalogo.
4. **L'asse "sorprendente" è piatto**: la popolarità media dei membri sta al 48-60° percentile del catalogo, cioè intorno alla mediana. Le foglie non sono "il solito" — ma nemmeno una selezione di nicchia.
5. **L'asse "medium" cresce con la dimensione**: il 66-83% delle foglie grandi contiene film *e* serie, contro il 16-20% delle piccole. L'agnosticismo dal medium è una proprietà delle foglie grandi.

## 3. Le foglie grandi non si aprono: la soglia non era la causa

Prima ipotesi: le 164 foglie sopra i 40 titoli (max 366) si aprono abbassando la soglia di stop da 40 a 25.

**Fatto**: l'albero a soglia 25 ha 4.250 foglie invece di 3.238, e le foglie sopra i 40 sono **ancora 164, con lo stesso massimo 366**. La soglia non era il vincolo.

**Perché** (`diag-foglie.py`, una foglia per volta, 8 risoluzioni di Leiden ciascuna):

| motivo del blocco | foglie | quota |
|---|---|---|
| **modularità del miglior taglio sotto 0,15** | **155** | **94,5%** |
| il taglio produce più di 25 figli | 6 | 3,7% |
| il taglio produce un figlio con meno di 3 titoli | 3 | 1,8% |
| si aprirebbe e non è stato aperto (bug) | 0 | 0% |

La modularità del miglior taglio valido, su quelle 155 foglie: 10° percentile 0,044 · mediana **0,102** · 90° 0,142. **Nessuna arriva a 0,15.**

Quindi la soglia `0.15` è vincolante. L'ho abbassata a **0,05** (stesso grafo, stesso seed) e l'albero è cambiato molto:

| albero | foglie | mediana | max | sopra 40 | sopra 100 |
|---|---|---|---|---|---|
| base (SOGLIA 40, mod ≥0,15) | 3.238 | 17 | 366 | **164** | 19 |
| soglia 25 (mod ≥0,15) | 4.250 | 12 | 366 | **164** | 19 |
| modularità ≥0,05 | 3.783 | 16 | **113** | **37** | **3** |

Le foglie grandi scendono da 164 a 37, il massimo da 366 a 113. **Obiettivo raggiunto.**

## 4. E la qualità? Peggiora. Ecco il conto che lo dimostra

I tre alberi sulla stessa batteria:

| albero | coppie | eventi | per coppia | nullo | **LIFT** |
|---|---|---|---|---|---|
| base | 776.268 | 66.576.129 | 85,76 | 7,99 | **10,74** |
| soglia 25 | 663.424 | 64.809.825 | 97,69 | 8,02 | **12,18** |
| modularità ≥0,05 | 529.186 | 36.929.005 | 69,78 | 7,82 | **8,92** |

L'albero a modularità 0,05 **perde il 20% di lift** (10,74 → 8,92). Ma il numero che spiega davvero è **cosa tagliano i due interventi**, per sottrazione (i due alberi più fini sono raffinamenti di quello base, quindi le coppie perse sono un sottoinsieme esatto):

| intervento | coppie perse | eventi persi | co-occorrenza delle coppie PERS | di quelle RESTATE |
|---|---|---|---|---|
| soglia 25 | 112.844 | 1.766.304 | **15,7** | 97,69 |
| modularità 0,05 | 247.082 | 29.647.124 | **120,0** | 69,78 |

**La soglia 25 taglia coppie da 15,7 co-occorrenze (spazzatura). La modularità 0,05 taglia coppie da 120,0** — quasi il doppio della media di quelle che tiene.

Cioè: **le 164 foglie grandi non erano un difetto, erano le parti migliori dell'albero.** La soglia di modularità 0,15 le rifiutava di aprire perché strutturalmente deboli (modularità 0,10) — e aveva ragione: quei titoli sono comportamentalmente legatissimi. Una foglia è grande perché la *folla* è grande.

**Conclusione su (3)**: non aprire quelle foglie. Se serve una granularità più fine per il prodotto, si ottiene **dentro** la foglia (ordinare i membri per punteggio), non spezzando la foglia in due — spezzarla distrugge le coppie che funzionano.

E la soglia 25 è un guadagno marginale (+1,44 di lift) pagato con 1.012 foglie in più e con foglie più piccole (138 foglie <5 titoli contro 49). Non vale il costo.

## 5. I tre assi, in una tabella sola

| asse | strumento | stato | risultato |
|---|---|---|---|
| **azzeccato** | co-occorrenza MovieLens contro nullo mescolato | **nuovo, calibrato** | lift 2,8-17,9; cresce con la dimensione |
| **sorprendente** | percentile di popolarità dei membri | misurato | 48-60° — intorno alla mediana: né il solito né nicchia |
| **medium** | % di foglie con film *e* serie | misurato | 24-30% in media, **66-83% sulle foglie grandi** |
| *(qualità intrinseca)* | `vote_average` | **esclusa dall'utente** | non misurata |

E il **trade-off** che cercavamo: i tre assi non vanno d'accordo. La coerenza comportamentale (*azzeccato*) e l'agnosticismo dal medium premiano le foglie **grandi**; la sorpresa non distingue. Non esiste una granularità che massimizzi tutto: esiste la granularità giusta per l'uso, e per un'unità di raccomandazione la misura dice che **grande e coerente batte piccolo e specifico**.

## 6. Limiti dichiarati

- **MovieLens copre 49.736 titoli su 66.259**, e solo film: le serie non hanno cronologie lì. L'asse "azzeccato" è misurato **solo sul lato film**. Per le foglie di sole serie (311 nell'albero base) non dice niente.
- 17.188 titoli hanno zero cronologie nel mapping: i loro archi non contano nel lift (né al numeratore né al denominatore).
- Il lift **non è confrontabile** con l'11,2% del report 43: quello misura la qualità dei *legami curati tenuti fuori*, questo misura la coerenza *interna* delle foglie. Domande diverse, numeri diversi.
- La popolarità è il `vote_count` di TMDB, non il consumo reale.
- MovieLens è un campione: i suoi utenti non sono gli utenti YACA.

## 7. Errori miei

- **Il nullo mi ha trovato un bug vero**: calcolavo l'atteso per indipendenza sull'assegnazione **originale** anche nel passaggio mescolato. Il nullo è passato da 0,49 a 3,94 appena corretto. Senza il controllo di calibrazione non l'avrei visto.
- **Prima versione della statistica dominata dalla popolarità**: la media grezza per coppia vale migliaia per le coppie di blockbuster. Risolto normalizzando col nullo a parità di film.
- **Il diagnostico delle foglie grandi era incompleto**: non controllavo il quarto criterio (la modularità) e dichiarava "155 foglie apribili, possibile bug". Il bug non c'era; c'era il mio controllo mancante.

## 8. Cosa fare adesso

1. **Non toccare la soglia di stop né la soglia di modularità.** Le foglie grandi sono buone: vanno usate come pool, con l'ordinamento dentro.
2. **Guardare alle foglie piccole**: 49 foglie da 2-5 titoli con lift 2,78 sono il punto debole misurato. La domanda giusta non è "come apro le grandi" ma "cosa faccio con i residui incoerenti".
3. **L'asse mancante è la sorpresa.** La popolarità è piatta: le foglie non distinguono il già visto dal nuovo. Se la sorpresa conta, va costruita (λ · similarità col profilo, gli item-ponte fra cluster — l'idea registrata nel report 41), non letta dalle foglie.
4. **Il lato serie resta scoperto**: 16.550 serie senza cronologie. È lo stesso buco del report 43, e non si chiude con i dati MovieLens.

## 9. Numeri riproducibili

| script | cosa fa | tempo |
|---|---|---|
| `qualita-foglie.py [albero.json]` | la batteria: co-occorrenza + nullo + popolarità + medium | 37 s |
| `diag-foglie.py [albero.json] [soglia]` | perché ogni foglia grande non si apre | 2 s |
| `albero.py` (con `YACA_SOGLIA_ALBERO`, `YACA_MIN_MOD`, `YACA_OUT_ALBERO`) | ricostruisce l'albero con altri parametri | 173-199 s |

Artefatti: `.cache/movielens/albero.json` · `albero-s25.json` · `albero-mod05.json` · log in `.scratch/ml-collaborativo/albero-*.log`.

---

# CORREZIONE (stessa sessione) — la misura mescolava coerenza e portata

**Obiezione dell'utente**: «le foglie piccole sono coerenti? cioè, i film/serie che stanno dentro, sono coerenti? perché in tal caso il problema sarebbe: sono raggiungibili? ma prima i set devono essere qualitativamente buoni — di un set con due film che non c'entrano niente l'uno con l'altro non me ne faccio nulla».

**Ha ragione, e le sezioni 2 e 4 qui sopra sono sbagliate nella lettura.**

Il lift di co-occorrenza misura **due cose insieme**:
- **coerenza** — i titoli c'entrano l'uno con l'altro (somiglianza)
- **portata** — abbastanza persone li hanno visti (volume di utenti)

Una foglia di due film di nicchia *perfettamente coerenti* ha co-occorrenza bassa e lift basso. Il mio numero la bocciava per un problema di portata. Misurato separatamente (`coerenza-foglie.py`):

| dimensione | foglie | **COERENZA** (cos. media fra i membri) | titoli a caso | **PORTATA** (utenti con ≥2 membri) |
|---|---|---|---|---|
| 2-5 | 165 | **0,647** | 0,010 | 2 |
| 6-10 | 594 | **0,682** | 0,004 | 14 |
| 11-20 | 1.264 | **0,709** | 0,002 | 22 |
| 21-40 | 1.051 | **0,682** | 0,004 | 60 |
| 41-80 | 124 | 0,456 | 0,003 | 199 |
| 81-150 | 33 | 0,427 | 0,003 | 299 |
| 151+ | 7 | 0,404 | 0,004 | 1.509 |

**Le foglie piccole sono le PIÙ coerenti e le MENO raggiungibili.** È l'esatto contrario di quello che avevo scritto: non sono "residui incoerenti", sono insiemi giusti che quasi nessuno raggiunge. E le grandi, che avevo chiamato "le parti migliori", sono le più **lasche** (0,404 contro 0,709), solo molto più frequentate.

*(Il nullo della coerenza è ~0 per costruzione — lo spazio Pc è centrato per medium — quindi non si usa un rapporto: si legge la coerenza assoluta. Un "lift" su un nullo nullo è un numero finto, ed è il secondo errore che avevo commesso.)*

**Lettura diretta di foglie piccole** (dal campione dello script, che le stampa per essere lette):

| foglia | coerenza | utenti | titoli | cosa sono |
|---|---|---|---|---|
| 679 | 0,858 | 4 | *Joueuse · Je vous trouve très beau · La fée · Parisienne · On My Way* | cinema francese |
| 504 | 0,905 | 10 | *Tschick · La Crème de la crème · Amici d'infanzia* | commedie teen franco-tedesche |
| 2275 | 0,863 | 12 | *Pippo nel pallone · Le papere di Bugs · Garfield · Heathcliff* | cartoni animati |
| 1352 | 0,785 | 1 | *Un duro per la legge · Day of the Panther · Bloodmatch* | action di serie B |
| 2731 | 0,799 | 1 | *Nobunaga Concerto · Akudama Drive* | azione giapponese |
| 1220 | 0,295 | 217 | *Assassinio sul Nilo · Perfect Stranger · Freies Land* | gialli — e infatti è la più lasca della lista |

Non sono insiemi casuali. Sono insiemi **giusti e piccoli**.

## I quattro quadranti

| | poco raggiungibili | raggiungibili |
|---|---|---|
| **coerenti** | **727 foglie (22,5%)** — dimensione mediana 13, 58% dei membri in MovieLens | 892 (27,5%) |
| **incoerenti** | 505 (15,6%) — 39% dei membri in MovieLens | **1.114 (34,4%)** — qui la portata c'è: sono da sistemare |

**Correlazione coerenza/portata: −0,299.** Le due cose si escludono. Un numero solo non poteva misurarle.

Nota di onestà: "incoerente" qui significa *sotto la mediana* (0,744). Una foglia da 366 titoli a 0,404 sta comunque ~100 volte sopra il caso: nessuna foglia dell'albero è spazzatura. Sono lasche, non sbagliate.

## Cosa ne segue

La sua ipotesi è quella giusta: **se i set sono coerenti, il problema è la raggiungibilità** — cioè un problema di attivazione/spreading, non di qualità degli insiemi. La domanda diventa: dato un utente che ha già visto un membro di una foglia coerente, l'attivazione raggiunge gli altri membri? È il test da fare adesso.
