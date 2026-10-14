# Handoff 3 — il grafo sa servire, e non sa accogliere

*Per il collega senior. Terzo handoff: il primo fotografava il lavoro **prima** (`.scratch/ml-collaborativo/handoff-senior.md`), il secondo i **fallimenti della fase precedente** (`.scratch/grafo-servibile/handoff-senior-2.md`). Questo è **dopo altri 16 ticket** — `bolle-nitrile` (10) e `inserimento` (6) — e riguarda **un problema nuovo**, che quei due non potevano vedere.*

*Tutto è nel repo, branch `main`. **Niente è in produzione**: `src/` non è stato toccato.*

---

## 0. In mezza pagina

Il prodotto è un add-on Stremio con **due cataloghi separati** (film e serie), che deve consigliare cose **sorprendenti, azzeccate e agnostiche fra i medium**. Il criterio dichiarato è l'**azzeccato non banale**: titoli che l'utente non conosce e che gli piacciono — la **coda**, non la testa.

Le due fasi precedenti avevano stabilito:
- **il righello** (recall stratificata, auto-informazione, banchi onesti) — `grafo-servibile`, 24 ticket
- **la ricetta del recupero**: film `CF + decadimento`, serie `CFst + B + TV + decadimento`, k=30 β=0,25 α=0,30 τ=365 — scelta **sulla coda**, non sulla recall globale
- **e i quattro artefatti** che il righello aveva smontato

Questo giro ha fatto due cose nuove:
1. **`bolle-nitrile`** — riparare la **costruzione** delle bolle. PARTITO DA UNA CRITICA AL CODICE dell'esperto: 4 difetti verificati nel codice, più 9 interventi. La partizione è passata da **5.297 bolle** (mediana 9) a **1.617** (mediana 34), e ora **18 sentinelle su 20 leggono un mondo nominabile**.
2. **`inserimento`** — far entrare un titolo mai visto. Il numero che conta: **600 titoli col comportamento nascosto, ricollocati dai soli metadati: 27,7% tornano nella propria bolla e 0% in una non collegata.** Verity (uscito 14 giorni fa) finisce con *Gone Girl*.

**E il problema nuovo, che è la cosa da chiedere: il grafo sa servire, ma non sa accogliere le serie.**

---

## 1. IL PROBLEMA NUOVO, in una tabella

Ho tolto il comportamento a **600 titoli**, ne ho nascosto il contributo al modello, li ho ricollocati dai soli metadati, e ho guardato in che bolla cadono rispetto a quella di partenza. Il criterio forte è **la propria bolla** (il caso è 0,062%) e l'allarme è **la bolla non collegata** (il caso è 20,6%).

| | propria bolla | bolla non collegata |
|---|---|---|
| **FILM** (600, comportamento nascosto) | **27,7%** (450× il caso) | **0,0%** |
| **SERIE**, studente dei film | 2,2% (35×) | 1,8% |
| **SERIE**, studente addestrato sulle serie | **1,3%** (22×) | 0,2% |

**Le serie sono debolissime con entrambi gli studenti, e il secondo studente non aiuta.** Ma il quartiere non è mai quello sbagliato (0,2-1,8% di bolle non collegate contro il 20,6% di caso).

**La domanda**: la collocazione di una serie nuova va per **una strada diversa**? Ho una misura che orienta: **nel 58,7% dei casi** (205 bolle-serie su 349) una bolla-serie ha **una bolla-film fra i primi otto vicini** — cioè l'impalcatura per passare **dai film** esiste. I documentari sono il caso migliore (docuserie ↔ documentari film, **peso 884,8**: il legame più forte di tutta la mappa). *Star Trek: Discovery* e *Banana Fish* invece non hanno **nessun** vicino film: i loro mondi sono pieni di serie.

**È la strada giusta (serie → film del suo mondo → serie adiacenti), o stiamo inseguendo un'idea sbagliata?**

---

## 2. I FALLIMENTI di questo giro, che vanno letti per primi

### 2.1 La via strutturale per l'inserimento non è pronta

Un titolo nuovo non ha archi di comportamento, quindi per collegarlo al grafo servono gli archi **strutturali** (keyword, cast, regia, produzione). Misurato: **non funziona**.

- Gli archi di un **film** finiscono su **serie TV** (*Scarpetta*, *Rebus*, *Harlan Coben*): il prodotto ha due cataloghi separati e quella via li mescola.
- L'arco più forte per Verity è *Wiñaypacha*, **un film peruviano**.
- Le due vie (proiezione e struttura) **non concordano su nessuna bolla**.
- **E il gating del ticket 16 è un no-op per un titolo nuovo**: `d_behav = 0` → `λ = 1` → passano **tutti** i 30 archi. La protezione non è nell'arco singolo, è nel loro **numero**.

⚠️ **Errore mio, il primo di questo giro**: all'inizio usavo la matrice **grezza**, e la similarità dava **0,86 con tutto** — i primi 30 archi erano talk show e reality show. Con l'IDF congelato scende a 0,39-0,51 e diventa leggibile.

