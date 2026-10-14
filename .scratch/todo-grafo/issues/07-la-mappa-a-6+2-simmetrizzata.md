Status: ready-for-agent
Type: task

# 07 — La mappa a 6+2, simmetrizzata

Salvare la mappa finale come dice §2 e §5.2: **6 vicini intra-medium + 2 ponti cross-medium
simmetrizzati**, invece della tassonomia 4 canonici + 2 vibe che a questa granularita' non esiste.

Il ponte cross-medium va **forzato simmetrico**: se la bolla-film *Guerre stellari* sceglie la
bolla-serie *The Mandalorian*, allora *The Mandalorian* deve vedere *Guerre stellari* fra i suoi due
ponti, anche se ha otto bolle-serie con peso maggiore. E' il difetto §2.4, ed e' deterministico
da riparare.

Poi ricalcolare `(purezza, pct_locale)` del ticket 14 sulle bolle della partizione finale
(V7 o V8, secondo l'esito del ticket 02) e rifare la mappa `.npz`.

Controllo: verificare che i 2 ponti cross-medium non siano due volte la stessa bolla, che le bolle
senza ponte siano dichiarate (non riempite a caso) e che *Guerre stellari* e *The Mandalorian*
si vedano in entrambi i versi.
Esito: la mappa `.npz` nuova + `ricerche/07-mappa-6-2.md`.
