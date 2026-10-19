Status: ready-for-agent
Type: task
Blocked by: 12

# 13 — Il registro dei nuovi cataloghi (lato Node)

## Decisione già presa (mappa, 19/10/2026)

**I nomi e gli ID dei cataloghi si possono cambiare.** Con più righe (micro-cluster) lo schema fisso non regge.
**Conseguenza deliberata**: i due hash del manifest **cambiano** — e il nuovo valore atteso si aggiorna **in questo
ticket**, con il numero misurato. Non si scopre dopo, non si "aggiusta" un test.

## Cosa deve uscire

1. **Il registro** (`src/catalog/registry.js` e ciò che ne dipende) elenca le nuove righe: `il_tuo_mondo`, `gemme
   nascoste`, `classici`, `ultime visioni`, `punti d'incontro`, `nuove uscite`, i **micro-cluster** (id stabili), e
   le righe esistenti che restano.
2. **`src/pool/index.js`** consuma le liste per `ruolo` senza scartarne nessuna: **oggi scarta `mondo_{b}` e non lo
   dice** — verificalo e, se è vero, è parte del difetto.
3. **Gli ID dei micro-cluster sono stabili** fra una richiesta e l'altra: un catalogo che compare e sparisce è un
   guasto per Stremio, non una varietà.
4. **I due hash del manifest**: si calcolano con `buildManifest({})` e `buildRootManifest()`, si **incollano nel
   ticket** con il comando che li ha prodotti, e si aggiornano i test che li fissano. Il vecchio valore
   (`dc4af35c…` / `91bf96d3…`) resta scritto nel ticket come "prima", per tracciabilità.

## La prova

- Il manifest nuovo, con l'elenco dei cataloghi (tipo + id), e **i due hash nuovi calcolati e incollati**, con il
  comando.
- Un test che verifica che **ogni lista** prodotta dal grafo abbia un catalogo nel registro: nessuna riga calcolata
  e poi buttata via.
- Suite: le rosse ammesse restano le stesse; se un test fissava i vecchi hash, l'aggiornamento va **dichiarato**
  riga per riga (non cancellato).

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
