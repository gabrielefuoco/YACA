Status: resolved
Type: bug
Blocked by: 09

# 10 — "Nuove uscite per te": il bug e la riparazione

## Il difetto, con le sue tre cause (da confermare una per una)

1. **Il canone è storico**: i 66.259 nodi vengono dalla co-visione Trakt/MovieLens. Le uscite 2025–2026 dei Parquet
   TMDB (`117.000 righe in `movies.parquet` e `tv.parquet`) **non ci sono** quasi mai. Il `README.md` del servizio
   lo ammette; `measure/liste.py` lo stampa (*"nessuna uscita 2025+ in questi mondi: servirebbe la porta d'ingresso
   per collocarle"*).
2. **L'imbuto in `motore.py`**: `nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0] if
   int(self.MEM[x]) in set(bolle) and x not in visti]` — le novità si cercano **solo dentro le 1–4 bolle** del
   profilo (50–80 titoli su 66.259) e **senza** i vicini.
3. **Soppressione silenziosa**: se `titoli_raw` è vuoto, `servizio.py` fa `if not titoli_raw: continue` e la lista
   **sparisce** dalla risposta; `pool/index.js` mette `assigned[catUscite] = []`. Nessuno lo dice.

## Cosa deve uscire

1. **La porta d'ingresso esiste già e non si usa**: `collocator.py` *colloca* un titolo in una bolla dai suoi
   metadati TMDB. `motore.py` **non lo chiama mai** — verificalo.
2. **Collocazione offline, una volta sola**: si scansionano i Parquet per i titoli degli **ultimi 18 mesi** (o
   `>= 2025`) che passano un pavimento **permissivo per i recenti** (`vote_count >= 30`, `vote_average >= 6.2`);
   se sono già nei 66.259 nodi si legge la loro bolla, altrimenti si chiama `collocator.colloca(…)`. Il risultato si
   salva in **`graph/data/uscite-collocate.npz`** (cache su disco, si rigenera quando i Parquet cambiano).
3. **A runtime**: `score_nuovo(y) = att_s[b_y] * confidenza(y) * qualità(y)`, con `att_s` l'attivazione dei mondi
   dell'utente. **Latenza <1 ms, zero ricostruzione della matrice.**
4. **Mai più in silenzio**: se la lista resta vuota dopo la riparazione, la risposta **lo dichiara** (un campo, un
   log con il conteggio dei candidati collocati e di quelli scartati dal pavimento).

## La prova

- **Il prima**: una misura che mostri la lista vuota (o quasi) con la causa — quanti titoli recenti collocabili
  esistono nei Parquet e quanti ne arrivano oggi nella lista.
- **Il dopo**: la lista non vuota, con titoli **realmente** recenti (controlla le date nel test), e un
  `--fixture` che non dipende dai Parquet veri (altrimenti non è eseguibile in CI).
- Suite alla baseline.

## Trappole

- I Parquet **non sono in git** e in CI possono mancare: la sonda deve degradare dichiarandolo, non esplodere.
- La collocazione è una **stima**: la confidenza va portata nel punteggio, non ignorata.
- Non allargare `USCITE_NUOVE_DAL` per far comparire titoli: sarebbe barare sul significato della riga.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

---

## Verifica delle premesse (20/10/2026, integratore)

1. **Canone storico — non verificabile qui, dichiarato da due fonti.** I Parquet TMDB non sono in questo checkout
   (`ROOT/.cache/tmdb` assente) e l'artefatto del canone nemmeno: la premessa sta nel `README` del servizio e nella
   riga che `measure/liste.py` stampa («nessuna uscita 2025+ in questi mondi»). Non la si può misurare da qui: la
   sonda la sostituisce con un fixture che **non ha** titoli 2025+ nel canone.
2. **L'imbuto — vero, e ora c'è una prova che morde.** `nuove = [...] if int(self.MEM[x]) in set(bolle)` cercava le
   novità **solo fra le bolle del profilo**, senza i vicini. La sezione 2b della sonda costruisce un grafo a 12
   mondi in cui `bolle` si ferma ai primi quattro e mette un titolo 2026 in un mondo **vicino** (ultimo dell'anello)
   e uno in un mondo **lontano**: entra il primo, non il secondo.
3. **Soppressione silenziosa — non esiste più, l'ha chiusa il `07`.** `servizio.py` non ha più
   `if not titoli_raw: continue`: restituisce la riga con `vuota: true`, `motivo` e il motivo anche nei `motivi`
   della risposta. La premessa del ticket era scritta prima del `07`. Resta vero il lato **consumatore**
   (`src/pool/index.js` mette `assigned[...] = []` e non legge `motivi`), che è del `13` e non si tocca qui.

## Decisioni prese prima del codice (20/10/2026)

- **La cache è un artefatto del modulo**, non una cache scaricata: sta in `services/graph/data/` come gli altri
  (`canon.DATA`), perché è il risultato di un lavoro nostro. Porta `schema`, data di generazione e **impronta dei
  Parquet**: se i Parquet cambiano, la cache lo dichiara (non si rigenera da sola a runtime: la collocazione costa
  minuti e non è un lavoro del servizio).
- **Chi la genera**: `python -m graph.uscite`, **dove ci sono i Parquet TMDB e gli artefatti dei centroidi**
  (il mate, `services/graph/data` montato). Non in CI. Non in questo ticket: generarla qui è impossibile (dati
  assenti) e generarla in produzione sarebbe toccare la produzione — si dichiara e si propone.
- **Due fonti, mai mescolate**: con la cache si usa **solo** la cache (i titoli già nel canone ci sono dentro, con
  bolla letta e confidenza 1.0); senza cache si usa il canone storico **con i vicini**, e la riga dichiara
  `fonte: canone`. Mescolarle darebbe punteggi su scale diverse nella stessa lista.
- **La qualità è quella del motore**: voto bayesiano con `BAYESIAN_M/C` e `RANKING_BAYES_BASE`, nessun numero nuovo.
- **Non si allarga `USCITE_NUOVE_DAL`**: il taglio resta l'anno dichiarato, per la cache e per il canone.
- **`attivazione` della riga**: la media dei punteggi non è confrontabile fra le due fonti, quindi il motore manda
  l'attivazione dei mondi da cui la riga pesca (come per i ponti del `09`).

---

## Esito (20/10/2026) — la porta d'ingresso c'è, e la riga dice da dove viene

### 1. Produzione, e la verità operativa

```
$ ssh mate 'docker exec yaca-graph python -c "import urllib.request;print(urllib.request.urlopen(\"http://127.0.0.1:7862/health\").read())"'
b'{"ok": true, "contratto": 1, "versioni": {"artefatto": "cf1d80dcba3eddce", "ricetta": "fa5771594b2ad0c4"}}'
```

Invariata: nessun deploy in questo ticket.

**La riga «uscite nuove» è già servita da Stremio** — `src/catalog/registry.js` ha
`yaca_uscite_nuove_movies`/`_series` e `src/pool/index.js` le assegna. Quindi non è vero (come diceva la
bozza di documentazione) che «non arriva a Stremio fino al 13»: **arriva, ed è vuota**, ed era il bug del
ticket. Con la cache si riempie di uscite vere.

**Chi genera la cache**: nessuno, oggi. Il container monta `services/graph/data` **read-only** e non ha i
Parquet TMDB. La procedura (scritta in `docs/DEPLOYMENT_HOME_SERVER.md` §1.2 e in `services/graph/README.md`)
è: sul mate, dove `.cache/tmdb` e gli artefatti esistono, `cd /srv/yaca/services/graph && python3 -m graph.uscite`,
poi `restart graph`. **Non l'ho eseguita**: è produzione, e qui i Parquet non ci sono. Finché quel passo non
c'è, la riga degrada dichiarandolo (`fonte: canone`) invece di riempirsi.

### 2. Le tre cause

1. **Canone storico**: documentata (`README` del servizio, `measure/liste.py`), **non misurabile qui** (nessun
   Parquet né artefatto nel checkout). La sonda la sostituisce con un fixture senza uscite 2025+.
2. **Imbuto**: vera. `nuove = [...] if MEM[x] in set(bolle)` guardava solo le bolle del profilo. **Provato**
   dalla sezione 2b: un titolo 2026 in un mondo **vicino** entra, uno in un mondo **lontano** no.
3. **Soppressione silenziosa**: **non esisteva più**. L'ha chiusa il commit `071d1cb` («silenzio HTTP
   rimosso», review del ticket 05), **non** il 07 come avevo scritto nella nota di presa in carico: la storia
   dice `git log -S'titoli_raw'`. Restava la parte del consumatore (`pool/index.js` ignora `motivo`), che è
   del `13`.

### 3. La prova

```
$ py scripts/qa/probe-ticket-10-uscite.py
1. PARAMETRI E FUNZIONI
  DAL=2025 · VOTI_MIN=30 · VOTO_MIN=6.2 · SCHEMA=1

