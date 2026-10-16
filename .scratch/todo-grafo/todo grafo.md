Ho letto per intero i file del modulo, gli step, i 21 arbitri, il motore JavaScript e i test contenuti nel digest.

Di seguito trovi la revisione completa divisa nelle quattro categorie che hai chiesto — partendo dalla **causa esatta dei due residui numerici insoluti che hai segnalato nel §4.3**, passando per i **bug subdoli**, le **ottimizzazioni**, le **semplificazioni** e i **contratti mancanti**. Per ogni punto c'è il file, le righe, il meccanismo del problema e la soluzione.

---

## 0. La spiegazione dei due residui numerici insoluti (§4.3 dell'Handoff 7)

Nel §4.3 segnali due discrepanze di cui non avevi isolato la causa. Entrambe hanno una spiegazione algebrica esatta nel codice:

### Residuo A — Perché la parità Python↔JS ha un errore fino a `4,2e-5`

Guarda come `graph/pipeline.py:esporta` (righe 253–262) salva le probabilità di transizione `"P"` in `src/data/bolle.json`, e come le usano `pipeline.py:parita` (righe 340–347) e `src/engines/bolle/Bolle.js`:

1. **Arrotondamento a 4 decimali senza rinormalizzazione:** in `pipeline.py:253` scrivi `(round(float(x), 4) for x in riga.data)`. Su una riga con ~15 archi uscenti, arrotondare ciascun peso a $10^{-4}$ fa sì che la somma della riga $\sum_j P_{bj}$ non sia più $1{,}0000$, ma oscilli tra $0{,}9994$ e $1{,}0006$ (in più, gli archi con peso $< 0{,}00005$ diventano `[dest, 0.0]` e restano nel JSON).


2. **Normalizzazione finale presente in JS ma assente in `pipeline.py:parita`:** poiché le righe di `Q` non sommano più esattamente a $1$, dopo 20 iterazioni di `r = alpha * meme + (1 - alpha) * (Q.T @ r)` la massa totale `r.sum()` deriva da $1{,}0$ di circa $\pm 5 \times 10^{-4}$. In `Bolle.js` (`attiva`), alla fine del ciclo dividi ogni elemento per `somma = r.reduce((a, x) => a + x, 0)` (`r[b] / somma`); in `pipeline.py:parita` (riga 347), invece, salvi `float(x)` **senza dividere per `r.sum()**` (`pura = [(int(b), float(x)) for b, x in enumerate(r) if x > 0]`)!



* **Soluzione:** in `pipeline.py:esporta` (riga 253) scarta gli zeri, arrotonda a 6 decimali (o rinormalizza la riga arrotondata), e in `pipeline.py:parita` (riga 347) dividi `r` per `r.sum()` esattamente come fa `Bolle.js`. L'errore scende da `4,2e-5` a $< 10^{-9}$.



### Residuo B — Perché in `camminata.ppr` 2 righe su 6 differivano di `< 1%`

Guarda `graph/camminata.py:ppr` (righe 68–72):

```python
e = np.zeros(Tr.shape[0], np.float64)
if pesi is None:
    e[seme] = 1.0 / max(len(seme), 1)
else:
    e[seme] = np.asarray(pesi, np.float64) / max(float(np.sum(pesi)), 1e-12)

```

In NumPy, l'assegnamento indicizzato **`e[seme] = w` NON somma i pesi se `seme` contiene un indice duplicato**: sovrascrive `e[r]` con l'ultima occorrenza e **perde la massa delle occorrenze precedenti** (facendo scendere `e.sum()` sotto $1{,}0$)!
Quando un utente nei file JSON di Trakt ha due voci che mappano sulla stessa riga `r` del canone (o in `motore.py` ha un titolo sia in `watched` sia in `loved`/`library`), `e.sum() < 1.0`. Se poi chiami `ppr(..., normalizza=False)` contro `ppr(..., normalizza=True)` (che divide alla fine per `r.sum()`), o cambi l'ordine dell'array `seme` (come in `pesi.py` dove hai invertito `pos_p[::-1]`), quale delle due occorrenze duplicate vince la sovrascrittura cambia!

* **Soluzione:** in `graph/camminata.py:ppr` (righe 68–72), sostituisci `e[seme] = ...` con `np.add.at(e, seme, w)` seguito da `e /= max(float(e.sum()), 1e-12)`.



---

## 1. Bug subdoli (non crashano, ma alterano i risultati o le conclusioni)

### 1.1 In `motore.py:lista()`, la lista `uscite_nuove` NON ordina per attivazione `r`: prende i primi 10 per indice di catalogo!

