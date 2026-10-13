# 14 — La leva Popolare / Nicchia, dentro la bolla

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 08

## What to build

La leva che risponde alla domanda dell'utente: *«in questo mondo, voglio la cosa più famosa o la cosa più
nascosta?»*.

**Deve operare per quantile dentro la bolla.** Un parametro globale di popolarità è la modalità di
fallimento: chiedere «Popolare» dentro *Cinema Polacco* o dentro *Rossellini* restituirebbe **zero**
titoli (o l'unico intruso hollywoodiano finito lì per errore), mentre chiedere «Nicchia» dentro
*Fantascienza blockbuster* pescherebbe film amatoriali da dodici voti.

Per ogni titolo dentro la sua bolla si calcolano due coordinate:

1. **Purezza interna**: la frazione del peso degli archi del titolo che cade **dentro** la bolla. Misura
   quanto è un vero membro archetipico e non un visitatore di confine.
2. **Percentile di popolarità locale**: la posizione del titolo per voti **rispetto agli altri membri di
   quella bolla**.

I due selettori:

- **Porta d'ingresso** («Popolare»): massimizza **purezza × percentile** — i capolavori canonici e più
  accessibili di quel micro-mondo.
- **Deep cut** («Nicchia»): richiede purezza **sopra la mediana della bolla** (così non si pesca rumore) e
  ordina per percentile **crescente**, oppure restringe il percentile a una fascia bassa ma non nulla.

Un **solo pavimento di sicurezza globale** sui voti, e nient'altro di globale.

## Acceptance criteria

- [ ] le due coordinate sono calcolate per ogni titolo di ogni bolla
- [ ] dentro una bolla di nicchia piccola, «Popolare» restituisce titoli **di quella bolla** e **mai zero**
- [ ] dentro una bolla di blockbuster, «Nicchia» **non** scende sotto il pavimento globale
- [ ] le due liste sono **lette**: la porta d'ingresso è il titolo canonico e accessibile, il deep cut è fedele ma poco battuto
- [ ] **controllo**: le due liste differiscono in modo misurabile da un sorteggio casuale di pari numerosità dentro la stessa bolla
- [ ] un titolo **ospite** (film-portale, ticket 08) usa la bolla **primaria** per le sue coordinate, non quella in cui è ospite
- [ ] la leva funziona **senza** il resto della mappa: è verificabile su una singola bolla, a mano

## Da dove nasce

Richiesta diretta dell'utente: «se abbiamo delle bolle di film simili, in cui le bolle simili sono anche
vicine nel grafo, diventa facile scegliere se restituire la roba popolare o quella di nicchia». È il
punto in cui le bolle diventano prodotto.
