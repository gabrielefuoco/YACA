# 01 — La recall stratificata e la recall pesata per auto-informazione

**Status**: `resolved` · **Ticket**: [01](../issues/01-recall-stratificata.md) · **Script**: `01-recall.py prodotto` · **Log**: `log/01-recall-prodotto.log` · **596 s**

## Cosa è stato costruito

Quattro funzioni nuove nel modulo canonico, **accanto** alle vecchie (che restano intatte e sono
ancora quelle che misurano): `fasce`, `per_fascia`, `recall_stratificato_oro`, `recall_si_oro`,
`auto_informazione`, `ranghi_popolare` — più `voti()`, che rende la popolarità una funzione del
modulo invece di una cosa che ogni script va a leggere per conto suo.

Le fasce si calcolano **sul catalogo servito**, film e serie separatamente: le due scale di
popolarità non sono confrontabili (2.171 voti per entrare nella testa dei film, 719 per quella
delle serie).

| | titoli | testa (top 5%) | mezzo | coda | mediana voti |
|---|---|---|---|---|---|
| **FILM** | 49.709 | 2.487 (≥2.171 voti) | 9.972 | 37.250 | 59 |
| **SERIE** | 16.550 | 828 (≥719 voti) | 3.313 | 12.409 | 33 |

## I tre numeri, insieme — banco prodotto, 1.000 utenti

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| camminata **globale** | 6,00% | 29,56% | 63,31% | 87,85% |
| camminata **mezzo+coda** | 3,31% | 18,37% | 46,03% | 76,70% |
| camminata **auto-informazione** γ=0,5 | 5,78% | 28,70% | 62,06% | 87,00% |
| camminata **auto-informazione** γ=1,0 | 5,56% | 27,81% | 60,74% | 86,08% |
| **popolarità** globale | 1,70% | 10,30% | 30,55% | 59,27% |
| **popolarità** mezzo+coda | **0,00%** | **0,00%** | **0,00%** | **0,00%** |
| **popolarità** auto-informazione γ=1 | 1,25% | 7,98% | 25,21% | 52,64% |

## La prova che la stratificazione isola il segnale

**La popolarità fa zero su mezzo+coda a ogni N** — non «poco»: **zero esatto**. Tutti i suoi punti
sono nella testa del catalogo (top 5% per voti), che è esattamente ciò che la definizione di quella
fascia implica.

Conseguenza operativa: **il margine della camminata sopra la popolarità è 3,5× sulla metrica
globale (6,00 / 1,70) e infinito su mezzo+coda (3,31 / 0)**, mentre sulla metrica pesata per
auto-informazione sale a **4,4×** (5,56 / 1,25). La metrica pesata per rarità **aumenta** il
vantaggio del metodo sul banale: è la direzione giusta, ed è la prova che il peso funziona.

## ⚠️ La correzione all'esperto: l'effetto della rarità è 2×, non 8-15×

L'esperto stimava che indovinare un titolo di nicchia «valga 8-15 volte» indovinare uno famoso.
**Misurato: vale circa 2 volte.** L'auto-informazione va da **9,2 bit** (il titolo più votato) a
**21,5 bit** (il più raro) sui film — un rapporto di **2,3×** fra gli estremi, e di circa 2× fra la
testa e la coda.

Non è un difetto dell'implementazione: è che la probabilità naturale di un titolo è la **quota di
voti**, e su 49.709 film quella quota non è mai abbastanza piccola da produrre 8-15×. Il numero
dell'esperto probabilmente si riferisce a una popolarità misurata come *esposizione nelle
raccomandazioni*, che è molto più concentrata della quota di voti.

**Il peso funziona lo stesso** (il vantaggio sale da 3,5× a 4,4×), ma chi si aspetta 10× non lo
troverà, e va detto prima che lo cerchi.

## ⚠️ Il numero canonico NON si riproduce — e la causa è dimostrata

Il ticket chiede che «la recall globale esistente sia identica al decimale prima e dopo». La parte
amministrativa è a posto: le funzioni nuove si **aggiungono**, `recall_film`/`recall_curato`/
`recall_catalogo` non sono toccate di una riga, e i numeri restano identici qualunque sia l'ordine
di calcolo dei ranghi (verificato).

Ma il numero **archiviato** non torna:

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| `canone-misure.log` (12/10, 19:54) | 5,99% | 29,61% | 63,35% | 87,86% |
| oggi | 6,00% | **29,56%** | **63,31%** | **87,85%** |

