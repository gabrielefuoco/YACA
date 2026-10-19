Status: ready-for-agent
Type: task
Blocked by: 10

# 11 — Waterfall dedup

## Verifica prima

- Le righe del grafo sono `SLUG_ADDITIVI` e **non** usano `claimedIds`: lo stesso titolo può comparire **identico**
  in più righe hero dello stesso feed. Conferma dove (in `motore.py` o in `pool/index.js`) manca l'esclusione.

## Cosa deve uscire

Un set **`gia_assegnati_globali`** costruito **in ordine di specificità**:

1. **Prima le righe a bacino stretto**: nuove uscite, gemme nascoste, classici, punti d'incontro.
2. **Poi** ultime visioni e i micro-cluster.
3. **Infine "il tuo mondo"** — che ha il bacino più grande — riempie i suoi 60–80 slot **escludendo** ciò che è già
   preso, con **al massimo una** sovrapposizione ammessa coi micro-cluster (e va scritto perché).

Risultato dichiarato: l'utente scorre la home e vede **righe con titoli diversi**, e una riga specialistica non
perde il suo titolo migliore perché "il tuo mondo" è arrivato prima.

## La prova

- Un profilo in cui lo stesso titolo (alto per attivazione, di nicchia e recente) sarebbe idoneo a **3 righe**:
  deve comparire **una volta sola**.
- Il conteggio dei doppioni per riga **prima/dopo**, misurato dalla sonda del ticket 01 (estendila se serve).
- Suite alla baseline.

## Trappole

- **L'ordine è la regola**: se "il tuo mondo" pesca per primo, il dedup non serve a niente. La specificità va
  scritta come dato (un campo della lista), non lasciata all'ordine accidentale del codice.
- Il dedup **non** deve svuotare le righe: se togliendo i doppioni una riga scende sotto la soglia minima, lo
  **dichiara**.

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
