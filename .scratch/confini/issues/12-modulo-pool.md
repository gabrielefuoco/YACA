Status: ready-for-agent
Type: task
Blocked by: 02, 15

# 12 — Il modulo pool: applicato

> **Il titolo è cambiato il 17/10/2026.** Prima era «Il vecchio stack dietro un confine», e il ticket 02
> l'ha smontato: un confine attorno a ciò che si ritira è impalcatura attorno a una demolizione. Si estraggono
> invece **le regole che sopravvivono** (decisione 9 della mappa) — vedi l'esito del ticket 02.

## Perché

Oggi il feed possiede la composizione del pool: chiama quattro strategie in parallelo
(`hybridRecommendations.js:261`), conosce `HERO_PRIORITY`, assegna i titoli senza ripetizioni
(`assignHeroPools` + `claimedIds`), sa quali righe sono additive (`SLUG_ADDITIVI`) e sa come degradare
quando Trakt non risponde. Sono **regole del prodotto**, non del vecchio stack: serviranno anche quando le
strategie non ci saranno più — e sono esattamente il posto in cui il motore nuovo si innesta (ticket 08).

## Cosa deve uscire

- **Il modulo pool in piedi**, con una porta sola dal feed (il nome è del ticket 06): riceve il contesto
  (utente, profilo, medium, kidsMode, selettori) e restituisce `{[catalogId]: items}` assegnati. Il feed
  smette di importare le strategie una per una.
- **Dentro il modulo**: `HERO_PRIORITY`, l'assegnazione esclusiva coi `claimedIds`, le righe additive, i
  limiti (`HERO_MAX_ITEMS_PER_CATALOG`), il degrado (Trakt giù → fallback, con `hiddenForInsufficientFallback`
  e le sue soglie). Oggi `HERO_PRIORITY` è **il decimo posto** in cui gli hero sono definiti e l'unico non
  derivato da `registry.js`: dopo, dev'essere uno solo in meno da ricordare.
- **Le quattro strategie diventano voci di una lista**: chiamate dal modulo, non dal feed. Ritirare una riga
  (mappa successiva) diventa cancellare una voce — ed è la ragione per cui questo modulo esiste.
- **I semi vengono dalla libreria** (ticket 14/15), non da `catalogStrategies.js`: è il motivo per cui questo
  ticket è bloccato da lì. Niente `require` provvisorio da sostituire dopo.
- **Il gancio del grafo** resta dov'è concettualmente (dopo l'assegnazione, non dentro il bacino degli hero,
  perché le righe del grafo non consumano i 160 candidati degli hero) — ma diventa **una voce** fra le altre,
  e il ticket 08 la realizzerà chiamando il servizio.
- **La chiave di cache alzata**: cambia *cosa entra* nella struttura memorizzata.

## Come si verifica

- **Prima e dopo**, gli stessi conteggi: i log del deploy (`[HeroPool] …`, `[Mondi] …`) e il `curl` sui
  cataloghi (le 12 righe di `src/catalog/registry.js` devono continuare a comparire, coi loro numeri).
- **Il confine**: un `grep` che dimostra che `hybridRecommendations.js` non nomina più né le strategie né
  `HERO_PRIORITY`, e che nessun altro le chiama direttamente.
- **La suite**: verde come prima (i 4 file rossi preesistenti restano tali — se ne compaiono altri, il confine
  è passato dove non doveva).

## Attenzione

Questo ticket tocca gli stessi file del ticket 08 (il prodotto che parla col servizio): il pool è il posto in
cui il servizio si innesta. Chi prende il 12 e chi prende l'08 devono **dirlo nei ticket** prima di toccare
`hybridRecommendations.js`, se no due confini si sovrappongono e quando qualcosa si rompe non si sa quale dei
due ha rotto.
