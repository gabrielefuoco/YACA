Status: ready-for-agent
Type: task
Blocked by: 08, 12

# 13 — I docs del grafo (e la fine della mappa)

## Perché

`docs/` non parla del grafo nuovo: l'ultimo aggiornamento è del 07/10 e le 17 pagine descrivono il prodotto
com'era (e in parte come non è più — `docs/INDEX.md` dichiara fermi da un mese `PRESETS`, `ALGORITHMS` e
`KITSU_MAPPING`). La convenzione della repo è esplicita (`docs/INDEX.md`, «Come si mantengono questi
documenti»): **nella mappa resta il racconto, nel doc va il distillato**; e **i documenti si allineano quando
il codice è fermo** — cioè adesso, a confini tagliati, non mentre si implementa.

## Cosa deve uscire

- **Il distillato del grafo**, secondo la convenzione: le **regole** che valgono ancora (i contratti, i formati
  — `tmdb:<id>` nella forma breve, `tv`/`series`, i dieci posti che definiscono gli hero), le **misure** che
  motivano una scelta (con la data), i **vincoli scoperti per forza** (le trappole pagate).
- **`docs/INDEX.md` aggiornato**: la mappa dei documenti, l'elenco degli artefatti e delle variabili
  d'ambiente — con le righe nuove del motore-servizio e del vecchio stack dietro il confine.
- **I doc morti**: l'inventario (04) dice quali documenti descrivono codice scomparso. Ognuno o si riscrive o
  si cancella — non resta lì a mentire. Vale anche per i `file:riga` citati che non esistono più.
- **La verifica a mano delle citazioni** (convenzione del 04/10/2026): per ogni `file:riga` citato nel doc
  nuovo, il file esiste ancora? Il controllo a mano del 03/10 trovò tre file citati rimossi a luglio e agosto,
  e uno schema superato di due versioni: è il genere di divergenza che nessuno nota finché non ci sbatte.
- **Il `README.md` della root**: è l'unico md ammesso alla root dalla regola del ticket 05 — dice cosa è YACA
  e dove sta il resto. Se dopo tutti i confini dice ancora il falso, si aggiorna qui.
- **La chiusura della mappa**: le decisioni di questa mappa che valgono oltre la sessione si portano nei docs;
  in `map.md` resta il racconto. E il marcatore di **decisione superata** (convenzione 06/10/2026) va messo
  **nella mappa dove la decisione è stata presa**, non solo nella nuova.

## Cosa NON deve uscire

Un documento per ogni ticket. Il valore del distillato è che sta in poche pagine: se il grafo ha bisogno di
sei documenti nuovi, la domanda giusta è perché il confine non si spiega in uno.

## Come si verifica

Le citazioni dei doc nuovi verificate a mano, una per una (`ls`, `grep -n`); `docs/INDEX.md` che elenca i
documenti **esistenti** (nessun link morto, nessun documento non elencato); e — la prova vera — qualcuno che
non ha mai visto questa mappa legge `docs/` e sa **chi possiede cosa** senza aprire il codice di tutti i
moduli.
