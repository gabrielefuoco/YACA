"""fai-ticket-2.py — i ticket della seconda revisione del senior (`todo grafo.md`, 16/10/2026, 12:33).

DICIOTTO voci: due residui numerici di cui ha trovato la causa, otto bug subdoli, tre ottimizzazioni,
quattro semplificazioni, quattro contratti mancanti.

Ogni ticket porta la PROVA (verificata da me, non solo affermata) e — dove l'ho verificata — dice se la
sua spiegazione REGGE o no. Una non regge, e sta scritta come non regge: §0.B, i semi duplicati. Su 60
utenti e 19.218 righe di storia i duplicati sono ZERO, quindi il meccanismo e' vero come difetto latente
ma non spiega il residuo dell'1%. Il fix si fa lo stesso (costa niente ed e' difensivo), ma il residuo
resta senza causa — ed e' scritto li' invece di essere chiuso con una spiegazione comoda.
"""
import pathlib

D = pathlib.Path(__file__).resolve().parent / "issues"
D.mkdir(exist_ok=True)

T = [
("17-parita-non-normalizza", "bug", "ready-for-agent", "", """\
# `parita` non normalizza, e l'artefatto arrotonda senza rinormalizzare: e' il 4,2e-5

**Era il residuo «di causa non isolata» del §4.3 dell'handoff 7. La causa c'e', ed e' questa.**

**Prova, misurata**: in `pipeline.py:esporta` i pesi di `P` sono `round(float(x), 4)`; su una riga con
~15 archi lo scostamento da 1 sale a **7,0e-4** (mediano 1,0e-4), e ci sono **24 pesi a zero** che
restano nel JSON. Poi `pipeline.py:parita` salva `pura = [(int(b), float(x)) ...]` **senza dividere per
`r.sum()`**, mentre `Bolle.js` (`attiva`) divide per `somma`. Le due parti divergono di quel tanto.

E c'e' una cosa da dire: **il mio test lo sapeva**. `test_le_righe_di_transizione_sono_normalizzate` ha
una tolleranza di `5e-3` scelta *apposta* per far passare lo scostamento da arrotondamento. Ho visto il
sintomo e ho allargato la tolleranza invece di chiudere la causa.

**Fix**: in `esporta`, scartare i pesi nulli e arrotondare a 6 decimali **rinormalizzando la riga** dopo
l'arrotondamento (somma esattamente 1 in floating point, a meno di 1e-16); in `parita`, dividere per
`r.sum()` come fa `Bolle.js`. Poi **stringere le tolleranze**: il test dell'artefatto da 5e-3 a 1e-9, e
il test di parita' da 1e-3 a 1e-9 (oggi l'errore e' 4,2e-5: deve scendere sotto 1e-9).
"""),
("18-semi-duplicati-np-add-at", "bug", "ready-for-agent", "", """\
# `e[seme] = w` perde la massa quando `seme` ha indici duplicati (difetto latente)

**Prova**: in NumPy l'assegnamento indicizzato con duplicati sovrascrive, non somma: `e = [0,0];
e[[0,0]] = [3,7]` da' `[7,0]`, non `[10,0]`. `camminata.ppr` fa esattamente questo, e a valle
`normalizza=True` maschera la perdita (divide per `r.sum()`), `normalizza=False` no.

**MA LA SPIEGAZIONE DEL SENIOR NON REGGE, e va detto**: lui collega a questo il residuo dell'1% in
`pesi.py`. **Verificato: su 60 utenti e 19.218 righe di storia i duplicati sono ZERO.** Una storia di
Trakt ha una voce per titolo, e `storia_trakt` cicla `movie` e `show` che sono insiemi disgiunti. Quindi
il meccanismo e' vero come **difetto latente**, ma **non spiega** quel residuo, che resta senza causa.

**Fix lo stesso** (costa nulla ed e' difensivo): `np.add.at(e, seme, w)` e poi `e /= max(e.sum(), 1e-12)`.
Il giorno che un titolo finisse due volte in una storia — per un tipo di segnale doppio, per un merge di
liste, per una storia costruita a mano con `--file` — il peso sarebbe giusto invece che arbitrario.
"""),
("19-uscite-nuove-non-ordinate", "bug", "ready-for-agent", "", """\
# `uscite_nuove` non e' ordinata: prende i primi 10 per INDICE DI CATALOGO

**Prova** (`motore.py:237-240`):
```python
nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0] ...]
liste.append({"tipo": "uscite_nuove", ..., "titoli": [(B.KEYS[x], float(r[x])) for x in nuove[:10]]})
```
`np.where(...)[0]` e' in ordine **crescente di riga del canone**, e `nuove` non viene mai ordinata. Il
tuple porta `float(r[x])`, che da' l'illusione di un ordine per attivazione: **non c'e'**. E' lo stesso
artefatto dell'ordine di indice gia' combattuto nei report precedenti.

**Fix**: ordinare prima del taglio, e usare lo stesso criterio del resto del motore:
`nuove.sort(key=lambda x: (-r[x], -self.VOT[x]))`.
"""),
("20-tre-liste-tre-capienze", "misura", "ready-for-agent", "", """\
# LA CONCLUSIONE DI PRODOTTO E' RIBALTATA: si confrontano 30 slot con 10

**Prova, misurata**: `Motore.lista` su un utente vero restituisce `il_tuo_mondo` **10 titoli**,
`un_passo_fuori` **26**, `nicchia_di_qualita` **10**, `uscite_nuove` **3**. `titoli_di(vicini)` concatena
i primi 10 di `vicini[0]`, poi 10 di `vicini[1]`, poi 10 di `vicini[2]` — e non riordina fra i tre mondi.
Ma in `intero.py` la conclusione «*il quartiere vale piu' del mondo*: 31% in `un_passo_fuori` contro 20%
in `il_tuo_mondo`» confronta i **successi totali** di una lista da ~26-30 slot con una da 10.

A parita' di slot: `il_tuo_mondo` 20%/10 ≈ **2,0% per titolo mostrato**, `un_passo_fuori` 31%/30 ≈
**1,03%**. Cioe' **il tuo mondo e' quasi due volte piu' denso** — l'opposto di quello che ho ripetuto tutto
il giorno, e l'opposto della raccomandazione di prodotto («mostrare prima *un passo fuori*»).

**Fix, due parti**: (1) in `titoli_di`, quando raccoglie da piu' bolle per una sola lista, ordinare i
candidati per `-r[x]` e **fissare la capienza** come per le altre liste; (2) in `intero.py` stampare sia i
colpi totali **sia la precisione per titolo mostrato**, e rifare la misura. La raccomandazione di prodotto
va riscritta col numero nuovo, e l'handoff 6 e 7 corretti.
"""),
("21-slider-canone-gradino", "bug", "ready-for-agent", "", """\
# Lo slider `canone` ha un gradino in 0: e' una MIA regressione di oggi

**Prova** (`motore.py:144-146`): `if slider.get("canone"):` e poi
`out = out * np.exp(-P.ASSE_PESO * np.abs(q - c))` — l'esponente **non e' moltiplicato per
`abs(slider["canone"])`**. Quindi a `canone = 0.0` non si applica niente e a `canone = 0.01` si applica
la penalita' **intera**: un gradino, dove l'utente si aspetta una curva.

Il ramo `cozy` fa la cosa giusta (`quota` e' moltiplicata per `slider["cozy"]`, righe 133-135).

**E la mia verifica di stamattina non poteva vederlo**: ho misurato i voti medi dei mondi a `-1`, `0`,
`+1` — tre punti, tutti lontani dal gradino. Un test che guarda solo gli estremi non vede le
discontinuita' interne: e' una lezione da tenere, non solo un bug da chiudere.

**Fix**: `out = out * np.exp(-P.ASSE_PESO * abs(slider["canone"]) * np.abs(q - c))` — e un test che
confronti `canone = 0.0` con `canone = 1e-6` (i due output devono essere quasi identici).
"""),
("22-motore-ignora-i-ponti-cross", "bug", "ready-for-agent", "", """\
# Il motore Python ignora i 2 ponti cross-medium; quello JavaScript no

**Prova** (`motore.py:73`): `self.INTRA = M["intra"]` — e basta. `M["cross"]` (2 ponti per bolla) non
viene mai letto, quindi `vicini` (riga 228 e 258) e `un_passo_fuori` **non attraversano mai il confine
fra film e serie** in Python. In `Bolle.js` invece la diffusione usa `P`, che l'esportazione costruisce
dall'intera matrice pesata **compresi i cross**: oggi ho esportato i ponti al prodotto e li ho lasciati
fuori dal motore che li ha misurati.

**Fix**: leggere le righe di `W` (il grafo sparso in `mappa-finale-6-2.npz`) invece di `INTRA`, come fa
`esporta`; oppure unire `intra` e `cross` mantenendo l'ordine per peso. Attenzione: cambia `vicini` e
`un_passo_fuori`, quindi **va rimisurato** il ticket 20.
"""),
("23-argmax-su-coseni-a-zero", "bug", "ready-for-agent", "", """\
# `colloca`: se tutti i coseni sono zero, `argmax` restituisce la bolla 0

**Prova** (`collocator.py:201-213`): se i token di un titolo nuovo sono nel vocabolario ma nessuno compare
nelle bolle compatibili per voti, `cos` vale `0.0` su tutte, `np.argmax` restituisce il **primo indice**
(artefatto dell'ordine di indice) e la regola del medium `0.0 <= 0.0 * (1 + margine)` e' `True`, quindi il
titolo atterra in una bolla arbitraria con confidenza `0.0`.

**Fix**: subito dopo `j = int(np.argmax(cos_f))`, `if cos[j] <= 0.0: return None, 0.0, len(tok),
len(tok) - n_dentro` — che e' gia' il modo in cui la funzione segnala «non lo so».
"""),
("24-piano-cieco-ai-file-mancanti", "bug", "ready-for-agent", "", """\
# Il DAG non vede le uscite mancanti, e non propaga se il file e' stato cancellato

**Prova** (`pipeline.py`, `piano()`):
 1. il ciclo sulle uscite legge `prima.get("uscite", {})` — cioe' **solo i file che c'erano quando si e'
    registrato**. Se un pattern di `p["scrive"]` non ha prodotto NIENTE, non se ne accorge: nessun
    controllo su `for pat in p["scrive"]: if not _file_di(pat)`;
 2. la propagazione calcola `suoi = {f.name for pat in q["scrive"] for f in _file_di(pat)}` — **file
    esistenti su disco**. Se un intermedio e' stato cancellato e `q` deve rigenerarlo, `suoi` e' vuoto,
    `suoi & letti` e' vuoto, e il passo a valle **non sa** che il suo input sta per cambiare.

Un piano che non vede un file mancante e' peggio di nessun piano: dice «tutto in ordine» mentre manca un
artefatto.

**Fix**: (1) `for pat in p["scrive"]: if not _file_di(pat): motivi.append(f"uscita mancante: {pat}")`;
(2) nella propagazione confrontare anche i **pattern** dichiarati, non solo i file trovati:
`(suoi | set(q["scrive"])) & (letti | set(p["legge"]))` — con l'avvertenza che i pattern sono glob e il
confronto va fatto sui nomi dei file che il pattern *descrive*, non sulla stringa del pattern.
"""),
("25-titoli-a-capo-carriage", "bug", "ready-for-agent", "", """\
# Un `\\r` in un titolo sfalsa l'allineamento di `titoli-canone.txt`

**Prova, verificata**: oggi `len(TIT) == N` (66.259) ed e' tutto allineato — il bug e' **condizionale**.
Ma in `canon.metadati` si scrive `str(t).replace("\\n", " ")` **senza togliere `\\r`**: se un titolo TMDB
contiene un ritorno carrello, `pt.read_text(...)` (che usa le newline universali) lo converte in `\\n`, e
`.split("\\n")` produce un array **piu' lungo di N**: tutti i titoli successivi slittano di una riga, senza
un'eccezione.

**Fix**: `.replace("\\r", " ").replace("\\n", " ")` in scrittura, e `assert len(d["TIT"]) == N` in lettura
(vedi anche il ticket 34, contratto di lunghezza).
"""),
("26-spread-esclude-part-zero", "bug", "needs-info", "", """\
# `03_divisione_voti`: il pezzo principale e' escluso dal calcolo dello spread finale?

**Affermato dal senior**, e **non l'ho ritrovato**: nella mia copia la riga 125 e'
`NUOVA[m_[part == 0]] = b` (il primo sottocluster conserva l'id del genitore), e la riga 115-116 assegnano
gli altri con `prossimo`. Il `np.setdiff1d(np.unique(NUOVA[MEMBRI[b]]), [b])` che lui cita **non l'ho
trovato** in `steps/03_divisione_voti.py`: o e' in una posizione diversa da quella che ho guardato, o e'
in una versione che ha letto dal digest.

**Cosa serve per chiuderlo**: guardare il calcolo dello spread che DECIDE se una bolla va divisa (il
verdetto, non il resoconto `SP2`), e stabilire se il pezzo con `part == 0` conta. Se non conta, una
suddivisione che non migliora lo spread del pezzo principale viene accettata — e il verdetto e' troppo
generoso. **Si chiude misurando**: ricalcolare lo spread p90/p10 dei pezzi finali della partizione
`bolle-eterogeneo-subvoti.npy` e vedere quanti superano ancora `VOTI_SPREAD_MIN`. Se sono pochi o zero, il
verdetto funziona e il ticket si chiude senza modifiche.
"""),
("27-transizione-potata-artefatto", "task", "ready-for-agent", "", """\
# Salvare la transizione potata: l'avvio da 2,0 s a 0,08

**Dove**: `Motore.__init__` (e ogni arbitro) carica `bolle-eterogeneo-V10-p1.0-triangolo.npz` (6,6M archi),
fa `W + W.T` (13,2M) e `C.pota()` — che e' un ciclo Python su 66.259 righe con `argpartition`.

**Fix**: un artefatto `transizione-top16.npz` con `Tr` gia' potata e normalizzata (1,52M archi),
accompagnato dall'hash del triangolo e da `POTA_PER_RIGA`. Caricarla e' ~80 ms.

**Come si verifica**: `Tr` e' deterministica — l'artefatto si accetta solo se `Tr` ricostruita e `Tr`
salvata sono **identiche** (stesso sha del `.npz` o `np.array_equal` sugli array), e se l'hash registrato
del triangolo corrisponde. Va nel registro degli artefatti di `canon.py` e nel DAG (ticket 14).
"""),
("28-scansioni-e-quote", "task", "ready-for-agent", "", """\
# Tre.497 scansioni di `MEM` e le quote ricalcolate a ogni chiamata

**Prova** (`motore.py:65`): `self.MEMBRI = [np.where(self.MEM == b)[0] for b in range(self.NB)]` — 3.497
scansioni su 66.259 elementi, ~231 milioni di confronti. Lo stesso file `collocator.py:105` usa gia' il
pattern O(N log N).

E alle righe 122-126 (`_quota_per_mondo`), 151 e 232 si ricalcola a ogni chiamata
`B.IS_TV[self.MEM == cb].mean()` e `maschera[m].mean()`.

**Fix**: `ordine = np.argsort(MEM, kind="stable"); confini = np.searchsorted(...)` per i membri, e tre
vettori **statici** precalcolati in `__init__` con `np.bincount`:
`QUOTA_TV = np.bincount(MEM, weights=IS_TV, minlength=NB) / np.maximum(SZ, 1)` (idem COZY, IMP).

**Come si verifica**: le quote devono venire **identiche** (confronto elemento per elemento), e il tempo
di `Motore.lista()` deve scendere da 147 ms verso i 25.
"""),
("29-metadati-nei-tre-punti-rimasti", "task", "ready-for-agent", "", """\
# Tre punti rileggono ancora i Parquet invece di `K.metadati()`

**Dove**: `pipeline.esporta` (per `VOT`), `collocator._mediane_voti` (per i voti) e `motore.carica_titoli`
(per `TIT`). Tutti e tre fanno ancora `pd.read_parquet` con cicli Python su ~117.000 righe, mentre gli
array sono gia' pronti, vettorizzati e **con l'impronta dei generi** in `graph/data/metadati-canone.npz`.

**Fix**: usare `K.metadati()`. Attenzione a `_mediane_voti`: la sua semantica e' la **mediana dei voti
per bolla** (che e' anche `VOTMED` in `motore`), quindi va confrontata prima di sostituire — e va tenuto
il fatto che restituisce `np.nan` per i titoli senza voto, mentre `metadati()` mette 0.
"""),
("30-nove-copie-di-storia", "task", "ready-for-agent", "", """\
# ~450 righe di infrastruttura copiata negli arbitri

**Prova**: otto arbitri (`alfa`, `cache`, `equilibrio`, `freddo`, `lettura`, `liste`, `pesi`, `ricetta`,
`soglia`) hanno ancora una `def storia(u)` locale (~25 righe l'una, che aprono i JSON di Trakt e chiamano
`pd.Timestamp` **dentro** il ciclo) e un caricamento manuale di `tv.parquet` per `NEP` (~20 righe l'una).

E' rimasto il lavoro a meta' del ticket precedente: `canon.storia_trakt` esiste ed e' usata da `motore`,
`intero` e `pesi`, ma gli altri sette la ignorano ancora.

**Fix**: `K.storia_trakt(u)` e `K.metadati()["NEP"]` al posto delle copie. ~450 righe in meno, e gli
arbitri **5x piu' veloci** (il caricamento dei Parquet e' il loro costo).

**Come si verifica**: gli arbitri ristampati devono dare **gli stessi numeri** — e questo e' il caso in
cui possono *non* darli, perche' le copie locali ordinano il tempo in modi diversi (e' la classe del
ticket 01). Se un numero cambia, quella copia stava misurando un'altra cosa: va indagato, non accettato.
"""),
("31-arbitri-legacy", "task", "ready-for-agent", "", """\
# Sei arbitri puntano a partizioni morte, e uno importa un modulo che non esiste

**Prova**: in `graph/measure/` ci sono sei file (`banco.py`, `loo_esatto.py`, `voto_diretto.py`,
`geometria.py`, `coerenza.py`, `sim_trama.py`) che puntano cablati a `bolle-nitrile-V8.npy`,
`bolle-nitrile-V7-triangolo.npz` o `ML / "06c-voto.npz"`, e `banco.py` fa `import colloca as C` — un
modulo che **non esiste in `graph/`**, esiste solo in `.scratch/inserimento/`.

Quindi oggi, in `graph/measure/`, non si distingue a colpo d'occhio quali arbitri verificano il sistema
**attuale** e quali documentano un esperimento del passato.

**Fix**: spostarli in `graph/measure/legacy/` con un README di una riga ciascuno («misura di V8, non
verifica il sistema attuale»), oppure allinearli a `PARTIZIONE`. Non cancellarli: sono l'evidenza di
perche' si e' andati altrove.
"""),
("32-ricetta-formula-vecchia", "task", "ready-for-agent", "", """\
# `ricetta.py` misura una formula diversa da quella del motore

**Prova** (`measure/ricetta.py`): `att_con_asse` usa ancora la **vecchia formula lineare**
`att * (1.0 + 0.5 * (quota - 0.5))` invece dell'esponenziale di `motore.modula()`
(`att * np.exp(P.ASSE_PESO * (quota_cozy - quota_imp))`), e per la fascia ordina ancora brutalmente
`o.sort(key=lambda b: VOTMED[b])` invece di chiamare `modula()`.

E' esattamente il difetto che il ticket 07 ha chiuso per la diffusione: **l'arbitro misura una variante
del motore credendo di misurare il motore**. L'ha visto il senior, non il mio refactor — perche' il
refactor ha guardato il ciclo della diffusione e non la modulazione.

**Fix**: far chiamare a `ricetta.py` direttamente `Motore.modula()`. Poi **ristampare**: le conclusioni
sugli assi (il cozy cambia un terzo dei titoli, l'impegnativo non cambia niente, la fascia fa crollare la
copertura) vanno riverificate con la formula vera.
"""),
("33-peso-tipo-nella-tabella", "task", "ready-for-agent", "", """\
# `PESO_TIPO_FATTORI` non e' nella tabella: cambiarlo NON cambia l'impronta della ricetta

**Prova, verificata**: in `parametri.py` c'e' `PESO_TIPO = "loved 3 · liked 2 · library 1,5 · watched 1"`
— **una stringa descrittiva** — mentre il dizionario vero, `PESO_TIPO_FATTORI = {"loved": 3.0, ...}`, vive
cablato in `camminata.py:39`. Verificato: `PESO_TIPO_FATTORI` **non compare** tra i nomi di `SCHEDA`,
quindi `P.impronta()` non lo copre.

E' la stessa classe del ticket 13 (`PESI_TOKEN` scritto in due posti) e del 21: **due fonti per un
valore**, con la seconda fuori dall'impronta. Conseguenza concreta: se qualcuno cambia i fattori di tipo,
la chiave della cache del prodotto **non cambia**, e le liste vecchie continuano a essere servite.

**Fix**: mettere il **dizionario** come valore di `PESO_TIPO` in `SCHEDA` (come fatto per `PESI_TOKEN`),
e in `camminata.py` usare `P.PESO_TIPO`. L'impronta cambia: artefatto del prodotto da riesportare
(`esporta`, 5 s) e fixture di parita' da rigenerare.
"""),
("34-quattro-contratti-mancanti", "task", "ready-for-agent", "", """\
# Quattro contratti da aggiungere a `canon.py`

Nati da errori reali, come gli altri. Ognuno trasforma un silenzio in un errore:

1. **`assert_stocastica(P, nome)`** — su `bolle.json` e su `Tr`: pesi >= 0 e finiti; per ogni bolla non
   isolata `|sum(P[b]) - 1| <= 1e-9` (avrebbe intercettato subito la deriva del ticket 17, invece di
   farmi **allargare una tolleranza**); mediana dell'auto-anello `P[b][b] > 0.10` (se una rigenerazione
   della mappa perdesse la diagonale, la ritenzione interna della bolla sparirebbe).
2. **`assert_split_temporale(eta_semi, eta_oro)`** — `eta` in giorni da oggi, quindi il passato ha eta'
   PIU' GRANDE: `np.median(eta_semi) > np.median(eta_oro)`. Chiude per sempre la classe del ticket 01
   (tempo invertito in `pesi.py`, taglio per medium in `intero.py`).
3. **`assert_lunghezza_canone(arr, nome)`** — dentro `metadati()` e `titoli()`: `len(arr) == N` e nessun
   `NaN`. E' la guardia del ticket 25.
4. **`assert_monotonia_lista(lista, nome)`** — in `motore.lista()`, prima di restituire: i punteggi di
   ogni lista ordinata devono essere **non crescenti**. Avrebbe fatto scattare subito `uscite_nuove`
   (ticket 19) e `un_passo_fuori` (ticket 20).
"""),
]

for nome, tipo, stato, bloccato, corpo in T:
    righe = [l for l in corpo.strip().splitlines() if l.strip()]
    testo = (f"Status: {stato}\nType: {tipo}\n" + (f"Blocked by: {bloccato}\n" if bloccato else "")
             + "\n" + "\n".join(righe) + "\n")
    (D / f"{nome}.md").write_text(testo, encoding="utf-8")
    print(f"  {nome:<34} {stato:<16} {tipo:<10} {len(testo.splitlines()):>3} righe · {righe[0][:44]}")

print(f"\n  {len(T)} ticket (17-34) in issues/")
