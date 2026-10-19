Status: ready-for-agent
Type: task
Blocked by: 14

# 16 — La seconda passata dei documenti: le righe che esistono

## Perché esiste

Il ticket **15** è la **prima** passata: corregge ciò che oggi è falso (percorsi che non esistono, strategie
rimosse) e lascia una sezione `## In arrivo` che **dice che le righe stanno cambiando e non le descrive** — perché
al momento in cui è stato eseguito non esistevano ancora.

Questo ticket è la **seconda** passata, e si fa **alla fine del cantiere**, quando le righe esistono davvero.
Decisione dell'utente (19/10/2026): *«quello della docs però dobbiamo poi rilanciarlo anche al termine dei lavori»*.

Chi esegue il 15 **non** deve anticipare niente: descrivere righe non ancora costruite è il modo esatto in cui un
documento diventa una bugia.

## Cosa deve uscire

1. **`docs/RECOMMENDATION_GRAPH.md` racconta le righe vere**, quelle che il registro espone **dopo** il ticket 13:
   il bacino appiattito, le gemme relative, i classici, le ultime visioni, i micro-cluster, i punti d'incontro, le
   nuove uscite riparate — **con i nomi e gli slug veri**, presi dal registro (`src/catalog/registry.js`), non dalla
   specifica.
2. **I meccanismi trasversali** documentati dove vivono: waterfall dedup (ordine di specificità), filtri a monte
   (`kidsMode`/`animePolicy` dentro `opzioni`), anti-monopolio saga/regista, rotazione sulle impressioni.
3. **La sezione `## In arrivo` sparisce**: non c'è più niente in arrivo. Se qualcosa è rimasto indietro, si dice.
4. **`docs/INDEX.md`** e ogni altro documento che elenca le righe hero o i cataloghi: allineati (un `grep` degli
   slug vecchi che non esistono più, e di quelli nuovi che nessuno nomina).
5. **La tabella dei sei stadi della sonda (`01`)** aggiornata con i numeri **veri** dell'ultima misura: prima/dopo
   il cantiere. È l'unico posto dove la promessa "la qualità non scende mai sotto un pavimento" può essere
   verificata da chi legge.

## La prova

- Per **ogni** slug di catalogo citato nel documento: il comando che mostra che esiste nel registro.
- Per **ogni** numero: il comando o la sonda che l'ha prodotto, accanto.
- `git grep` degli slug rimossi: zero risultati (o l'elenco motivato di quelli tenuti come alias).
- Nessuna modifica al codice in questo ticket: se il documento e il codice non coincidono, **vince il codice** e si
  apre un ticket — non si "aggiusta" il documento per far quadrare i conti.

## Trappole

- **La specifica non è la realtà.** `spec.md` dice cosa si voleva; il documento deve dire cosa c'è. Se divergono,
  la divergenza è un'informazione: scrivila.
- **I numeri si misurano, non si ricopiano.** Un ticket che aveva lo scopo di dire la verità ha prodotto due bugie
  nuove perché i numeri erano enunciati invece che misurati.
- Le righe dei **micro-cluster** hanno id generati: se non sono stabili, il documento deve dirlo (e allora è un bug
  del ticket 13, non del documento).

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse**: se il codice dice altro, fermati e dichiara la divergenza.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite) — salvo che i ticket
  precedenti l'abbiano deliberatamente cambiata, e in quel caso il numero nuovo è scritto nel loro Esito.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- Commit in steps, ognuno con la sua prova.
