Status: ready-for-agent
Type: task

# 29 — L'ambiente della suite: i lock e i test non ermetici

## Perché

La suite intera, dopo i merge, dà **9 suite rosse in `main`** e **tutte verdi eseguite singolarmente**. La
classificazione è nel ticket 20, e le cause sono due condizioni dell'ambiente — **non guasti di codice**:

1. **Sette suite falliscono per lock sul file DuckDB** quando jest usa più worker (su Windows), e passano una
   alla volta: `animeOverridesCertify`, `duckDbAndMatchmaker`, `duckDbPresetsValidation`, `presetBurtonOrdering`,
   `sottosogliaVisibility`, `ticket14TitlePolicy`, `resilienceAuditFixes`.
2. **Un test non è ermetico**: `tests/ricercaDoor.test.js` passa solo perché `.cache/tmdb/` è **vuoto**, e
   fallisce dove i dati ci sono (`Expected: 2 / Received: 3`, e in `kidsMode` `Expected: [2] / Received: 20`)
   perché **l'indice vero risponde** dove il test crede di parlare con uno stub. Stessa classe per
   `tests/searchTier2Merge.test.js`, che in `main` è rosso per un `learned_names.db` locale inquinato.
   (Il terzo rosso, `retireTmdbScoringData`, vuole una **API key TMDB viva**: quello è un test che dipende dalla
   rete, e va dichiarato tale.)

## Perché conta

Un numero senza l'ambiente è un numero che verrà letto male: chi lancia la suite intera e vede nove rosse crede
di avere nove guasti. E un test che dipende da `.cache/` è **verde in CI e rosso sulla macchina di chi lavora** —
cioè il contrario di quello che serve.

## Cosa deve uscire

- **I lock**: una decisione dichiarata e applicata — `maxWorkers: 1` per le suite che aprono DuckDB (o per tutte,
  se il costo è accettabile: misurare la durata), oppure l'isolamento per suite (una cartella dati temporanea per
  processo). La scelta va scritta nel `jest.config`/`package.json` **con il perché**, se no il prossimo la
  rimuove per far correre la suite.
- **I test non ermetici**: ognuno **isola il suo seam** (stub esplicito dell'indice, o una cartella dati
  temporanea) e continua ad asserire **la stessa cosa** — l'asserzione non si indebolisce, l'ambiente si
  controlla. Il caso `kidsMode` (`20` invece di `2`) sta dicendo qualcosa di reale sull'isolamento, non sulla
  funzione.
- **Il test che vuole la rete**: dichiarato (uno `skip` esplicito con il motivo, o un flag d'ambiente), non
  lasciato rosso per caso.

## Come si verifica

`npx jest --forceExit --silent` **nel checkout principale**: le uniche rosse devono essere le **preesistenti**
(`tests/metaHandlerEpisodeIds.test.js`, rosso dal 04/10 per il commit `947163b`), e ogni altra suite verde **anche
coi dati presenti**. Poi il numero va scritto nel ticket **con l'ambiente accanto**, perché è quello che il
ticket 20 ha imparato a proprie spese.
