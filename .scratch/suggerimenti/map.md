# Mappa: il meccanismo dei suggerimenti — il grafo come substrato

**Aperta**: 15/10/2026 · **Natura**: progetto — **niente in `src/`** finché il quadro non è confermato
**Origine**: una sessione di `grilling` sul meccanismo dei suggerimenti. Dieci decisioni in fila, ognuna
con la sua misura. Il modulo `graph/` è il **punto di partenza**, non di arrivo.

## Destination

Uno **storico utente pesato** entra; un **portafoglio di mondi accesi** esce — ogni mondo con i suoi
titoli e un peso di attivazione. Il prodotto compone le liste da quel portafoglio, secondo il tipo del
profilo. Il grafo **non decide cosa mostrare**: decide **dove guardare**.

Il criterio di riuscita, dichiarato dal proprietario: un grafo **perfettamente coerente** su cui
caricare uno storico restituisce un **sottoinsieme ordinato del grafo stesso**.

## Decisions so far

### 1. Il substrato: titolo per titolo, aggregato alle bolle

La diffusione cammina sui **13.253.674 archi** fra 66.259 titoli (il triangolo più la sua trasposta) e
l'attivazione per bolla è una **somma sui membri**. L'alternativa — camminare sulla mappa delle bolle
(45.194 archi) — perde la risoluzione dentro la bolla e con essa l'ordine dei titoli.

Misurato: **10,8%** degli archi (718.563) sta *dentro* una bolla, con densità media **37,0%** delle
coppie possibili contro lo **0,151%** del grafo intero. Il sottografo che torna è reale, non una foglia.

### 2. I mestieri del livello bolle: tre su quattro

