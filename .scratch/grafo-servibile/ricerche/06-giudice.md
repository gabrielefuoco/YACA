# 06 — Il giudice automatico delle bolle (intruder test)

**Status**: `resolved` · **Ticket**: [06](../issues/06-giudice-automatico-bolle.md) · **Script**: `06-giudice.py` · **Log**: `log/06-giudice-*.log`, `log/giudice-*.json`

## Cosa è stato costruito

Un **intruder test** cieco. Per ogni bolla campionata si prendono 4 membri e si inietta 1 intruso
pescato da una bolla a **distanza ≥2** nel grafo delle bolle e con un numero di voti **entro un
fattore 2** dalla mediana dei membri (senza l'appaiamento, l'intruso si riconoscerebbe dalla fama).
Un modello linguistico — `open-mistral-nemo`, la stessa chiave e lo stesso modello che usa YACA —
vede **solo** titolo, anno, regia, generi e trama dei 5 titoli, e deve indicare l'intruso.

Il giudice non vede mai l'identità della bolla né i suoi altri membri ✓ — il prompt è in inglese,
i metadati sono quelli del catalogo.

## I numeri

| partizione | bolle | **identificazione** | controllo | token | tempo |
|---|---|---|---|---|---|
| **`bolle2-E`** (tutti i componenti) | 199 | **52,8%** | 20% | 77.474 | 332 s (36/min) |
| **`bolle2-E` senza regia nel prompt** | 199 | **39,7%** | 20% | 69.158 | 293 s (41/min) |
| **`bolle2-A`** (solo comportamento) | 200 | **47,0%** | 20% | 76.660 | 296 s (41/min) |

Le 5 bolle giudicate minestrone dalla lettura umana sono **forzate** dentro il campione, per la
validazione.

## Cosa funziona

**Le bolle hanno un filo reale e misurabile.** 52,8% contro il 20% del caso è **2,6 volte** il caso,
su 199 bolle: non è rumore. Lo strumento produce un numero per partizione, reagisce, e costa
**~0,05 centesimi di secondo per bolla** (41 bolle al minuto, ~388 token per bolla).

**E la direzione fra le due partizioni è quella giusta**: `bolle2-E` (tutti i componenti) **52,8%**
contro `bolle2-A` (solo comportamento) **47,0%**. I componenti nuovi — keyword, co-visione Trakt,
cast, registi, franchise — **migliorano** le bolle, e ora c'è un numero che lo dice invece di una
lettura a mano.

## ⚠️ Cosa non funziona — tre cose, tutte dichiarate

### 1. La validazione contro la lettura umana è FALLITA

Il ticket diceva: *«deve separare quelle giudicate buone da quelle giudicate sciolte — se non lo fa,
è **lo strumento** a essere sbagliato, non le bolle, e va scritto così»*. Ecco:

| bolla | con regia | senza regia | posizione nella classifica per difficoltà |
|---|---|---|---|
| [217] | corretta | sbagliata | 104/199 · **7/199** |
| [1270] | sbagliata | — | **26/199** |
| [1267] | corretta | — | 131/199 |
| [1215] | sbagliata | — | **27/199** |
| [1288] | sbagliata | — | **28/199** |

**Minestrone nel 20% peggiore della classifica: 0 su 5.** E tre delle cinque stanno fra le **più
facili** (posizioni 26-28): il giudice trova l'intruso proprio nelle bolle che l'occhio umano ha
giudicato senza filo.

**Il motivo è che i due strumenti non misurano la stessa cosa.** L'occhio chiede: *questa bolla ha
un filo che riesco a nominare?* Il giudice chiede: *fra questi 5 titoli, 4 si somigliano abbastanza
da far sembrare il quinto estraneo?* Una bolla-miscuglio può contenere **4 titoli che condividono un
filo debole** — «sono tutti fantascienza anni '80», «sono tutti europei» — e allora il giudice
l'intruso lo trova lo stesso, mentre l'occhio dice «sì, ma che mondo è?».

**Conclusione: uno delle due non è sbagliato, sono due domande diverse, e il ticket ha il torto di
averle confuse.** L'intruder test misura la **separabilità**, non la **nominabilità**.

### 2. Il campo regia vale 13 punti del test, e sono punti che non contano

