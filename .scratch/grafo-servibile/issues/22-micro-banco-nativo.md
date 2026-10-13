# 22 — Il micro-banco nativo di YACA

**Status**: `needs-info` · **Type**: `research` · **Blocked by**: nessuno (ma serve una decisione prima di partire)

## What to build

Nessuno dei due banchi è YACA. Uno snapshot **anonimo** delle librerie e delle cronologie reali di
produzione, con uno split temporale, direbbe se il pubblico di YACA somiglia di più a quello delle
cronologie Trakt o a quello del banco MovieLens — cioè **quale dei due banchi ha il diritto di decidere**
la ricetta (ticket 21).

## Perché è `needs-info` e non `ready-for-agent`

L'utente ha già dichiarato una cosa che va in direzione opposta: **gli utenti attuali di YACA «sono test
casuali miei»**. Se è così, un banco costruito su di loro non misura YACA, misura le prove di chi l'ha
costruita — e sarebbe il **terzo banco rotto** di questa sessione.

Quindi la prima cosa da fare non è esportare: è **rispondere alla domanda**.

## Acceptance criteria

- [ ] la domanda sulla privacy è risposta **prima**: cosa si esporta, come si anonimizza, dove vive il file (fuori dal repo), chi lo vede
- [ ] l'obiezione è messa agli atti, con la soglia dichiarata: **quanti profili reali servono** perché il banco valga qualcosa (e qual è il numero attuale: se sono tre, non vale)
- [ ] **se si costruisce**: la sovrapposizione della popolazione con i due banchi esistenti è misurata e dichiarata, e la demografia dice a quale dei due assomiglia
- [ ] **se non si costruisce**: il ticket si chiude con la ragione scritta, e il ticket 21 dichiara di aver deciso **senza** un banco nativo
- [ ] in nessun caso dati di utenti reali entrano nel repo o in `.scratch/`

## Da dove nasce

Suggerimento dell'esperto (buco 6 / domanda 4), in **conflitto diretto** con un'istruzione dell'utente. Il
conflitto è il motivo per cui questo ticket esiste come decisione e non come lavoro.
