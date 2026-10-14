# Ticket 01-02 — La mappa pesata, e la lettura dei quartieri

`Status: resolved` · 14/10/2026 · esito di `01-02-pesata.py` (log in `log/01-02-pesata.log`)

**Esito: la mappa pesata funziona, e i quartieri sono mondi.** Il taglio per peso tiene la mappa in
**una sola componente** (era il vincolo del ticket 23 di `grafo-servibile`), il ginocchio sale da
**1,074 a 1,24**, e leggendo i vicini si riconoscono fantasie anni '80, seinen anime, K-BL e K-drama.

**Ma il ginocchio a 6 o 8 non esiste.** Il rapporto `w_k/w_k+1` è massimo a **k=2** (1,218) e decresce
sempre: 1,11 a 4, 1,074 a 6, 1,082 a 8, 1,057 a 12, 1,037 a 20. **La struttura a otto slot è una
scelta della UI, non una struttura del dato** — e va detto, perché nessun parametro la giustifica.

---

## I pesi

| | |
|---|---|
| archi | 1.249.858 su 1.319.500 coppie = **94,7%** |
| mediana del peso | **0,066** |
| media | 1,17 · massimo 2.073,5 |
| archi con peso < 0,1 | **714.466 (57,2%)** |
| 99° percentile | 20,54 |
| il **top-8** di ogni bolla | tiene il **40,9% del peso** con l'**1,0% degli archi** |

Il 57,2% degli archi ha peso sotto 0,1: la saturazione del ticket 07 è confermata, e la coda è
pesante. Il top-8 per bolla prende il 40,9% del peso totale — un taglio **non** gratuito, ma che
conserva il grosso della struttura in un centesimo degli archi.

*(Correzione al ticket 07: là avevo scritto «la mediana del peso è 0,0». Era la mediana degli archi
di **una** bolla — la 1313. Sul grafo intero è 0,066. Il senso non cambia, il numero sì.)*

## Il ginocchio: non c'è

| k | w_k/w_k+1 | peso tenuto |
|---|---|---|
| **2** | **1,218** | 18,0% |
| 4 | 1,110 | 28,0% |
| 6 | 1,074 | 34,9% |
| 8 | 1,082 | 41,7% |
| 12 | 1,057 | 49,4% |
| 20 | 1,037 | 60,8% |
| 64 | 1,014 | 82,2% |

Il rapporto **decresce monotonicamente**: il "gradino" più forte è a k=2, ed è debole. Questo grafo
non ha una scala caratteristica — è un **continuum pesato**, non una struttura a grappoli collegati da
pochi ponti. **Nessun k è giustificato dai dati**, quindi la scelta di 6+2 va dichiarata come
**convenzione di prodotto** (otto slot per una riga di carosello), non come proprietà del grafo.

## Le costruzioni a confronto, e la connettività

Il vincolo è quello del ticket 23 di `grafo-servibile`: la mappa deve restare **navigabile**.

| costruzione | archi | grado mediano | componenti | peso tenuto |
|---|---|---|---|---|
| soglia al 50° pct (0,07) | 624.930 | 361 | **1** | 99,2% |
| soglia al 90° pct (1,45) | 124.986 | 66 | 5 | 86,8% |
| soglia al 99° pct (20,54) | 12.500 | 6 | **206** ✗ | 46,8% |
| **top-4 per bolla, unione** | 6.500 | 5 | **1** | 28,8% |
| **top-8 per bolla, unione** | 13.000 | 10 | **1** | **40,9%** |
| top-12 per bolla, unione | 19.500 | 15 | **1** | 48,7% |
| top-20 per bolla, unione | 32.500 | 25 | **1** | 58,7% |

**La soglia frammenta, il top-k no.** Alla soglia del 99° percentile la mappa esplode in **206
componenti** — è la stessa frammentazione che il ticket 23 aveva misurato col k-NN **mutuo**. Il
**top-k per bolla con unione simmetrica** invece tiene **una sola componente** a ogni k provato, ed è
quindi la costruzione giusta: sparsa **e** navigabile.

## La mappa finale

```
la mappa 6+2: 20.918 archi · componenti 1 · la piu' grande 1.625/1.625 (100,0%)
coppie asimmetriche: 0
e il ginocchio SU QUESTA mappa: w6/w7 mediano 1,24   (sull'adiacenza binaria era 1,074)
```

Ventimila archi invece di 1.249.858 — **60 volte più sparsa** — tutta raggiungibile, e con un ginocchio
**17% più netto**. Non è un ordine di grandezza migliore, ma è la differenza fra una mappa che
seleziona e una che non seleziona.

## I quartieri, letti

La parte che i numeri non dicono. Sei bolle note, e i loro sei vicini intra-medium **per peso**:

**Bolla 750 — il fantasy/avventura anni '80** (I Goonies, Labyrinth, Highlander):

| vicino | peso | dentro |
|---|---|---|
| 687 | 57,6 | Stand by Me, Una poltrona per due |
| 833 | 49,4 | X-Files - Il film, Phenomenon |
| 1249 | 39,4 | **I predatori dell'arca perduta, Indiana Jones e il tempio** |
| 1590 | 29,6 | Tesoro, mi si sono ristretti |
| 439 | 29,1 | La bella addormentata nel bosco, Il gobbo di Notre Dame |
| 749 | 27,1 | Hercules - Il guerriero, Percy Jackson |

**Bolla 525 — il seinen anime** (G.I. Samurai, SPY×FAMILY, Golden Kamui):

| vicino | peso | dentro |
|---|---|---|
| 622 | 119,4 | Demon Slayer, Jujutsu Kaisen 0 |
| 555 | 111,5 | **Monster, Death Note** |
| 1078 | 76,9 | Blood+, **Berserk** |
| 406 | 65,1 | Blue Exorcist, Monogatari |
| 959 | 55,9 | 86 Eighty Six, NieR:Automata |

**Bolla 738 — il K-BL** (Equals, Tune in for Love, My Love Mix-Up!):

| vicino | peso | dentro |
|---|---|---|
| 933 | 281,6 | **HIStory**, สถานะกั๊กใจ |
| 946 | 104,3 | Weak Hero, True Beauty |
| 846 | 91,7 | 오늘부터 인간입니다만, 비밀 사이 |
| 654 | 77,4 | Love O2O |
| 446 | 48,7 | **Your Name Engraved Herein**, his |

E ancora: **775** (K-drama: 응답하라 1988) → **Mr. Sunshine, Goblin, Alchemy of Souls, Tale of the
Nine Tailed**; **981** (rom-com anime) → The Angel Next Door, Rent-a-Girlfriend, Welcome to Demon
School; **1090** (Star Wars serie) → **LEGO Star Wars**, Marvel Studios Expanding, The Boys, Space
Wars/Galaxina.

**I vicini sono mondi.** Con del rumore — la bolla 1313 (Guerre stellari) ha fra i primi sei
*Cimarron* (1931) e *Dopo la prova* — ma le prime posizioni sono sistematicamente giuste, e in due
casi il vicino più pesante è esattamente il gemello del mondo (*Monster/Death Note* per il seinen,
*Indiana Jones* per l'avventura anni '80).

## Cosa resta vero del ticket 07

La saturazione **dell'adiacenza** resta: il grafo ha il 94,7% delle coppie con un arco, e nessuna
soglia lo rende rado senza frammentarlo (a parte il top-k, che però **non è una soglia** ma un vincolo
di grado). La differenza è che ora la mappa che si usa non è quella.