| mestiere | perché |
|---|---|
| **Rendere leggibile la massa** | a livello di titolo la massa è piatta (59 titoli sopra 0,1%, 765 sopra 0,01%): oltre i primi ~60 l'ordine è rumore. Le bolle la riconcentrano |
| **Porta d'ingresso per i titoli nuovi** | il grafo è costruito sul comportamento; un'uscita di domani non ha archi. La collocazione (11,4 ms, ~90/100 all'occhio) è l'unica risposta che abbiamo |
| ~~Rilevatore: "ha un mondo o no"~~ | **RITIRATO**: la quota del mondo di testa prende il 24,7% con 10 semi coerenti e il 5,0% con 10 casuali, ma **2,9% con uno storico vero da 100 titoli**. Il numero dipende da *quanti* semi ci sono, non da quanto sono coerenti. Non è un rilevatore |
| ~~Vincolare la camminata (gate)~~ | scartato: il segnale c'è già senza (170× di densità interna contro il caso) e il gate toglierebbe la proprietà più utile — i mondi vicini si accendono da soli |

### 2b. IL CONTRATTO DI RITORNO — misurato, non discusso

`graph/measure/soglia.py`, 120 utenti, α = 0,60. Il pacchetto che un mondo acceso deve portare:

| campo | perché |
|---|---|
| **la bolla** | l'identità del mondo |
| **attivazione grezza** | quanto è acceso. È questo che ordina |
| **i membri ordinati per la loro attivazione** | il dentro del mondo, e l'ordine esce dallo stesso giro |
| **la mediana dei voti del mondo** | la fascia di canone (mainstream ↔ nicchia): è la stratificazione già validata (p90/p10) |
| **i vicini sulla mappa** | il quartiere, per le liste "un passo fuori" |

**Non** `attivazione per membro` — misurato e **scartato**: il grezzo trova più titoli nascosti (7% contro
4%) e colpisce più spesso (50% contro 40% dei primi 10 mondi). Il timore che l'aveva giustificata — i
mondi grossi che vincono per dimensione (250× misurato con semi casuali) — **con un utente vero non si
materializza**: i primi 10 mondi per grezzo hanno taglia mediana **12**, non 123.

### 2c. LA SOGLIA NON ESISTE — e il numero che lo dimostra

| soglia | mondi accesi dall'**utente** | da una storia **casuale** di pari dimensione | rapporto |
|---|---|---|---|
| 0,50% | 44 | **48** | 0,9× |
| 0,20% | 82 | 94 | 0,9× |
| 0,10% | 125 | 138 | 0,9× |
| 0,01% | 464 | **525** | 0,9× |

**Una storia finta accende più mondi di una vera, a ogni soglia.** Non è un errore: 168 titoli a caso
spargono la luce, 168 titoli *tuoi* la concentrano. Quindi «quanti mondi si accendono» **non misura il
gusto, misura quanto è lunga la storia** — ed è per questo che il tetto dei 15 titoli (`todo/8`) cambia
la *dimensione* del portafoglio, non solo l'ordine.

Conseguenza: **non esiste una soglia assoluta onesta**, e *il numero di liste lo decide chi invoca* —
la decisione del proprietario era giusta dal principio.

**Quello che discrimina davvero** (e va usato come criterio, non la soglia): i primi 10 mondi contengono
un titolo che l'utente guarderà davvero nel **50%** dei casi, contro lo **0%** di una storia casuale.

### 3. Il portafoglio lo decide il modello del profilo

Il vertice della classifica dei mondi è **piatto e instabile**: due metà della stessa storia si
accordano su un Jaccard di **0,25**, e i 15 semi contro la storia intera danno **0,11**. Il tetto dei 15
costa, ma **non è la causa principale** dell'instabilità: ordinare nella coda è un lancio di moneta per
chiunque. Un utente pesante ha **~7 mondi sopra il 2%** della storia, **26 sopra lo 0,5%**, e ne tocca
**90**. Il numero di liste e la loro distanza li decide il tipo del profilo, non un top-k fisso.

### 4. Il tipo del profilo: cinque assi, da dichiarato + dedotto

`.scratch/../todo/9_assi_del_profilo.md` — onboarding con **due slider** (informazione nuova) più la
deduzione dalla cronologia. Il grafo sa già dire due assi **da solo**, misurati su 12 utenti MovieLens
veri:

| asse | spread fra utenti | stabilità fra due metà della storia |
|---|---|---|
| **canone** (mediana voti della storia) | 4,8× (2.682 → 12.923) | **0,87** |
| **forma** (quanti mondi ≥ 2%) | 2,8× (4 → 11) | **0,82** |
| entropia | 1,2× | 0,89 — **stabile e inutile**: non distingue |
| concentrazione della testa | 3,6× | 0,48 — è la coda instabile |

Avvertimento che vale ancora (`.scratch/ocean-prototipo/`, 4 test): un OCEAN come **spazio** è
smentito (coseno medio 0,63 contro 0,03; *Mad Max* → *Sister Act*), come **descrizione** funziona. I
cinque assi servono a **instradare**, non a ordinare i titoli.

### 5. Dove gira: notte il grafo, giorno la diffusione

**Notte** — il grafo si aggiorna e i titoli nuovi vengono collocati (l'unico passo che ha bisogno dei
centroidi densi, 455 MB smontati: è un'ingestione in blocco).
**Online** — il prodotto carica un artefatto binario e fa la camminata per profilo, con **cache TTL 12
ore**. In RAM: miscela (~107 MB), partizione (0,3 MB), mappa (0,5 MB).

### 6. I titoli nuovi ereditano la loro bolla — e nei due versi

Non entrano nel grafo come nodi. Prendono l'attivazione della **loro** bolla e si ordinano dentro per
somiglianza micro (V3). Se un titolo nuovo è nella **storia**, è lui a seminare: senza archi non accende
niente, quindi semina i compagni di bolla. **Una sola regola, entrambe le direzioni.**

Perché non gli archi sintetici, misurato: un arco conta **solo se sta nel top-16 della riga di
destinazione** (l'86% degli archi di saga ci sta, rango mediano **2%**). Sotto quella soglia non porta
massa misurabile. Metterlo forte significherebbe **scacciare un arco vero** — e le saghe occupano già
l'86% delle prime sedici posizioni.

### 7. La potatura: top-16 per riga

| | pieno | **top-16** | top-48 |
|---|---|---|---|
| archi | 13.253.674 | **1.529.390 (12%)** | 4.206.348 |
| costo della camminata | 1× | **8,7× meno** | 3,2× meno |
| massa che resta sui compagni di saga | 26,6% | **47,8%** | 32,0% |

Contro lo **0,011%** di un titolo qualunque: le saghe sono a ~2.400× nel pieno e ~4.400× potate.
Potare non perde i legami forti, **li rafforza**.

### 7b. α = 0,60 — misurato su 120 utenti, non scelto a intuito

`graph/measure/alfa.py`: 120 utenti Trakt, metà storia a seminare e metà nascosta come bersaglio, e un
insieme **casuale di pari dimensione** come termine di paragone. Il `lift` è quante volte più massa cade
sui titoli che l'utente guarderà che su titoli a caso.

| α | lift titoli | lift bolle | rango mondi nascosti | mondi accesi | **luce sprecata sui già visti** |
|---|---|---|---|---|---|
| 0,20 | 20,7× | 7,61× | 300 | 32 | 28% |
| 0,40 | 26,8× | 8,92× | 291 | 41 | 48% |
| **0,60** | **29,3×** | **9,48×** | **288** | 46 | **65%** |
| 0,75 | 30,9× | 9,71× | 294 | 49 | 78% |
| 0,90 | 31,8× | 9,92× | 295 | 50 | **91%** |

**La decisione**: α = 0,60. Da 0,6 a 0,9 il lift sale di +8,5% (dentro il rumore) e la luce sprecata va
dal 65% al 91% — si paga tutto e non si compra quasi niente. E il rango dei mondi nascosti ha il suo
massimo proprio a 0,60. Il valore che l'autore aveva impostato a intuito era 0,15, **peggio su tutto**
(20,7× contro 29,3×).

**Due metriche da NON usare, imparate qui**:
- **la stabilità** dei 10 mondi di testa fra due metà: ferma a 0,33 per ogni α tranne 0,15 (0,43) —
  **premia l'output generico** (con α basso la luce finisce nei mondi popolari, uguali per tutti).
- **la quota della bolla di testa** — già **ritirata** come "rilevatore" (§2): dipende da quanti semi
  ci sono, non da quanto sono coerenti.

**Il numero da portare a casa è il lift: 29×.** Avvertenza dichiarata: i titoli nascosti *sono* nel
grafo, quindi la misura dice «la diffusione ritrova i mondi che l'utente vive partendo da mezza storia»,
non «indovina film mai visti».

### 8. Il criterio di riuscita: la lettura dei risultati su storie vere

Non un banco astratto: **il giudizio** su suggerimenti veri, contro la storia dell'utente considerato.
Le cronologie sono in casa — **3.676 utenti Trakt**, 3 GB, con `last_watched_at` (data per voce) e
`plays` (ri-visioni). Il giudizio lo può dare l'agente leggendo, senza simulatore e **senza `src/`**.

Limite dichiarato: i file sono **troncati a 300 voci** (`total_count` dice il totale vero), quindi la
"storia" è l'ultima parte — sufficiente per un taglio temporale, da tenere presente nelle conclusioni.
Il banco a taglio temporale (seme = prima di T, bersaglio = dopo T) resta come **misura ausiliaria** per
scegliere fra varianti, dove l'occhio non scala.

### 9. Le due trappole già note, che valgono anche qui

- **Il triangolo è la metà di un grafo non orientato** (tutti gli archi hanno `col > row`, zero sulla
  diagonale): la direzione è stata persa nel salvataggio, non nel dato. Per ora si cammina non orientati.
- **Le bolle non hanno id stabili fra partizioni**: la partizione e i centroidi sono un artefatto solo,
  e il contratto (`canon.assert_partizione`, sha256 nelle impronte) lo rende un errore invece di un
  risultato sbagliato. La mappa dichiara dentro di sé partizione e triangolo.

## Not yet specified

Con la mia raccomandazione, da confermare o ribattere:

1. ~~Il contratto di ritorno~~ — **CHIUSA**: bolla · attivazione grezza · membri ordinati · mediana
   dei voti · vicini sulla mappa. «Per membro» misurato e **scartato** (§2b).
2. ~~La soglia del portafoglio~~ — **DISSOLTA**: non esiste una soglia onesta, il numero di liste lo
   decide chi invoca (§2c).
3. **Il peso dei semi.** Cosa pesa un titolo della storia: recenza (`last_watched_at`), ri-visioni
   (`plays`), il tipo di segnale (loved/liked/watched/library)? *Raccomando: recenza × ri-visioni, e il
   decadimento di `todo/8` — ma il peso va misurato.*
4. **Il freddo** (0-3 semi). *Raccomando: il grafo non risponde, e lo dice; il prodotto ricade sulle
   regole attuali, e va detto che sono imbarazzanti (report 04: voto B 68).*
5. **I tipi di lista.** Il portafoglio li rende possibili quasi gratis (il mondo, il quartiere, la
   fascia alta di voti, la fascia bassa, i ponti cross-medium). *Quali* mostrare è decisione di prodotto.
6. **La cache a 12 ore: su cosa si invalida.** Una visione nuova cambia il portafoglio — ma non sempre
   in modo visibile (misurato: 0 cambi su 20 col decadimento di `todo/8`).
7. **Il contenuto dei due slider** (`todo/9`): scelti per **instradare**, non per descrivere.
8. ~~α dopo la potatura~~ — **CHIUSA**: α = 0,60, misurato su 120 utenti (§7b).

## Out of scope

- **L'integrazione in `src/`**: è il lavoro di produzione, complesso, e non si fa ora.
- **Il frontend della creazione profilo** (gli slider): registrato in `todo/9`, non si fa qui.
- **Il costo dell'annotazione OCEAN** (questionario nuovo o annotazione LLM): registrato in `todo/9`.
- **Il riscrivere preset e hero del prodotto**: il meccanismo nuovo convive con quelli, non li sostituisce
  in questa fase.

## Il primo passo, quando si parte

**La lettura su una storia Trakt vera.** Caricare un utente, far girare la diffusione, leggere il
portafoglio e dire se è congruo alla sua storia. Costa un'ora di lavoro e dice subito se il meccanismo
regge — o se le dieci decisioni di cui sopra vanno riviste prima di scrivere qualunque altra riga.
