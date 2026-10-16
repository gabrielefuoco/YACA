# Handoff 7 — revisione profonda del modulo, per il senior

Questo documento non è un resoconto del lavoro fatto. È un **incarico di revisione**: leggi tutto il
codice, controlla tutto, e scrivi tutto quello che noti — **con la soluzione possibile accanto**, anche
quando è una riga o solo un'ipotesi.

Il digest che accompagna questo file contiene **tutto il modulo**: non fidarti dei riassunti qui sotto,
servono solo a farti orientare in fretta. La fonte è il codice.

---

## 1. Cos'è il modulo, in mezza pagina

YACA suggerisce film e serie. Il modulo `graph/` costruisce **una mappa di "mondi"** — 3.497 bolle
coerenti, da 66.259 titoli — e un **motore** che, da una storia di visioni, accende i mondi giusti e ne
tira fuori le liste da mostrare.

```
   storia (titoli + ri-visioni + tipo di segnale)
        │
   peso dei semi (film min(plays,3) · serie 1+2×(frazione di episodi) · × fattore di tipo)
        │
   diffusione: PageRank personalizzato, α=0,60, sul grafo potato top-16  ──»  una sola implementazione
        │
   portafoglio: i mondi accesi (attivazione, voti mediani, vicini, membri, termini, esempi, da_semi)
        │
   liste: il tuo mondo · un passo fuori · le uscite nuove · la nicchia di qualità
```

**I numeri che contano**, coi loro metodi: coerenza intra-bolla **+0,942**; α misurato su 120 utenti;
potatura top-16 (12% degli archi, 8,7× meno lavoro); motore intero **precisione 6,4%** contro un pavimento
dello 0,08% (**76×**), su 100 utenti con taglio temporale; **31%** del futuro trovato sta in *un passo
fuori* e **20%** in *il tuo mondo*; **147 ms** a chiamata; il freddo si accende da 1 titolo (36,9× contro
lo 0,6× di un titolo a caso).

**Dove gira cosa**: la mappa si costruisce **offline** (30 minuti, un passo da 11 GB di picco); la
diffusione gira **online nel prodotto**, e nel prodotto c'è un secondo motore, in JavaScript, che cammina
sulle **bolle** invece che sui titoli — una semplificazione dichiarata, di cui misuriamo il costo
(le due diffusioni condividono metà dei primi dieci mondi, Jaccard 0,25–0,54, e il primo mondo del motore
vero cade sempre nei primi dieci di quello del prodotto).

---

## 2. Dove guardare — la mappa dei file

| file | cos'è | quanto è delicato |
|---|---|---|
| `graph/canon.py` | il livello base: registro degli artefatti, lettura dei titoli, `storia_trakt`, i metadati del canone, **i contratti** (`assert_partizione`, `assert_allineamento_spazi`, `assert_ordine`, `assert_simmetrica`, `ranghi`), i banchi e le metriche di recall | **molto**: è la macchina che trasforma un silenzio in un errore |
| `graph/camminata.py` | **l'unica** implementazione della diffusione: `pota`, `transizione`, `pesi_semi`, `diffondi`, `ppr`, `attiva_per_mondo` | **molto**: ci passano tutte le misure |
| `graph/motore.py` | il motore: carica tutto, `deduci` (canone, forma, freddo), `modula` (gli assi), `scegli_mondi`, `lista` | **molto**: è la logica di prodotto |
| `graph/bubbles.py` | la miscela dei componenti, la chiusura triangolare, Leiden, la potatura al nucleo | **molto**: il pezzo più grande e più lento |
| `graph/collocator.py` | collocare un titolo nuovo in una bolla (due spazi: macro per la bolla, micro per i vicini) | alto |
| `graph/parametri.py` | la tabella: ~50 iperparametri con stato epistemico (misurato / dichiarato / inventato), impronta della ricetta, `da_rivedere()` | alto |
| `graph/pipeline.py` | la CLI, l'esportazione dell'artefatto per il prodotto, e **il DAG della costruzione** (`PASSO`, `piano()`, `build`) | alto |
| `graph/measure/*.py` | **21 arbitri**: le misure che hanno deciso i parametri. Sono l'evidenza, e ognuno deve misurare *il motore*, non una variante | alto |
| `graph/steps/*.py` | i sette passi della costruzione, in ordine | medio |
| `src/engines/bolle/Bolle.js` | il motore del prodotto: diffusione sulle bolle, pesi, portafoglio, `descrivi` | alto |
| `tests/test_graph_pipeline.py` | 17 prove in 2,5 s: equivalenza delle varianti di diffusione, contratti dell'artefatto, numeri incrociati dei metadati, e il DAG | basso costo, da estendere |
| `tests/bolleParity.test.js` | la parità Python↔JavaScript, con un golden | basso costo |

---

## 3. Cosa ti chiedo

**Leggi tutto il codice, non solo i punti elencati.** Poi scrivi tutto quello che noti. In particolare:

