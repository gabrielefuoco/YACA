Status: resolved
Type: task
Blocked by: 07

# 08 — Micro-cluster dei filoni

## Verifica prima

- In `motore.py` **tutti** i semi (fino a 300) finiscono in un **unico** vettore e parte **un solo** PageRank: il
  filone dominante schiaccia gli altri.
- `motore.py` genera già in coda delle liste `mondo_{b}` per le bolle secondarie, ma `src/pool/index.js` **le
  scarta del tutto**: verifica dove e perché (se è vero).

### Esito della verifica (20/10/2026, integratore)

1. **Un solo PageRank: vero.** `Motore.lista` chiama `self.diffondi` **una volta** su tutti i semi
   (`services/graph/motore.py:604`); l'unica altra camminata è quella del Ticket 07 (`:898`, sui soli semi
   recenti). Con 200-300 semi il filone con più peso decide il vettore `r` per tutti.
2. **`mondo_{b}` esiste ed è scartata: vero, in due punti.** `lista` accoda una riga per ogni bolla secondaria
   (`for b in bolle[1:]`), e `src/pool/index.js:287-290` cerca **solo** i quattro ruoli storici: le righe
   `mondo_*` non hanno consumatore e spariscono senza un log. Non si tocca qui: il consumatore è il Ticket 13.
3. **Baseline aggiornata**: dopo il `07` la suite è `5 suite rosse / 8 test falliti / 1910 passati` (192 suite,
   +2 file e +12 test). Restano ammesse le stesse cinque.

**Decisioni scritte qui, prima del codice**:

- **Quanti e quali**: massimo **3** righe (`MICRO_CLUSTER_MAX`, DICHIARATO); un cluster si tiene se ha almeno
  **3 semi** (`MICRO_CLUSTER_MIN_SEMI`) **o** almeno il **10% del peso** dei semi (`MICRO_CLUSTER_MIN_PESO`). Il
  numero era un «non ancora specificato» della mappa: il ticket lo fissa a 3, non a 2, perché con 2 filoni un
  terzo filone minoritario sparirebbe di nuovo — che è il difetto che questo ticket cura.
- **Componenti connesse**, non Leiden: il mini-grafo ha <=300 nodi e il ticket ammette le componenti; un
  partizionatore aggiungerebbe dipendenze e latenza per niente. Costo O(n²) con n<=300, dichiarato.
- **Identità stabile della riga**: `tipo = micro_cluster_<i>` (i = 1..3, ordine di peso) e un campo
  `cluster_id = b<bolla_dominante>` (la bolla che porta più peso). Due cluster distinti non possono avere la
  stessa bolla dominante — semi nella stessa bolla sono connessi per definizione — quindi l'id è stabile finché
  il filone resta ancorato alla sua bolla. Lo slug definitivo per Stremio lo decide il registro (Ticket 13).
- **Titolo parlante**: `titoli_seme` con i **2 semi più pesanti** del cluster e `descrizione`
  «Perché hai amato X e Y» (campo della lista, non un titolo inventato).
- **Profilo monolitico**: un solo cluster → **una** riga, nessuna riga inventata per arrivare a 2 o 3.
- **Nessun lavoro Node**: le righe nuove non hanno consumatore fino al Ticket 13, come per `06` e `07`.
- **Bacino**: lo stesso `bacino_appiattito` del Ticket 03, con un tetto di **4** bolle-seme
  (`MICRO_CLUSTER_BOLLE_MAX`) — una riga di filone deve restare stretta.

## Cosa deve uscire

1. **Mini-grafo indotto sui soli semi** (100–300 nodi). Due semi sono collegati se: stanno nella **stessa bolla**
   (`MEM[u_i] == MEM[u_j]`), o in bolle **adiacenti** (`MEM[u_j] in VICINI[MEM[u_i]]`), o hanno un arco
   `Tr[u_i, u_j] > 0`.
2. **Componenti connesse** (o Leiden/Louvain sul mini-grafo, <1 ms). Si tengono i primi **2–3** cluster con almeno
   **3 semi** o almeno il **10%** del peso totale dei semi.
3. **Una diffusione per cluster**, con i **soli** semi di quel cluster: la massa di `r_k` somma a 1.0 **dentro** il
   filone.
