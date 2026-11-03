# Uscire dal plateau del grafo

Effort: capire perché il grafo delle raccomandazioni è fermo da tre versioni e sbloccarlo.
Origine: handoff a un senior esterno (`%TEMP%/yaca-handoff-senior/`), risposta in `risp.md`, verificata
sul nostro codice prima di aprire i ticket.

---

## Destination

Un grafo che, dato un titolo, proponga vicini **di tono e non solo di pubblico**, senza perdere
accuratezza sul banco curato, con una valutazione che sappia distinguere un miglioramento vero da
±0,005 di rumore, e con il cold-start (titoli nuovi) che funziona davvero.

**Decisione dell'utente (2026-11-03)**: il bersaglio *tonale* deve prevalere su quello *autoriale*, e di
parecchio — se coincidono bene, ma il grafo non deve diventare «ti suggerisco altra roba dello stesso
autore». Bersaglio: *Povere creature!*, *The Substance*, *Josie and the Pussycats*, «e altri che non so
precisare».

Misura del successo, in ordine:
1. `Barbie` porta nei primi 10 almeno 2 dei film giudicati affini (*Povere creature!*, *The Substance*,
   *Josie and the Pussycats*, *EEAAO*) **senza** portarci *Dragon Trainer*, *Annabelle*, *American Sniper*.
2. R@20 sul banco curato **non scende** sotto 0,25 e la quota di titoli >5k voti in top-10 sui semi
   popolari **scende sotto il 55%** (oggi 64,5% con V19; era 74,5%).
3. Ogni confronto fra due grafi è accompagnato da un intervallo di confidenza, e le differenze sotto
   la soglia di rilevabilità vengono dichiarate rumore invece di essere rincorse.
4. Un titolo nuovo (senza co-visione) riceve raccomandazioni non degeneri entro 24h dall'uscita.

---

## La diagnosi: tre difetti verificati nel codice

Non sono opinioni: sono righe di codice lette e misurate il 2026-11-03.

### D1 — La "chiusura triangolare" non è una chiusura: è un moltiplicatore di cricca

`chiudi.py` (e `bubbles.chiusura_triangolare`) esegue `S.multiply(O) + alpha0*S` con
`O = Sb @ Sb.T` e `Sb = (S>0)`. Il proprio docstring lo dice: *"Non cambia la topologia: moltiplica
ogni arco per (alpha0 + vicini comuni)"*. Nessun arco nuovo.

Misurato sulla riga di *Barbie* (artefatto `v18tau-2.0`): **532 archi prima, 532 dopo, 0 nuovi**, e i
moltiplicatori sono 700–1211 per i vicini di cricca.

| vicino | peso mixer | peso dopo "chiusura" | moltiplicatore |
|---|---:|---:|---:|
| Wonka | 0,0839 | 10,16 | ×1211 |
| Il gatto con gli stivali 2 | 0,0726 | 7,05 | ×971 |
| Everything Everywhere All at Once | 0,0797 | 6,94 | ×871 |
| (un legame autoriale con 3 vicini comuni) | — | — | ×3,1 |

Rapporto fra un legame di cricca e un legame autoriale: **~390×**. Il moltiplicatore è quadratico nella
densita della cricca, e viene applicato **dopo** tutta la taratura dei pesi: ogni correzione fatta a monte
(mixer, tipi, damping) viene riscritta a valle. È la spiegazione più semplice del plateau.
Spiega anche perché i tre film di Greta Gerwig, che nella riga non chiusa stanno ai ranghi 3, 15 e 46,
spariscono dalla top-10.

**Risolto (ticket 02).** La forma giusta non è togliere il secondo ordine (costa −0,012 di R@20, sopra
l'MDE) né ripesare gli hub (Adamic-Adar non sposta l'arco autoriale): è **comprimere il conteggio**,
`alpha0 + log(1 + |vicini comuni|)`. Cricca ×7,1 invece di ×1211, rapporto cricca/autoriale ~4×.
Misurato: R@20 0,264 contro 0,268 (Δ −0,004, **sotto l'MDE** 0,009), MRR 0,1023 contro 0,0999, R@5
0,146 contro 0,143, e *Lady Bird* passa dal **#61 al #19** nella riga di *Barbie*. Costo: >5k in top-10
dal 68,2% al 72,3%, che è il fronte del ticket 04.

### D2 — COVISION è costruita con `--semplice`: nessuno sconto temporale, nessuna normalizzazione

`build-v18.sh:59` → `covision.py build --semplice --minsup 1 --topk 20`. Con `--semplice` la funzione
`score()` salta il fattore temporale (finestra `LAG = 365` giorni dalla data di uscita) e la
normalizzazione p99 fra le quattro fonti. Effetto: *Barbie* assorbe senza penalità l'intera co-visione
congiunturale 2022-2023 (*Wonka*, *Mario*, *Puss in Boots 2*, *Spider-Verse*, *Glass Onion*) — cioè
esattamente la top-8 che vediamo.

### D3 — Il titolo è dentro l'embedding della trama

`embed-trama2.py:50` → `out[k] = f'{t}. {o.strip()}'`. Il titolo è prefisso al testo, e dentro le
sinossi restano i nomi propri (*Barbie*, *Ken*, *Gotham*). Lo spazio TRAMA misura l'omonimia lessicale,
non la storia. Esiste `trama-notitle.npy` (esperimento `emb-senza-titolo.py`) ma **non è nella pipeline**.

A questi si aggiungono due difetti già noti: il gate di popolarità è **simmetrico** (intrappola i semi
popolari nella loro lega) e **non esiste alcun tipo d'arco per gli sceneggiatori** (`tipi.py` costruisce
CAST, DIR, PROD, COLL; Noah Baumbach, co-sceneggiatore di *Barbie*, non è rappresentato da niente).

