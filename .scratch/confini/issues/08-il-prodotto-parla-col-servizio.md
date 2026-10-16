Status: ready-for-agent
Type: task
Blocked by: 07

# 08 — Il prodotto parla col servizio

## Perché

Il ticket 12 chiuderà il vecchio stack dietro un confine; questo chiude il **nuovo** dal lato prodotto. Oggi
il prodotto legge l'artefatto in casa propria (`src/data/bolle.json` → `src/engines/bolle/Bolle.js` →
`raccomanda.js` → `hybridRecommendations.js`, il gancio dopo `assignHeroPools`) e serve due righe:
`yaca_mondi_*` e `yaca_passo_fuori_*`.

## Cosa deve uscire

- **L'adattatore**: il punto del prodotto che traduce la storia in una richiesta e la risposta in pool.
  Oggi quella traduzione è `righePerStremio` dentro `raccomanda.js` (semi → `{yaca_mondi_series: [...]}`),
  con `CAP=60`, `MONDI_PER_RIGA=8`, `VICINI=3` cablati: quei numeri sono **opzioni di richiesta**, non
  costanti del prodotto (charting, decisione 3).
- **La chiamata al cache-build**, non per richiesta: `buildSharedHeroCatalogs` in
  `src/engines/hybridRecommendations.js` è dove il gruppo si costruisce (e dove oggi il `console.log`
  stampa `[Mondi] … settimane · mondi 60 · passo fuori 14`). La risposta del motore entra lì, e da lì in poi
  il resto del prodotto la tratta come una riga qualsiasi.
- **La fine della doppia verità**: `Bolle.js`, `raccomanda.js` e la lettura di `bolle.json` non servono più
  al prodotto. Vanno **cancellati**, non lasciati in piedi «per sicurezza»: se restano, la prossima sessione
  li userà. La cancellazione del file lo fa il 09; qui si cancella il codice.
- **Il degrado**: motore giù o lento → la riga non compare, il resto del feed continua. Il guardiano c'è già
  (`[Mondi] ATTENZIONE: … ZERO titoli in entrambe le righe`) e va conservato.
- **La chiave di cache alzata** (`HERO_CACHE_KEY_VERSION`): cambia *cosa entra* nella struttura memorizzata,
  quindi senza bump il fix non produce effetto. È la trappola pagata dieci volte il 17/10.

## Come si verifica

Dentro il container, sul deploy vero: `docker logs yaca-app | grep '\[Mondi\]'` deve mostrare i conteggi che
il motore ha restituito, e `curl .../catalog/series/yaca_mondi_series.json` deve restituire **gli stessi
titoli**. Il confronto è fra i due numeri, non con un'impressione.

**Questo è anche il posto in cui il ticket 38 della mappa `suggerimenti` (le righe serie che si perdono fra
pool e risposta) diventa visibile o sparisce**: se dopo questo ticket le righe serie sono ancora 3, la perdita
è a valle del pool — e il 38 va riaperto con la prova in mano, non con un'ipotesi.

## Attenzione

Gli hero sono definiti in **dieci** posti (nove derivati da `src/catalog/registry.js`, più `HERO_PRIORITY`):
se una riga smette di comparire, il sospetto è lì prima che nel motore. E `tv`/`series` sono la stessa cosa
con due nomi (`annotationKeyFor` usa `tv`, la MetaPreview in uscita usa `series`).
