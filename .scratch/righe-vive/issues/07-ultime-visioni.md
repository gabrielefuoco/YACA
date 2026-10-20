Status: resolved
Type: task
Blocked by: 06

# 07 — "Sul filo delle tue ultime visioni"

## Verifica prima

- In `parametri.py` è **misurato** che *«la recenza non funziona come peso globale, ma funziona fortissimo come
  SELEZIONE: i soli ultimi 15 titoli fanno lift 47,5x contro 18,2x»*. Trova quel commento e riportalo nel ticket.
- **Trappola verificata nel piano**: `semiDi()` in `src/pool/index.js` restituisce una **Map** che **non preserva i
  timestamp né l'ordine cronologico**: prendere "i primi 15" dal dizionario dà i primi **per inserimento**, non gli
  ultimi visti.

### Esito della verifica (20/10/2026, integratore) — le premesse sono vere, la data esiste già

1. **`semiDi` non espone la recenza: vero.** `src/library/seeds.js:90` restituisce `{ seeds, counts }`; `seeds` è
   `Map<id, peso>` aggregata dai bucket `loved/liked/watched/library` (righe 153–171). Nessun timestamp esce.
2. **Ma la data c'è, e dentro la funzione.** `getSeedTimestamp()` (riga 28) legge `lastWatchedAt`, `createdAt`,
   `signals[].at`, `daysAgo`; `keepMostRecentSeed()` (riga 37) tiene già, per ogni id, **il segnale più recente**
   nei bucket. La recenza viene **buttata via solo nell'aggregazione finale**, quando `seeds.set(id, ...)` perde la
   data. Quindi **non manca il dato**: manca l'esposizione. Nessun ordine inventato dal dizionario — è la
   trappola che il ticket vieta, e non serve.
3. **Il contratto HTTP oggi non trasporta la recenza.** `convertiSemiPerGrafo` (`src/pool/index.js:162`) manda
   `{ tmdbId, medium, tipo }`; `servizio.py:74-84` costruisce la tupla `(ch, 1, tipo, peso)`; `motore.py:511`
   legge fino a 4 elementi. La recenza deve attraversare tutti e tre i punti, altrimenti la seconda diffusione
   non ha semi.
4. **Il consumatore non esiste ancora**: `src/pool/index.js` legge solo i quattro ruoli storici. La riga
   `ultime_visioni` non si vedrà in produzione fino al ticket 13 — atteso, non è un difetto (vedi map §2).

**Divergenza rispetto all'handoff §4**: non serve aprire un prerequisito. L'handoff prevedeva che `semiDi`
*dovesse* esporre la data come ticket separato; il ticket 07 lo chiede già come suo punto 1, e il dato è di
WatchHistory, non di un dizionario. Il prerequisito si apre solo se il dato non esistesse: esiste.

**Produzione (verificata su `mate`, 20/10/2026)**: `yaca-graph` è stato ritirato da Watchtower 3 minuti prima del
controllo; `/health` risponde `{"ok": true, "contratto": 1, "versioni": {"artefatto": "cf1d80dcba3eddce",
"ricetta": "fa5771594b2ad0c4"}}`. Quella ricetta è una di quelle previste dall'handoff §1: **le regole di 02, 03,
05 (e 06, costruita dalla CI) sono già vive in produzione** con l'artefatto **vecchio**, quindi il 04 resta
inerte. Da qui in avanti ogni modifica a `parametri.py` cambia la ricetta di nuovo, e va dichiarata nell'Esito.

**Scomposizione del lavoro** (il ticket tocca due lingue; un commit per passo, review a fine ticket):

- **passo A / Node** — `semiDi` espone `ultimaVisione: Map<id, timestampMs>` (solo segnali di visione, non le
  aggiunte in libreria); `convertiSemiPerGrafo` marca `recente: true` sui **15** più recenti con data vera;
  `graphClient` documenta il campo; test jest che prova che **l'ordine di inserimento della Map non conta** e che
  una data mancante **non** è "recente".
