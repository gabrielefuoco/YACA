# Handoff 7 — la revisione è diventata lavoro, e il lavoro ha prodotto altre domande

**Settimo handoff, e il primo che non è solo un riepilogo: in fondo ci sono tre domande precise.**

Il sesto raccontava il grafo che entra nel prodotto e il meccanismo misurato. La tua revisione di quel
handoff ha prodotto **16 ticket**, e questa settimana li abbiamo fatti quasi tutti: 15 chiusi, 1 aperto.
Il modulo è cambiato parecchio, e in un modo che vale la pena guardare, perché **tre dei quattro bug che
avevi trovato erano sintomi di qualcosa di più grande** — e quella cosa più grande si è ripresentata, con
me come autore, altre sei volte.

---

## 1. Cos'è cambiato, in ordine

**I quattro bug che avevi trovato.** Tutti veri, verificati uno per uno sul codice prima di toccarlo.
  · **lo split «temporale» non era temporale** (`da_trakt` non leggeva `last_watched_at` e metteva tutti i
    film prima di tutte le serie): risolto con **una sola funzione** `canon.storia_trakt(u, ordine=...)`,
    che è anche il modo in cui si chiude quella classe di bug. La storia di prova ha **174 cambi di
    medium**, dove prima ce n'era 1.
  · **l'artefatto perdeva i 2 ponti cross-medium e i pesi degli archi**: ora porta `P` = 45.194 archi
    pesati con l'auto-anello. Misurato col banco: il salto uniforme cambiava **3 dei primi 10 mondi**
    (Jaccard 0,54), e la versione pesata è anche **più veloce** (73 ms contro 179).
  · **il job notturno usava V3 per la macro e leggeva la partizione V8**: sistemato.
  · **lo slider `canone` era una retta** (`abs(q-c)*sign(q-c)` è identico a `(q-c)`): ora il centro si
    sposta davvero. Verificato su tre utenti: `-1` → voti medi 643 e 453, `0` → 507 e 78, `+1` → 1.479 e
    684. Monotono, e **zero mondi a zero voti** in tutti i casi.

**Le rimisure, che sono la parte da guardare.** Il numero che avevo annunciato era misurato su uno split
rotto. Rifatto: precisione **6,4%** (era 5,0%), lift **76×** (era 63×), *un passo fuori* 31% (era 38%),
*il tuo mondo* 20% (era 21%), rango mediano 3, 58% entro le prime quattro posizioni, 147 ms a chiamata.
**La conclusione di prodotto non cambia.** E io avevo previsto che scendesse, perché uno split vero è più
difficile: sbagliato io, non il dato — con i medium separati mancava la possibilità strutturale che una
serie ne trovasse un'altra.

**I refactor.** Gli arbitri sono passati da nove copie della diffusione a **una** (`camminata.ppr`, con
le quattro varianti che erano vere fatte parametri); i 19 parametri di costruzione hanno **una fonte
sola** in `parametri.py` (`PESI_TOKEN` era scritto in due posti, e cambiarne uno solo faceva scivolare i
punteggi); l'avvio del motore è passato da **51,2 s a 2,0**; le bolle hanno `termini`, `esempi` e
`da_semi`, quindi un mondo si legge in una riga.

**E il DAG** (`pipeline build`): tabella dei passi, manifest, e un piano che dice *cosa rifare e perché*.
Cambiando `VOTI_SPREAD_MIN` restano in salto i tre passi pesanti (17 min · 13 s · 13 min/11 GB) e si
accendono solo i cinque a valle. La propagazione è **per file**, e il piano ha una memoria delle uscite:
se un artefatto non è più quello che il passo aveva scritto, il motivo lo dice — *«uscita RISCRITTA FUORI
DA QUI»*. È la trappola del 15/10 in una riga.

---

## 2. La cosa su cui mi serve il tuo occhio: i sei effetti collaterali

Questa settimana ho fatto **sostituzioni in massa** con script (9-19 rimpiazzi per volta, con l'ancora
esatta e un controllo che ogni sostituzione sia avvenuta). Il metodo ha funzionato: 9/9, 15/18, 7/7. Ma
**sei volte** un edit scriptato ha prodotto un effetto che nessun controllo ha visto:

1. l'import di `ppr` inserito **dopo l'ultima riga** `from graph import`, che in quel file stava **dentro
   un blocco**: `NameError` a runtime, e lo script aveva detto «sostituito e compila»;
2. un'ancora che ha inserito `canon.esiste()` **fra il decoratore `@functools.lru_cache` e la sua
   funzione** — il decoratore è rimasto appiccicato a `esiste`, `titoli()` ha smesso di essere cachata,
   e `esporta` è passato da 30 secondi a **97 minuti** (2.488 secondi per 100.000 accessi a una costante);
3. percorsi `/tmp/...` che per bash e per il Python di Windows sono **due posti diversi** (due volte);
4. un `pos = max(...)` che sceglie l'ultima occorrenza invece della prima;
5. `$TEMP` risolto diversamente dai due lati;
6. e il più istruttivo: **`canon.A(nome).exists()` in sette file**, che quando hai reso severo `A()` sono
   diventati **bombe** — il ramo di ripiego non si è mai più eseguito, e `steps/03_divisione_voti.py`
   cercava il triangolo in tre nomi, il file giusto c'era, e **lo step non partiva**. Tradotto: gli
   artefatti non erano più riproducibili da nessuno, e nessuno se n'era accorto perché nessuno aveva più
   ricostruito. Il sintomo era chiaro, la causa no: la colpa era di un `if` che sembrava prudente.

