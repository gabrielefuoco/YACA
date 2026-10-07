# 16 — Il builder Trakt solleva un errore di inizializzazione e degrada sempre

**Stato**: `ready-for-agent` · **Gravità**: media (percorso mai pulito, degrado silenzioso raddoppiato) · **Trovato**: 07/10/2026, durante la verifica del ticket 13

## Sintomo

A ogni costruzione dei pool hero, nei log compare:

```
[HeroPool] trakt_filtered builder failed: Cannot access 'types' before initialization
```

L'errore è un `ReferenceError` di **temporal dead zone**: dentro il builder Trakt una variabile viene usata prima della
sua dichiarazione (`const`) — il codice legge `types` in una funzione che viene invocata prima che quella `const` sia
inizializzata. L'errore viene catturato da `runPoolBuilder` ([`hybridRecommendations.js`](../../../src/engines/hybridRecommendations.js)
`try/catch` intorno a riga 169) che logga e passa al fallback.

## Perché conta

- Il hero **«Suggeriti dalla Community» non esegue mai il proprio percorso**: qualunque sia l'esito voluto dal builder
  (con token o senza), il risultato passa sempre dal `catch` e dal fallback. Se un giorno il builder migliora, il
  miglioramento non si vedrà — e se peggiora, non si vedrà nemmeno.
- Rende **invisibile** ogni altro errore del builder: un `catch` che scatta sempre non distingue più un guasto nuovo
  da quello noto.
- Spiega, in parte, il verdetto basso della campagna QC su quel hero (media 72,5; 1 P su 10 liste): il percorso
  giudicato era il degrado, non il builder.

## Riproduzione

Dall'albero, con un profilo di test materializzato:

```bash
node scripts/qa/simulate.js profiles
node scripts/qa/simulate.js fetch --pages 1 --only yaca_trakt_filtered_movies --run .scratch/qc-cataloghi/runs/repro-16
node scripts/qa/simulate.js teardown
```

I log del server riportano la riga `[HeroPool] trakt_filtered builder failed: ...`. In alternativa, la stessa riga
compare eseguendo il builder in locale (`buildTraktFilteredCatalogWithMeta`, vedi `scripts/qa/verify-solo-anime.js`
come modello di chiamata diretta).

## Fix

1. Trovare la variabile usata prima della dichiarazione in `buildTraktFilteredCatalogWithMeta`
   (`src/engines/hybrid/catalogStrategies.js`) e dichiararla prima dell'uso — con un commento che spieghi **perché**
   l'ordine conta (la storia di questo errore è più utile del fix).
2. Verificare che il builder ritorni **senza sollevare** in tre condizioni: con token e dati Trakt disponibili, con
   token ma dati vuoti, senza token.
3. **Test di regressione**: un test che chiama il builder e fallisce se solleva (prior art: i test hero esistenti,
   es. `tests/heroAnimeFavoredSeam.test.js` per la forma del mock di DuckDB/Trakt).

## Criteri di accettazione

- La riga `trakt_filtered builder failed` **non compare più** in una costruzione reale dei pool hero.
- Il hero `trakt_filtered` riporta `fallbackUsed`/`traktAvailable` coerenti col percorso davvero eseguito
  (con token: `fallbackUsed: false`; senza token: `true` con il fallback dichiarato).
- `npm test` senza nuove rotture.
- Il test di regressione fallisce se si rimette la lettura anticipata.

## Fuori ambito

- Il comportamento Trakt in sé (token, device flow): coperto da `docs/INTEGRATIONS.md` e dal ticket 10.
- La qualità delle liste Trakt: giudicata dalla campagna.
