Status: ready-for-agent
Type: task
Blocked by: 19

# 12 — I filtri a monte, non a valle

## Il difetto

Oggi il grafo calcola su tutto e restituisce `cap = 60`; poi `src/stremio/idratazione.js` e
`src/stremio/catalogHandler.js` tagliano per `kidsMode` e `animePolicy`. Se un cluster è al 70% anime e l'utente ha
`anime: 'exclude'`, la riga arriva a Stremio con **8 titoli invece di 60** — e nessuno lo dice.

## Cosa deve uscire

1. **`animePolicy` e `kidsMode` viaggiano dentro `opzioni`** della `POST /raccomanda` (il contratto si estende in
   modo **retrocompatibile**: se il campo manca, il servizio si comporta come oggi).
2. **`motore.py` maschera prima del taglio `[:cap]`**: usa ciò che già ha in memoria (generi, `IS_TV`, il flag
   anime del canone) per escludere i titoli non idonei **prima** di riempire la lista.
3. **Ogni lista esce piena e già conforme**: il prodotto **non** deve più avere bisogno di tagliare per quei due
   criteri. I tagli a valle **restano** come rete di sicurezza (difesa in profondità), ma non devono più togliere
   quasi nulla — e il ticket lo **misura**.

## La prova

- Un profilo con `anime: 'exclude'` il cui bacino è **prevalentemente anime**: prima → riga corta; dopo → riga piena
  **e** senza anime. Il conteggio prima/dopo è la prova.
- Un profilo **kidsMode: true**: nessun titolo non-idoneo in uscita, e la riga non si accorcia.
- Il contratto resta retrocompatibile: una richiesta **senza** i nuovi campi si comporta come prima (test).
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

## Perché non è stato fatto al suo turno (20/10/2026)

La premessa «il flag anime del canone» è **falsa**: `metadati-canone.npz` non esporta nessun flag per
titolo (né anime né adulto), e l'anime è deciso lato Node. Il prerequisito è il ticket **19**; questo
ticket resta fermo finché il canone non porta i due array. Vedi `19-i-flag-del-canone.md`.