2. IL «PRIMA»: SENZA CACHE LA RIGA E' VUOTA, E LO DICHIARA
  fonte=canone candidati=0 nel_bacino=0 titoli=0
  motivo: 'uscite_nuove: cache uscite-collocate.npz assente, solo il canone storico (che non ha quasi uscite 2025+)'

2b. L'IMBUTO: I VICINI DEL MONDO ACCESO ENTRANO, I MONDI LONTANI NO
  vicino=movie:1223 (mondo 11) · lontano=movie:1103 (mondo 5) · riga=['movie:1223']
  -> OK: l'allargamento ai vicini e' vero, e resta un imbuto

3. IL BUILDER: I PAVIMENTI MORDONO E IL CANONE SI LEGGE
  collocati: 4
  chiavi: ['movie:1005', 'movie:4001', 'movie:4007', 'tv:4006']
  bolle: [0, 0, 2, 1] · confidenze: [1.0, 0.9, 0.4, 0.7] · anni: [2026, 2026, 2026, 2026]
  movie:1005 (già nel canone): bolla=0 confidenza=1.0

4. IL «DOPO»: LA RIGA SI RIEMPIE DI USCITE VERE
  fonte=collocate candidati=3 nel_bacino=3 scartati_pavimento=3 riga=2
  titoli: [('movie:4001', 0.85258733), ('movie:4007', 0.00064694)]

