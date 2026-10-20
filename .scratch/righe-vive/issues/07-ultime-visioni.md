Status: claimed
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

**Decisioni scritte qui, non nel codice**: una data mancante o `0` significa **non recente** (mai "adesso"); i
semi Trakt entrano nei semi ma **non** fra i recenti (non hanno data nel payload di oggi); il numero 15 vive in
`SEED_RECENTI_QUANTI` (Node), la soglia 3 in `ULTIME_VISIONI_MIN_SEMI` (parametri del motore), e nessuna delle due
si allenta per riempire la riga.

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