* **Dove:** `graph/motore.py`, righe 218–221.


* **Cosa succede:**
```python
nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0]
         if int(self.MEM[x]) in set(bolle) and x not in visti]
liste.append({"tipo": "uscite_nuove", "mondo": None,
              "titoli": [(B.KEYS[x], float(r[x])) for x in nuove[:10]]})

```


`np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0]` restituisce le righe in **ordine crescente di indice nel canone (`0, 1, 2, ...`)**. `nuove` non viene mai ordinata né per `-r[x]` né per `-self.VOT[x]` prima di fare `nuove[:10]`, anche se nel dizionario di output alleghi `float(r[x])` dando l'illusione che sia ordinata per attivazione! È lo stesso artefatto dell'ordine di indice che avevate combattuto nei report precedenti.


* **Soluzione:** ordina prima del taglio: `nuove.sort(key=lambda x: (-r[x], -self.VOT[x]))`.



### 1.2 In `motore.py:lista()`, `un_passo_fuori` restituisce fino a 30 titoli (non 10) e non li ordina tra i 3 mondi vicini — gonfiando di 3× il conteggio del «31%–38%» in `intero.py`!

* **Dove:** `graph/motore.py`, righe 155–166 (`titoli_di`) e 210–216 (`righe_titoli(vicini)`); `graph/measure/intero.py`, righe 52–57.


* **Cosa succede:** `titoli_di(bolle, r, visti, quanti_per_mondo=10)` prende i primi 10 titoli di `vicini[0]`, seguiti dai primi 10 di `vicini[1]`, seguiti dai primi 10 di `vicini[2]`.
Questo produce due distorsioni silenziose:


1. **`un_passo_fuori` contiene fino a 30 titoli**, mentre `il_tuo_mondo`, `uscite_nuove` e `nicchia_di_qualita` ne contengono al massimo **10** (e `mondo_b` ne contiene **8**). Quando in `intero.py` (riga 55) conti `per_tipo[li["tipo"]] += 1` e concludi che *«il quartiere vale più del mondo: 31%–38% in un_passo_fuori contro 20%–21% in il_tuo_mondo»*, stai confrontando i successi totali di una lista da **30 slot** contro una da **10 slot**! A parità di slot (precisione per card), `il_tuo_mondo` fa $20\% / 10 = \mathbf{2{,}0\%\text{ per slot}}$, mentre `un_passo_fuori` fa $31\% / 30 = \mathbf{1{,}03\%\text{ per slot}}$: cioè `il_tuo_mondo` è quasi **due volte più denso** di `un_passo_fuori`!


2. Poiché `titoli_di` concatena per bolla senza riordinare per `-r[x]`, le prime 10 posizioni di `un_passo_fuori` appartengono **tutte esclusivamente a `vicini[0]**`, anche se il 1° titolo di `vicini[1]` ha un'attivazione `r` 10 volte superiore al 10° titolo di `vicini[0]`.




* **Soluzione:** in `titoli_di(bolle, r, visti, ...)` (quando raccoglie da più bolle per una singola lista come `un_passo_fuori`), ordina i candidati raccolti per `-r[x]` (o fai round-robin tra i 3 vicini) e fissa la capienza della lista; in `intero.py`, stampa sia i colpi totali sia la **precisione per titolo mostrato** di ciascuna lista.



### 1.3 In `motore.py:modula()`, lo slider `canone` ha una discontinuità a gradino in `0.0`

* **Dove:** `graph/motore.py`, righe 135–145.


* **Cosa succede:**
```python
if slider.get("canone"):
    q = np.log(np.maximum(self.VOTMED, 1.0))
    c = np.log(max(dedotto["canone"], 1.0)) + slider["canone"] * P.DELTA_FASCIA
    out = out * np.exp(-P.ASSE_PESO * np.abs(q - c))

```


Quando `slider["canone"] == 0.0`, `if slider.get("canone"):` è `False` e `out` resta identico ad `att`. Ma appena l'utente sposta lo slider a `0.01`, l'`if` diventa `True` e scatta l'intera penalità `np.exp(-P.ASSE_PESO * np.abs(q - c))`, perché `P.ASSE_PESO` **non è moltiplicato per `abs(slider["canone"])**` (a differenza di `cozy` alla riga 131, dove `quota` è moltiplicata per `slider["cozy"]`)!


* **Soluzione:** o applichi sempre la campana attorno a `c` anche a `slider["canone"] == 0`, oppure moltiplichi l'esponente per `abs(slider["canone"])`: `out = out * np.exp(-P.ASSE_PESO * abs(slider["canone"]) * np.abs(q - c))`.



