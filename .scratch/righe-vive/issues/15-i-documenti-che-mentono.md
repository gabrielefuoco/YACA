Status: ready-for-agent
Type: task
Blocked by: 14

# 15 — I documenti che mentono

## Il difetto, verificato il 19/10/2026

`docs/RECOMMENDATION_GRAPH.md` è **il** documento di questo sottosistema, ed è **parzialmente stantio**:

- nomina `src/engines/hybridRecommendations.js` → **non esiste** (oggi è `src/stremio/hybridServing.js`);
- nomina `src/pool/graphClient.js` → **non esiste** (è `src/clients/graphClient.js`);
- il diagramma elenca ancora `true_blend, seed_network, hidden_gems, trakt` fra le `HERO_STRATEGIES` → **rimosse**
  (ticket 46); oggi `HERO_STRATEGIES` ha **una** voce, `graph_rows` (`src/pool/index.js:156`).

E `src/api/bolle.js` ha commenti che parlano ancora di liste vuote con `da_comporre: true`, mentre `motore.py` e
`servizio.py` popolano già tutte e quattro le liste (verificalo: potrebbe essere cambiato con questo cantiere).

## Cosa deve uscire

1. **`docs/RECOMMENDATION_GRAPH.md` allineato al vero**: i percorsi che esistono, le strategie che esistono, le
   righe che il registro espone **dopo** questo cantiere.
2. **I commenti stantii** in `src/api/bolle.js` e ovunque altro nominino percorsi che non esistono (un `grep` dei
   percorsi citati nel doc, verificati uno per uno con `ls`).
3. **La regola scritta**: ogni numero in un documento porta accanto il comando che l'ha prodotto. In questa sessione
   un ticket "sulla verità dei documenti" ha prodotto **due bugie nuove** (una chiave inesistente, una versione
   sbagliata) perché i numeri erano enunciati invece che misurati.

## La prova

- Per **ogni** percorso citato nel documento: il comando `ls` (o `git grep`) che mostra che esiste. Incollalo.
- `git grep` dei percorsi eliminati: zero risultati.
- Nessuna modifica al codice in questo ticket: se trovi un disallineamento nel codice, **apri un ticket**, non
  correggerlo qui.

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
