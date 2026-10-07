# 21 — Motore hero: pool a monte, flag sdoppiato, cap famiglia

**Stato**: `in corso` · assegnato (pool a monte, flag sdoppiato, cap famiglia)

Tre interventi sul motore dei suggerimenti, tutti con la misura prima/dopo. L'ordine è quello di priorità.

## 1. Pool a monte più largo nei contesti stretti (decisione dell'utente: **allargare**, non sovrapporre)

Nel profilo Otaku tre hero serie servono **17-19 titoli invece di 50**: `assignHeroPools` assegna in ordine rigido e
`true_blend_series` consuma per primo l'intero pool anime. L'utente ha scelto di **allargare il pool di candidati a monte**
(da ~150 a ~250) mantenendo la disgiunzione totale, invece di permettere sovrapposizioni.

- Dove: il punto in cui i candidati vengono raccolti prima dell'assegnazione (`src/engines/hybrid/hybridRecommendations.js`).
- **Misura**: item per hero (i 4 hero × film/serie) nel profilo Otaku prima → dopo; latenza della richiesta prima → dopo
  (il costo è il rischio dichiarato di questa scelta); e verifica che la disgiunzione resti 0 sovrapposizioni.
- Attenzione: non allargare nei contesti ampi dove il pool basta già (sarebbe costo senza beneficio). La soglia con cui
  decidere «contesto stretto» va scritta nel codice con il perché.

## 2. Il flag `fallbackUsed` non dice la verità completa

Oggi `fallbackUsed=false` significa «non ho degradato per errore», **non** «Trakt ha contribuito»: il top-up interno
(quando Trakt risponde con 0 titoli conformi) riempie il catalogo senza alzare il flag. Misurato sul profilo reale il
07/10: catalogo al 100% di top-up, flag a `false`.

- Sdoppiare in campi tipizzati: `traktAvailable` (token valido), `traktSourcedCount`, `fallbackTopUpCount`,
  `isDegradedFallback` (vero se `traktSourcedCount === 0`).
- **Misura**: sul percorso reale (o su un profilo con token) e su uno senza, i quattro campi devono raccontare la storia
  giusta in entrambi i casi. Riportare le righe di log prima → dopo.

## 3. Cap sul genere Famiglia nella `seed_network` (44% di animazione per ragazzi in un profilo adulto)

Su 50 film serviti nel profilo Generale adulto, **22 sono animazione per famiglie** (*Phineas e Ferb*, *Il robot
selvaggio*, *Luck*, *Elio*): i seed blockbuster/sci-fi toccano per affinità di grafo i lungometraggi animati per ragazzi.

- Dove: `HERO_DIVERSITY_CAPS` — cap esplicito sul genere Famiglia (10751) quando `kidsMode: false`, come già si fa per
  le saghe. Nei profili kids il cap non si applica (lì l'animazione è il contenuto giusto).
- **Misura**: quota Famiglia nei primi 50 della `seed_network` (film e serie) prima → dopo, su entrambi gli archetipi;
  e verifica che il catalogo non si svuoti (resta ≥ 40 item).

## Criteri di accettazione

- Per ognuno dei tre: misura prima → dopo con il comando usato, e `git diff --stat` dei file toccati.
- La disgiunzione fra hero resta un'invariante verificata (0 sovrapposizioni) dopo l'intervento 1.
- Nessuna modifica ai preset (`src/data/presets.js` ha un altro proprietario) e nessun commit.