1. **bug subdoli** — quelli che non fanno crashare niente e danno numeri finiti e plausibili. È il tipo
   che questo modulo ha già pagato più volte: un artefatto costruito su una partizione e usato con
   un'altra; un `argsort(argsort(v))` che ordina al contrario; un contratto che cambia severità e i
   chiamanti che continuano a trattarlo come permissivo; un'ancora di sostituzione che spezza una struttura
   senza rompere la sintassi.
2. **ottimizzazioni** — dove il codice fa più lavoro di quanto serva, e quanto si guadagnerebbe. Ci sono
   già due misure che mostrano quanto spazio c'è: l'avvio del motore è passato da 51 s a **2,0** spostando
   il parsing dei Parquet in un artefatto, e una diffusione pesata è risultata **più veloce** di una a
   pesi uguali perché la seconda allocava un array per bolla per iterazione.
3. **semplificazioni e piccoli refactor** — cose che si possono togliere, unificare o rendere ovvie, senza
   cambiare i numeri. E qui ho un numero che vale la pena guardare: il modulo ha **4.622 righe di codice**
   e **4.040 righe di arbitri**, cioè le misure sono grandi quanto il sistema che misurano. Non so se sia
   giusto (le misure sono state l'unica difesa contro gli errori silenziosi, e hanno ripagato), ma un
   rapporto così merita un'occhiata da fuori.
4. **i contratti** — `graph/canon.py` è pieno di `assert_*` nati da errori reali. Dimmi quali contratti
   **mancano**: quali proprietà, se violate, produrrebbero un risultato sbagliato invece di un errore.

**Sii prodigo di dettagli.** Non serve che tu sia breve, e non serve che tu scelga: se noti venti cose,
scrivi venti cose. Anche quelle che ti sembrano minori — un nome che inganna, un commento che non
corrisponde più al codice, un parametro il cui valore non ha una misura dietro. E per ognuna, **la
soluzione possibile**, anche se è «va cancellato» o «non lo so, ma va misurato così».

---

## 4. Le cose che so di non aver verificato

Te le dico perché non ci spenda tempo a riscoprirle — e perché sono i posti dove è più probabile che ci
sia qualcosa:

1. **cinque degli otto passi della costruzione non sono stati rieseguiti**: `00` (~17 min), `01`, `02`
   (~13 min, 11 GB), `04` (oltre 15 min, interrotto) e `06`. Gli step `03` e `05` invece **riproducono gli
   artefatti bit per bit**, quindi l'estrazione dei parametri in `parametri.py` è fedele e il resto è
   ragionevolmente vero — ma «ragionevolmente» non è «verificato».
2. **gli step restano comandi, non funzioni**: `02_partizione.py` legge `sys.argv` e `os.environ` da
   dentro, e non ho un modo di verificare che una riscrittura non cambi il risultato. La micro-fixture di
   prova da 100 titoli è bloccata da questo.
3. **due residui numerici di causa non isolata**: nel refactor della diffusione un banco ha 4 righe su 6
   identiche al bit e 2 che differiscono di **meno dell'1%** (rapporti su 100 utenti); e la parità
   Python↔JS ha un errore normalizzato fino a **4,2e-5**, coi primi dieci mondi nello stesso ordine.
4. **i quattro segnali del prodotto** (like, love, libreria, voti) hanno fattori dichiarati inventati: con
   un proxy la precisione va da 6,4% a 6,2% e i portafogli hanno Jaccard 0,81, cioè oggi quei fattori non
   spostano quasi niente. Non so se è perché i valori sono troppo vicini o perché il segnale non c'è.
5. **i nomi degli artefatti sono fossili dei ticket** (`04-` è il macro, `05-` il micro, e due pipeline si
   spartiscono il prefisso `04-`: il DAG ha già trovato che `04-*` cattura anche l'artefatto
   dell'embedding). La rinomina è aperta.
6. **il job notturno (`esporta --colloca`) non è mai stato eseguito fino in fondo**, e oggi collocherebbe
   zero titoli perché il canone *è* il grafo.
7. **la suite `npm test` ha 4 suite rosse preesistenti** (6 test, per esempio `staticPosters.test.js`).
   Non le ho toccate. Una suite con test rossi dentro insegna a ignorare le suite rosse.

---

## 5. Come rispondere

Come preferisci: nel file dove hai scritto la volta scorsa (`todo grafo.md`), dentro i ticket di
`.scratch/suggerimenti/issues/`, o in un documento tuo. L'importante è che per ogni cosa che scrivi ci sia
**cosa hai visto, dove, e cosa faresti** — poi i ticket li scrivo io, e li eseguo.

L'ultima volta hai trovato quattro bug reali leggendo un digest, e tre dei quattro erano sintomi di classi
di errore più grandi. Il modulo adesso è cambiato molto. Questa volta ti chiedo di guardarlo tutto, non
solo le parti nuove.