### 1.4 In `motore.py`, `self.INTRA` ignora i 2 ponti `cross` (mentre `Bolle.js` li usa)

* **Dove:** `graph/motore.py`, riga 66 (`self.INTRA = M["intra"]`).


* **Cosa succede:** mentre in `pipeline.py:esporta` hai unito correttamente l'intera matrice sparsa `W` (che include i 6 archi `intra` e i 2 ponti `cross`) dentro `bolle[b]["P"]` per `Bolle.js`, `motore.py` continua a leggere solo `M["intra"]` e ignora `M["cross"]`. Quindi in Python `un_passo_fuori` e il campo `vicini` dei mondi non attraversano mai il ponte cross-medium.


* **Soluzione:** in `motore.py:66`, unisci `M["intra"]` e `M["cross"]` (o leggi direttamente le righe di `W` da `mappa-finale-6-2.npz`).



### 1.5 In `collocator.py:colloca()`, se tutti i coseni nel filtro sono `0.0`, `argmax` restituisce la bolla `0` invece di `None`

* **Dove:** `graph/collocator.py`, righe 201–213.


* **Cosa succede:** se un titolo nuovo ha token presenti in `vocab`, ma nessuno di quei token compare nelle bolle compatibili per voti (`ok`), `cos` su quelle bolle vale `0.0`. `np.argmax(cos_f)` restituisce il primo indice `j` che ha valore `0.0` (artefatto dell'ordine di indice) e nella regola di medium `0.0 <= 0.0 * (1 + margine)` è `True`, quindi restituisce una bolla arbitraria con confidenza `0.0`.


* **Soluzione:** subito dopo `j = int(np.argmax(cos_f))`, se `cos[j] <= 0.0` restituisci `None, 0.0, len(tok), len(tok) - n_dentro`.



### 1.6 In `pipeline.py:piano()`, il DAG non vede se un file di uscita manca del tutto e non propaga a valle se il file intermedio non è ancora su disco

* **Dove:** `graph/pipeline.py`, righe 450–497.


* **Cosa succede:**
1. Alla riga 479 controlla `for nome, h in prima.get("uscite", {}).items():`. Ma se un pattern in `p["scrive"]` non ha prodotto alcun file su disco (o `prima["uscite"]` era vuoto quando si è lanciato `--registra`), `piano()` non controlla `for pat in p["scrive"]: if not _file_di(pat): motivi.append(...)`!


2. Alle righe 491–492, la propagazione a valle calcola `suoi = {f.name for pat in q["scrive"] for f in _file_di(pat)}` cercando i file **già esistenti su disco**. Se un file intermedio è stato cancellato e `q` deve rigenerarlo, `_file_di(pat)` restituisce `[]`, `suoi & letti` è vuoto, e lo step a valle `p` non sa che `q` riscriverà il suo input!




* **Soluzione:**
1. Aggiungi `for pat in p["scrive"]: if not _file_di(pat): motivi.append(f"uscita mancante: {pat}")`.


2. Nella propagazione (riga 491), unisci ai file su disco anche i pattern dichiarati: `(suoi | set(q["scrive"])) & (letti | set(p["legge"]))`.





### 1.7 In `canon.py:metadati()`, un carattere `\r` in un titolo TMDB sfalsa l'allineamento di `titoli-canone.txt`

* **Dove:** `graph/canon.py`, righe 530 e 576.


* **Cosa succede:** alla riga 576 scrivi `str(t).replace("\n", " ")`, ma non rimuovi `\r`. Quando `pt.read_text(encoding="utf-8")` rilegge il file in modalità universal newlines di Python, qualsiasi `\r` rimasto in una stringa viene convertito in `\n`, e `.split("\n")` alla riga 530 produce un array più lungo di `N`, facendo slittare tutti i titoli successivi di una riga senza lanciare eccezioni!


* **Soluzione:** usa `.replace("\r", " ").replace("\n", " ")` in scrittura e aggiungi `assert len(d["TIT"]) == N` in lettura.



### 1.8 In `steps/03_divisione_voti.py`, il pezzo principale (`part == 0`) è ancora escluso dal calcolo dello spread finale

* **Dove:** `graph/steps/03_divisione_voti.py`, riga 125 (`digest_7.txt`).


* **Cosa succede:** alla riga 115 assegni `NUOVA[m_[part == 0]] = b` (il primo sottocluster conserva l'ID `b` del genitore), ma alla riga 125 calcoli `pezzi = [SP2[p] for p in np.setdiff1d(np.unique(NUOVA[MEMBRI[b]]), [b])]`, escludendo proprio `b` dal verdetto sullo spread.


* **Soluzione:** togli `np.setdiff1d(..., [b])` e usa `[SP2[p] for p in np.unique(NUOVA[MEMBRI[b]])]`.



---

## 2. Ottimizzazioni (dove tagliare tempi di avvio e latenza delle chiamate)

1. **Tagliare i restanti 2,0 secondi di avvio di `Motore()` a 0,08 secondi salvando `transizione-top16.npz`:**
Oggi `Motore.__init__` (`graph/motore.py:58–62`) e tutti gli arbitri caricano a ogni avvio `bolle-eterogeneo-V10-p1.0-triangolo.npz` (6,6M archi), fanno `W + W.T` (13,2M archi) ed eseguono `C.pota()` (un ciclo Python `for i in range(66259)` con `argpartition`).
Poiché il triangolo e `P.POTA_PER_RIGA = 16` sono fissi, salva in `graph/data/transizione-top16.npz` la matrice `Tr` già potata e normalizzata (solo 1,52M archi, accompagnata dall'hash del triangolo e da `POTA_PER_RIGA`). Caricarla direttamente richiede **80 ms** invece di 2,0 s.


2. **Tagliare la latenza di `Motore.lista()` da 147 ms a ~25 ms eliminando le scansioni `self.MEM == b`:**
Dentro `graph/motore.py`:
* Alla riga 65, `self.MEMBRI = [np.where(self.MEM == b)[0] for b in range(self.NB)]` esegue 3.497 scansioni dell'array `self.MEM` (231 milioni di confronti booleani). Sostituiscilo con il pattern $O(N \log N)$ che usi già in `collocator.py:105`: `ordine = np.argsort(self.MEM, kind="stable"); confini = np.searchsorted(self.MEM[ordine], np.arange(self.NB + 1))`.


* Alle righe 122–126 (`_quota_per_mondo`), 151 (`scegli_mondi`) e 232 (`lista`), il codice ricalcola a ogni chiamata `B.IS_TV[self.MEM == cb].mean()` e `maschera[m].mean()`. Precalcola una volta sola in `__init__` i tre vettori statici con `np.bincount`:


```python
self.QUOTA_TV = np.bincount(self.MEM, weights=B.IS_TV, minlength=self.NB) / np.maximum(self.SZ, 1)
self.QUOTA_COZY = np.bincount(self.MEM, weights=self.COZY, minlength=self.NB) / np.maximum(self.SZ, 1)
self.QUOTA_IMP = np.bincount(self.MEM, weights=self.IMP, minlength=self.NB) / np.maximum(self.SZ, 1)

```


Il costo di `modula()` e `scegli_mondi()` scende a zero.




3. **Usare `K.metadati()` dentro `pipeline.py:esporta`, `collocator.py:_mediane_voti` e `motore.py:carica_titoli`:**
Quei tre punti rileggono ancora `movies.parquet` e `tv.parquet` con cicli Python su 117.000 righe per estrarre `VOT`, `NEP` e `TIT`, che sono già pronti e vettorizzati in `K.metadati()`.



---

## 3. Semplificazioni e Refactor (il rapporto 4.622 righe codice vs 4.040 righe arbitri)

Hai notato che gli arbitri (`4.040` righe) sono grandi quasi quanto il sistema che misurano (`4.622` righe). Guardando `graph/measure/*.py`, circa **1.400 di quelle 4.040 righe non sono logica di misura, ma codice infrastrutturale copiato e incollato** prima che esistessero `canon.storia_trakt`, `canon.metadati` e `camminata.transizione`:

1. **Sostituire le 8 copie locali di `def storia(u):` e i caricamenti manuali di `NEP`/`VOT` negli arbitri:**
In `alfa.py`, `cache.py`, `equilibrio.py`, `freddo.py`, `lettura.py`, `liste.py`, `pesi.py`, `ricetta.py` e `soglia.py` è rimasta in ciascun file la vecchia `def storia(u):` (25 righe per file che aprono i JSON Trakt e chiamano `pd.Timestamp` dentro il ciclo) e il caricamento manuale di `tv.parquet` per `NEP` (20 righe per file). Sostituendoli con `K.storia_trakt(u)` e `K.metadati()["NEP"]`, tagli ~450 righe duplicate e rendi tutti gli arbitri 5× più veloci.


2. **Separare gli arbitri vivi dagli arbitri storici V7/V8:**
In `graph/measure/` ci sono 6 file (`banco.py`, `loo_esatto.py`, `voto_diretto.py`, `geometria.py`, `coerenza.py`, `sim_trama.py`) che puntano ancora in modo cablato a `bolle-nitrile-V8.npy`, `bolle-nitrile-V7-triangolo.npz` o `ML / "06c-voto.npz"`, e `banco.py` fa `import colloca as C` (un modulo che non esiste in `graph/`, esiste solo in `.scratch/inserimento/`). Spostarli in `graph/measure/legacy/` (o allinearli a `PARTIZIONE`) chiarisce subito quali arbitri verificano il sistema attuale e quali documentano il passato.


3. **Allineare la formula dell'asse in `ricetta.py` a quella di `motore.py`:**
In `graph/measure/ricetta.py` (riga 158), `att_con_asse` usa ancora la vecchia formula lineare `att * (1.0 + 0.5 * (quota - 0.5))` invece dell'esponenziale `att * np.exp(P.ASSE_PESO * (quota_cozy - quota_imp))` di `motore.py:131`, e per la fascia (righe 131–133) ordina ancora brutalmente `o.sort(key=lambda b: VOTMED[b])` invece di chiamare `motore.modula()`. Fai chiamare a `ricetta.py` direttamente `Motore.modula()`!


4. **Spostare i 4 pesi `PESO_TIPO_FATTORI` da `camminata.py` a `parametri.py`:**
In `graph/parametri.py` (riga 60), `PESO_TIPO` è salvato come stringa descrittiva `"loved 3 · liked 2 · library 1,5 · watched 1"`, mentre il dizionario vero `PESO_TIPO_FATTORI = {"loved": 3.0, ...}` vive cablato in `graph/camminata.py:39`. Se qualcuno cambia `PESO_TIPO_FATTORI` in `camminata.py`, `parametri.impronta()` **non cambia**! Metti direttamente il dizionario `{"loved": 3.0, "liked": 2.0, "library": 1.5, "watched": 1.0}` come valore di `PESO_TIPO` dentro `SCHEDA` in `parametri.py` (esattamente come hai fatto per `PESI_TOKEN` alla riga 243).



---

## 4. I contratti mancanti da aggiungere a `graph/canon.py`

I contratti attuali in `canon.py` coprono il pareggio di `argsort`, il verso, il LOO, l'allineamento di `idf`/`vocab` e l'hash della partizione. Per blindare i punti emersi sopra, ti consiglio di aggiungere questi **quattro contratti**:

1. **`assert_stocastica(P_bolle, nome="P")` (Contratto di conservazione della massa sulla mappa esportata):**
Verifica su `bolle.json` (e su `Tr`) che:
* tutti i pesi di transizione siano $\ge 0$ e finiti;


* per ogni bolla non isolata, $\vert{}\sum_{(d, p) \in P[b]} p - 1{,}0\vert{} \le 10^{-5}$ (avrebbe intercettato subito la deriva `4,2e-5` causata da `round(..., 4)` in `esporta`);


* la mediana dell'auto-anello $P_{bb}$ sia $> 0{,}10$ (impedisce che una rigenerazione della mappa perda per errore la diagonale / ritenzione interna della bolla).




2. **`assert_split_temporale(eta_semi, eta_oro, nome="split")` (Contratto anti-inversione passato/futuro):**
Verifica che `eta_semi.min() >= eta_oro.max()` (o `np.median(eta_semi) > np.median(eta_oro)` dove `eta` è in giorni da oggi). Chiude per sempre la classe di bug che aveva colpito `pesi.py` (tempo invertito) e `intero.py` (taglio per medium invece che per data).


3. **`assert_Lunghezza_Canone(arr, nome)` dentro `metadati()` e `titoli()`:**
Verifica che ogni array restituito da `K.metadati()` (`TIT`, `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP`) abbia `len(arr) == N` e nessun `NaN`.


4. **`assert_monotonia_lista(lista_titoli, nome)` in `motore.py:lista()`:**
Prima di restituire `liste` da `Motore.lista()`, verifica che nelle liste ordinate per attivazione (`il_tuo_mondo`, `uscite_nuove`, `mondo_b`) la sequenza dei punteggi `[score for _, score in li["titoli"]]` sia monotona non crescente (`all(s[i] >= s[i+1] for i in range(len(s)-1))`). Questo contratto avrebbe fatto scattare immediatamente un `AssertionError` su `uscite_nuove` (che usciva ordinata per indice di catalogo invece che per `r[x]`) e su `un_passo_fuori` (che concatenava 3 bolle senza riordinare)!


