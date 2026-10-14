# Ticket 09 — Le bolle-continente: il sub-clustering

`Status: resolved (parte 4 di 4 — le parti 1-3 richiedono la ricostruzione, vedi in fondo)` ·
14/10/2026 · `09-subclustering.py` (log in `log/09-subclustering.log`)

**Il sub-clustering funziona, e l'arbitro che avevamo non sa giudicarlo.** Il true crime da 205
titoli si divide in otto mondi leggibili, la bolla 594 separa i western dagli horror. Ma `N_eff`
**peggiora su ogni tropo** (true crime 8,32 → 26,73; film noir 35,35 → 76,51) perché conta *bolle*, e
uno split sensato ne crea di più. **`N_eff` è monotono nel numero di bolle: non può arbitrare questa
intervento.** Va detto prima dei numeri, perché li rende inutilizzabili.

E la bolla 820 **non si divide**, perché non è una chimera: PMI mediana **+0,880**.

---

## Tre correzioni alla ricetta del senior

**1. La soglia di 60 titoli esclude proprio le due bolle che vuole vedere divise.** La 820 ne ha
**46**, la 594 ne ha **51**. Il bersaglio non è la taglia: è la **chimera**, che è ciò che lui stesso
descrive («due mondi incompatibili incollati da un terzo fattore») e che l'indice del ticket 03
misura. Con la soglia sulla taglia: 264 bolle. Con la chimera: 44. In unione: **296**.

**2. La risoluzione RB non si trasferisce ai sottografi.** La prima esecuzione con `RB 100` (la
risoluzione di V8) ha **frantumato tutto in singoli**: 1.625 → **31.908** bolle, mediana **1**. La
risoluzione è nella stessa unità dei pesi, e un sottografo da 100 nodi non è il grafo da 66.259.
Dividendo i pesi per la loro media — così «risoluzione 1» significa la stessa cosa su ogni bolla — e
cercando dal basso, si arriva a **2.887 bolle, mediana 19, la più grossa 262**.

**3. Il criterio del tetto era troppo largo.** Con `len/3` e una scala che partiva da 0,5 uscivano
~21 pezzi per bolla (7.402 bolle, mediana 3). Il tetto buono è `max(12, min(70, len/2))`, e la scala
parte da 0,03.

## Cosa si divide, e come

**La bolla 12 — true crime, 205 titoli → 8 pezzi** (RB 1.0). Ed è il risultato che conta:

| pezzo | titoli | dentro |
|---|---|---|
| 0 | 56 | American Murder, Missing, Trust Me, La mia fuga da Scientology |
| 1 | 42 | VICE, Dirty Money, The Anarchists, Exterminate All the Brutes |
| 2 | 35 | Dear Mama, Challenger, George Carlin, Reality Check |
| **3** | 29 | **The Jinx, Tiger King, O.J.: Made in America, Jeffrey Epstein, The Staircase** |
| 4 | 24 | Unsolved Mysteries, I AM A KILLER, Time: The Kalief Browder Story |
| **6** | 7 | **Ted Bundy, Conversazioni con un killer, Sulla scena del delitto** |
| **7** | 3 | **The Clinton Affair, Trump: Unprecedented, The Fourth Estate** |

Un «true crime» generico è diventato **i documentari-caso celebri**, **i serial killer**, **la politica
americana**, **le inchieste economiche**. Il pezzo 3 è esattamente il mondo che un umano nominerebbe.

**La bolla 594 — spaghetti western → 5 pezzi** (RB 1.0): i western da una parte (*Django il
bastardo*, *Mannaja*, *Per pochi dollari ancora*, *Una pistola per cento bare*), e l'horror
distribuito. A RB 2.0 l'horror si separava del tutto (*Demoni 3* da solo). **La chimera si ripara.**

**La bolla 750 — fantasy anni '80, 41 titoli → NON divisa.** È il controllo negativo, e passa: sotto
la soglia e con PMI positiva, resta intera.

**La bolla 820 — il minestrone di Verity → NON divisa**, con PMI mediana **+0,880**. Non è una
chimera: i suoi token di testa (*Inception*, *Fight Club*, *Gone Girl*, *Shutter Island*, *Memento*)
sono **compatibili fra loro**. È un minestrone **coerente**, e questo distingue due difetti diversi
che finora avevamo chiamato con lo stesso nome:

- la **chimera**: due mondi incompatibili incollati (594) → l'indice di chimera la trova, e lo split la ripara;
- il **canone**: un mondo vero ma troppo largo, tenuto insieme dalla popolarità (820) → **nessun
  indice di token lo vede**, perché i token sono d'accordo. Serve un criterio **per membro** — quanto
  un titolo è lontano dagli altri della sua bolla — o il giudizio umano.

## Il verdetto sui numeri

```
tropo                        prima     dopo
kw:psychological thriller   101.78   118.53   +16.75
kw:film noir                 35.35    76.51   +41.16
kw:true crime                 8.32    26.73   +18.41
kw:spaghetti western         11.39    20.45    +9.06
kw:iyashikei                  7.81     7.86    +0.05
N_eff mediano su 800 ancore   42.2     45.0
```

**Peggiora ovunque.** E il caso del true crime spiega perché: il tropo `kw:true crime` portava 334
titoli in **8 bolle** (N_eff 8,32); dopo lo split quegli stessi titoli stanno in **più** bolle, perché
il mondo è stato diviso in sottotemi che il tag non distingue. **`N_eff` misura la frammentazione del
tag, non la qualità dei mondi**, e un intervento che migliora i mondi la fa salire per costruzione.

L'arbitro giusto per questa decisione **non esiste ancora**: sarebbe la coerenza per esemplari del
ticket 07 (che separa i vicini veri dai falsi) applicata **dentro** una bolla, per decidere se i suoi
membri formano uno o più gruppi coesi. È il prossimo passo, e va costruito prima di adottare V8sub.

## Cosa resta delle parti 1-3 (richiedono la ricostruzione)

La maschera estesa a `CF`/`LIST`/`B`/`TV`, la severità di V7 ripristinata, e la quarantena NSFW: tutte
e tre agiscono **dentro** la costruzione dei componenti, quindi richiedono la ricostruzione completa
della partizione — 502 s e **11 GB di picco** l'ultima volta, e la macchina è già stata al limite. Non
fatte qui, e non perché non si volessero.

V8sub è salvata in `bolle-nitrile-V8sub.npy` (2.887 bolle) **come esperimento, non come candidata**:
finché l'arbitro non esiste, adottarla sarebbe scegliere col metro che abbiamo appena visto sbagliare.
