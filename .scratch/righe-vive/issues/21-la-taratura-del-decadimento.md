Status: ready-for-agent
Type: task
Blocked by: 14

# 21 — La taratura del decadimento: l'alpha del giorno e il reset

## La decisione (20/10/2026)

Il decadimento del ticket 14 resta **`0.85^giorni`** (soglia 3 giorni, mai visti). Due aggiunte decise
dall'utente, perché la formula da sola ha due difetti misurati:

1. **senza varietà**: la pagina 1 si rinnova in blocco (a 3 giorni restano 5/20, a 5 giorni 0/20) ma sempre
   nello stesso ordine — chi apre Stremio due volte nello stesso giorno vede la stessa sequenza, e nei primi
   due giorni non cambia **niente**;
2. **senza ritorno**: un titolo che scivola giù resta giù finché non esce dalla finestra di 14 giorni
   (dente di sega: torna al punteggio pieno di colpo, ~11 giorni dopo). «Molti suggerimenti utili
   scompaiono» — ed è vero: il decadimento non ha memoria del fatto che il titolo era buono.

## Cosa deve uscire

1. **Alpha giornaliero deterministico**: un fattore casuale per `(giorno UTC, tmdbId)` in una banda
   dichiarata (es. `1 ± 0.05`), moltiplicato al punteggio **effettivo** (dopo il decadimento), così l'ordine
   delle prime pagine cambia di giorno in giorno. Deterministico = due richieste nello stesso giorno danno
   lo stesso ordine (Stremio non deve vedere la pagina che balla a ogni refresh), e nessun dato da salvare:
   l'hash di `giorno + id` basta. La banda è un parametro in `parametri`-equivalente lato Node, non una
   costante sparsa.
2. **Reset periodico**: un titolo non può restare penalizzato all'infinito. Il conteggio dei giorni si misura
   su una finestra **corta e dichiarata** (es. ultimi 7 giorni, non 14) **oppure** l'esponente si azzera
   dopo `k` giorni consecutivi **fuori** dalla pagina 1. Scegliere una delle due, misurarla e scrivere
   perché l'altra no.
3. **Il pavimento di qualità non si abbassa**: il reset non deve ripescare titoli sotto il pavimento del
   canone — riporta in gioco chi era sopra, non chi era stato scartato.
4. **La prova**: un titolo decaduto da 10 giorni **torna** in pagina 1 dopo il reset; due giorni diversi
   danno ordini diversi (e lo stesso giorno due volte dà lo stesso ordine); nessun titolo esce dalla riga;
   la banda dell'alpha è rispettata (`|alpha - 1| <= banda`).
5. **La misura**: sonda che mostra, su 10 giorni simulati, quanti titoli **diversi** passano dalla pagina 1
   (rotazione) e quanti **tornano** dopo il reset, con e senza le due aggiunte.

## Note

- L'alpha **non è un boost di gusto**: è varietà di presentazione, quindi non deve mai spostare un titolo
  oltre la banda del 5% (o della banda scelta) né cambiare quali titoli sono in riga — solo l'ordine.
- Il reset e l'alpha vanno **dopo** il decadimento e **dopo** la cache (come il 14), e non devono invalidare
  la voce di cache delle righe.
