Status: resolved
Type: task

# 44 — Il corpus Trakt, riscaricato (l'input che manca alla misura)

## Perché

La misura del ticket 43 (`oro_preso`) gira su **2 utenti** — un segnale, non una prova. La ricetta del grafo la
faceva su **60 utenti reali**, ma il corpus che li conteneva (`.cache/trakt/users/movie-*.json` + `show-*.json`)
**non c'è più**: non è in locale, non è sul mate, non è nel vecchio clone.

**Ma non è perduto**: è **dato scaricato**, e i programmi che lo scaricano sono **in git**
(`services/graph/fetch/fetch-trakt-*.js`, 7 script). Serve solo `TRAKT_CLIENT_ID`, che è nel `.env` ✓.

## Cosa deve uscire

1. **Il corpus riscaricato** col fetcher giusto (`fetch-trakt-users.js`, e gli altri solo se servono), scritto dove
   la ricetta lo cerca: `TK = YACA/.cache/trakt/users/` (vedi `services/graph/canon.py:34`).
2. **La prova**: quanti utenti hanno **entrambi** i file (`movie-<u>.json` e `show-<u>.json`); il campione di un
   utente (numero di titoli); il tempo e i limiti di rate incontrati.
3. **La dichiarazione onesta**: un corpus riscaricato **oggi non è identico** a quello di prima (Trakt cresce) →
   i valori assoluti non sono confrontabili con le misure vecchie; **la metodologia sì**. Va scritto nel ticket e
   nel README di `fetch/`, se non c'è già.
4. **La nota di casa**: `.cache/` è una cache e **si può cancellare** (lo dice il README degli input). Poiché
   ora questo corpus serve a **misurare**, va scritto *come si rifà* — comando esatto — così che la prossima
   perdita costi un comando e non una ricerca.

## Se l'obiettivo è **ricostruire il grafo** (non solo misurare)

Servono anche gli altri input, e i loro generatori sono tracciati:
- **MovieLens `ml-32m`** → dataset pubblico, da scaricare a mano (link nel README di `fetch/`);
- i **derivati** (ratings puliti, spazi-trakt, cf-*, boot-B, componenti) → i 6 script `services/graph/upstream/*.py`.

Questo ticket **non** deve ricostruire il grafo: quello è un lavoro a sé, e oggi **non serve** (gli artefatti in
`services/graph/data/` sono stati ripristinati dal mate, 141 MB, identici ✓).

## Come si verifica

`ls .cache/trakt/users | grep -c '^movie-'` → il numero di utenti; e la ricetta (`measure/ricetta.py`) o la sonda
`probe-gusto-holdout.js` che **girano senza errori** su quel corpus.

## Esito

Eseguito il 18/10/2026.

1. **Correzione path nei fetcher**:
   - Negli script `services/graph/fetch/fetch-trakt-*.js`, il percorso relativo era rimasto `../../.cache` dopo il trasloco da `graph/` a `services/graph/` nel ticket 06: scriveva in `services/.cache` anziché nella radice del repo `ROOT/.cache`.
   - Aggiornato a `../../../.cache` in tutti i 7 script della cartella.

2. **I comandi eseguiti**:
   - `PAGES=40 node services/graph/fetch/fetch-trakt-lists.js` (con `TRAKT_CLIENT_ID` letto dal `.env` del clone principale senza echo/stampa): 40 pagine di liste popolari scaricate (`popular-1.json` .. `popular-40.json`), 1.415 autori unici scoperti, 1.045 file di `items-*.json` salvati.
   - `USERS=400 PAGES=3 node services/graph/fetch/fetch-trakt-users.js`: 400 utenti selezionati dagli autori e scaricati fino a 3 pagine per film e serie.

3. **I numeri del corpus**:
   - **800 file totali** in `.cache/trakt/users/`: 400 `movie-*.json` e 400 `show-*.json`.
   - **400 utenti su 400** (100%) hanno **entrambi** i file.
   - Voci totali scaricate: **100.091 film** e **81.271 serie**.
   - Campione utente (`donxy`): 300 film (primo: *V/H/S/Halloween*) e 300 serie (primo: *The Simpsons*), 600 titoli totali.
   - Tempo totale impiegato: ~25 minuti complessivi (step liste + step utenti).
   - Rate limiting: **0 errori HTTP 429 incontrati**, 0 errori di rete (rispettati i 300-320 ms di sleep tra chiamate).

4. **Copia nel clone principale**:
   - Copiato l'intero albero `.cache/trakt/` (copy only) in `C:\Users\gabri\APP\YACA\.cache\trakt\`.
   - Conteggi identici prima e dopo:
     - Worktree: `lists: 1085, users: 800 (400 movie, 400 show), totale: 1885`
     - Main: `lists: 1085, users: 800 (400 movie, 400 show), totale: 1885`

5. **Dichiarazione onesta (metodologia vs valori assoluti)**:
   - Un corpus riscaricato **oggi non è identico** a quello storico: Trakt cresce nel tempo con nuovi utenti, nuovi titoli visti e nuove liste popolari.
   - La **metodologia di misurazione è pienamente valida e confrontabile** (permette di confrontare configurazioni e discriminare i parametri o testare `oro_preso` su campioni statisticamente solidi di 400 utenti anziché 2); i **valori assoluti percentuali non sono sovrapponibili** punto a punto con le vecchie corse di ottobre.
   - Documentato sia qui che nella sezione *"Come si rifà"* di `services/graph/fetch/README.md`.

6. **Verifica della ricetta (`services/graph/measure/ricetta.py`)**:
   - Eseguita con il virtualenv Python disponibile in `C:\Users\gabri\APP\YACA\offline_graph_builder\venv\Scripts\python.exe` (Python 3.13 con pandas, scipy, pyarrow).
   - Lanciata nel clone principale (`C:\Users\gabri\APP\YACA\services\graph`), dove risiedono i 141 MB di artefatti in `services/graph/data/` e i parquet TMDB in `.cache/tmdb/`: ha girato in **3 secondi** su 2 utenti di prova (`memeroa15` e `trinisete`) calcolando correttamente le distanze Jaccard, estraendo oro/seme e generando i campioni di portafoglio senza errori.
   - Prova provata che il corpus riscaricato è consumabile dal canone senza frizioni.