### 2.2 E DUE MIEI NUMERI CHE ERANO FALSI — il quinto e il sesto artefatto della sessione

Questi due vanno letti perché sono lo stesso tipo di errore che ci ha già ingannato quattro volte.

**Il criterio «bolla adiacente» non discrimina.** La mappa delle bolle ha **1.037.438 adiacenze su 1.306.536 coppie possibili: il 79,4%**. Quindi «cade in una bolla adiacente» accade **per caso quattro volte su cinque**, e il «100% nel quartiere giusto» che avevo misurato per i film era **gonfiato dal grafo denso** (era 1,2 volte il tasso base). I criteri forti sono la **propria bolla** e la **non collegata**. *Il tasso base va sempre calcolato: una misura che sembra altissima può essere quasi il caso.*

**Il fallimento delle serie era un artefatto mio.** Nella prima versione del banco avevo mascherato la matrice dei vicini con `Pn = np.where(ha[:, None], Pn, 0.0)`: le righe delle serie diventavano **zero**, il ranking cadeva sui **pareggi a −9**, cioè sull'**ordine degli indici di catalogo**. Per questo tre serie diverse ricevevano gli stessi vicini (*Resident Evil*, *Endgame*, *Interstellar*) e io ho concluso «lo studente non sa collocare le serie». **Non era lo studente: era la maschera.** La misura vera è 35× il caso — debole, non rotto.

### 2.3 Un terzo errore, il più istruttivo: ho rischiato di dichiarare «lo spazio CFst è rumore»

Rifacendo il modello dello studente ho trovato che due implementazioni **equivalenti** delle stesse feature davano proiezioni con **correlazione 0,24** e **0/50 vicini in comune**. Ho scritto: *«la proiezione è instabile, quindi i suoi archi sono rumore»* — e sarebbe stato un pezzo della ricetta messo in dubbio.

**Me ne sono accorto dall'aritmetica**: un modello con `||coef|| = 11,39` non può amplificare una perturbazione di 1e-7 in 0,58. Tre ordini di grandezza. Il test giusto era confrontare i **coefficienti** — e lì si è visto che il problema ero io: addestravo su `FX` grezza invece che sulla **tfidf** (`cf-edges.py:95`). Con la matrice giusta: correlazione **1,0000**, vicini **50/50**, e perturbando la tfidf di 1e-8 i vicini restano **50/50**.

### 2.4 Il ponte cross-medium della mappa è asimmetrico, e per il 41,3% non esiste

*Guerre stellari* (film) trova *The Mandalorian* (serie) fra i primi vicini, **ma non viceversa**: nei mondi ricchi le serie hanno vicini serie più forti del film. E nel **41,3%** delle bolle-serie non c'è **nessun** vicino film.

### 2.5 Il recupero non è stato toccato, e le bolle non lo migliorano

Va detto perché qualcuno potrebbe aspettarselo: **la camminata gira sul grafo dei titoli, non sulle bolle.** Le bolle servono ai **caroselli** e agli slot della mappa. Ogni misura di recupero in questo giro sarebbe una misura di altro.

---

## 3. COSA ORA FUNZIONA, con i numeri

### 3.1 I difetti di costruzione, corretti e verificati

Quattro, tutti verificati leggendo il codice prima di toccarlo:

| | |
|---|---|
| **`msk = Mc.row < Mc.col` su una matrice ASIMMETRICA** | i pesi di Leiden dipendevano **dall'indice numerico dei titoli**. Corretto; la versione ottimizzata è **verificata identica** (0 di differenza su 280.130 archi di prova) |
| **la doppia normalizzazione** | `correggi_hub` normalizzava ogni componente a somma-riga 1 **prima** della somma: un arco solitario in DIR valeva come **30 archi veri** di CF. È la spiegazione di *Star Trek Into Darkness* nella bolla *Star Wars* (J.J. Abrams dirige entrambi) |
| **il coseno L2 senza shrinkage** | un titolo con **una sola keyword** prendeva coseno **1,000 esatto** con un altro che aveva la stessa |
| **l'effetto catena di Leiden** | A-regista-B, B-attore-C, C-keyword-D finivano insieme anche se A e D non hanno niente in comune |

