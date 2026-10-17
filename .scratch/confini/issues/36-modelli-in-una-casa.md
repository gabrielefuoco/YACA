Status: ready-for-agent
Type: task

# 36 — I sette modelli in una casa sola

## Perché

Ci sono **sette modelli mongoose in due cartelle** senza nessuna ragione:

- `src/models/`: `RecommendationImpression.js`, `SystemLog.js`, `TasteProfile.js`, `UserConfig.js`
- `src/db/models/`: `AddonConfig.js`, `ImdbToTmdbMapping.js`, `UserAccount.js`

Chi cerca un modello non sa dove guardare, e la divisione non segue niente (non è «dominio vs infrastruttura»:
`UserAccount` sta in `db/models` e `UserConfig` in `models`). Il costo è basso ma è **il tipo di cosa che si
paga ogni volta** che si tocca il dato.

## Cosa deve uscire

1. **Una sola casa** per i modelli. Consiglio: `src/models/`, perché è quella dei nomi di dominio (e `src/db/`
   resta il *database*: connessione, indice, migrazioni — non le entità).
2. **Tutti gli importatori ripuntati**, con la prova che nessuno usa più il percorso vecchio.
3. **La regola scritta** dove sta il resto delle regole (docs/INDEX.md, accanto alla clausola sugli shim del
   ticket 28): *un modello sta in `src/models/`*.

## Come si verifica

- `grep` a zero: nessun `require` di `db/models/` in `src/`, `index.js`, `scripts/`, `tests/`.
- Le suite che toccano i modelli verdi una alla volta (almeno `tests/*profile*`, `tests/*config*`,
  `tests/*account*`, `tests/domainSurface*`).
- Nessuna modifica al contenuto dei modelli: è un **trasloco**, non un refactor. Se un modello ha bisogno di
  cambiare, è un altro ticket.