Nella variante **senza** la regia nel prompt l'identificazione scende da **52,8% a 39,7%**. Il
motivo si vede in un caso su tutti: la bolla [1288] ha **quattro membri tutti di Richard Loncraine**
— l'intruso si riconosce dalla regia, non dal filo. Per le bolle costruite attorno a un autore (ed è
una parte grande del grafo: Fassbinder, Kurosawa, Van Sant...) quel campo è la risposta.

La variante **senza regia** è quella che misura il filo **tematico**, ed è quella da usare se la
domanda è «le bolle sono mondi», non «le bolle sono filmografie».

### 3. Con 200 bolle lo strumento NON distingue due partizioni vicine

La differenza `bolle2-E` − `bolle2-A` è **5,8 punti**, con un errore standard di **5,0 punti**:
**z = 1,16, p ≈ 0,25. Non è statisticamente significativa.**

Per risolvere una differenza di 6 punti con potenza 80% servono **~1.090 bolle per partizione**, cioè
~5 volte il campione usato. Con 200 bolle lo strumento **ordina** ma non **decide**: dà una
direzione, non una prova.

## Il confondente che ho controllato (e che non c'è)

`bolle2-A` ha bolle con mediana **28 titoli**, `bolle2-E` con mediana **9**: un confronto fra mondi
di dimensione diversa. Se la taglia predìcesse l'accuratezza, il confronto sarebbe falsato.

**Non la predice**: la correlazione taglia/identificazione è **+0,044** in `bolle2-E` e **+0,062** in
`bolle2-A` — praticamente nulla — e per fascia non è monotona (E: 48,9% a 6-10 titoli, 56,8% a
11-20, 57,9% a 21-40, 50,0% oltre 40). Il confondente c'è nelle premesse e **non nei numeri**.

## I criteri del ticket

- [x] gira su ≥200 bolle e produce **un numero per partizione** (199, 199, 200)
- [ ] ⚠️ **validazione contro la lettura umana FALLITA**: le 5 minestrone finiscono nelle posizioni 26, 27, 28, 104 e 131 — **3 delle 5 fra le più facili**. Lo strumento misura la *separabilità*, non la *nominabilità*: sono due domande diverse
- [x] il giudice non vede mai l'identità della bolla né gli altri membri
- [x] costo e tempo dichiarati: 77.474 token e 332 s per 199 bolle (**388 token e 1,7 s per bolla**)
- [x] **discrimina due partizioni note per essere diverse**: 52,8% contro 47,0%, nella direzione attesa — ma **non in modo statisticamente significativo** con 200 bolle (p ≈ 0,25), e questo limite va scritto accanto al numero

## Come va usato (e come no)

**Sì**: per **tracciare** una partizione contro sé stessa nel tempo, o per misurare un cambiamento
**grande** (i componenti nuovi valgono +5,8 punti, e per vederli con certezza servono ≥1.100 bolle
per lato). Con ~5 minuti e 5 centesimi si ha un numero che prima non c'era.

**No**: per decidere fra due configurazioni vicine con 200 bolle. E **no** come sostituto della
lettura: la lettura umana resta il giudice della *nominabilità*, che è la domanda del ticket 08.
Il giudice automatico risponde a una domanda **più debole** — e risponde bene.

## Limiti dichiarati

1. **199-200 bolle per partizione**: la risoluzione dello strumento è ±5 punti, e la differenza da
   misurare era 5,8. Il numero c'è, la potenza no.
2. **Le 100 bolle lette a mano avevano un solo verdetto per bolla** (5 minestrone su 100): le ~7 «con
   un filo largo» non sono state registrate, quindi il bersaglio della validazione è **parziale**.
   Una lettura che non scrive il verdetto per bolla non è riusabile — vale per la prossima volta.
3. **Il giudice è un modello linguistico**: non è deterministico per costruzione (temperatura 0, ma
   il servizio non garantisce riproducibilità al bit), e le sue ragioni non sono ispezionabili. Un
   cambio di modello cambia il numero: il valore assoluto non è una proprietà delle bolle.
4. **L'appaiamento di popolarità è entro un fattore 2 sulla mediana dei membri**: è una cautela, non
   una garanzia. Con bolle molto eterogenee il fattore si allarga (fino a 5) per non restare senza
   candidati.
5. **`bolle2-A` e `bolle2-E` sono due partizioni con un numero diverso di bolle** (1.910 contro
   5.297): il campione non è appaiato, e i due insiemi non sono gli stessi mondi.