Il sesto non è un errore di script, è una **classe**: un contratto che cambia severità e i chiamanti che
continuano a trattarlo come permissivo. Ma i primi cinque hanno una radice comune: **il controllo di
compilazione non è un controllo di correttezza.** Un decoratore appiccicato alla funzione sbagliata è
Python perfettamente valido.

**Quello che ho fatto finora** (e su cui voglio il tuo parere, non un complimento): gli script stampano un
report per ogni rimpiazzo, verificano che il file compili **e** — per il caso 1 — che l'import sia a
colonna 0. Dopo il caso 2 ho aggiunto il test dell'ordine topologico del DAG e i test di equivalenza
numerica. Ma ho la sensazione che manchi qualcosa di sistematico.

**Domanda 1 — BUG:** nei file che leggi adesso, c'è qualche **altro** errore come quelli che hai trovato la
volta scorsa? In particolare guarda: (a) `camminata.ppr` e i nove chiamanti delegati, perché è là che ho
spostato il codice di nove banchi; (b) `pipeline.PASSO` e `piano()`, perché un piano sbagliato è peggio
di nessun piano; (c) `canon.storia_trakt`, perché ora la usano anche gli arbitri; (d) `bubbles.__getattr__`
(PEP 562), perché è un meccanismo che nasconde errori di battitura nei nomi delle costanti.

---

## 3. Cosa NON è verificato — leggerlo prima di fidarsi

1. **Gli step restano comandi, non funzioni.** `02_partizione.py` legge `sys.argv` e `os.environ` da
   dentro: non posso verificare che una riscrittura non cambi il risultato (13 min, 11 GB) e quindi non
   l'ho fatta. La micro-fixture da 100 titoli resta **bloccata a monte** da questo.
2. **Quattro passi non li ho rieseguiti**: `04_centroidi.py` (oltre 15 min, interrotto — l'artefatto è
   rimasto intatto, verificato con lo sha), `06_mappa.py`, e i tre pesanti (`00` ~17 min, `01`, `02`).
   **03 e 05 invece riproducono gli artefatti bit per bit**, ed è la prova che l'estrazione dei parametri
   è fedele.
3. **Il `ppr` unificato**: `ricetta.py` è **identico al bit**; `pesi.py` è deterministico (due corse
   coincidono) e ha 4 righe su 6 identiche, le altre due differiscono di **meno dell'1%**. **La causa non
   è stata isolata.** L'ipotesi più ovvia — float32 contro float64 nel seme — l'ho verificata ed è
   **falsa**. Le due righe sono rapporti su 100 utenti, quindi sensibili a qualunque differenza minima.
4. **La parità Python↔JS** ha un residuo di **4,2e-5** (errore normalizzato al massimo) di causa non
   isolata, con i primi dieci mondi **nello stesso ordine**.
5. **I quattro segnali del prodotto** (like, love, libreria, voti) restano **inventati**: con un proxy
   dichiarato la precisione va da 6,4% a 6,2% e i portafogli hanno Jaccard 0,81 — cioè oggi quei fattori
   **non spostano quasi niente**.
6. **Il ticket 11 (i nomi degli artefatti) è aperto**, e non è più cosmetico: il DAG ha scoperto che
   `centroidi_v1` che scrive `04-*` cattura anche `04-trama-qwen3b.npy`, l'artefatto dell'embedding. Due
   pipeline che si spartiscono il prefisso `04-`.
7. **La suite `npm test` ha 4 suite rosse preesistenti** (`staticPosters.test.js` e altre), 6 test. Non le
   ho toccate: ma una suite con dentro test rossi da chissà quanto insegna a ignorare le suite rosse.

**Domanda 2 — COSA CONTROLLARE:** di queste sette, quale ti sembra la più pericolosa? E: c'è una verifica
che *non* ho fatto e che avrei dovuto fare prima di dichiarare chiuso un ticket? (La mia regola nuova è
che un refactor si chiude solo con la prova che i numeri non cambiano — ma due volte questa settimana la
prova era «i numeri *non cambiano quasi*», e ho dovuto scegliere una soglia. Non sono sicuro che sia la
regola giusta.)

---

## 4. I prossimi passi, e dove non so decidere

**Quello che farei io, in ordine:** (1) il ticket 11 — rinominare gli artefatti, adesso che il DAG dà il
modo di farlo in sicurezza, perché due pipeline che si spartiscono `04-` sono una trappola pronta;
(2) gli step come funzioni, partendo da 03 e 05 che so riprodurre bit per bit, così la micro-fixture
esiste; (3) la calibrazione dei quattro segnali, che richiede i dati del prodotto e quindi una decisione
del proprietario; (4) il job notturno vero (`esporta --colloca`), che non è mai stato eseguito fino in
fondo.

**E due cose su cui non so decidere, e le dico invece di scegliere a caso:**

· **il valore di `DELTA_FASCIA`** (quanto lo slider `canone` sposta la finestra) l'ho messo a **1,0 in
  spazio logaritmico** senza misurarlo. È dichiarato INVENTATO, ma è l'unico parametro che ho *creato* io
  questa settimana e non ho idea se 1,0 sia ragionevole;
· **`PESO_TIPO_FATTORI`** (`loved` 3,0 · `liked` 2,0 · `library` 1,5 · `watched` 1,0): con quei valori i
  fattori di tipo non spostano quasi niente (vedi §3.5). Potrebbe voler dire che i valori sono troppo
  vicini, o che il segnale non c'è. **Non lo so distinguere**, e mi sembra il tipo di domanda in cui una
  lettura esterna vede subito cosa manca.

**Domanda 3 — PROSSIMI PASSI:** sei d'accordo sull'ordine? E: c'è un pezzo che consideri **finito e
inutile da rifinire oltre**, su cui smettere di spendere? Perché dopo una settimana di rifiniture la
domanda vera è cosa si può **smettere** di sistemare.
