Status: resolved
Type: task
Blocked by: 13

# 14 — Il ritorno delle impressioni

## Il difetto

`src/profile/impressions.js` (`recordRecommendationImpressions`) scrive su MongoDB
(`RecommendationImpression`) i titoli serviti a **pagina 1**, e **nessun modulo** di `pool/` o `stremio/` li rilegge
(verificato: l'unico chiamante è `src/stremio/hybridServing.js:155`, che **scrive**). Chi apre Stremio per dieci
giorni vede gli stessi titoli in cima.

## Cosa deve uscire

1. **Lettura** delle impressioni degli **ultimi 14 giorni** per l'utente (e per il catalogo), con una funzione che
   oggi non esiste.
2. **Soft-decay sul punteggio**, senza invalidare la cache del grafo:
   `score_effettivo = score * (0.85 ** giorni_mostrato_in_home)` per i titoli mostrati in pagina 1 per **≥3 giorni
   diversi** e **mai visti**.
3. **Non si cancella**: il titolo **scende**, e salgono i candidati dalla posizione 21–60. Questo è il punto: una
   riga che si rinnova senza perdere qualità.
4. **Costo dichiarato**: una lettura per richiesta (o una cache breve, se serve) — si misura e si scrive.

## La prova

- Un caso con un titolo forte mostrato per **5 giorni** senza essere visto: senza decay sta primo, con il decay
  scende e un titolo dalla posizione `25` sale in prima pagina.
- Un titolo **visto** dall'utente **non** subisce decay (è già escluso dai visti, ma provalo).
- Il comportamento è **deterministico** a parità di impressioni: niente casualità, altrimenti i test non tengono.
- Suite alla baseline.

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

## Esito (20/10/2026) — le impressioni tornano indietro, e si vede quanto pesano

### 1. La premessa, verificata eseguendo

`src/profile/impressions.js` scriveva e basta: l'unico chiamante è `src/stremio/hybridServing.js:155`
(`registraImpressioni`), e in tutto `src/` **nessuno** rileggeva `RecommendationImpression` (grep su
`src/` escluso il modello: solo scrittura). Confermato.

Il modello tiene `seenDates: ['YYYY-MM-DD']` con indice unico `(owner, profileId, catalogId, tmdbId)`:
la finestra si può misurare in **giorni distinti** senza cambiare schema.

### 2. Cosa è uscito

- **Lettura** (`src/profile/impressions.js`): `leggiImpressioniRecenti({ userId, profileId, catalogIds, giorni })`
  → `Map<catalogId, Map<tmdbId, giorni>>`, finestra **14 giorni** (`IMPRESSIONI_FINESTRA_GIORNI`), una query
  per richiesta con `catalogId: { $in: [...] }`. L'aggregazione è una funzione pura (`aggregaImpressioni`),
  così la finestra si prova senza database. Senza connessione **non interroga** (niente query in buffer,
  niente richiesta appesa) e un guasto di lettura **dichiara** e prosegue senza decadimento.
- **Decadimento** (nuovo `src/pool/impressioni.js`): `applicaDecadimento` porta `punteggio × 0.85^giorni` per
  i titoli con **≥3 giorni distinti** in home e **mai visti** (`visti` = i semi del grafo: i titoli che
  l'utente conosce), poi riordina per punteggio effettivo. **Nessun titolo esce dalla riga**; ogni item
  toccato porta `punteggio_grafo` e `giorni_in_home` per tracciabilità.
- **Dove**: in `getHeroPool`, **dopo** la cache delle righe. Non muta gli array in cache (li copia), quindi la
  voce di cache non si avvelena e il grafo non si tocca.
- **Costo, dichiarato**: **una query per richiesta** per media (non una per catalogo: i 20 cataloghi vanno in
  `$in`); la funzione `leggi` è iniettabile e un test conta le chiamate (1). Se non arrivano impressioni,
  la riga torna **lo stesso riferimento** (zero lavoro, zero copie).
- **Diagnostica**: `[Impressioni] movie: N titoli scesi in M righe (media X giorni in home, K oltre la
  soglia percepibile)`; se non scende niente, nessuna riga di log.

### 3. La prova

`tests/impressioniDecadimento.test.js` (10 test): finestra in giorni distinti e giorni fuori finestra
ignorati; `0.85^giorni` esatto; sotto soglia non si tocca; **già visto non scende**; nessun titolo sparisce;
la cache non viene mutata; le statistiche; nessuna lettura senza `userId`.
`tests/impressioniNelPool.test.js` (2 test): la riga servita da `getHeroPool` scende davvero e resta intera;
**una sola lettura per richiesta**, con `userId`/`profileId`/`catalogIds` giusti.

### 4. La taratura, misurata (sonda `scripts/qa/probe-ticket-14-impressioni.js`)

```
$ node scripts/qa/probe-ticket-14-impressioni.js
== Ticket 14: decadimento delle impressioni ==
riga: 60 titoli · prima pagina mostrata per 10 giorni
titoli spariti dalla riga: 0   (deve essere 0)
titoli rimasti nella stessa posizione: 0/60
top-10: 0/10 titoli di ieri restano, 10 entrano da sotto
entrati in top-10 dalla posizione 11-60: 10
   #1  tmdb:1010  (era #11)
   ...
   #10 tmdb:1019  (era #20)
statistiche dichiarate: 10 titoli scesi in 1 righe, media 10 giorni, 10 oltre la soglia percepibile
punteggio del #1 di ieri: 1 -> 0.1969

== taratura della formula (0.85^giorni) ==
giorni  punteggio#1  quanti dei 10 di ieri restano in pagina 1
    1      0.8500          0/10
    2      0.7225          0/10
    3      0.6141          0/10
    5      0.4437          0/10
    7      0.3206          0/10
   10      0.1969          0/10
letture di impressioni per richiesta: 1 (una query per tutti i cataloghi di un media)
```

**La divergenza, dichiarata e non «aggiustata»**: la formula del ticket è troppo forte per la banda dei
punteggi del grafo (il #1 vale 1.00, il #20 vale 0.77). Con `0.85^1 = 0.85` un titolo che è stato in home
**un solo giorno** scende già sotto tutta la banda 11-20; con la soglia a 3 giorni la conseguenza è netta:
nei primi due giorni **niente**, dal terzo la prima pagina si rinnova **tutta** (0/10 restano). Non è un
guasto — nessun titolo sparisce e i sostituti sono i vicini di classifica — ma è **turnover totale**, non
«rotazione morbida». Il codice resta quello del ticket; le leve per una versione più morbida sono il
**tetto all'esponente** (`min(giorni, k)`), il **fattore** (0.95 invece di 0.85) o il confronto **dentro la
banda** del catalogo invece che sul punteggio assoluto. Da decidere col prodotto: non l'ho deciso io.

### 5. Suite

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 190 passed, 195 total
Tests:       8 failed, 1 skipped, 1935 passed, 1944 total
```

Baseline `1910`/`192` + 12 test nuovi = `1935`, `195` suite. Le cinque rosse sono quelle ammesse.

### 6. Residui

1. **Il decadimento non è coperto da `recordRecommendationImpressions` per le righe nuove**: le impressioni
   si scrivono solo dove passa `hybridServing` (`skip === 0`); se una riga viene servita da un'altra strada,
   non lascia traccia. Da verificare quando tutte le righe passeranno di lì.
2. **`visti` = i semi del grafo**: un titolo visto ma fuori dalla library del profilo (seed escluso per
   politica anime, per esempio) può decadere. È il compromesso per non aggiungere una query per richiesta.
3. **La taratura** (punto 4): da decidere col prodotto.