---

## Il piano

### Fase 0 — Prima di toccare il grafo: una valutazione che sappia dire "rumore"
Ticket 01. Senza questo, ogni ticket successivo viene giudicato su differenze che a 499 sorgenti hanno
MDE ≈ 0,015: continueremmo a inseguire il caso. Produce: bootstrap appaiato per seme, MDE dichiarato,
SNIPS-recall e surprise-recall sui log Trakt.

### Fase 1 — Riparare i tre difetti (nessun dato nuovo, nessun modello nuovo)

Ticket 02 (**fatto**), 03, 04, 05. Sono tutti e quattro già completamente specificati e a costo basso.
Atteso: il grosso del guadagno, perché rimuovono distorsioni applicate *dopo* la taratura.

### Fase 2 — Aggiungere i segnali che mancano

Ticket 06 (CREWPROP: carriera di regista/sceneggiatore/cast con leave-one-out), 07 (TONE),
08 (studente de-biasato), 09 (RP3β/EASE^R al posto della COVISION grezza).

### Fase 3 — Manutenzione strutturale

Ticket 10 (simmetrizzazione incrementale), 11 (regola anime/franchise), 12 (provenienza
content-addressed, che chiude la classe di bug "build sbagliata in silenzio").

---

## Cosa smettiamo di fare

1. **Varianti sulle singole keyword TMDB** (KWLAT, KWEXP, KWRARE, bande df×cos). Quindici tentativi:
   le keyword sono sostantivi di soggetto, e ogni somma lineare finisce o nei falsi amici lessicali
   (`doll` → horror con le bambole) o nei documentari a tema (`feminism` → *The Red Pill*).
2. **Inseguire ±0,003-0,008 su R@20** senza intervallo di confidenza. Sotto l'MDE è rumore.
3. **Toccare pesi e `tau` a valle** mentre D1 moltiplica per 100-1200×. Prima si ripara D1.
4. **LLM-as-reranker sui top-40**: se *Povere creature!* sta al rango #110 e *The Substance* non è
   nemmeno nella riga, nessun riordino dei primi 40 può salvarla. Il collo di bottiglia è la
   generazione dei candidati, non il riordino.
5. **Sweep del peso di KWLAT**: guadagna sul banco ma non sposta il caso d'uso; resta fuori dal grafo.

---

## Rischi

- **D1 potrebbe essere "carico"**: il moltiplicatore di cricca è una forma grezza di smoothing al
  secondo ordine, e potrebbe star sostenendo parte del R@20. Rimuoverlo *da solo* può far scendere il
  banco. Per questo il ticket 02 chiede di misurare **tre varianti** (nessuna chiusura, chiusura
  Adamic-Adar, chiusura attuale) e non di sostituire alla cieca.
- **Il banco curato è popolarità-dipendente** (collega serie di nicchia a film famosi): un
  miglioramento di tono può sembrare una regressione. Serve il doppio asse del ticket 01.
- **Il canone ha 76.497 nodi ma la partizione bolle ne copre 66.259**: il motore di prodotto non può
  usare V18 finché non si decide (rifare la partizione o togliere le bolle). Fuori da questo effort.

---

## Criteri di accettazione dell'effort

1. `Barbie` nei primi 10 contiene ≥2 affini e 0 falsi amici evidenti (bambole horror, documentari).
2. R@20 ≥ 0,25 e quota >5k in top-10 ≤ 55% sui 200 semi popolari. — **oggi 64,5%** (era 74,5%):
   il criterio non è ancora raggiunto.
3. Ogni ticket chiude con: numero prima/dopo, intervallo di confidenza bootstrap, e verdetto
   esplicito "sopra/sotto l'MDE".
4. `build` completa da zero senza fallback silenziosi: se manca un input, si ferma.

## Stato al 2026-11-03

Base congelata **V19** (`services/graph_dense/V19.md`): stessa accuratezza di V18, **−10 punti di
blockbuster**, segnale autoriale in testa a *Barbie*. Il tono resta fuori portata con i segnali
attuali: l'ipotesi del residuo ortogonale (ticket 07) è **falsamente** falsificata dai dati, e serve
una fonte nuova (recensioni TMDB o Wikipedia Themes/Style).