- **passo B / motore** — `servizio.py` accetta `recente` e lo porta nella tupla; `motore.py` fa la **seconda**
  diffusione sui soli semi recenti (>= 3 presenti nel canone), bacino appiattito dalle bolle accese **da quella**
  diffusione, stesso pavimento e stesso ranking; riga `ultime_visioni` che **dichiara** il caso `< 3 semi
  recenti`; sonda `scripts/qa/probe-ticket-07-ultime-visioni.py`.

**Decisioni scritte qui, non nel codice**: una data mancante o `0` significa **non recente** (mai "adesso");
un'**aggiunta in watchlist** non è una visione (non entra fra i recenti e non sovrascrive la data di una visione
vera, anche se `ProfileBuilder` scrive segnali `library` dentro WatchHistory); i **semi Trakt grezzi**
(`rawTraktResult`, il payload aggiuntivo senza date) entrano nei semi ma **non** fra i recenti, mentre le voci
già scritte in WatchHistory dal sync Trakt **hanno** `at` e sono visioni vere — quindi possono essere recenti;
il numero 15 vive in `SEED_RECENTI_QUANTI` (Node), la soglia 3 in `ULTIME_VISIONI_MIN_SEMI` (parametri del
motore), il tetto di 4 bolle in `ULTIME_VISIONI_BOLLE_MAX`; l'ordine è **data discendente, poi id crescente**
(deterministico, mai l'ordine della Map); con meno di 3 semi recenti la riga esce **vuota con il motivo** e
`semi_recenti` (`vuota: true`, non un ripiego sulla diffusione principale); **nessuna soglia si allenta per
riempire la riga**.

## Cosa deve uscire

1. **I semi portano la recenza**: o `semiDi` (o `cronologiaDi`) espone l'ordine temporale (es. un flag `recente` sui
   primi 12–15, o la data), o il pool la ricava — ma **da una fonte vera**, non dall'ordine della Map.
2. **Seconda diffusione**: se ci sono **almeno 3** semi recenti, `ppr(Tr, righe_recenti, pesi_recenti)` — costo
   dichiarato: `2 ms`, la matrice è già in RAM.
3. **Bacino appiattito** sulle top 3–4 bolle accese **da quella** diffusione, con lo stesso pavimento di qualità.
4. La riga **cambia appena l'utente guarda 2–3 film di un filone nuovo**: è l'effetto che la prova deve mostrare.

## La prova

- Due giri con gli stessi semi ma con **ordine temporale diverso** (stessi titoli, date cambiate): le prime
  posizioni **devono cambiare**. Se non cambiano, la recenza non sta selezionando niente.
- Con meno di 3 semi recenti la riga **lo dichiara** (non esce vuota in silenzio) e il ticket dice cosa fa in quel
  caso.
- Suite alla baseline.

## Trappole

- Una data mancante non è "vecchia di zero": decidi e scrivi come la tratti.
- Non toccare `ALPHA` né la diffusione principale: questa è una **seconda** camminata, non un peso sul resto.

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

## Esito (20/10/2026) — la recenza seleziona, e la riga lo dichiara

### 1. Produzione, verificata prima di toccare il codice

```
$ ssh mate 'cd /srv/yaca; git log --oneline -1; docker compose ps --format "{{.Name}} {{.Image}} {{.Status}}"'
cc51b83e refactor(posters): via lo shim drena-coda-poster — il timer puntava gia' al percorso nuovo, e i doc ora lo dicono
yaca-anime-source ghcr.io/gabrielefuoco/yaca-anime-source:latest Up 24 hours (healthy)
yaca-app          ghcr.io/gabrielefuoco/yaca:latest              Up 3 minutes (healthy)
yaca-graph        ghcr.io/gabrielefuoco/yaca-graph:latest        Up 3 minutes (healthy)
yaca-redis        redis:7-alpine                                 Up 3 weeks (healthy)
yaca-tmdb-daemon  ghcr.io/gabrielefuoco/yaca:latest              Up 3 minutes (healthy)
yaca-watchtower   ghcr.io/nicholas-fedor/watchtower:latest       Up 24 hours (healthy)

$ ssh mate 'docker exec yaca-graph python -c "import urllib.request;print(urllib.request.urlopen(\"http://127.0.0.1:7862/health\").read())"'
b'{"ok": true, "contratto": 1, "versioni": {"artefatto": "cf1d80dcba3eddce", "ricetta": "fa5771594b2ad0c4"}}'
```

