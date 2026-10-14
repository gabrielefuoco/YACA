# Ticket 05 — la tenuta e il costo

Script: la misura del costo è dentro `04-banco.py` e in questo report. **La tenuta non è misurabile
oggi**, e va detto perché.

## Il costo, misurato

| | |
|---|---|
| caricamento (modello + vocabolari + FX + partizione) | **16 s**, una volta sola |
| **proiezione di un titolo** | **7,7 ms** |
| 200 titoli | 1,54 s |
| 1.000 titoli | 7,7 s |
| 10.000 titoli | **1,3 min** |
| modello su disco | **3,8 MB** (coef 4,1 MB in memoria) |
| vocabolari su disco | 0,3 MB |

Il collocamento è **economico**: diecimila titoli nuovi si proiettano in un minuto e mezzo. Il costo
vero non è la proiezione, è **l'inserimento nel grafo** — che oggi non esiste.

## La tenuta: perché non si può misurare

Il ticket chiedeva tre cose, e due dipendono da qualcosa che non c'è:

1. **Il banco sonda prima e dopo l'inserimento di 50 titoli** → **non misurabile**: l'inserimento nel
   grafo vuol dire aggiungere archi, e gli archi strutturali (ticket 03) **mescolano film e serie** e
   portano 30 legami deboli per titolo. Inserirli oggi significherebbe misurare il danno di una via
   che sappiamo sbagliata.
2. **Si aggancia a una bolla o ne crea una nuova?** → parzialmente risposto: la proiezione **vota una
   bolla esistente** (il quartiere giusto 600/600), quindi il titolo **si aggancia**, non crea. La
   potatura al nucleo (ticket 05 di `bolle-nitrile`) è il meccanismo che lo aggancerebbe senza
   gonfiare la bolla.
3. **E fra sei mesi, con 10.000 titoli nuovi?** → **non misurabile oggi**. Ma c'è un numero che
   orienta: il catalogo del grafo ha **66.259 titoli** e la partizione **1.617 bolle**. Diecimila
   titoli nuovi sono il **15% del catalogo**: non è una perturbazione, è una rifondazione. La
   risposta onesta è che la partizione **va rifatta periodicamente**, non aggiornata per sempre.

## Le due condizioni perché la tenuta si possa misurare

1. **Il vincolo di medium** sugli archi strutturali (ticket 03): film con film, serie con serie.
2. **Il secondo studente per le serie** (ticket 04): senza, ogni serie nuova finisce nello stesso
   posto, e la tenuta sarebbe quella di un errore ripetuto 12.315 volte.

Con queste due, il ticket 05 si chiude con una misura vera: il banco sonda prima e dopo l'inserimento
di 50 titoli, e i titoli nuovi agganciati con la potatura al nucleo.