5. CONFIDENZA E QUALITA' CONTANO, NON SONO DECORAZIONE
  stessa bolla, voti uguali, confidenza 0.9 vs 0.2 -> ['movie:5001', 'movie:5002']
  30 voti/6.5 vs 3000 voti/7.6 -> ['movie:5004', 'movie:5003']

6. L'IMBUTO: SOLO I MONDI ACCESI (E I VICINI), MAI TUTTI
  bacino {0}: ['movie:6000'] · vicini: entrano, e pesano quanto il loro mondo

7. I VISTI RESTANO FUORI
  con un seme nel bacino: ['movie:6000'] · gia_visti=1
  attivazione zero: motivi distinti -> 'uscite_nuove: 2 collocate nei mondi accesi, 0 già viste e 2 senza attivazione'

8. IL CONTRATTO PORTA FONTE E CONTEGGI
  status=200 fonte=collocate candidati=3 nel_bacino=3 parziale=True titoli=2

9. CACHE ASSENTE E DATI ASSENTI: SI DICHIARA, NON SI ESPLODE
  builder senza dati: collocati=0 · cache scritta=False
  -> OK: degrada dichiarandolo

10. I CASI CHE FANNO MALE: MEDIUM ASSENTE, PARTIZIONE VECCHIA, CACHE ROTTA, DATE
  medium=None -> ['movie:7001', 'tv:7002']
  bolla 9 con att_s di 1 mondo -> [] (scartata, non IndexError)
  partizione cambiata -> cache ignorata
  cache con membri mancanti -> None, dichiarato
  date sulle colonne giuste (release_date / first_air_date): collocati=2
  1000 titoli in cache: 0.43 ms per chiamata
  -> OK: casi cattivi dichiarati, e il costo resta di un ordinamento

TUTTE LE PROVE SUPERATE — OK
```

### 4. Non regressione e suite

A/B su `cd46bcb` (stessa storia, stesso fixture):

```
solo in HEAD        : []
solo in cd46bcb     : []
righe confrontate   : 11
righe divergenti    : nessuna
```

Le undici righe sono identiche sul fixture — che **non ha** uscite 2025+ nel canone né cache, quindi il
percorso nuovo non si vede. Il percorso nuovo si vede nella sonda (sezioni 2b/4).

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 187 passed, 192 total
Tests:       8 failed, 1 skipped, 1910 passed, 1919 total

$ py -c "import sys; sys.path.insert(0,'services'); from graph import parametri as P; print(P.impronta())"
fbb01ab5bb41b18c
```

Baseline `1910`/`192` (quella del `08`): zero regressioni. Produzione `fa5771594b2ad0c4` → con questa
immagine `fbb01ab5bb41b18c`, artefatto invariato.

### 5. Le due review, e cosa hanno cambiato

**`spec`** e **`standards`** hanno trovato, sovrapponendosi, sei difetti veri (tutti chiusi):

