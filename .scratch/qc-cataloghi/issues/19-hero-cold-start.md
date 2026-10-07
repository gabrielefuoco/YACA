# 19 — Hero: cosa succede con zero, 50 e 100 titoli visti

**Stato**: `ready-for-agent` · **Causa**: difetti misurati sui suggerimenti (campagna §6) · **Fonte**: [report](../ricerche/01-report-qc-cataloghi.md) §6, [ticket 09](09-hero-fallback-invisibile.md)

## Problema

I quattro hero di YACA (`true_blend`, `seed_network`, `hidden_gems`, `trakt_filtered`) sono stati giudicati **una sola
volta**, su profili con DNA reale clonato e su un profilo freddo. Da lì sappiamo due cose:

1. **Con zero dati** «⭐ Scelti per Te» è, alla lettera, il fallback «popolari ultimi 36 mesi»: **50 titoli su 50
   identici, nello stesso ordine** (verificato con una query diretta). «🕸️ La Rete dei tuoi Preferiti» senza preferiti
   non ha rete, e il percorso Trakt degrada.
2. **Con dati** i hero vanno bene ma con difetti ricorrenti: `seed_network_movies` inquinata da animazione per famiglie
   e corti (B in 3 profili su 5), il cap di diversità che nel profilo anime fa refluire **22 film live-action su 60**,
   la lista Trakt serie ridotta a **8 titoli** dall'assegnazione disgiunta.

Manca la domanda centrale: **come si comportano i hero mentre i dati arrivano?** Un utente non nasce con 500 titoli nel
DNA: ne ha 10, poi 50, poi 100. Se il prodotto degrada in modo silenzioso a 10 e non lo dice, l'utente giudica il
prodotto su una lista popolare travestita da scelta personale.

## Soluzione

Una campagna di misura sugli hero a **tre livelli di dati** — 0, 50 e 100 titoli visti — su due archetipi di gusto,
con verifica di cosa cambia nella lista servita e di come si comportano i percorsi di degrado.

### Metodo

- **Profili e scenari**: usare l'harness (`scripts/qa/simulate.js`, riparato dal ticket 11) con uno spec dedicato:
  - due archetipi di gusto diversi (uno generalista, uno anime-heavy) — i DNA si clonano dai context reali, come nella
    campagna;
  - per ognuno, tre livelli di attività sintetica: **0** (nessuna cronologia), **50** film/serie visti, **100** visti.
    La cronologia va pescata da titoli coerenti col gusto (non casuali), altrimenti si misura il rumore;
  - stessa config per tutti: gli 8 hero abilitati, nessun selettore di tipo.
- **Misure strutturali** (meccaniche, da `hero-enrich.js` e dai log del server):
  - item serviti e loro composizione (anime %, badge ITA, mediana voto, mediana anno, mediana popolarità);
  - **firma del fallback**: la lista è identica (stessi id, stesso ordine) a quella di un catalogo popolare noto? Questa
    è la misura che smaschera il degrado silenzioso;
  - **invariante di disgiunzione**: zero titoli condivisi fra i 4 hero dello stesso tipo (già verificata una volta: va
    riverificata ai tre livelli);
  - flag `fallbackUsed`/`traktAvailable` dai log, e riga `top-up` quando il pool Trakt non basta;
  - diversità: nessun genere oltre il cap (3), nessuna saga oltre il cap (1).
- **Giudizio manuale** (lettura della top-50): su **un archetipo** ai tre livelli, per `true_blend` e `seed_network`
  (i due che promettono personalizzazione) e per `trakt_filtered` (che promette community). `hidden_gems` ha già
  dimostrato di essere il più solido e resta come termine di paragone meccanico.

### Cosa deve rispondere il report

1. **A zero dati**: cosa vede l'utente, catalogo per catalogo, e se il degrado è dichiarato o travestito. Con la
   proposta — nascondere, rinominare o servire — motivata dai numeri.
2. **A 50 e 100**: da quale livello la lista smette di essere il fallback (misura: somiglianza col catalogo popolare
   sotto una soglia dichiarata) e se la personalizzazione cresce in modo monotono.
3. **I tre difetti noti**: corti/famiglia nella `seed_network`, reflusso live-action nel profilo anime, pochi item nella
   lista Trakt serie. Per ognuno: misurato ai tre livelli, con la causa e il rimedio proposto.
4. **Il flag**: `fallbackUsed=false` oggi non distingue «Trakt ha contribuito» da «ho riempito col top-up interno»
   (misurato il 07/10). Dire se il flag va sdoppiato e come.

## Criteri di accettazione

- Le 6 combinazioni (2 archetipi × 3 livelli) × 8 hero producono le misure strutturali, in una tabella per profilo.
- Per ogni hero e livello: la somiglianza col catalogo popolare è un numero (Jaccard sui primi 40), non un'impressione.
- Il report contiene la risposta alle quattro domande sopra, con l'evidenza accanto a ogni affermazione.
- Niente modifiche a `src/` in questo ticket: si misura e si propone. Le correzioni diventano ticket.

## Fuori ambito

- La rubrica e il rumore del giudice (ticket 18).
- Il percorso Trakt con token (misurato dal ticket 10 sul profilo reale: funziona).
- I cataloghi preset (ticket 04/15/17): qui si parla solo di hero.
