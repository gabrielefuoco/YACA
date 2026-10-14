# Ticket 05 — Il peso dei token: perché *Verity* finisce con *Cinquanta sfumature*

`Status: resolved` · 14/10/2026 · `05-peso-token.py`, `05b-coerenza.py`, `verity.py`

**Nato da un'obiezione dell'utente**, ed è l'obiezione più utile della sessione:

> «Verity non c'entra niente con Fight Club, Inception. Magari con Gone Girl sì, ma non è nella bolla
> giusta: è un thriller psicologico con qualche jump scare e tensione costante.»

Aveva ragione, e la diagnosi ha portato a una **correzione di rotta** che vale più del 35,3%.

---

## Cosa c'era di sbagliato in *Verity*, e di chi era la colpa

*Verity* ha 29 termini e **7 fuori vocabolario**. Il `colloca()` l'aveva messa nella bolla 820 — che
contiene Inception, Fight Club, Gone Girl, **Shutter Island**, Seven, The Truman Show, The Prestige,
American Psycho, Il cigno nero, Memento, Prisoners, **Eiffel** — cioè un minestrone di «film famosi
contorti», non un genere.

E il coseno era **0,069**: sotto la soglia di 0,08 che la mia stessa taratura del ticket 05 di
`todo-grafo` definiva «ipotesi, non risposta». **L'avevo presentata come il successo della sessione.**
Due errori in uno: il metodo ha sbagliato, e io ho letto il suo punteggio come se fosse un voto.

Guardando il vettore, le cause erano due e nessuna delle due nel centroide (che è la media, e di un
minestrone non può che essere un minestrone):

1. **Il cast dominava.** I vicini di *Verity* erano *Cinquanta sfumature di grigio* (stessa attrice:
   Dakota Johnson) e *WeCrashed* (Anne Hathaway). Un film veniva collocato per gli **attori**, non per
   quello che racconta.
2. **Le keyword rare e inutili dominavano.** `kw:baffled`, `kw:dreary`, `kw:tragic` hanno df 1-3,
   quindi idf quasi massimo, quindi pesavano più di `kw:psychological thriller` — che è il termine
   **esatto** con cui l'utente ha descritto il film, ed è nei suoi metadati.

Conseguenza meccanica: i **25 vicini più prossimi di Verity stanno in 24 bolle diverse**. Il segnale
non era solo rumoroso, puntava in ventiquattro direzioni.

## La cura, e il numero che la contraddice

Sei varianti misurate sul banco dei 600 (stessa macchina del ticket 06c, leave-one-out esatto):

| variante | propria bolla |
|---|---|
| **V0 com'è adesso** (df ≥ 2, idf pieno, tipi pari) | **35,3%** |
| V1 df ≥ 3 | 35,2% |
| V2 V1 + tetto all'idf | 35,2% |
| V3 V2 + **pesi per tipo** (generi ×1,5, cast ×0,4, case ×0,4) | **32,0%** ✗ |
| V4 V3 **senza il cast** | **32,0%** — *identico* |
| V5 V3 con i generi a ×2,5 | 30,5% ✗ |

Due cose da leggere:

- **V4 = V3**: togliere il cast **non cambia nulla** (192 successi su 192). La mia diagnosi «Dakota
  Johnson» spiegava il caso di *Verity*, non il comportamento generale del metodo. Era una storia
  convincente su un campione di uno.
- **Le correzioni che guariscono *Verity* peggiorano il banco di 3,3 punti.** Se mi fossi fermato al
  numero, avrei scartato la variante giusta.

## E allora chi ha ragione: il numero o l'occhio?

Guardando gli stessi titoli sotto le due varianti:

| | V0 (com'è) | V3 (pesi per tipo) |
|---|---|---|
| **Verity** | WeCrashed, Spoiler Alert, Hello My Name Is Doris | **Le Grand Jeu, El páramo — Terrore invisibile, Dark Cloud, Il silenzio della palude** |
| **Gone Girl** | Murder Mountain, **The Leftovers**, Dateline, **Best Time Ever with Neil Patrick Harris** | Body of Evidence, **Due tombe, Lacrime di sangue, Disappearance, I See You** |
| **Shutter Island** | Tutti gli uomini del re, Archivo 253, **The Wolf of Wall Street**, Killers of the Flower Moon | **Black Jack, Il collezionista, Disappearance, Stonehearst Asylum, Verónica** |

**V3 è chiaramente meglio**: sono tutti thriller e horror. V0 pesca *The Leftovers* e un game show con
Neil Patrick Harris.

**Il numero e l'occhio misurano due cose diverse**, e la seconda è quella che conta per un titolo
nuovo:

- il **banco** chiede: «il titolo atterra nella bolla che la **co-visione** gli aveva assegnato?». È
  una domanda sul **comportamento**, e si può fare solo sui titoli che nel grafo ci sono **già**, con
  una bolla scritta addosso dagli utenti.
- l'**occhio** chiede: «i vicini sono lo stesso genere di film?». È una domanda sul **significato**, ed
  è l'unica che si possa fare su un titolo **nuovo**, che di comportamento non ne ha.

Per un film del 2026 che entra in catalogo, la prima domanda non esiste. **Quindi per il prodotto V3 è
la variante giusta, e il 35,3% non era la misura del suo lavoro.** Non ho buttato un numero buono: ho
scoperto che misurava un'altra cosa.

## Cosa va nel collocatore

- **V3**: df ≥ 3, idf con tetto a `log(N/20)`, generi e reti ×1,5, cast e case ×0,4, registi ×0,8.
  Salvata in `05-tfidf.npz`, `05-vocab.json`, `05-idf.npy`, `05-centroidi.npz` (con gli **idf
  accanto al vocabolario**, che è il rischio numero uno della proposta per `src/`).
- **La confidenza resta**, ma con una lettura più severa: i coseni di V3 sono **più alti a parità di
  significato** (0,28 per *Le Grand Jeu* contro 0,15 per *WeCrashed*), quindi la soglia di 0,08 va
  ritarata sulla nuova scala.
- **La regola di medium simmetrica** resta (ticket 04).
- E il banco **non sparisce**: continua a servire per i titoli che nel grafo ci sono, ed è l'unico
  controllo automatico che abbiamo. Ma non è più l'arbitro.

## ⚠️ RITRATTATO IL 14/10/2026 — vedi `coerenza/ricerche/820-la-bolla-che-non-era-un-minestrone.md`

La sezione qui sotto conclude che «quella bolla non esiste» e che il difetto è nella partizione.
**E' sbagliata.** La bolla 820 è coerente: 35 titoli su 46 sono Thriller, i registi sono Fincher (7),
Nolan (4), Shyamalan (3), i voti mediani sono 7.037 contro 51 del catalogo, e i termini del suo
centroide dicono `ge:thriller · ge:mystery · kw:psychological thriller · di:david fincher`. È **il
canone del thriller psicologico**, e Verity ci appartiene. L'obiezione dell'utente sulla bolla era
giusta quanto la sua obiezione su Verity: avevo giudicato dalla superficie (*Inception*, *The Truman
Show*) invece che dal baricentro, e i termini del centroide erano su disco da ore.

## E Verity resta con Fight Club

V3 migliora i **vicini titolo per titolo** ma **non** la collocazione: rieseguito il `colloca()` con
V3, *Verity* va **ancora** nella bolla 820, con coseno 0,107 (sopra la soglia, quindi stavolta senza
nemmeno l'avviso).

La ragione è la cosa più importante di tutto l'effort: **quella bolla non esiste.** I thriller
psicologici della stessa famiglia sono **sparsi** — *Body of Evidence* in 551, *Due tombe* in 930,
*Disappearance* in 776, *Il collezionista* in 505, *Verónica* in 967 — e la bolla 820, che pure
contiene *Gone Girl* e *Shutter Island*, è un «prestigio contorto» con *Inception*, *The Truman Show*
e *Eiffel*.

Quindi il difetto **non è nel vettore e non è nel centroide**: è nella **partizione**. V8 a RB 100 è
troppo grossolana per la struttura dei generi, e il ticket 09 di `bolle-nitrile` che diceva «RB 200
frantuma» parlava del **numero complessivo** di bolle, non della coerenza dei singoli mondi. Sono due
cose diverse.

**Conseguenza operativa, concreta.** Per un titolo nuovo il posto giusto non è per forza una bolla.
Il `colloca()` dovrebbe restituire **due cose**:

| livello | cosa | a cosa serve |
|---|---|---|
| **macro** | la bolla (820) | l'aggancio al grafo, alla camminata, al carosello |
| **micro** | i **10 titoli più vicini** con V3 (*Gone Girl*, *Shutter Island*, *Due tombe*…) | quello che si mostra all'utente, ed è la parte **giusta** |

Il micro è già misurato e funziona: con V3 i vicini di Verity sono *Le Grand Jeu*, *El páramo*,
*Dark Cloud*, *Il silenzio della palude*. Il macro serve a muoversi nel grafo. **Fondere i due**
livelli in una scelta sola è l'errore che ha prodotto questa obiezione: la bolla giusta per navigare
non è la stessa cosa del mondo giusto da mostrare.

## La lezione, che è la stessa di tutto l'effort

Il ticket 06 di `todo-grafo` aveva già dato questa lezione una volta — il 63,7% gonfiato dal
leave-one-out — e l'ha ripetuta in forma nuova: **un numero che sale non è una prova che la cosa
giusta stia succedendo**. Qui il numero **scendeva** mentre la qualità **migliorava**, ed è stato
l'occhio dell'utente a vederlo, non un contratto.

I contratti servono a fermare gli artefatti degeneri. Per il resto serve guardare le uscite.