E **due che NON sono risultati veri**, dichiarati come negativi: `n_iterations` (leidenalg usa **2 passate** per default, verificato nella firma installata, ma 2 e 6 passate danno **la stessa partizione**: 1.770 contro 1.771 bolle) e il **consenso multi-vista** (solo l'**8,6%** degli archi ha due viste: è di fatto solo una penalità).

### 3.2 I tre interventi che hanno funzionato, e come si giudicano

- **La chiusura triangolare** `S · (0,1 + S·Sᵀ)`: *i triangoli non mentono mai*. Fa uscire l'intruso con il meccanismo previsto (Star Trek e Star Wars hanno un arco DIR ma **nessun vicino in comune** → il ponte cade).
- **La maschera di genere su DIR/CAST**: taglia il **76,3%** degli archi regista — e la lettura dice che è benefica.
- **LIST (le 540 liste umane di Trakt) dentro le bolle**: mai provato prima (era stato provato solo nel recupero, dove abbassava la coda). Porta le sentinelle a leggere mondi veri: *film noir americano* (114 titoli: Gilda, Rififi, Giungla d'asfalto), *commedia sexy all'italiana* (162), *fantasy anni '80* (Conan, Highlander, Excalibur), *commedia romantica* (Bridget Jones).

**Il giudice è il banco sonda**: **20 titoli sentinella**, fissi, con i compagni di bolla letti prima e dopo. Esiste perché modularità, λ₂, purezza e **conteggio** ci hanno premiato la partizione peggiore **quattro volte su quattro**. La quinta volta è stata stavolta: il numero di bolle **scende di 3,7 volte** e la qualità sale moltissimo — se avessimo guardato il conteggio avremmo buttato via il risultato.

### 3.3 L'inserimento di un titolo mai visto

**7,7 ms per titolo** (10.000 in 1,3 minuti), modello **3,8 MB**. Otto uscite del 2026 su otto in un mondo coerente: *Project Hail Mary* → Gravity e Oblivion; *Michael* (biopic MJ) → **Elvis e Judy**; *Odissea* → **Troy e Gods of Egypt**; *Spider-Man* → X-Men e Deadpool; e il titolo russo con **due keyword** trova **tutti vicini russi**.

**E la scoperta che riorienta tutto**: la proiezione **non recupera il comportamento** — recupera la **struttura dei metadati**. Confrontata con lo spazio CF dà **0,0%** di vicini in comune; confrontata col *senso* dà 8 su 8. Per il prodotto è ciò che serve (un film nuovo deve finire nel mondo giusto), ma **la personalizzazione via comportamento previsto non c'è**: è un ottimo collocatore, non un predittore di gusto.

---

## 4. LE QUATTRO DOMANDE

**1. Le serie.** La collocazione di una serie nuova è debole (2%) con **entrambi** gli studenti — quello dei film e quello addestrato sulle serie coi dati Trakt. Ma l'impalcatura per passare dai film esiste nel 58,7% dei casi. **Voi fareste il passo in due tempi (serie → film del suo mondo → serie adiacenti), o c'è una ragione per cui non funziona che noi non vediamo?** E per il 41,3% senza appoggio — i mondi solo-serie come gli anime — cosa resta?

**2. La mappa a otto slot.** Il disegno era 4 canonici + 2 vibe + **2 cross-medium**, in priorità. Ma su **160 coppie lette, 156 sono guidate dal comportamento** e l'unico legame strutturale è *Star Wars ↔ Star Wars TV*. **Gli slot vibe esistono a questo livello, o stiamo per costruire una tassonomia che non c'è?** E con bolle da **114 e 162 titoli**, un carosello ha ancora senso — o va a un'altra risoluzione?

**3. La dimensione delle bolle.** Il ticket 09 ha misurato che **più fine frantuma** (la commedia sexy scende da 162 titoli a 4) e **più grossa cola** (191 titoli, ma dentro *Ski School* e *Sognando l'Africa*). RB 100 è il migliore dei cinque provati. **Ma 162 titoli per una bolla: è un mondo o è già troppo?**

**4. La più scomoda.** Due volte in questo giro la **precisione numerica** ha quasi deciso al posto nostro: due implementazioni equivalenti delle stesse feature con proiezioni a correlazione 0,24, e un criterio (la bolla adiacente) che era il **79,4% del caso**. **Come si evita di costruire una catena di misure in cui ognuna dipende da una precedente già fragile?** Il nostro rimedio è stato: tasso base sempre, due strade indipendenti per ogni misura, e la lettura come giudice finale. Non ci sembra sufficiente.

---

## 5. Dove sta cosa

| | |
|---|---|
| **il banco sonda** | `.scratch/bolle-nitrile/sonda.py` — 20 sentinelle, prima/dopo |
| **la partizione di riferimento** | `.cache/movielens/bolle-nitrile-V7.npy` (1.617 bolle, mediana 34) |
| **la mappa delle bolle** | `.cache/movielens/bolle-nitrile-V7-triangolo.npz` (4,96 M archi) |
| **il modulo dell'inserimento** | `.scratch/inserimento/features.py` + `colloca.py` |
| **i modelli** | `.cache/movielens/inserimento-modello.npz` (film) e `-serie.npz` |
| **le mappe dei due effort** | `.scratch/bolle-nitrile/map.md` e `.scratch/inserimento/map.md` |
| **i 16 report** | `ricerche/` dentro i due effort |

⚠️ **Trappola**: `ml-collaborativo/` contiene un **altro `bolle.py`** che stampa all'import. Metterlo prima nel path fa importare il modulo sbagliato, silenziosamente (mi è successo, e il primo giro di una misura ha prodotto l'output di un altro script).

⚠️ **E una trappola di metodo**: il launcher `.scratch/grafo-servibile/lancia.py` apre il log in **scrittura**. Rilanciando uno script si **perde** il log precedente. Le letture di V1-V5 di `bolle-nitrile` sono perse così.