4. **Una riga per cluster**, con bacino appiattito e pavimento di qualità (ticket 03).
5. **Titolo parlante**: la riga porta i **2 titoli-seme più pesanti** del cluster (es. *"Perché hai amato
   Interstellar e Arrival"*) — un campo nella descrizione della lista, non un titolo inventato a caso.

## La prova

- Un profilo **costruito con due filoni netti** (es. 6 sci-fi + 20 drammi): devono uscire **due** righe distinte, e
  la riga dello sci-fi **non** deve essere fatta di drammi. Con la diffusione unica di oggi, la riga sci-fi sarebbe
  schiacciata: mostra il prima/dopo.
- Un profilo **monolitico** (un solo filone): una sola riga, e il ticket dice cosa succede alle altre (niente righe
  inventate).
- Suite alla baseline.

## Trappole

- Il mini-grafo è piccolo: **non** costruire strutture pesanti. Se la latenza del servizio sale sopra `100 ms,
  qualcosa è sbagliato e va dichiarato.
- I nomi delle righe dei cluster devono essere **stabili** fra una richiesta e l'altra (stesso cluster = stesso id),
  altrimenti Stremio vede comparire e sparire cataloghi.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
  Si incolla la lista `FAIL` e i totali: un sottoinsieme scelto a mano non è una prova.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo. Se una sonda deve mostrare un
  difetto, lo fa dall'esterno (patch dell'istanza).
- **Ogni riga che non si riesce a riempire lo dichiara**: il difetto di `uscite_nuove` è nato da un silenzio
  (`if not titoli_raw: continue`). Nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

---

## Esito (20/10/2026) — ogni filone cammina da solo, e parla con i suoi semi

### 1. Produzione, com'era quando ho iniziato

```
$ ssh mate 'docker exec yaca-graph python -c "import urllib.request;print(urllib.request.urlopen(\"http://127.0.0.1:7862/health\").read())"'
b'{"ok": true, "contratto": 1, "versioni": {"artefatto": "cf1d80dcba3eddce", "ricetta": "fa5771594b2ad0c4"}}'
```

Invariata dal `07` (che non è stato deployato): nessun deploy in questo ticket.

### 2. Le premesse, verificate eseguendo

- **Una sola diffusione**: `Motore.lista` chiama `diffondi` una volta su tutti i semi; la seconda camminata
  esistente è quella del `07`. Vero.
- **Le righe `mondo_{b}` esistono e sono scartate**: `lista` le accoda, `src/pool/index.js` cerca solo i quattro
  ruoli storici. Vero — non toccato qui, il consumatore è il `13`.

### 3. La prova

```
$ py scripts/qa/probe-ticket-08-micro-cluster.py
1. PARAMETRI DICHIARATI
  MAX=3 · MIN_SEMI=3 · MIN_PESO=0.1 · BOLLE_MAX=4
  -> OK

2. DUE FILONI NETTI (6 nel filone A, 20 nel filone B)
  semi: 26 (6 filone A, 20 filone B)
  micro_cluster_1  cluster_id=b1 quota=0.7692 semi=20 titoli=20 seme_parlante=['Film_100', 'Film_101']
  micro_cluster_2  cluster_id=b0 quota=0.2308 semi=6 titoli=20 seme_parlante=['Film_0', 'Film_1']
  filone A (b0): 20/20 titoli nelle bolle del filone A
  filone B (b1): 20/20 titoli nelle bolle del filone B
  -> OK: ogni riga resta nel suo filone

3. IL «PRIMA»: LA DIFFUSIONE UNICA SEGUE IL FILONE DOMINANTE
  il_tuo_mondo, primi 5: 4/5 vengono dal filone B (quello con 20 semi su 26)
  -> OK: la riga unica segue il filone dominante, le righe di cluster no

4. PROFILO MONOLITICO: UNA RIGA, NON TRE
  righe di cluster: 1 -> ['b2']
  -> OK: nessuna riga inventata

5. IDENTITA' STABILE SOTTO PERTURBAZIONE (una rivisione al filone B)
  prima  slot: {'micro_cluster_1': 'b4', 'micro_cluster_2': 'b5'}
  dopo   slot: {'micro_cluster_1': 'b5', 'micro_cluster_2': 'b4'}
  prima  identita': {'b4': ('Film_400', 'Film_401'), 'b5': ('Film_500', 'Film_501')}
  dopo   identita': {'b5': ('Film_500', 'Film_501'), 'b4': ('Film_400', 'Film_401')}
  -> OK: gli slot seguono il peso (posizionali, dichiarato), il filone tiene il suo cluster_id

6. IL TITOLO PARLANTE
  b0: ['Film_0', 'Film_1'] · b1: ['Film_100', 'Film_101']

6b. IL SEME PIU' PESANTE, E NIENTE DOPPIONI
  titoli_seme=['Film_202', 'Film_201'] · attesi dal peso=['Film_202', 'Film_201'] (pesi [1.0, 3.0, 4.0])
  -> OK: contano i pesi, e un doppione non buca la descrizione

7. IL CONTRATTO HTTP PORTA LE RIGHE E LA LORO IDENTITA'
  righe nel contratto: 2
  micro_cluster_1  cluster_id=b1 quota=0.7692 descrizione='Perché hai amato Film_100 e Film_101' semi=20 titoli=20
  micro_cluster_2  cluster_id=b0 quota=0.2308 descrizione='Perché hai amato Film_0 e Film_1' semi=6 titoli=20

8. PAVIMENTO E PESO DEI FILONI
  quota di peso coperta dalle righe: 1.0000 (in QUESTO fixture 1.0: due filoni, nessuno scartato)
  -> OK: pavimento rispettato, e ogni riga dichiara la sua quota

9. UNA CAMMINATA PER FILONE, CON I SUOI SOLI SEMI
  camminata 0 (principale): 26 semi · massa 1.000000
  camminata 1 (filone 1): 20 semi · massa 1.000000
  camminata 2 (filone 2): 6 semi · massa 1.000000
  semi per camminata: [26, 20, 6] — ognuna i suoi, non tutti
  -> OK: una diffusione per riga, coi semi della riga

10. FILONI SCARTATI E TETTO DI 3, DICHIARATI
  con 2 semi (9,1%) + 20: righe=1 · log: ['[micro_cluster] filone scartato: 2 semi, 9.1% del peso (minimo 3 semi o 10%)']
  4 filoni indipendenti: righe=3 -> ['b0', 'b1', 'b3'] · log: ['[micro_cluster] 1 filoni oltre il tetto di 3: restano i primi per peso']
  -> OK: nessun filone sparisce in silenzio

10b. ZERO FILONI: IL MOTIVO ARRIVA AL CHIAMANTE
  righe=0 · motivi=['micro_cluster: nessun filone sopra le soglie (3 semi o 90% del peso)']
  contratto: status=200 · motivi=['micro_cluster: nessun filone sopra le soglie (3 semi o 90% del peso)']
  -> OK: zero righe e' un fatto dichiarato, non un silenzio

11. COSTO: UNA CAMMINATA PER RIGA
  180 semi · 2 righe di cluster · 3 camminate · 6.6 ms
  (il tempo è un numero di FIXTURE, 800 nodi: l'artefatto vero da 66.259 nodi non è in questo checkout)
  -> OK: nessuna diffusione oltre quelle delle righe

TUTTE LE PROVE SUPERATE — OK
```

Cosa la sonda ha **cambiato dopo le review**, perché non è cosmetica: la prova di stabilità originale era
**tautologica** (stesso input, codice deterministico) e lasciava passare un `cluster_id` che si spostava con una
rivisione. Ora la sezione 5 **perturba i pesi** e distingue le due cose: gli slot sono posizionali (seguono il
peso, dichiarato), l'identità del filone no. La sezione 9 confronta i **semi** di ogni camminata, non la loro
massa (che somma a 1 per costruzione, quindi non poteva fallire).

### 4. Non regressione delle righe esistenti (A/B su `9543e54`)

```
solo in HEAD        : ['micro_cluster_1']
solo in 9543e54     : []
righe confrontate   : 9
righe divergenti    : nessuna
```

Le **nove righe preesistenti sono identiche** (stessa storia, stesso fixture). Cambia solo l'**ordine** dentro
`liste` (i filoni stanno prima di `mondo_*`), quindi l'ordine degli `items` appiattiti a valle.

### 5. Suite

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 187 passed, 192 total
Tests:       8 failed, 1 skipped, 1910 passed, 1919 total
```

Baseline del cantiere: `5 / 8 / 1898` (190 suite). Nessun file JS toccato da questo ticket: il conto resta
quello del `07` (`1898 + 12` test nuovi), zero regressioni. **Nuova baseline per i ticket successivi: `1910`
passati, `192` suite.**

### 6. La ricetta

```
$ py -c "import sys; sys.path.insert(0,'services'); from graph import parametri as P; print(P.impronta())"
60313e7a5e433dc0
```

Produzione: `fa5771594b2ad0c4`. Artefatto invariato (`cf1d80dcba3eddce`), manifest invariati fino al `13`.

### 7. Le due review, e cosa hanno cambiato

**`spec`** ha demolito tre cose giuste da demolire:

1. **`cluster_id` era la bolla *dominante*** (più peso), e una sola rivisione la faceva cambiare: misurato
   `b0 → b2` sullo stesso filone. È esattamente il difetto che il ticket chiama «comparire e sparire cataloghi».
   Ora l'ancora è la **bolla più bassa** del filone (`ancora`), che cambia solo se il filone si allarga verso il
   basso; la bolla dominante resta come `mondo` («di cosa parla la riga»).
2. **La prova di stabilità era tautologica** → sostituita dalla perturbazione dei pesi (sezione 5).
3. **`cluster_id`, `titoli_seme` e `quota_peso` non uscivano dal processo**: il prodotto vedeva solo lo slot.
   Ora sono nel contratto, anche sulla riga svuotata dal pavimento.

**`standards`** ha trovato:

1. **componenti connesse riscritte a mano** — `scipy.sparse.csgraph.connected_components` è già una dipendenza
   usata in `steps/06_mappa.py`: eliminato il BFS artigianale. Il difetto ricorrente di questo cantiere,
   ennesima volta.
2. **`titoli_seme` scelto sui semi non deduplicati**: lo stesso titolo (watchlist + loved) usciva due volte —
   «Perché hai amato X e X». Ora si sceglie sui nodi deduplicati (`nodi`/`pesi`).
3. **Zero filoni sopra le soglie = silenzio totale**: ora il motivo viaggia in `esito["motivi"]` e arriva al
   chiamante HTTP (sezione 10b), oltre ai log per ogni filone scartato e per il taglio oltre il tetto.
4. **«riga corta» copiata quattro volte**, con le copie già divergenti (`motivo` c'era in due su quattro):
   ora è `Motore.dichiara_corta(...)`, un posto solo.
5. `[:2]` dei titoli parlanti era un numero hardcoded → `MICRO_CLUSTER_SEMI_PARLANTI` in tabella.

### 8. Residui dichiarati (nessuno si aggiusta qui)

1. **Con un filone solo la riga è identica a `il_tuo_mondo`** — misurato, 20/20 titoli nello stesso ordine, su un
   profilo da 1 seme (`quota_peso = 1.0`, `titoli_seme` di **un** titolo: «Perché hai amato X»). Per il ticket era
   il comportamento voluto («profilo monolitico: una sola riga»); finché non c'è il **waterfall dedup del `11`**,
   quella riga è un catalogo doppio. Il `11` dovrà dire chi tiene i titoli.
2. **La latenza sull'artefatto vero non è misurata**: `services/graph/data/` non è in questo checkout, e la
   produzione non si tocca. Il costo **strutturale** è dichiarato e provato: *una camminata per riga* (sezione 11),
   quindi ≤3 camminate in più da ~2 ms sulla matrice vera (misura del piano), più una matrice booleana `n×n` con
   `n ≤ 300`. **Proposta, non applicata**: dopo il deploy, una misura read-only su `mate` con un `POST /raccomanda`
   a 100 semi, per chiudere il conto dei 100 ms.
3. **`measure/intero.py` aggrega tutte le liste** in precisione/copertura: con tre righe in più i numeri pubblicati
   non sono più comparabili con quelli scritti nella mappa. Non è un bug del `08`, è una **baseline da rifare**
   (ticket `16`, o un ticket suo): qui si dichiara.
4. **`semi` di una riga di filone sono tutti i semi del filone** (fino a 300), a differenza delle altre righe che
   filtrano per bolla: nuova forma di payload da guardare nel `13`. (La collisione `movie:100`/`tv:100` nella
   conversione a `tmdbId` è preesistente in tutte le righe.)
5. **`corta` con `cap = 60`** sarà spesso `true`, perché il bacino di un filone è per costruzione stretto
   (4 bolle + vicini) mentre il target è il cap della richiesta. Non è una regressione (`ultime_visioni` ha la
   stessa forma), ma il `13` deve decidere il target prima di consumare il flag — altrimenti `corta` significa
   «questa riga è un filone».
6. **Nessun lavoro Node**: le righe non hanno consumatore fino al `13`; le rotte `/api/mondi` e `/api/bolle` le
   restituiscono già (piene, non vuote come nel `07`), ed è scritto nei documenti.