**Due ipotesi, la prima sbagliata.**

1. *L'ordine di indice sul bordo della classifica* (`01-tie.py`, 575 s). **Falsa**: i titoli
   irraggiungibili sono **zero** (mediana 0 su 66.259), i due protocolli di rango scelgono gli
   **stessi** titoli in **1000/1000** casi a @10, @100 e @500, e danno lo stesso numero.
2. *Un componente del grafo è stato rigenerato dopo la misura.* **Vera, e dimostrata**
   (`01-causa.py`, 506 s): rifacendo la stessa misura con la **B vecchia** (`boot-B-3k.npz`,
   2.222.144 archi) esce **5,99 / 29,61 / 63,35 / 87,86** — esatto.

`boot-B.npz` è stato rigenerato il **13/10 alle 17:53** dal report 70 (da 2,2M a 4,0M archi: la
co-visione delle cronologie Trakt con le serie espanse), **dopo** la misura di riferimento del
12/10 alle 19:54. Il grafo canonico del prodotto contiene B a peso 1, quindi il numero film si è
mosso di 0,05 punti al @100.

## ⚠️ E una conseguenza: il quinto controllo obbligatorio è scritto male

La specifica impone un quinto controllo: *«quando un componente della parte serie cambia, i numeri
del catalogo film devono restare identici al decimale»*. **B è un componente della parte serie** —
la co-visione Trakt è serie→serie — **e ha mosso i numeri del catalogo film di 0,05 punti.**

Il controllo non è sbagliato nell'intenzione, è sbagliato nella frase: **in un grafo misto non
esiste un componente «della parte serie»**. B collega serie fra loro, ma la camminata ci passa
attraverso, e le serie sono raggiungibili dai film via CFst: la struttura delle serie **entra**
nel punteggio dei film. Il controllo vale solo per la **ricetta minima** (film = CF da solo), ed è
lì che il report 70 l'aveva verificato — correttamente.

Da riscrivere come: *«un componente che non tocca alcun titolo del catalogo servito non deve
muoverne i numeri»*. Che è vero, verificabile, e non dice una cosa falsa sul grafo.

## I criteri del ticket

- [x] la recall globale esistente è **identica** prima e dopo: le funzioni si aggiungono, i vecchi cammini di codice non sono toccati, e l'ordine di calcolo dei ranghi non cambia il risultato
- [ ] ❌ **il numero archiviato non si riproduce** — ma la causa è identificata, dimostrata e **non riguarda questo ticket** (`boot-B.npz` rigenerato dopo la misura). Il riferimento va riletto: `5,99 / 29,61 / 63,35 / 87,86` è valido **per la B vecchia**, che non esiste più
- [x] la baseline di popolarità fa ~100% dei punti sulla testa e **0,00%** su mezzo+coda — stampato come prova
- [x] ogni misura stampa i tre numeri insieme (globale / mezzo+coda / auto-informazione)
- [x] γ è configurabile e sono riportati **0,5 e 1,0** — il numero cambia di ~0,2 punti al @10 e ~1 punto al @100
- [x] un'etichetta chiara sul protocollo casuale (questa misura è sul banco prodotto a split casuale: i numeri **non** sono temporali)

## Limiti dichiarati

- **Il banco prodotto è a split casuale.** Questi numeri non sono quelli del prodotto: il
  protocollo onesto (temporale) sta nel ticket 03 e dà 2,87 / 18,21 / 46,14 / 77,93. Qui si sta
  misurando **lo strumento**, non la ricetta.
- **La fascia «mezzo+coda» è larga**: 47.222 film su 49.709 (95%). La testa sono 2.487 titoli, che
  è abbastanza per un @10 e **non** per un @2000 (2.487 < 2.000: la testa è quasi tutta dentro il
  top-2000, ed è il motivo per cui la sua recall a @2000 è 94%). La stratificazione è affidabile
  fino a @500; a @2000 va letta con cautela.
- **L'auto-informazione usa la quota di voti come probabilità.** È la scelta difendibile (la
  probabilità che un voto a caso cada su quel titolo), ma non è l'unica possibile, e il rapporto
  2× dipende da quella scelta.
- **Il catalogo serie non è stato misurato in questa esecuzione** (`prodotto` invece di `tutto`):
  le fasce e l'auto-informazione delle serie sono calcolate e stampate, ma la camminata serie
  richiede ~10 minuti in più e le sue metriche vanno ancora misurate.