La ricetta è una di quelle previste dall'handoff §1: **02, 03, 05 e 06 sono già vive in produzione**, con
l'artefatto **vecchio** — quindi il `04` resta inerte. Nessun deploy in questo ticket.

### 2. La premessa, verificata nel codice e poi eseguita

`src/library/seeds.js` restituiva `{seeds, counts}` senza date, **ma** `getSeedTimestamp`/`keepMostRecentSeed`
tenevano già, per bucket, il segnale più recente: la recenza veniva buttata via **solo nell'aggregazione finale**.
Nessun prerequisito da aprire, nessun ordine preso dal dizionario. La data→flag è provata dai test Node (fonte
vera: `WatchHistory`), il passo flag→riga dalla sonda Python.

### 3. La prova del ticket

```
$ py scripts/qa/probe-ticket-07-ultime-visioni.py
1. PARAMETRI DICHIARATI
  ULTIME_VISIONI_MIN_SEMI  = 3
  ULTIME_VISIONI_BOLLE_MAX = 4
  ALPHA (diffusione principale) = 0.6 — intatto
  -> OK

2. DUE GIRI, STESSI SEMI, RECENZA INVERTITA
  semi totali: 6 | recenti nel giro A: i 3 di mondo 2 | nel giro B: i 3 di mondo 6
  giro A: 20 titoli | primi 5: ['movie:1200', 'movie:1208', 'movie:1204', 'movie:1203', 'movie:1209']
  giro B: 20 titoli | primi 5: ['movie:1600', 'movie:1608', 'movie:1604', 'movie:1603', 'movie:1609']
  giro A: 5/5 nei primi 5 vengono dal mondo dei semi recenti (2)
  giro B: 5/5 nei primi 5 vengono dal mondo dei semi recenti (6)
  -> OK: la riga cambia appena le ultime visioni cambiano filone

3. LA RECENZA NON E' UN PESO: IL TUO MONDO NON SI MUOVE
  il_tuo_mondo con i flag  : ['movie:1600', 'movie:1200', 'movie:1608', 'movie:1604', 'movie:1208'] (20 titoli)
  il_tuo_mondo senza flag  : ['movie:1600', 'movie:1200', 'movie:1608', 'movie:1604', 'movie:1208'] (20 titoli)
  -> OK: identica, bit per bit

4. CON MENO DI 3 SEMI RECENTI LA RIGA LO DICHIARA
  motore  : titoli=0 corta=True recenti=1 motivo='ultime_visioni: meno di 3 semi recenti (1)'
  contratto: vuota=True motivo='ultime_visioni: meno di 3 semi recenti (1)'
  -> OK: nessuna lista sparisce in silenzio

5. CON TRE SEMI RECENTI IL CONTRATTO PORTA LA RIGA PIENA
  titoli: 20 | descrizione: 'sul filo delle tue ultime visioni (3 semi recenti)'
  semi recenti dichiarati dal motore: 3

6. IL PAVIMENTO DI QUALITA' VALE ANCHE QUI
  tutti i titoli delle due righe hanno VAVE >= 6.4 e VOT >= 150
  -> OK: il pavimento non si abbassa per riempire

TUTTE LE PROVE SUPERATE — OK
```

Cosa la sonda **non** prova, per non raccontare una bugia: il passo *data → flag*. Quello vive dall'altra parte
del contratto e ha i suoi test (`tests/ultimeVisioniRecenza.test.js`, `tests/semiRecenzaFonteVera.test.js`):
due giri con le stesse date cambiate di posto danno `recente` diversi, l'ordine della Map non conta, una data
mancante non è "adesso", e un'aggiunta in watchlist **non** è una visione.

