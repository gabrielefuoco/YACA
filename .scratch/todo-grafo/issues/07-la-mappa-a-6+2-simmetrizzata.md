Status: resolved
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

## Esito

Fatto e con la simmetria vera: 0 coppie asimmetriche. Il primo tentativo era sbagliato — sostituire il ponte piu' debole ne evince uno gia' simmetrizzato e lascia 2.264 asimmetrie; l'unione, come dice l'esperto, le azzera. §2.4 PASSA nei due versi: Guerre stellari (1313, film) e The Mandalorian (1090, serie) si vedono a vicenda. MA la mappa e' SATURA: 95,7% delle coppie adiacenti, grado mediano 798, rapporto 6°/7° vicino 1,074 — nessun ginocchio. Il difetto e' dell'ADIACENZA, non del peso: il peso mediano degli archi e' 0,0 e l'arco Star Wars-Mandalorian vale 22,4 (34% del massimo). La mappa va rifatta sul grafo pesato.
