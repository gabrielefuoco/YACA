"""fai-ticket.py — i ticket della revisione del senior (`todo grafo.md`, 16/10/2026).

Sedici voci: 4 BUG, 6 refactor strutturali, 6 interventi architetturali. Ogni ticket porta la prova
(dove sta il codice, come l'ho verificato), il fix, e come si verifica che sia chiuso.
Le priorita' sono nell'ordine: i bug prima, perche' alterano le misure su cui ho deciso.
"""
import pathlib

D = pathlib.Path(__file__).resolve().parent / "issues"
D.mkdir(exist_ok=True)

T = [
# ---------------------------------------------------------------- 1-5: I BUG
("01-storia-temporale", "bug", "ready-for-agent", "", """\
# `da_trakt` non riporta la data: lo split "temporale" e' film-semi / serie-oro

**Prova** (`graph/motore.py:294-310`): `da_trakt` cicla `for tipo in ("movie","show")` e non legge mai
`last_watched_at`. L'array e' quindi **tutti i film e poi tutte le serie**. Chi taglia `storia[:70%]` /
`storia[70%:]` credendo di separare passato e futuro sta separando **medium**: i film seminano, le serie
sono l'oro. Lo fanno `intero.py` e `pesi.py`.

**Fix** (e' anche il refactor 2 del senior, la radice di questa classe di bug): **una sola** funzione
`storia_trakt(u, ordine="cronologico")` in `graph/canon.py` — legge `last_watched_at` (ISO, confronto
diretto di stringhe), restituisce `[(chiave, plays, eta_giorni, tipo)]`, con `ordine` che decide il
verso. La chiamano `motore.da_trakt`, e i 10 arbitri che oggi rileggono i JSON ognuno a modo suo.
Elimina ~10 copie e il calcolo di `now - last_watched_at` dentro il ciclo per riga.

**Chiuso quando**: `grep -rn "last_watched_at" graph/measure/` non trova piu' parsing locali (solo la
chiamata a `K.storia_trakt`), e `intero.py` ristampato da' un numero nuovo e credibile.
"""),
("02-pesi-verso-invertito", "bug", "ready-for-agent", "01", """\
# In `pesi.py` il tempo e' invertito: semina dal presente per predire il passato

**Prova** (`graph/measure/pesi.py:74`): `o = np.argsort(eta)` con `eta = adesso - ultima_visione`.
`eta` grande = visto tanto fa = **passato**. Quindi `argsort(eta)` mette **i piu' recenti per primi**,
e `A, Bt = righe[:taglio], righe[taglio:]` (commentato «il passato semina, il futuro e' l'oro») semina
col **presente** e misura sul **passato remoto**. Gli altri arbitri fanno il contrario e giusto:
`cache.py:67`, `freddo.py:71`, `ricetta.py:72` usano `np.argsort(-np.array(eta))`.

**Fix**: `argsort(-eta)`, come gli altri — o meglio, usare `K.storia_trakt(u, ordine="cronologico")`
del ticket 01 e non ordinare piu' a mano.

**Chiuso quando**: `pesi.py` ristampato, e la tabella dei pesi/ha il verso giusto in tutti gli arbitri
(un solo posto decide l'ordine).
"""),
("03-intero-rimisura", "misura", "ready-for-agent", "01", """\
# `intero.py` va rimisurato: il 5,0% e 63x sono misurati su uno split rotto

**Prova**: `intero.py` usa `MO.da_trakt(u)` (ticket 01) e taglia `storia[:70%]`. Con l'ordine rotto, la
precisione 5,0% e il 63x sul pavimento 0,08% misurano «dai film indovina le serie», non «dal passato
indovina il futuro». **Il numero headline dell'handoff 6 e' quindi sospetto.**

**Fix**: dopo il ticket 01, rieseguire `python graph/measure/intero.py` (~1 min). Riportare il numero
nuovo **anche se e' peggiore**, e correggere `handoff-senior-6.md` §3 e §4 dove il 5,0% e' citato.
Attenzione: lo split cronologico e' piu' difficile di quello per medium per costruzione (il futuro
remoto e' piu' lontano del presente), quindi un numero piu' basso e' **atteso** e non e' una
regressione. Va confrontato con il pavimento ricalcolato allo stesso modo.
"""),
("04-export-cross-pesi", "bug", "ready-for-agent", "", """\
# L'artefatto perde i 2 ponti cross-medium, i pesi degli archi e la ritenzione interna

**Prova** (`graph/pipeline.py:331-332`): `M = np.load(D/"mappa-finale-6-2.npz")` e poi **solo**
`INTRA = M["intra"]`. Ma quel file contiene anche `cross` (3497x2), `cross_lun`, `quota_tv` e —
regalo — **il grafo sparso pesato** (`grafo_data` 45.194 float64, `grafo_indices`, `grafo_indptr`).
Quindi: in `Bolle.js` la diffusione non attraversa mai i ponti fra film e serie, e tratta ogni vicino
allo stesso modo **senza pesi** (`Bolle.js` divide `r[b]/vic.length`). In Python invece il 47,8% della
massa resta nella bolla a ogni passo, e il resto esce in proporzione ai pesi.

**Fix**: in `esporta`, scrivere per ogni bolla la **riga di transizione normalizzata** presa dal grafo
sparso `P = D^-1 @ W` (i 6+2 vicini coi loro pesi **piu' la quota di auto-anello**), e in `Bolle.js`
usare quella riga al posto della divisione uniforme. Costo in RAM: zero (i pesi sono 45.194 numeri).
L'auto-anello e' il pezzo che manca oggi: senza, il 100% di `(1-alpha)*r[b]` esce dalla bolla.

**Chiuso quando**: una storia di prova da' in JS le stesse bolle in cima che da' in Python, e il
confronto numerico (ticket 16) sta entro l'1%.
"""),
("05-colloca-v1-e-v8", "bug", "ready-for-agent", "", """\
# Il job notturno usa V3 per la bolla macro, e `colloca` legge ancora la partizione V8

**Prova**, due punti:
 1. `graph/pipeline.py:355` (dentro `esporta --colloca`): `S = CO.carica(v3=True)` e poi `colloca(dd,
    tipo, S)` **senza** `S_macro`. Ma in `collocator.py:244`, se `S_macro` e' `None` si usa `S` anche
    per la **macro** — scendendo dal **63,0%** (V1) al **35,3%** (V3). La stessa funzione righe 165-171
    lo fa bene (`S_v1 = C.carica(v3=False)` e `S_macro=S_v1`).
 2. `graph/pipeline.py:167` (dentro `colloca`): `mem = np.load(K.A("bolle-nitrile-V8.npy"))` — la
    partizione **superata**. `collocator.py:112` lo dice esplicitamente: la partizione e' quella
    finale. Qui e' rimasto V8, quindi i `membri` stampati vengono dalla partizione sbagliata.

**Fix**: punto 1, caricare `S_v1` e passarlo. Punto 2, `K.A("bolle-eterogeneo-subvoti.npy")`.

**Chiuso quando**: `python -m graph.pipeline colloca` stampa membri coerenti con le bolle finali, e
`esporta --colloca` usa V1 per la macro.
"""),
("06-slider-canone", "bug", "ready-for-agent", "", """\
# Lo slider `canone` e' una retta verso l'estremo, non una fascia attorno al profilo

**Prova** (`graph/motore.py`, `modula`): l'esponente contiene
`abs(q - c) * abs(s) * np.sign(q - c) * s`. Ma `abs(x)*sign(x)` **e' identico a `x`**: quindi
l'esponente e' `-P.ASSE_PESO * (q - c) * s*|s|`, una **retta monotona**, non una campana centrata su
`c`. Con `s>0` premia i mondi mainstream in assoluto, con `s<0` premia `VOTMED = 0` — cioè esattamente
il riordino verso l'estremo che il commento due righe sopra dice di voler evitare (e che in
`ricetta.py` faceva crollare la copertura allo 0,3%).

**Fix**: `c_target = c + slider["canone"] * delta_fascia` e penalita' `exp(-P.ASSE_PESO * abs(q -
c_target))`. Lo slider **sposta la finestra**, non spinge all'estremo: `delta_fascia` va in
`parametri.py` (INVENTATO fino a calibrazione) e il centro resta il profilo dedotto.

**Chiuso quando**: `ricetta.py` ristampato: con `canone = +1` il `VOTMED` mediano dei mondi tenuti e'
**piu' alto** del profilo e con `-1` piu' basso, e nessuno dei due e' a 0 voti.
"""),
# ---------------------------------------------------------------- 7-12: I REFACTOR
("07-arbitri-su-camminata", "task", "ready-for-agent", "", """\
# Nove arbitri riscrivono la diffusione invece di chiamare `camminata.py`

**Prova**: `graph/camminata.py` offre `pota`, `transizione`, `pesi_semi`, `diffondi`,
`attiva_per_mondo`. Nove arbitri (`alfa`, `cache`, `diffusione`, `freddo`, `lettura`, `liste`, `pesi`,
`ricetta`, `soglia`) chiamano **solo** `pota` e ridefiniscono localmente una loro `ppr`/`diffondi` e la
matrice di transizione. ~200 righe duplicate, e il rischio che un arbitro misuri una **variante** e
non il motore.

**Fix**: sostituire ogni copia con `_cam.transizione`, `_cam.pesi_semi`, `_cam.diffondi`. Dove la
variante e' **voluta** (es. `liste.py` misura una ricetta diversa), dichiararlo nel docstring e
parametrizzare, non ricopiare.

**Chiuso quando**: `grep -c "def ppr\\|def diffondi" graph/measure/*.py` da' zero, e i numeri degli
arbitri **non cambiano** (se cambiano, una copia stava misurando qualcos'altro: ed e' la scoperta).
"""),
("08-metadati-canone", "task", "ready-for-agent", "", """\
# Un artefatto di metadati invece di 12 parsing dei Parquet (~20 s -> <1 s)

**Prova**: `Motore.__init__` legge due volte `movies.parquet` e `tv.parquet` iterando **riga per riga**
in Python (`for k in range(len(d)): d.iloc[k]`) su ~117.000 righe, ed e' il costo vero dei 20 secondi
di avvio (non la matrice). Lo stesso parsing di `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP`,
`TIT` e' copiato in piu' file (`motore.py`, `pipeline.py`, `cataloghi.py`, `liste.py`, e altri).

**Fix**: creare `graph/data/metadati-canone.npz` (7 array allineati alle 66.259 righe del canone),
generato **una volta** da uno step, e caricarlo in 15 ms. `TIT` (le stringhe) si tiene in un `.npy` a
parte. Il file va nel registro degli artefatti (`canon.py`) con il suo sha256.

**Chiuso quando**: `python -c "import time; t=time.time(); MO.Motore(); print(time.time()-t)"` da'
**meno di 1 secondo**, e nessun file di `graph/` legge piu' i Parquet con `d.iloc[k]`.
"""),
("09-bubbles-niente-io", "task", "ready-for-agent", "", """\
# `import bubbles` legge il disco: I/O a tempo di import

**Prova** (`graph/bubbles.py:31`): `KEYS, ROW_OF, N, IS_TV = K.titoli()` a livello globale. Chiunque
faccia `from graph import bubbles as B` paga la lettura di `spazi-trakt.npz` e la costruzione di un
dizionario di 66.259 stringhe — **anche** `motore.py`, `collocator.py`, `pipeline.py` e tutti gli
arbitri, che importano `bubbles` solo per leggere quelle costanti.

**Fix**: `canon.titoli()` con `@functools.lru_cache(maxsize=1)`, e le costanti esposte da `canon`.
`bubbles.py` le prende da li' quando servono, non a tempo di import. Attenzione: `canon` e' importato
da tutti, quindi l'ordine di import va provato (import circolare).

**Chiuso quando**: `python -c "import graph.bubbles"` non legge nessun .npz (verificabile col tracciato
degli `open`, o banalmente dal tempo: sotto i 50 ms).
"""),
("10-pipeline-riferimenti", "task", "ready-for-agent", "", """\
# `pipeline.py` rimanda ancora a `.scratch/`, che non e' piu' la fonte

**Prova**: `voti()` e `pesanti()` e la tabella `ARTEFATTI` citano `.scratch/eterogeneo/01-...`,
`02-v10.py`, `11-subclustering-voti.py`, `.scratch/mappa-pesata/05c-salva-v3.py` — script che sono
stati **estratti** in `graph/steps/00_...`-`06_...`. Chi legge `python -m graph.pipeline pesanti` viene
mandato a eseguire codice che non e' piu' quello che ha prodotto gli artefatti.

**Fix**: aggiornare `pesanti()` e `ARTEFATTI` perche' puntino solo a `graph/steps/`, e far chiamare a
`pipeline voti` la funzione di `graph/steps/03_divisione_voti.py` invece di stampare un promemoria.

**Chiuso quando**: `grep -n "scratch/" graph/pipeline.py` non trova piu' comandi da eseguire (le
citazioni storiche nei commenti possono restare, se dicono che sono storia).
"""),
("11-artefatti-nomi", "task", "needs-info", "", """\
# I nomi degli artefatti sono fossili dei ticket, non nomi di dominio

**Prova**: `04-tfidf.npz`/`04-centroidi.npz` sono lo spazio **V1 macro** (per scegliere la bolla), e
`05-tfidf.npz`/`05-centroidi.npz` sono il **V3 micro** (per scegliere i vicini); convivono
`bolle-nitrile-KW.npz` (effort omonimo), `nuovo-TV.npz` (`ml-collaborativo`),
`eterogeneo-TRAMA.npz`, `04-trama-qwen3b.npy`, `bolle-eterogeneo-V10-p1.0-r200.npy`. Fra due mesi
nessuno ricordera' perche' 04 e' macro e 05 e' micro.

**Proposta** (dal senior): nomi di dominio — `comp-KW.npz`, `comp-CAST.npz`, `comp-DIR.npz`,
`comp-PROD.npz`, `comp-COLL.npz`, `comp-TV.npz`, `comp-LIST.npz`, `comp-TRAMA.npz`,
`grafo-miscela.npz`, `partizione-base.npy`, `partizione-finale.npy`, `mappa-bolle.npz`,
`spazio-macro-v1.npz`, `spazio-micro-v3.npz` — con un registro in `canon.py`.

**Perche' needs-info**: la rinomina tocca 655 MB di artefatti e ~20 file di codice, e alcuni artefatti
sono **citati dentro gli sha256** salvati in altri file. Serve decidere se rinominare i **file** o solo
esporre **alias** nel registro (piu' sicuro: registrare i nomi nuovi come chiavi e tenere i vecchi
come alias deprecati). Da decidere col proprietario prima di toccare 655 MB.
"""),
("12-bolle-auto-descrittive", "task", "ready-for-agent", "", """\
# Le bolle sono numeri opachi: `termini`, `esempi`, e `da_semi`

**Prova**: in `bolle.json` e in `motore.py` una bolla e' `mondo 1084 · acceso 4,3% · 25 titoli · voti
mediani 636`. Per sapere **che cos'e'** e **perche'** si e' accesa bisogna incrociare i parquet o
leggere i titoli uno a uno. In `.scratch/mappa-pesata/bolle-esempi.md` la riga coi top token V3
(`ge:thriller · kw:psychological thriller · di:david fincher`) e i 3 titoli piu' votati rendeva tutto
leggibile a colpo d'occhio.

**Fix**, due campi leggeri (~180 KB su 3.497 bolle) nell'artefatto:
  · `"termini"`: i 5 token V3 piu' forti del centroide
  · `"esempi"`: i 3 titoli piu' votati della bolla
E in uscita, per ogni mondo acceso, `"da_semi"`: i 2 titoli della storia che hanno versato **piu'
massa** in quella bolla (si calcola durante la diffusione, e' la matrice dei semi per mondo).

**Chiuso quando**: `python -m graph.pipeline lista --utente NOME` stampa, per ogni mondo,
«Mondo 820 [thriller psicologico, David Fincher] acceso per Se7en e Gone Girl».
"""),
# ---------------------------------------------------------------- 13-16: LE PROPOSTE GRANDI
("13-parametri-build", "task", "needs-info", "", """\
# I parametri di COSTRUZIONE sono ancora cablati dentro gli step

**Prova**: `parametri.py` governa la camminata e le liste, ma `RICETTA` in `pipeline.py` e' **solo
testo descrittivo**: gli step hanno i numeri cablati dentro (`TOPK=30`, `SOGLIA=0.30` in
`01_componente_trama.py`; `beta=0.25`, `alpha0=0.1`, `min_sim_kw=0.12`, `quanti_nucleo=4` in
`02_partizione.py`; `SPREAD_MIN=10.0`, `MIN_MEMBRI=15`, `RISOLUZIONI=(...)` in `03_divisione_voti.py`;
`TETTO=20.0`, `PESI_TIPO={...}`, `FATTORE_VOTI=10.0`, `MARGINE=1.0` in `04_centroidi.py` **e**
separatamente in `collocator.py`). Cambiare un peso in un file e non nell'altro li disallinea in
silenzio.

**Perche' needs-info**: unificare significa **toccare la ricetta che ha prodotto gli artefatti attuali**
(impronta `5026703db53a4ba7`). Va deciso col proprietario se: (a) `parametri.py` diventa la fonte e la
ricetta si **riproduce** (gli artefatti cambiano impronta, e va rifatta la verifica), oppure (b) si
registrano i valori **storici** come «ricetta congelata» e i nuovi come override dichiarati.
"""),
("14-build-dag", "task", "needs-info", "", """\
# `pipeline build`: gli step come funzioni, con ricostruzione incrementale

**Proposta** (dal senior): (1) incapsulare ogni file di `graph/steps/` in `esegui(dati_dir, params)`;
(2) in `pipeline.py` una lista dichiarativa `(nome, funzione, input, output, parametri_usati)`;
(3) `python -m graph.pipeline build` che confronta gli sha256 di input e parametri con un manifest
(`graph/data/manifest-build.json`) e **riesegue solo gli step a valle** di cio' che e' cambiato.

**Perche' needs-info**: gli step pesano **~30 minuti** e 11 GB di picco (`02-v10.py`). Prima di
riscriverli in funzioni va deciso se il DAG debba **rieseguire** o solo **dire cosa rieseguire** (un
`--dry-run`), e se il manifest debba stare in git (e' un artefatto di build, quindi no: va in
`.gitignore`). La parte (1) ha senso comunque e si puo' fare da sola.
"""),
("15-fixture-pytest", "task", "ready-for-agent", "", """\
# Micro-fixture a 100 titoli e una suite pytest da 3 secondi

**Perche'**: nel §6.7 dell'handoff 6 sta scritto che il modulo non ha test, e il motivo e' che girare
`bubbles.py` o `motore.py` sul grafo vero chiede 422 MB di artefatti e minuti. Risultato: le
regressioni si scoprono leggendo il codice (o facendo revisionare un digest).

**Fix**: uno script che estrae **una volta** un micro-canone di 100 titoli (5 gruppi da 20: saghe
spaziali, seinen, fincher/nolan, k-drama, spaghetti western), salva `tests/fixtures/micro_graph/`
(~500 KB), e un `tests/test_graph_pipeline.py` che verifica: la miscela + chiusura + Leiden + nucleo non
crashano; `03`/`04` producono impronte valide; il collocatore mette il titolo giusto nella bolla giusta
e **solleva** se l'hash della partizione cambia; i contratti di `canon.py` si accendono sui casi corrotti.

**Chiuso quando**: `pytest tests/test_graph_pipeline.py` passa in meno di 5 secondi senza leggere
niente di `graph/data/`.
"""),
("16-parita-jest", "task", "ready-for-agent", "04", """\
# Test di parita' Python <-> JavaScript

**Perche'**: ci sono due motori che devono dire la stessa cosa — `graph/motore.py` (che misura e decide
i parametri) e `src/engines/bolle/Bolle.js` (che serve il prodotto). Il rischio fra sei mesi: si
cambia la formula in Python, si misura che migliora, e **non si aggiorna il JS** (o viceversa). Le due
parti divergono in silenzio, e il numero misurato non e' piu' quello servito.

**Fix**: `tests/bolleParity.test.js` (Jest c'e' gia': `npm test`): 5 storie fisse (solo film, solo
serie, mista con loved+library, fredda con 2 titoli, una lunga), un golden generato da
`python -m graph.pipeline parita --fuori tests/fixtures/parita.json`, e il confronto su: pesi dei semi,
bolle attivate e **loro ordine**. Da agganciare a `npm test`.

**Dipende dal ticket 04**: senza i pesi degli archi e i ponti cross, la parita' numerica non puo'
essere migliore della differenza fra transizione uniforme e pesata (misurata: le bolle di testa
cambiano).
"""),
]

for nome, tipo, stato, bloccato, corpo in T:
    righe = [l for l in corpo.strip().splitlines() if l.strip()]
    titolo = righe[0].lstrip("# ").strip()
    testo = (f"Status: {stato}\nType: {tipo}\n"
             + (f"Blocked by: {bloccato}\n" if bloccato else "")
             + "\n" + "\n".join(righe) + "\n")
    p = D / f"{nome}.md"
    p.write_text(testo, encoding="utf-8")
    print(f"  {nome:<28} {stato:<16} {tipo:<10} {len(testo.splitlines()):>3} righe · {titolo[:52]}")

print(f"\n  {len(T)} ticket in {D.relative_to(pathlib.Path.cwd()) if D.is_relative_to(pathlib.Path.cwd()) else D}")