### 4. Non regressione del refactor (A/B sul fixture del 05)

Il bacino è stato estratto in `Motore.bacino_appiattito` perché lo usano due righe. Confronto fra `ad7de0a` e
`HEAD` sullo stesso fixture e la stessa storia (dumper di 10 righe in `%TEMP%`, che costruisce il grafo del 05 e
stampa `{tipo: [titoli]}` di `lista()`):

```
solo in HEAD   : ['ultime_visioni']
solo in ad7de0a: []
confrontate: 8 | divergenti: nessuna
```

Le otto righe preesistenti sono **identiche**: l'estrazione non ha cambiato comportamento.

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

Baseline `5 / 8 / 1898` (190 suite): qui `1904 = 1898 + 6` il primo giro, e `1910 = 1898 + 12` con il secondo
file di test (`192 = 190 + 2` suite). Le cinque rosse sono **esattamente** quelle ammesse: zero regressioni.

### 6. La ricetta

```
$ py -c "import sys; sys.path.insert(0,'services'); from graph import parametri as P; print(P.impronta())"
10547118a14ca72c
```

Produzione oggi: `fa5771594b2ad0c4`. Con questa immagine il mate servirà `10547118a14ca72c` (il valore è cambiato
anche spostando le due voci nella tabella: l'impronta include l'ordine). Artefatto invariato
`cf1d80dcba3eddce` — non è stato rigenerato nulla. Manifest/cataloghi non toccati: gli hash restano quelli del
ticket 18 finché non arriva il 13, che li cambierà **di proposito**.

### 7. La review ha trovato un difetto vero, e ora c'è la prova

La review `spec` ha mostrato che `ultimaVisione` accettava anche i segnali di tipo **`library`**: `ProfileBuilder`
li scrive dentro WatchHistory, quindi un titolo **messo in watchlist e mai visto** poteva entrare fra i 15
recenti, e una aggiunta recente poteva **sovrascrivere** la data di una visione vera. Corretto: solo
`watched`/`liked`/`loved` alimentano la recenza. La prova sta in `tests/semiRecenzaFonteVera.test.js` (sorgente
vero: documenti WatchHistory), non in un mock di `semiDi`.

L'altra review (`standards`) ha chiesto di non lasciare **due copie** di pavimento e ranking (ne erano appena
state create tre) e di rispettare la facade della libreria: `Motore.pavimento` + `Motore.ranking` +
`ordina_per_ranking` sono ora l'unico posto, `SEED_RECENTI_QUANTI` passa da `src/library` come gli altri
`SEED_*`, `semi.recenti` esiste anche nei due ritorni degradati del contratto.

### 8. Residui dichiarati

1. **La riga non arriva ai cataloghi Stremio** finché non c'è il ticket 13: `src/pool/index.js` legge solo i
   quattro ruoli storici. Le rotte `/api/mondi` e `/api/bolle` però restituiscono **tutte** le liste, quindi da
   oggi vedono una `ultime_visioni` **vuota** (non mandano flag di recenza). Non è un difetto: è il ticket 13.
2. **Sonde `03` e `04` ferme**: falliscono con `AttributeError: 'Motore' object has no attribute 'VAVEMEAN'`
   **anche su `ad7de0a`**, cioè prima di questo ticket — i loro `Motore` sintetici precedono il 05. Non è una
   regressione, ma la sonda del bacino non gira più: va rifatta in un ticket suo, non qui.
3. **`tests/test_contratto_servizio.py` non eseguibile qui**: 9 error di ambiente (`graph/data/` non è nel
   checkout né in git). Non era nella baseline e non è nella CI.
4. **La lunghezza reale della riga** (20/20 sul fixture) non è misurata su un profilo vero: serve l'artefatto,
   quindi si misura dopo il deploy, col ticket 01 o il 16 — non qui, e senza toccare la produzione.
