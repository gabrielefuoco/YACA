Status: ready-for-agent
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
