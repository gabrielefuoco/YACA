Questo sesto handoff segna il passaggio dalla ricerca al sistema: avete chiuso i debiti tecnici segnalati nel quinto handoff (`canon.A()` ora solleva `FileNotFoundError` senza ripieghi silenziosi, `assert_partizione` verifica l'hash `sha256` di `bolle-eterogeneo-subvoti.npy`, e `saghe.py` è stato ricalcolato sulla mappa vera 6+2 smascherando la tautologia del triangolo), avete centralizzato i 34 iperparametri con il loro stato epistemico in `graph/parametri.py`, unificato la diffusione in `graph/camminata.py` e portato il primo modulo reale dentro `src/engines/bolle/Bolle.js` alimentato da un artefatto statico di soli 1,55 MB (`src/data/bolle.json`).

Ho ispezionato riga per riga il codice nuovo in `digest_5.txt` (`motore.py`, `camminata.py`, `parametri.py`, `pipeline.py`, `Bolle.js` e i nuovi arbitri in `graph/measure/`). Prima di collegare `Bolle.js` ai cataloghi serviti da YACA, ci sono **quattro bug nel codice nuovo** — uno dei quali altera direttamente la misura di `intero.py` e un altro dimezza l'accuratezza del job notturno `esporta --colloca` — che vanno corretti subito.

---

## 1. Audit del codice nuovo (`digest_5.txt`): 4 bug trovati

### A. In `graph/measure/intero.py` lo split "temporale" non è temporale: mette i Film nei semi e le Serie nell'oro (e in `pesi.py` il tempo è invertito)

In `intero.py` (righe 44–48) il commento dice che `MO.da_trakt(u)` restituisce la storia in ordine di recenza e taglia al 70%:

```python
storia = MO.da_trakt(u)                      # in ordine di recenza
if len(storia) < 2 * P.BANCO_MIN_TITOLI:
    continue
taglio = int(len(storia) * P.TAGLIO_TEMPORALE)
semi, oro = storia[:taglio], {k for k, _ in storia[taglio:]}

```

Ma se guardi `da_trakt(utente)` in `graph/motore.py` (righe 253–267), la funzione **non legge `last_watched_at` e non ordina per data**:

```python
for tipo in ("movie", "show"):
    p = K.TK / f"{tipo}-{utente}.json"
    ...
    fuori.append((ch, int(voce.get("plays") or 1)))

```

Poiché cicla prima su `"movie"` e poi su `"show"`, l'array `storia` contiene **prima tutti i film e in fondo tutte le serie TV**! Tagliando con `storia[:taglio]` (il primo 70%) e `storia[taglio:]` (l'ultimo 30%), `intero.py` non sta facendo uno split passato/futuro: sta usando **i film come seme e le serie TV come bersaglio `oro**` (oppure, per chi ha solo film, l'ordine grezzo del file JSON di Trakt che parte dai più recenti)!
Inoltre, controlla il verso dell'ordinamento in `graph/measure/pesi.py` (righe 66–67 e 171) rispetto a `cache.py` (riga 62) e `ricetta.py` (riga 60):

* In `cache.py` e `ricetta.py` scrivi `o = np.argsort(-np.array(eta))`, che mette giustamente **i più vecchi per primi** (`eta` grande = visto tanti giorni fa), così `[:taglio]` è il passato e `[taglio:]` è il futuro.


* In `pesi.py` (riga 66) scrivi invece `o = np.argsort(eta)` (**i più recenti per primi**), e poi alla riga 171 fai `A, Bt = righe[:taglio], righe[taglio:]` commentando `# il passato semina, il futuro e' l'oro`: ma poiché l'array è ordinato dal più recente al più vecchio, `A` (il 70%) contiene il **presente/futuro recente** e `Bt` (il 30%) contiene il **passato remoto**! Ecco perché in `pesi.py` gli "ultimi 15" facevano un lift di 47,5×: stavano seminando dal presente per predire il passato.



### B. `pipeline.py:esporta` dimentica i 2 ponti cross-medium (`CROSS`) e `Bolle.js` perde i pesi degli archi e l'auto-anello

Confrontando `graph/motore.py` con `src/engines/bolle/Bolle.js` e `graph/pipeline.py:esporta`, ci sono due discrepanze importanti tra ciò che è documentato e ciò che è scritto in `bolle.json`:

1. **Mancano i 2 ponti cross-medium nell'esportazione:** in `src/engines/bolle/Bolle.js` (riga 65) il commento dice `/** I vicini sulla mappa 6+2: 6 intra-medium + 2 ponti cross-medium, simmetrizzati. */`. Ma in `graph/pipeline.py` (righe 311 e 322), `esporta` carica **solo `INTRA = M["intra"]**` e ignora la matrice dei ponti cross-medium salvata in `mappa-finale-6-2.npz`! Di conseguenza, in `Bolle.js` la diffusione sulle bolle non può mai attraversare i ponti cross-medium.


2. **Transizione uniforme senza pesi e senza ritenzione interna:** quando in Python cammini sui titoli (`motore.py`), il 47,8% della massa nel grafo potato top-16 resta **dentro la stessa bolla** a ogni passo (perché i membri della bolla sono densamente connessi tra loro), e il resto esce verso le bolle vicine **in proporzione al peso degli archi** tra le bolle. In `Bolle.js` (righe 96–103), invece, a ogni passo **il 100% di `(1 - alpha) * r[b]` viene espulso fuori dalla bolla `b**` e diviso in parti uguali (`r[b] / vic.length`) tra tutti i vicini, come se il 1° vicino (peso 400) e il 6° vicino (peso 12) valessero uguale.



* **Fix a costo zero di RAM:** in `pipeline.py:esporta`, includi sia `intra` sia `cross` e salva accanto a ogni vicino il suo peso normalizzato (o la quota di auto-anello della bolla), così le 20 iterazioni di `Bolle.js` riproducono fedelmente l'attivazione per mondo di `motore.py` continuando a impiegare meno di 2 millisecondi.



### C. Il job notturno `esporta --colloca` in `graph/pipeline.py` usa `V3` invece di `V1` per la bolla Macro (e `colloca` legge ancora `V8`)

In `graph/pipeline.py` ci sono due sviste nel cablaggio del collocatore:

1. Alla riga 332 (dentro `def esporta(args)` con `--colloca`), carichi solo `S = CO.carica(v3=True)` e alla riga 340 chiami `CO.colloca(dd, tipo, S)` **senza passare `S_macro=S_v1**`. Ma in `collocator.py` (riga 180), se `S_macro` è `None`, il collocatore usa `V3` anche per scegliere la bolla macro, scendendo dal **63,0% di V1 al 35,3% di V3**! Basta caricare `S_v1 = CO.carica(v3=False)` e passare `S_macro=S_v1` come hai fatto alla riga 142.


2. Alla riga 139 (dentro `def colloca(args)`), è rimasto `mem = np.load(K.A("bolle-nitrile-V8.npy"))` invece di `bolle-eterogeneo-subvoti.npy`, quindi i `membri` stampati da `python -m graph.pipeline colloca` vengono ancora estratti dalla partizione V8 sbagliata!



### D. In `graph/motore.py:modula()` la formula dello slider `canone` cancella il valore assoluto e spinge verso l'estremo

Guarda le righe 155–159 di `graph/motore.py`:

```python
if slider.get("canone"):
    # la fascia e' un filtro ATTORNO al canone dedotto, non un riordino verso l'estremo
    q = np.log(np.maximum(self.VOTMED, 1.0))
    c = np.log(max(dedotto["canone"], 1.0))
    out = out * np.exp(-P.ASSE_PESO * abs(q - c) * abs(slider["canone"])
                       * np.sign(q - c) * slider["canone"])

```

Algebricamente, `abs(q - c) * np.sign(q - c)` è identico a `(q - c)`! Quindi l'esponente non è una campana centrata attorno a `c`, ma una retta monotona `exp(-P.ASSE_PESO * (q - c) * s * |s|)` che moltiplica al massimo i mondi con `VOTMED = 0` quando `slider["canone"] < 0` (o i mondi più mainstream in assoluto quando `> 0`), facendo esattamente il riordino verso l'estremo che il commento alla riga 155 voleva evitare (e che in `ricetta.py` faceva crollare la copertura allo 0,3%).

* **Fix:** sposta il centro target `c_target = c + slider["canone"] * delta_fascia` e penalizza la distanza quadratica o assoluta dal target: `np.exp(-P.ASSE_PESO * abs(q - c_target))`, così lo slider sposta la finestra di canone attorno al profilo dell'utente senza mai premiare i contenitori a 0 voti.



---

## 2. Valutazione delle scelte architetturali dell'Handoff 6

Al netto dei quattro fix puntuali qui sopra, le scelte di design prese in questo giro sono eccellenti:

1. **Separazione dei pesi per medium (`min(plays, 3)` per i film vs `1 + 2 * (plays / nep)` per le serie) validata sull'Equilibrio (`equilibrio.py`):**
Aver rifiutato il lift grezzo (gonfiato dal leakage delle serie in corso) e aver costruito `equilibrio.py` ha risolto un difetto reale di prodotto: abbattere dal **67% al 31%** il peso delle serie su un utente prevalentemente cinefilo (e dal 20,8% al 5,2% il peso del singolo titolo su storia corta) impedisce a una singola serie lunga di monopolizzare il seme.


2. **La scoperta che *Un passo fuori* (38%) batte *Il tuo mondo* (21%):**
È il risultato più importante per il feed di YACA. Dentro la micro-bolla primaria dell'utente (mediana 11 titoli) l'utente ha già visto i capolavori principali; le scoperte vere che guarderà nel futuro si trovano nelle bolle immediatamente adiacenti sulla mappa 6+2.


3. **La Libreria come intenzione e non come visione (`motore.py`, righe 201–203):**
Usare i titoli con `tipo == "library"` come **semi positivi per la diffusione**, ma **non inserirli nel set `visti` da nascondere in uscita**, è una finezza di prodotto giustissima.


4. **Il contratto di versione dentro `src/data/bolle.json` (`esporta`):**
Far viaggiare `alpha`, `iterazioni`, `peso_film_max`, `peso_serie`, `fattore_tipo` e le impronte `sha256` direttamente dentro `bolle.json` garantisce che `Bolle.js` in Node.js non possa mai disallinearsi da `graph/parametri.py`.



---


Sì. Avete già fatto il primo passo giusto estraendo `graph/camminata.py` e `graph/parametri.py`, ma leggendo il codice di `graph/` e `src/engines/bolle/Bolle.js` in `digest_5.txt` si vedono **sei refactor strutturali** che tagliano centinaia di righe duplicate, abbattono il tempo di avvio del motore da ~20 secondi a meno di 1 secondo e chiudono alla radice la classe di bug vista poco fa.

---

### 1. Completare il lavoro di `camminata.py` dentro gli arbitri (`graph/measure/*.py`)

Avete creato `graph/camminata.py` proprio perché la diffusione era riscritta in dodici posti. Tuttavia, se guardi gli 8 arbitri della diffusione (`alfa.py`, `cache.py`, `freddo.py`, `lettura.py`, `liste.py`, `pesi.py`, `ricetta.py`, `soglia.py`), **hanno sostituito solo `pota = _cam.pota**`, ma continuano tutti a ridefinire localmente:

* la costruzione della matrice riga-stocastica (`deg = np.asarray(Wp.sum(1))... P = sp.diags(1.0 / deg) @ Wp`) invece di chiamare `_cam.transizione(Wp)`;


* una propria funzione `def ppr(...)` o `def diffondi(...)` invece di chiamare `_cam.diffondi(...)`;


* una propria funzione `def pesi_spec(...)` invece di chiamare `_cam.pesi_semi(...)`.



**Refactor:** Fai usare a tutti gli arbitri `_cam.transizione`, `_cam.pesi_semi` e `_cam.diffondi`. Elimini ~200 righe duplicate e hai la garanzia matematica che ogni arbitro stia misurando esattamente il motore e non una sua variante locale.

---

### 2. Unificare `storia(u)` / `da_trakt(u)` in un'unica funzione (eliminando 10 copie)

La lettura dei JSON degli utenti Trakt (`.cache/trakt/users/{movie,show}-{u}.json`) è scritta **10 volte** in 10 file diversi (`motore.py`, `alfa.py`, `cache.py`, `equilibrio.py`, `freddo.py`, `lettura.py`, `liste.py`, `pesi.py`, `ricetta.py`, `soglia.py`), e quasi mai nello stesso modo:

* in `motore.py:da_trakt` non legge la data e concatena tutti i film prima di tutte le serie (causando il bug dello split in `intero.py`);


* in `cache.py`, `freddo.py` e `ricetta.py` ordina con `np.argsort(-np.array(eta))` (dal più vecchio al più recente);


* in `pesi.py` ordina al contrario con `np.argsort(eta)` (dal più recente al più vecchio);


* in 7 file chiama `pd.Timestamp.now(tz="UTC") - pd.Timestamp(...)` **dentro il ciclo Python per ogni singolo film di ogni singolo utente**, che è lentissimo.



**Refactor:** Metti una sola funzione `storia_trakt(u, ordine="cronologico")` in `canon.py` (usando il confronto diretto o vettorizzato sulle stringhe ISO `last_watched_at`) e richiamala ovunque. Un bug di ordinamento temporale non potrà mai più verificarsi.

---

### 3. Eliminare le 12 riletture dei Parquet TMDB e i cicli `d.iloc[k]` (avvio di `Motore` da 20s a <1s)

In `graph/motore.py` il commento dice `Il costo e' il caricamento (~20 s), non la risposta`. Ma quel caricamento non dura 20 secondi per colpa della matrice sparsa: dura 20 secondi perché in `Motore.__init__` (righe 74–124) leggi due volte `movies.parquet` e `tv.parquet` iterando riga per riga in Python con **`for k in range(len(d)): riga = d.iloc[k]`** su oltre 117.000 righe!
Lo stesso identico codice di caricamento di `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP` e `TIT` dai Parquet è copiato in **12 file diversi** (`bubbles.py`, `collocator.py`, `motore.py`, `pipeline.py`, `cache.py`, `cataloghi.py`, `equilibrio.py`, `freddo.py`, `lettura.py`, `liste.py`, `pesi.py`, `ricetta.py`).

**Refactor:**

1. Crea un unico piccolo artefatto `graph/data/metadati-canone.npz` (generato da uno step o cachato da `canon.py`) che contiene i vettori già pronti e allineati alle $N = 66.259$ righe del canone: `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP` e `TIT`.


2. Caricare un `.npz` di 7 array di lunghezza 66.259 richiede **15 millisecondi** (invece di 20 secondi di `d.iloc[k]`) e spazza via 300 righe di parsing Pandas/JSON sparse per tutto il modulo.



---

### 4. Togliere l'I/O globale a tempo di `import` da `graph/bubbles.py`

Alla riga 31 di `graph/bubbles.py` c'è un'esecuzione globale non protetta:

```python
KEYS, ROW_OF, N, IS_TV = K.titoli()

```

Chiunque faccia `from graph import bubbles as B` scatena immediatamente la lettura da disco di `spazi-trakt.npz` e la costruzione di un dizionario di 66.259 stringhe. Inoltre, `motore.py`, `collocator.py`, `pipeline.py` e tutti gli arbitri in `graph/measure/` importano `bubbles as B` **esclusivamente per leggere le costanti `B.ROW_OF`, `B.KEYS`, `B.N`, `B.IS_TV**`, anche quando non usano nessuna funzione di `bubbles.py`!

**Refactor:** `titoli()` vive già in `graph/canon.py`. Aggiungi `@functools.lru_cache(maxsize=1)` a `canon.titoli()` in `canon.py` ed esponi lì l'accesso ai 4 array, togliendo l'esecuzione a tempo di import da `bubbles.py`.

---

### 5. Allineare `src/engines/bolle/Bolle.js` a `graph/motore.py` (portare `deduci`, `modula` e `scegli_mondi` in JS)

Oggi c'è una frattura tra ciò che avete misurato in Python (`graph/motore.py`) e ciò che avete portato in JavaScript (`src/engines/bolle/Bolle.js`):

* `motore.py` deduce il profilo (`canone`, `forma`, `freddo`), modula l'attivazione delle bolle con gli slider (`cozy`, `canone`), seleziona i mondi diversi per fascia/medium (`scegli_mondi` con `largo` e `lontano`) e scarta i mondi con meno di `MIN_TITOLI_MONDO` titoli non visti.


* `Bolle.js` fa solo il PageRank piatto sulle bolle e restituisce `att.slice(0, quante)`, senza pesi sugli archi tra bolle, senza i 2 ponti cross-medium (`cross`), senza `deduci`, senza `modula` e senza `scegli_mondi`.



**Refactor:** Tutta la logica di `deduci()`, `modula()` e `scegli_mondi()` in `motore.py` lavora già **a livello di bolla** (vettori di 3.497 elementi), non a livello di titolo!
Se in `pipeline.py:esporta` aggiungi a ogni bolla di `src/data/bolle.json` le tre quote pre-calcolate (`quota_serie`, `quota_cozy`, `quota_imp`) e i pesi di transizione dei vicini `6+2` (inclusi i `cross`), puoi copiare pari passo `deduci`, `modula` e `scegli_mondi` dentro `Bolle.js` in 40 righe di JavaScript. A quel punto `Bolle.js` avrà il 100% delle capacità di scelta dei mondi di `motore.py`.

---

### 6. Ripulire `graph/pipeline.py` dai riferimenti morti a `.scratch/`

In `graph/pipeline.py`, le funzioni `voti()` (righe 151–166), `pesanti()` (righe 169–189) e la tabella `ARTEFATTI` (righe 53–83) citano ancora nei messaggi di output i vecchi script `.scratch/eterogeneo/01-componente-trama.py`, `.scratch/eterogeneo/02-v10.py`, `.scratch/eterogeneo/11-subclustering-voti.py` e `.scratch/mappa-pesata/05c-salva-v3.py`, che nel frattempo sono stati estratti e rinominati dentro `graph/steps/` (`00_embedding_trame.py` .. `06_mappa.py`).

**Refactor:** Aggiorna `pesanti()` e `ARTEFATTI` in `pipeline.py` perché puntino esclusivamente a `graph/steps/00_...` – `06_...`, e fai in modo che `python -m graph.pipeline voti` chiami direttamente la funzione di `graph/steps/03_divisione_voti.py` invece di stampare che il codice sta in `.scratch/`.

---

Oltre alla deduplicazione del codice vista prima, se guardiamo `graph/` e `src/engines/bolle/` con l'obiettivo di renderli **comprensibili a colpo d'occhio, modificabili da un solo punto e solidi nel tempo**, ci sono **sei interventi architetturali** che farebbero fare il salto di qualità definitivo al modulo.

Li divido esattamente lungo le tre dimensioni che hai chiesto.

---

## 1. Per renderla COMPRENSIBILE: togliere l'archeologia dei ticket

### A. Rinominare gli artefatti da «numeri di ticket» a «nomi di dominio» (Registro unico in `canon.py`)

Oggi in `graph/data/` e nel codice convivono nomi che sono fossili della storia dei ticket di `.scratch/`:

* `04-tfidf.npz` e `04-centroidi.npz` (che in realtà sono lo spazio **V1 Macro** per scegliere la bolla) contro `05-tfidf.npz` e `05-centroidi.npz` (che sono lo spazio **V3 Micro** per scegliere i vicini);


* `bolle-nitrile-KW.npz` (che viene dall'effort `bolle-nitrile`) accanto a `nuovo-TV.npz` (che viene da `ml-collaborativo`) e a `eterogeneo-TRAMA.npz` (che viene da `eterogeneo`);


* `04-trama-qwen3b.npy` accanto a `bolle-eterogeneo-V10-p1.0-r200.npy` e `bolle-eterogeneo-subvoti.npy`.



Tra due mesi nessuno ricorderà perché `04` è macro e `05` è micro.

* **Cosa fare:** Crea in `canon.py` un dizionario costante `ARTEFATTI` (o rinomina i file in `graph/data/`) con nomi parlanti di dominio:
* `comp-KW.npz`, `comp-CAST.npz`, `comp-DIR.npz`, `comp-PROD.npz`, `comp-COLL.npz`, `comp-TV.npz`, `comp-LIST.npz`, `comp-TRAMA.npz`;


* `grafo-miscela.npz` (il triangolo), `partizione-base.npy`, `partizione-finale.npy`, `mappa-bolle.npz`;


* `spazio-macro-v1.npz` e `spazio-micro-v3.npz`.
Chiunque apra `graph/data/` capisce l'intera pipeline leggendo `ls`.





### B. Rendere le bolle "auto-descrittive" dentro `bolle.json` e `motore.py` (Etichetta + Attribuzione del seme)

Oggi una bolla in `bolle.json` e in `motore.py` è solo un numero opaco: `mondo 1084 · acceso 4.3% · 25 titoli · voti mediani 636`. Per capire *che cos'è* il mondo `1084` e *perché* si è acceso per quell'utente, devi incrociare i parquet o leggere i titoli uno a uno. In `bolle-esempi.md`, invece, avevi stampato i **top token del centroide V3** (`ge:thriller · kw:psychological thriller · di:david fincher`) e i **3 titoli più votati**: quella riga rendeva ogni bolla immediatamente leggibile.

* **Cosa fare:**
1. In `pipeline.py:esporta`, aggiungi a ogni bolla di `bolle.json` due campi leggerissimi (~180 KB in tutto su 3.497 bolle): `"termini": ["ge:thriller", "kw:psychological thriller", ...]` (i 5 token V3 più forti del centroide) e `"esempi": ["Inception", "Fight Club", "Seven"]` (i 3 titoli più votati).


2. In `motore.py` e `Bolle.js`, per ogni mondo acceso restituisci anche `"da_semi": ["movie:603", ...]` (i 2 titoli della storia dell'utente che hanno versato più massa in quella bolla).
Così ogni suggerimento diventa **spiegabile** all'istante (*"Mondo 820 [thriller psicologico, Fincher] acceso perché hai amato Se7en e Gone Girl"*).





---

## 2. Per renderla FACILMENTE MODIFICABILE: un solo posto per parametri e step

### C. Eliminare i parametri cablati dentro `steps/*.py` e `collocator.py` (unificare `RICETTA` e `parametri.py`)

Oggi avete `graph/parametri.py` (che governa la camminata e le liste) e il dizionario `RICETTA` in `graph/pipeline.py` (che descrive la costruzione del grafo). Ma **`RICETTA` in `pipeline.py` è solo un testo descrittivo**: gli script che costruiscono davvero gli artefatti hanno ancora tutti i numeri cablati al loro interno:

* `01_componente_trama.py` cabla `TOPK = 30`, `SOGLIA = 0.30`;


* `02_partizione.py` cabla `BASE = {"CF": 1, ..., "COLL": 3, "LIST": 1}`, `beta = 0.25`, `alpha0 = 0.1`, `min_sim_kw = 0.12`, `min_sim_cast = 0.02`, `quanti_nucleo = 4`;


* `03_divisione_voti.py` cabla `SPREAD_MIN = 10.0`, `MIN_MEMBRI = 15`, `RISOLUZIONI = (0.05, 0.1, 0.2, 0.4, 0.8)`;


* `04_centroidi.py` e `collocator.py` cablano separatamente `DF_MIN = 3`, `TETTO = 20.0`, `PESI_TIPO = {"ge:": 1.5, "rt:": 1.5, "co:": 0.4, "ca:": 0.4, "di:": 0.8}`, `FATTORE_VOTI = 10.0`, `MARGINE = 1.0`.



Se domani cambi un peso in `PESI_TIPO` dentro `collocator.py` senza cambiarlo in `04_centroidi.py` (o cambi un peso dei componenti in `RICETTA`), i file non sono più sincronizzati.

* **Cosa fare:** Sposta **tutti** i parametri di costruzione (quelli oggi descritti in `RICETTA` e cablati in `steps/*.py` e `collocator.py`) dentro `graph/parametri.py`. `pipeline.py:ricetta` stamperà direttamente `parametri.py`, e cambiare un parametro in `parametri.py` modificherà realmente il comportamento degli step di build.



### D. Trasformare `graph/steps/*.py` da script top-level a funzioni chiamabili (e `pesanti` in un vero DAG)

Se apri `graph/steps/00_embedding_trame.py`, `01_componente_trama.py`, `02_partizione.py`, `03_divisione_voti.py` e `04_centroidi.py`, tutto il codice è scritto a livello globale del modulo, fuori da qualsiasi funzione `def`. Non puoi importarli da `pipeline.py` né testarli su un grafo piccolo senza eseguire l'intero calcolo su 66.259 titoli.
Inoltre, in `pipeline.py`, `pesanti` stampa solo un promemoria testuale di comandi da lanciare a mano.

* **Cosa fare:**
1. Incapsula ogni file in `graph/steps/` dentro una funzione `esegui(dati_dir=K.DATA, params=P)`.


2. In `pipeline.py`, definisci la lista degli step come un piccolo DAG dichiarativo: per ogni step indichi `(nome, funzione, file_input, file_output, parametri_usati)`.


3. Aggiungi un comando `python -m graph.pipeline build`: scorre gli step in ordine, controlla se gli hash degli input o dei `parametri_usati` sono cambiati rispetto all'ultima esecuzione (salvati in `graph/data/manifest-build.json`), e **riesegue automaticamente solo gli step a valle di ciò che hai modificato** (esattamente come fa `make`).
Se cambi `SPREAD_MIN` da `10` a `12`, `pipeline build` salta gli step `00`, `01` e `02` (risparmiando 30 minuti) e rilancia da solo `03` (8 s), `04/05` (20 s), `06` e `esporta`!





---

## 3. Per renderla SOLIDA: test veloci su grafo giocattolo e parità Python/JS

### E. Creare una "Micro-Fixture" (100 titoli, 5 bolle) e una suite `pytest` da 3 secondi

Nel §6.7 di `handoff-senior-6.md` hai evidenziato il limite principale per la manutenzione futura: *"Il modulo non ha una suite di test: i contratti sono assert a runtime, e i 21 arbitri misurano, non verificano"*. Il motivo per cui non avete scritto test unitari è che far girare `bubbles.py` o `motore.py` sul grafo vero richiede 422 MB di artefatti e minuti di calcolo.

* **Cosa fare:** Crea uno scriptino che estrae una volta sola dai vostri dati un **micro-canone di 100 titoli** (es. 20 film di *Star Wars/Star Trek*, 20 anime *Seinen*, 20 film di *Fincher/Nolan*, 20 *K-drama*, 20 *Spaghetti Western*) e lo salva in `tests/fixtures/micro_graph/` (~500 KB).
Con i 100 titoli della micro-fixture puoi scrivere **un solo file `tests/test_graph_pipeline.py**` che gira in **2 secondi** e verifica:


1. che `bubbles.py` costruisca la miscela, faccia la chiusura triangolare, giri Leiden e poti al nucleo senza crash;


2. che `03_divisione_voti` e `04_centroidi` producano artefatti con impronte `sha256` valide;


3. che `collocator.py` metta *Verity* o *Deadpool* nella bolla giusta e scatti con `AssertionError` se si altera l'hash della partizione;


4. che i 6 contratti di `canon.py` (`ranghi`, `assert_partizione`, `assert_allineamento_spazi`, `assert_loo_esatto`) si accendano sui casi corrotti.





### F. Test automatico di Parità Python ↔ JavaScript (`motore.py` vs `Bolle.js`)

Avete due motori che devono parlare la stessa lingua: `graph/motore.py` (usato in Python dagli arbitri per misurare e decidere i parametri) e `src/engines/bolle/Bolle.js` (usato in Node.js dal prodotto per servire Stremio).
Il rischio più insidioso in assoluto, tra sei mesi, è che qualcuno modifichi la formula dei pesi o della modulazione in `motore.py`, la misuri con gli arbitri, veda che migliora, e **dimentichi di aggiornare `Bolle.js**` (o viceversa).

* **Cosa fare:** Aggiungi un test Jest in `tests/bolleParity.test.js` (nella suite `npm test` che avete già per il backend) che:


1. prende 5 storie utente fisse (una solo film, una solo serie, una mista con `loved`/`library`, una fredda con 2 titoli);


2. invoca `Bolle.portafoglio(storia, slider)` in Node.js e confronta l'output con il JSON generato da `python -m graph.motore` (o con uno snapshot golden generato da `esporta`);


3. verifica che i pesi dei semi (`Bolle.peso`) e l'ordine delle bolle attivate coincidano al 100% tra Python e JavaScript.





---