1. **`medium=None` faceva sparire le serie**: `prefisso = "tv" if medium == "series" else "movie"` con
   `medium=None` sceglieva `movie:`; e `medium=None` è raggiungibile dal servizio. Ora `None` = entrambi,
   come faceva il canone, con un caso nella sonda.
2. **`carica()` prometteva di non sollevare e sollevava**: i membri `z["chiavi"]/…/z["anno"]` erano letti
   **fuori** dal `try`; un npz senza un membro faceva `KeyError` fino a `Motore.__init__` e **il servizio
   non partiva**. Ora tutti i membri si validano dentro il `try`.
3. **Partizione vecchia**: la cache salvava id di bolla senza impronta della partizione, e `att_s[bolla]`
   poteva andare in `IndexError` (o, peggio, pescare il mondo sbagliato). Ora la cache porta
   `impronta_partizione` e **si ignora** se la partizione è cambiata; in più una guardia in `candidati`
   scarta le bolle fuori range dichiarandolo.
4. **Parametri della cache**: se `USCITE_NUOVE_DAL` o i due pavimenti cambiano, la cache di ieri non
   risponde più alla domanda di oggi: ora si ignora con un messaggio.
5. **Imbuto**: i vicini erano solo quelli del **primo** mondo (`VICINI[primo][:3]`); ora il bacino è quello
   appiattito del Ticket 03 (`bacino_bolle_set`), cioè i vicini di **tutti** i mondi accesi.
6. **`attivazione` calcolata e poi buttata**: `servizio` ricalcolava la media dei punteggi (≈0,43 su due
   titoli, uno dei quali pesa 0,0006). Ora i ponti e le uscite usano l'attivazione che manda il motore.

Più le pulizie: **lo schema viene dalla tabella** (`SCHEMA = int(P.USCITE_COLLOCATE_SCHEMA)` — era un numero
cablato accanto a un parametro morto); **la formula bayesiana è una sola** (`canon.voto_bayesiano`, usata dal
motore e da `uscite.qualita`); **il ripiego sul canone è una porta sola** (`uscite.da_canone`, non l'imbuto
vecchio copiato dentro `lista`); **i motivi sono distinti** (`gia_visti` vs `senza_attivazione`, prima
«tutti visti» e «tutti a zero» dicevano la stessa cosa); **gli scarti del pavimento arrivano alla riga**
(`scartati_pavimento`, dal `meta` del builder); **niente pickle** (`chiavi` come array di stringhe);
**`python -m graph.uscite` ha `--dal`/`--out`** e degrada dichiarandosi se gli artefatti mancano; **README del
modulo e guida di deploy** aggiornati.

### 6. Residui dichiarati

1. **La cache non è generata**: finché non si esegue il passo sul mate (procedura sopra), la riga resta
   `fonte: canone` — vuota ma dichiarata. È un passo di **dati**, non di codice: proporlo, non farlo da qui.
2. **La misura sui Parquet veri non esiste**: «quante uscite collocabili ci sono e quante arrivano» è la
   prova che il ticket chiede, e in questo checkout non è eseguibile. Va fatta sul mate, subito dopo la
   generazione, con lo stesso comando più un conteggio letto dal `meta` (`per_tipo`, `scartati`).
3. **L'anti-monopolio del `04` non può valere per i titoli collocati**: non sono nodi del canone, quindi non
   hanno `COLL`/`DIR`. Con `COLL is None` la funzione è un no-op, quindi oggi non è un difetto; quando il
   `18` porterà collezione e regista a runtime, le uscite nuove non saranno cappate. Da dire al `18`/`13`.
4. **Il `punteggio` di questa riga non è confrontabile** con quello delle altre (`att × confidenza × qualità`,
   ~0,4-1,0 contro `r[x]` ~1e-3): le righe non vengono mai mescolate in una lista, e l'`attivazione` viaggia
   a parte, ma un merge a valle che ordini per `punteggio` mescolerebbe mele e pere (nota per il `11`/`13`).
5. **Una nuova stagione di una serie vecchia non è un'«uscita nuova»**: si guarda `first_air_date`. È una
   limitazione di prodotto del taglio `anno >= USCITE_NUOVE_DAL`, dichiarata qui.
6. **Il consumatore Node ignora `motivo`/`vuota`**: la riga arriva vuota e Stremio la mostra vuota. È il
   debito del `13`, non di questo ticket.
7. **Nessun test pytest per `uscite.py`**: la prova è la sonda (che gira in CI senza Parquet). Un pytest con
   iniezione sarebbe possibile, ma la suite Python qui non è eseguibile (artefatti assenti).
